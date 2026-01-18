
import { AudioEngine } from '../audio/engine';
import { AutomationScore, AutomationTrack, CurveType, Keyframe, ParameterID, ResetAction } from '../types/ai-mix';

export class AutomationEngine {
  private engine: AudioEngine;
  private isPlaying: boolean = false;
  private startTime: number = 0;
  private currentBar: number = 0;
  private score: AutomationScore | null = null;
  private animationFrameId: number | null = null;
  private onProgressCallback: ((bar: number, phase: string) => void) | null = null;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  loadScore(score: AutomationScore) {
    this.score = score;
    // Validate or Reset state if needed
  }

  start() {
    if (!this.score) {
      console.warn("No score loaded");
      return;
    }
    this.isPlaying = true;
    this.startTime = this.engine['context'].currentTime; // Access raw context time
    // Adjust start time to sync with next bar? For now immediate.
    this.loop();
  }

  stop() {
    this.isPlaying = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Trigger Phase 4: Reset
    if (this.score && this.score.post_mix_reset) {
        this.handlePostMixReset(this.score.post_mix_reset);
    }
  }
  
  setOnProgress(cb: (bar: number, phase: string) => void) {
      this.onProgressCallback = cb;
  }

  private loop = () => {
    if (!this.isPlaying || !this.score) return;

    const now = this.engine['context'].currentTime;
    const elapsed = now - this.startTime;
    const bpm = this.score.meta.target_bpm;
    const secondsPerBar = (60 / bpm) * 4;
    
    this.currentBar = elapsed / secondsPerBar;

    if (this.currentBar >= this.score.meta.total_bars) {
      this.stop();
      return;
    }
    
    // Determine Phase
    const progress = this.currentBar / this.score.meta.total_bars;
    let phase = "UNKNOWN";
    if (progress < 0.3) phase = "PRESENCE";
    else if (progress < 0.7) phase = "HANDOFF";
    else phase = "WASH OUT";
    
    if (this.onProgressCallback) this.onProgressCallback(this.currentBar, phase);

    // Process Tracks
    for (const track of this.score.tracks) {
      const val = this.evaluateTrack(track, this.currentBar, bpm);
      this.applyParam(track.target_id, val);
    }

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  private evaluateTrack(track: AutomationTrack, currentBar: number, bpm: number): number | boolean {
    // Find surrounding keyframes
    // Sort just in case (should be pre-sorted)
    const points = track.points; // Assume sorted by time
    
    // 1. Before first point
    if (points.length === 0) return 0; // Fallback
    if (currentBar <= points[0].time) return points[0].value;
    
    // 2. After last point
    if (currentBar >= points[points.length - 1].time) return points[points.length - 1].value;

    // 3. Between points
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i+1];
        
        if (currentBar >= p1.time && currentBar < p2.time) {
            const t = (currentBar - p1.time) / (p2.time - p1.time); // 0..1
            
            // Boolean handling (STEP)
            if (typeof p1.value === 'boolean' || typeof p2.value === 'boolean') {
                return t < 1.0 ? p1.value : p2.value;
            }
            
            const v1 = p1.value as number;
            const v2 = p2.value as number;
            
            return this.interpolate(v1, v2, t, p2.curve, p2.wobble_amount, currentBar, bpm);
        }
    }
    
    return points[0].value;
  }

  private interpolate(v1: number, v2: number, t: number, curve: CurveType, wobbleAmount: number = 0, currentBar: number, bpm: number): number {
      let p = t;
      
      switch (curve) {
          case 'STEP': return t < 1.0 ? v1 : v2;
          case 'HOLD': return v1;
          case 'LINEAR': break;
          case 'EXP': 
              // Simple x^2 implementation
              p = t * t; 
              break;
          case 'LOG':
              p = Math.sqrt(t);
              break;
          case 'SIGMOID':
               const k = 10;
               const sigmoid = 1 / (1 + Math.exp(-k * (t - 0.5)));
               const min = 1 / (1 + Math.exp(k * 0.5));
               const max = 1 / (1 + Math.exp(-k * 0.5));
               p = (sigmoid - min) / (max - min);
               break;
          case 'WOBBLE':
              // Linear base
              const linear = v1 + (v2 - v1) * t;
              // Wobble logic
              // Sine wave based on BPM (beat synced)
              // 1 Hz = 60 BPM. 
              const freq = (bpm / 60) * 2; // 2 beats cycle
              const phase = currentBar * Math.PI * 2; 
              
              const window = Math.sin(t * Math.PI); // Window to 0 at ends
              const noise = Math.sin(phase) * Math.sin(phase * 1.5); // Simple pseudo-random
              
              const wobble = noise * window * wobbleAmount * 0.2;
              return linear + wobble;
      }
      
      return v1 + (v2 - v1) * p;
  }
  
  private dispatchUpdate(parameter: string, value: number) {
      if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('mixer-update', {
              detail: { parameter, value }
          }));
      }
  }

  private applyParam(id: ParameterID, val: number | boolean) {
      if (typeof val === 'boolean') {
          // Handle Booleans
           if (id.includes('SLICER_ON')) this.engine.updateDspParam('SLICER_ACTIVE', val ? 1.0 : 0.0);
           // TODO: Handle others
           return;
      }
      
      const v = val as number;

      switch (id) {
          case 'CROSSFADER': 
              this.engine.setCrossfader(v); 
              this.dispatchUpdate('crossfader', v);
              break;
          case 'DECK_A_VOL': 
              this.engine.setDeckVolume('A', v); 
              this.dispatchUpdate('volumeA', v);
              break;
          case 'DECK_B_VOL': 
              this.engine.setDeckVolume('B', v); 
              this.dispatchUpdate('volumeB', v);
              break;
          
          case 'DECK_A_EQ_HI': 
              this.engine.setEq('A', 'HI', v); 
              this.dispatchUpdate('highA', v);
              break;
          case 'DECK_A_EQ_MID': 
              this.engine.setEq('A', 'MID', v); 
              this.dispatchUpdate('midA', v);
              break;
          case 'DECK_A_EQ_LOW': 
              this.engine.setEq('A', 'LOW', v); 
              this.dispatchUpdate('lowA', v);
              break;
          
          case 'DECK_B_EQ_HI': 
              this.engine.setEq('B', 'HI', v); 
              this.dispatchUpdate('highB', v);
              break;
          case 'DECK_B_EQ_MID': 
              this.engine.setEq('B', 'MID', v); 
              this.dispatchUpdate('midB', v);
              break;
          case 'DECK_B_EQ_LOW': 
              this.engine.setEq('B', 'LOW', v); 
              this.dispatchUpdate('lowB', v);
              break;

          // Mapping FILTER to EQ for V1 Compatibility
          case 'DECK_A_FILTER_CUTOFF':
             if (v > 0.5) {
                 // High Pass (Cut Lows)
                 const amount = (v - 0.5) * 2.0;
                 const eqVal = 1.0 - amount;
                 this.engine.setEq('A', 'LOW', eqVal);
                 this.dispatchUpdate('lowA', eqVal);
                 // Reset High (ensure it is open)
                 // this.engine.setEq('A', 'HI', 1.0); // Maybe optional, but safe?
             } else {
                 // Low Pass (Cut Highs)
                 const amount = (0.5 - v) * 2.0; 
                 const eqVal = 1.0 - amount;
                 this.engine.setEq('A', 'HI', eqVal);
                 this.dispatchUpdate('highA', eqVal);
             }
             break;

          case 'DECK_B_FILTER_CUTOFF':
             if (v > 0.5) {
                 const amount = (v - 0.5) * 2.0;
                 const eqVal = 1.0 - amount;
                 this.engine.setEq('B', 'LOW', eqVal);
                 this.dispatchUpdate('lowB', eqVal);
             } else {
                 const amount = (0.5 - v) * 2.0; 
                 const eqVal = 1.0 - amount;
                 this.engine.setEq('B', 'HI', eqVal);
                 this.dispatchUpdate('highB', eqVal);
             }
             break;
             
          // FX
          case 'DECK_A_ECHO_SEND': 
             this.engine.updateDspParam('DUB', v); 
             // Toggle Tape Active if send is > 0
             if (v > 0.05) this.engine.updateDspParam('TAPE_ACTIVE', 1.0);
             else this.engine.updateDspParam('TAPE_ACTIVE', 0.0);
             break;

          case 'DECK_A_ECHO_FEEDBACK':
             // Echo Feedback logic not fully mapped to UI slider in this codebase yet
             // Just Engine update
             this.engine.updateDspParam('DUB', v);
             break;
          
          case 'MASTER_SLAM_AMOUNT':
             this.updateSlam(v);
             break;
      }
  }
  
  private updateSlam(intensity: number) {
        // Simple macro based on main.ts logic
        const baseCutoff = 20.0;
        const maxCutoff = 10000;
        const maxRes = 15.0;
        const maxDrive = 4.0;
        const maxNoise = 0.1;
        
        const cutoff = baseCutoff * Math.pow(maxCutoff / baseCutoff, intensity);
        const resonance = 1.0 + (intensity * (maxRes - 1.0));
        const drive = 1.0 + (intensity * (maxDrive - 1.0));
        const noise = intensity * maxNoise;

        this.engine.updateDspParam('SLAM_CUTOFF', cutoff);
        this.engine.updateDspParam('SLAM_RES', resonance);
        this.engine.updateDspParam('SLAM_DRIVE', drive);
        this.engine.updateDspParam('SLAM_NOISE', noise);
  }

  private handlePostMixReset(config: { target_deck: string, actions: ResetAction[] }) {
      const bpm = this.score?.meta.target_bpm || 120;
      const secPerBar = (60 / bpm) * 4;
      
      config.actions.forEach(action => {
          const delayMs = action.wait_bars * secPerBar * 1000;
          setTimeout(() => {
              this.applyParam(action.target, action.value);
              console.log(`[AI Mix] Reset ${action.target} to ${action.value}`);
          }, delayMs);
      });
  }
}
