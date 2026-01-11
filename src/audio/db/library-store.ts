import { openDB, IDBPDatabase, DBSchema } from 'idb';

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
}

export class LibraryStore {
    private db: IDBPDatabase<PromptDJLibrary> | null = null;
    private readonly DB_NAME = 'promptdj-ghost-memory';
    private readonly STORE_NAME = 'chunks';

    async init() {
        this.db = await openDB<PromptDJLibrary>(this.DB_NAME, 1, {
            upgrade(db) {
                const store = db.createObjectStore('chunks', { 
                    keyPath: 'timestamp' 
                });
                store.createIndex('by-energy', 'vector.energy');
                store.createIndex('by-brightness', 'vector.brightness');
            },
        });
        console.log('[GhostSystem] LibraryStore Initialized (IndexedDB)');
    }

    async saveChunk(pcmData: Float32Array, vector: { brightness: number; energy: number; rhythm: number }) {
        if (!this.db) await this.init();
        
        try {
            await this.db?.add(this.STORE_NAME, {
                timestamp: Date.now(),
                duration: pcmData.length / 44100,
                vector,
                pcmData
            });
            // console.log('[GhostSystem] Archived chunk to Library');
        } catch (e) {
            console.warn('[GhostSystem] Failed to archive chunk', e);
        }
    }

    async getAll() {
        if (!this.db) await this.init();
        return this.db?.getAll(this.STORE_NAME);
    }
    
    async getCount() {
        if (!this.db) await this.init();
        return this.db?.count(this.STORE_NAME);
    }
}
