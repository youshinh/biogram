import { VisualChunk } from '../../ai/visual-analyzer';
import type { VisualMode } from './modes';

type ScoreVisualMode = VisualMode | 'test_mic' | 'test_score' | 'debug_ai';

export interface VisualState {
    mode: ScoreVisualMode;
    theme: string;
    energy: number;
    chaos: number;
    distortion: number;
    cloud: number;
    event: 'NONE' | 'NOTE_ON' | 'NOTE_OFF' | 'DROP_IMPACT' | 'FADE_OUT' | 'BUILDUP_START' | 'INTRO';
}

export interface VisualKeyframe {
    time: number;
    state: VisualState;
}

export interface VisualScore {
    version: string;
    bpm: number;
    duration: number;
    tracks: {
        A: VisualKeyframe[];
        B: VisualKeyframe[];
    };
}

const toVisualStateEvent = (event: string): VisualState['event'] => {
    switch (event) {
        case 'DROP':
            return 'DROP_IMPACT';
        case 'BUILD':
            return 'BUILDUP_START';
        case 'BREAK':
            return 'FADE_OUT';
        case 'KICK':
        case 'SNARE':
            return 'NOTE_ON';
        case 'NONE':
            return 'NONE';
        default:
            return 'NONE';
    }
};

export class ScoreManager {
    private score: VisualScore | null = null;
    private currentTrack: 'A' | 'B' | 'MASTER' = 'MASTER'; // For now just use A/B or blend? 
    // We should probably return both A and B states and let the engine blend them if needed, 
    // or engine requests specific deck state.

    constructor() {}

    public loadScore(json: any) {
        try {
            // Basic validation could go here
            this.score = json as VisualScore;
            if (import.meta.env.DEV) console.log('[ScoreManager] Score loaded.', this.score);
        } catch (e) {
            console.error('[ScoreManager] Failed to load score', e);
        }
    }

    public addChunk(deck: 'A' | 'B', chunk: VisualChunk, startTime: number) {
        if (!this.score) {
            this.score = {
                version: "2.0 (Stream)",
                bpm: chunk.bpm,
                duration: 999999, // Infinite stream
                tracks: { A: [], B: [] }
            };
        }

        const track = this.score.tracks[deck];
        
        // Map Chunk Timeline to VisualKeyframes
        const newFrames: VisualKeyframe[] = chunk.timeline.map(event => {
            return {
                time: startTime + event.time, // Absolute Stream Time
                state: {
                    mode: 'organic', // Default mode, or infer from mood?
                    theme: chunk.mood || 'default',
                    energy: event.energy,
                    chaos: event.brightness, // Map Brightness -> Chaos
                    distortion: 0,
                    cloud: event.brightness * 0.5, // Map Brightness -> Cloud
                    event: toVisualStateEvent(event.event)
                }
            };
        });

        // Append 
        // Filter out overlaps? Or just push?
        // Simple push for now. Engine handles linear sort usually, but let's assume chunks arrive in order.
        track.push(...newFrames);
        
        // Prune old history? (Efficiency)
        // If track > 1000 items, remove first 500?
        if (track.length > 2000) {
            track.splice(0, 1000);
        }
    }

    public getInterpolatedState(deck: 'A' | 'B', currentTime: number): VisualState {
        if (!this.score || !this.score.tracks[deck]) {
            return this.getDefaultState();
        }

        const timeline = this.score.tracks[deck];
        
        // 1. Handle Out of Bounds
        if (timeline.length === 0) return this.getDefaultState();
        if (currentTime <= timeline[0].time) return timeline[0].state;
        if (currentTime >= timeline[timeline.length - 1].time) return timeline[timeline.length - 1].state;

        // 2. Find Keyframes (Linear Search for now, Optimize to Binary Search later if needed)
        // Since we play forward, we could cache the last index to speed up.
        let prevIdx = 0;
        for (let i = 0; i < timeline.length - 1; i++) {
            if (currentTime >= timeline[i].time && currentTime < timeline[i+1].time) {
                prevIdx = i;
                break;
            }
        }

        const prev = timeline[prevIdx];
        const next = timeline[prevIdx + 1];

        // 3. Interpolation
        const duration = Math.max(1e-6, next.time - prev.time);
        const progress = (currentTime - prev.time) / duration;
        const t = Math.max(0, Math.min(1, progress)); // Clamp

        return {
            // Discrete properties: Take previous (Hold) or Next depending on logic? Usually Previous.
            mode: prev.state.mode, 
            theme: prev.state.theme,
            event: prev.state.event, // Event triggers on the frame

            // Continuous properties: Lerp
            energy: this.lerp(prev.state.energy, next.state.energy, t),
            chaos: this.lerp(prev.state.chaos, next.state.chaos, t),
            distortion: this.lerp(prev.state.distortion, next.state.distortion, t),
            cloud: this.lerp(prev.state.cloud, next.state.cloud, t)
        };
    }
    
    // Helper to get events that happened EXACTLY in this frame?
    // Engine polls every frame (e.g. delta 0.016s). 
    // We might miss an event if we strictly check equality.
    // Better strategy: "Get events between lastTime and currentTime"
    public getEvents(deck: 'A' | 'B', startTime: number, endTime: number): string[] {
        if (!this.score || !this.score.tracks[deck]) return [];
        
        const events: string[] = [];
        const timeline = this.score.tracks[deck];
        
        for (const kf of timeline) {
            if (kf.time > startTime && kf.time <= endTime && kf.state.event !== 'NONE') {
                events.push(kf.state.event);
            }
        }
        return events;
    }

    private lerp(start: number, end: number, t: number): number {
        return start * (1 - t) + end * t;
    }

    public clearTrack(deck: 'A' | 'B') {
        if (this.score && this.score.tracks[deck]) {
            this.score.tracks[deck] = [];
            if (import.meta.env.DEV) console.log(`[ScoreManager] Cleared track ${deck}`);
        }
    }

    private getDefaultState(): VisualState {
        return {
            mode: 'organic',
            theme: 'default',
            energy: 0,
            chaos: 0,
            distortion: 0,
            cloud: 0,
            event: 'NONE'
        };
    }
}
