import { openDB, IDBPDatabase, DBSchema } from 'idb';

// ============================================
// Schema Definitions
// ============================================

export interface LoopSample {
  id: string;           // UUID
  name: string;         // User-specified name
  prompt: string;       // Generation prompt
  createdAt: number;    // Timestamp
  duration: number;     // Seconds
  bpm: number;          // Detected BPM
  tags: string[];       // User tags
  vector: {
    brightness: number;
    energy: number;
    rhythm: number;
  };
  pcmData: Float32Array;  // Audio data (mono 44.1kHz)
}

interface PromptDJLibrary extends DBSchema {
  chunks: {
    key: number;
    value: {
      timestamp: number;
      duration: number;
      vector: { 
          brightness: number; 
          energy: number; 
          rhythm: number 
      };
      pcmData: Float32Array; 
    };
    indexes: { 'by-energy': number; 'by-brightness': number };
  };
  samples: {
    key: string;  // id
    value: LoopSample;
    indexes: { 'by-bpm': number; 'by-created': number };
  };
}

// ============================================
// LibraryStore Class
// ============================================

export class LibraryStore {
    private db: IDBPDatabase<PromptDJLibrary> | null = null;
    private readonly DB_NAME = 'promptdj-ghost-memory';
    private readonly CHUNKS_STORE = 'chunks';
    private readonly SAMPLES_STORE = 'samples';

    async init() {
        this.db = await openDB<PromptDJLibrary>(this.DB_NAME, 2, {
            upgrade(db, oldVersion) {
                // Version 1: chunks store
                if (oldVersion < 1) {
                    const chunksStore = db.createObjectStore('chunks', { 
                        keyPath: 'timestamp' 
                    });
                    chunksStore.createIndex('by-energy', 'vector.energy');
                    chunksStore.createIndex('by-brightness', 'vector.brightness');
                }
                
                // Version 2: samples store (user-saved loops)
                if (oldVersion < 2) {
                    const samplesStore = db.createObjectStore('samples', { 
                        keyPath: 'id' 
                    });
                    samplesStore.createIndex('by-bpm', 'bpm');
                    samplesStore.createIndex('by-created', 'createdAt');
                }
            },
        });
        console.log('[GhostSystem] LibraryStore Initialized (IndexedDB v2)');
    }

    // ============================================
    // Chunks (Auto-save for Ghost System)
    // ============================================

    async saveChunk(pcmData: Float32Array, vector: { brightness: number; energy: number; rhythm: number }) {
        if (!this.db) await this.init();
        
        try {
            await this.db?.add(this.CHUNKS_STORE, {
                timestamp: Date.now(),
                duration: pcmData.length / 44100,
                vector,
                pcmData
            });
        } catch (e) {
            console.warn('[GhostSystem] Failed to archive chunk', e);
        }
    }

    async getAll() {
        if (!this.db) await this.init();
        return this.db?.getAll(this.CHUNKS_STORE);
    }
    
    async getCount() {
        if (!this.db) await this.init();
        return this.db?.count(this.CHUNKS_STORE);
    }

    // ============================================
    // Samples (User-saved Loops)
    // ============================================

    async saveSample(sample: Omit<LoopSample, 'id' | 'createdAt'>): Promise<string> {
        if (!this.db) await this.init();
        
        const id = crypto.randomUUID();
        const fullSample: LoopSample = {
            ...sample,
            id,
            createdAt: Date.now(),
        };
        
        await this.db?.add(this.SAMPLES_STORE, fullSample);
        console.log(`[LoopLibrary] Saved sample: ${sample.name} (${id})`);
        return id;
    }

    async getSample(id: string): Promise<LoopSample | undefined> {
        if (!this.db) await this.init();
        return this.db?.get(this.SAMPLES_STORE, id);
    }

    async getAllSamples(): Promise<LoopSample[]> {
        if (!this.db) await this.init();
        const samples = await this.db?.getAll(this.SAMPLES_STORE);
        // Sort by newest first
        return (samples || []).sort((a, b) => b.createdAt - a.createdAt);
    }

    async deleteSample(id: string): Promise<void> {
        if (!this.db) await this.init();
        await this.db?.delete(this.SAMPLES_STORE, id);
        console.log(`[LoopLibrary] Deleted sample: ${id}`);
    }

    async getSampleCount(): Promise<number> {
        if (!this.db) await this.init();
        return (await this.db?.count(this.SAMPLES_STORE)) || 0;
    }

    // ============================================
    // Tag Management
    // ============================================

    async updateSampleTags(id: string, tags: string[]): Promise<void> {
        if (!this.db) await this.init();
        const sample = await this.getSample(id);
        if (!sample) return;
        
        sample.tags = tags;
        await this.db?.put(this.SAMPLES_STORE, sample);
        console.log(`[LoopLibrary] Updated tags for ${id}: ${tags.join(', ')}`);
    }

    async getAllTags(): Promise<string[]> {
        if (!this.db) await this.init();
        const samples = await this.getAllSamples();
        const tagSet = new Set<string>();
        samples.forEach(s => s.tags.forEach(t => tagSet.add(t)));
        return Array.from(tagSet).sort();
    }

    // ============================================
    // Recommendation (Vector Similarity)
    // ============================================

    /**
     * Find samples similar to the given vector using Euclidean distance
     * @param vector Target feature vector
     * @param limit Max results to return
     * @param excludeId Optional ID to exclude (e.g., currently playing sample)
     * @param complementary If true, find opposite characteristics
     */
    async findSimilar(
        vector: { brightness: number; energy: number; rhythm: number },
        limit: number = 5,
        excludeId?: string,
        complementary: boolean = false
    ): Promise<LoopSample[]> {
        if (!this.db) await this.init();
        const samples = await this.getAllSamples();
        
        // Calculate distance for each sample
        const withDistance = samples
            .filter(s => s.id !== excludeId)
            .map(sample => {
                let distance: number;
                if (complementary) {
                    // For complementary: look for opposite characteristics
                    distance = Math.sqrt(
                        Math.pow((1 - sample.vector.brightness) - vector.brightness, 2) +
                        Math.pow((1 - sample.vector.energy) - vector.energy, 2) +
                        Math.pow(sample.vector.rhythm - vector.rhythm, 2) // Keep rhythm similar
                    );
                } else {
                    // Standard Euclidean distance
                    distance = Math.sqrt(
                        Math.pow(sample.vector.brightness - vector.brightness, 2) +
                        Math.pow(sample.vector.energy - vector.energy, 2) +
                        Math.pow(sample.vector.rhythm - vector.rhythm, 2)
                    );
                }
                return { sample, distance };
            });
        
        // Sort by distance (closest first)
        withDistance.sort((a, b) => a.distance - b.distance);
        
        return withDistance.slice(0, limit).map(w => w.sample);
    }
}
