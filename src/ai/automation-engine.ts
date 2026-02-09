
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
  
  // Grace period for transport commands after start()
  // SafetyNet establishes correct play state, so we ignore Bar 0 transport commands
  private gracePeriodEndBar = 0.5;
  
  // Track executed one-shot commands to prevent repeated triggering
  private executedOneShotCommands: Set<string> = new Set();
  
  // FORBIDDEN parameters - AI is not allowed to control these
  private static readonly FORBIDDEN_PARAMS = [
      'DECK_A_TRIM', 'DECK_B_TRIM', 'TRIM_A', 'TRIM_B',
      'DECK_A_DRIVE', 'DECK_B_DRIVE', 'DRIVE_A', 'DRIVE_B',
      'TRIM', 'DRIVE',
      // SLICER causes audio artifacts (tremolo effect) - block it
      'DECK_A_SLICER_ON', 'DECK_B_SLICER_ON', 
      'DECK_A_SLICER_RATE', 'DECK_B_SLICER_RATE',
      'SLICER_ON', 'SLICER_RATE', 'SLICER_ACTIVE'
  ];
  
  // Track mix direction to protect source deck from being stopped
  private mixDirection: 'A->B' | 'B->A' | null = null;
  
  // Track already-logged blocked commands to avoid spam (log once per command per mix)
  private loggedBlockedCommands: Set<string> = new Set();
  
  // Parameter value cache to avoid sending duplicate values to AudioEngine
  // This prevents performance issues from thousands of redundant updates per second
  private paramValueCache: Map<string, number | boolean> = new Map();
  
  // RATE LIMITER: Prevent overwhelming AudioWorklet with postMessages
  // 10fps (100ms interval) is sufficient for smooth DJ mixing automation
  private lastUpdateTime = 0;
  private static readonly UPDATE_INTERVAL_MS = 100;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  loadScore(score: AutomationScore) {
    this.score = score;
    // Reset all tracking when loading new score
    this.executedOneShotCommands.clear();
    this.loggedBlockedCommands.clear();
    this.paramValueCache.clear();
    
    // Detect mix direction from score metadata or transport commands
    this.detectMixDirection();
  }
  
  private detectMixDirection() {
    if (!this.score) return;
    
    // Check if description mentions direction, or check CROSSFADER track
    const desc = this.score.meta.description?.toLowerCase() || '';
    if (desc.includes('a->b') || desc.includes('a to b')) {
        this.mixDirection = 'A->B';
    } else if (desc.includes('b->a') || desc.includes('b to a')) {
        this.mixDirection = 'B->A';
    } else {
        // Fallback: check crossfader track direction
        const cfTrack = this.score.tracks.find(t => t.target_id === 'CROSSFADER');
        if (cfTrack && cfTrack.points.length >= 2) {
            const startVal = cfTrack.points[0].value as number;
            const endVal = cfTrack.points[cfTrack.points.length - 1].value as number;
            this.mixDirection = endVal > startVal ? 'A->B' : 'B->A';
        }
    }
    console.log(`[AutomationEngine] Detected mix direction: ${this.mixDirection}`);
  }

  start() {
    if (!this.score) {
      console.warn("No score loaded");
      return;
    }
    
    // CRITICAL: Cancel any existing animation loop to prevent duplicates
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    this.isPlaying = true;
    this.startTime = this.engine['context'].currentTime;
    this.loop();
  }

  stop() {
    this.isPlaying = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Clear one-shot tracking on stop
    this.executedOneShotCommands.clear();
    this.loggedBlockedCommands.clear();
    this.paramValueCache.clear();
    
    // Notify UI that mix is complete so it can transition to IDLE state
    if (this.score && this.onProgressCallback) {
        this.onProgressCallback(this.score.meta.total_bars, 'COMPLETE');
    }
    
    // CRITICAL: Reset FX that may have been activated during mix
    // This prevents tremolo/gate effects from persisting after mix ends
    this.engine.updateDspParam('SLICER_ACTIVE', 0.0);
    console.log('[AutomationEngine] Reset SLICER_ACTIVE to 0 on mix stop');
    
    // =========================================================
    // FAILSAFE: Ensure mix finishes in correct state
    // Even if AI's JSON was incomplete, force correct end state
    // =========================================================
    if (this.mixDirection) {
        const EQ_DEFAULT = 0.67; // Default EQ position (67%)
        
        if (this.mixDirection === 'A->B') {
            // A->B: Crossfader fully to B, Stop A, Reset A's EQ
            console.log('[AutomationEngine] Failsafe: Finalizing A->B mix');
            
            // 1. Force crossfader to B (1.0)
            this.engine.setCrossfader(1.0);
            this.dispatchUpdate('crossfader', 1.0);
            
            // 2. Stop Deck A (source deck is done)
            this.dispatchPlaybackCommand('A', false);
            
            // 3. Reset Deck A's 3-band EQ to default
            this.engine.setEq('A', 'LOW', EQ_DEFAULT);
            this.engine.setEq('A', 'MID', EQ_DEFAULT);
            this.engine.setEq('A', 'HI', EQ_DEFAULT);
            this.dispatchUpdate('lowA', EQ_DEFAULT);
            this.dispatchUpdate('midA', EQ_DEFAULT);
            this.dispatchUpdate('highA', EQ_DEFAULT);
            
        } else if (this.mixDirection === 'B->A') {
            // B->A: Crossfader fully to A, Stop B, Reset B's EQ
            console.log('[AutomationEngine] Failsafe: Finalizing B->A mix');
            
            // 1. Force crossfader to A (0.0)
            this.engine.setCrossfader(0.0);
            this.dispatchUpdate('crossfader', 0.0);
            
            // 2. Stop Deck B (source deck is done)
            this.dispatchPlaybackCommand('B', false);
            
            // 3. Reset Deck B's 3-band EQ to default
            this.engine.setEq('B', 'LOW', EQ_DEFAULT);
            this.engine.setEq('B', 'MID', EQ_DEFAULT);
            this.engine.setEq('B', 'HI', EQ_DEFAULT);
            this.dispatchUpdate('lowB', EQ_DEFAULT);
            this.dispatchUpdate('midB', EQ_DEFAULT);
            this.dispatchUpdate('highB', EQ_DEFAULT);
        }
    }
    
    // Trigger Phase 4: Reset (AI's custom post-mix actions)
    if (this.score && this.score.post_mix_reset) {
        this.handlePostMixReset(this.score.post_mix_reset);
    }
  }
  
  setOnProgress(cb: (bar: number, phase: string) => void) {
      this.onProgressCallback = cb;
  }

  private loop = () => {
    if (!this.isPlaying || !this.score) return;
    
    // RATE LIMITER: Skip frames to prevent overwhelming AudioWorklet
    const perfNow = performance.now();
    if (perfNow - this.lastUpdateTime < AutomationEngine.UPDATE_INTERVAL_MS) {
      this.animationFrameId = requestAnimationFrame(this.loop);
      return; // Skip this frame
    }
    this.lastUpdateTime = perfNow;

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

  private applyGlobalFilterFromBipolarCutoff(v: number) {
      const clamped = Math.max(0, Math.min(1, v));
      const hpf = clamped > 0.5 ? (clamped - 0.5) * 2.0 : 0.0;
      const lpf = clamped < 0.5 ? 1.0 - ((0.5 - clamped) * 2.0) : 1.0;
      const active = Math.abs(clamped - 0.5) > 0.02 ? 1.0 : 0.0;
      this.engine.updateDspParam('FILTER_ACTIVE', active);
      this.engine.updateDspParam('HPF', hpf);
      this.engine.updateDspParam('LPF', lpf);
      this.dispatchUpdate('FILTER_ACTIVE', active);
      this.dispatchUpdate('HPF', hpf);
      this.dispatchUpdate('LPF', lpf);
  }

  private applyParam(id: ParameterID, val: number | boolean) {
      // Block FORBIDDEN parameters (TRIM, DRIVE)
      if (AutomationEngine.FORBIDDEN_PARAMS.includes(id as string)) {
          // Log only once
          if (!this.loggedBlockedCommands.has(`forbidden_${id}`)) {
              this.loggedBlockedCommands.add(`forbidden_${id}`);
              console.warn(`[AutomationEngine] Blocked forbidden parameter: ${id}`);
          }
          return;
      }
      
      // CRITICAL: Skip if value hasn't changed significantly
      // This prevents performance issues from redundant AudioEngine updates every frame
      const cachedVal = this.paramValueCache.get(id);
      if (cachedVal !== undefined) {
          if (typeof val === 'boolean' && val === cachedVal) {
              return; // Boolean unchanged
          }
          if (typeof val === 'number' && typeof cachedVal === 'number') {
              // Only update if changed by more than 0.01 (1%)
              // This significantly reduces AudioEngine message traffic
              if (Math.abs(val - cachedVal) < 0.01) {
                  return; // Number unchanged within threshold
              }
          }
      }
      // Update cache
      this.paramValueCache.set(id, val);
      
      if (typeof val === 'boolean') {
          this.applyBooleanParam(id, val);
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
             this.applyGlobalFilterFromBipolarCutoff(v);
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
             this.applyGlobalFilterFromBipolarCutoff(v);
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

          case 'DECK_A_FILTER_RES':
          case 'DECK_B_FILTER_RES':
             this.engine.updateDspParam('FILTER_ACTIVE', 1.0);
             this.engine.updateDspParam('FILTER_Q', v);
             this.dispatchUpdate('FILTER_ACTIVE', 1.0);
             this.dispatchUpdate('FILTER_Q', v);
             break;
             
          // FX
          case 'DECK_A_ECHO_SEND': 
             this.engine.updateDspParam('DUB', v); 
             this.dispatchUpdate('DUB', v);
             // Toggle Tape Active automatically if send is > 0
             if (v > 0.05) {
                 this.engine.updateDspParam('TAPE_ACTIVE', 1.0);
                 this.dispatchUpdate('TAPE_ACTIVE', 1.0);
             } else {
                 this.engine.updateDspParam('TAPE_ACTIVE', 0.0);
                 this.dispatchUpdate('TAPE_ACTIVE', 0.0);
             }
             break;
          case 'DECK_B_ECHO_SEND': 
             this.engine.updateDspParam('DUB', v); 
             this.dispatchUpdate('DUB', v);
             if (v > 0.05) {
                 this.engine.updateDspParam('TAPE_ACTIVE', 1.0);
                 this.dispatchUpdate('TAPE_ACTIVE', 1.0);
             } else {
                 this.engine.updateDspParam('TAPE_ACTIVE', 0.0);
                 this.dispatchUpdate('TAPE_ACTIVE', 0.0);
             }
             break;

          case 'DECK_A_REVERB_MIX':
          case 'DECK_B_REVERB_MIX':
             this.engine.updateDspParam('BLOOM_WET', v);
             this.dispatchUpdate('BLOOM_WET', v);
             if (v > 0.05) {
                 this.engine.updateDspParam('REVERB_ACTIVE', 1.0);
                 this.dispatchUpdate('REVERB_ACTIVE', 1.0);
             } else {
                 this.engine.updateDspParam('REVERB_ACTIVE', 0.0);
                 this.dispatchUpdate('REVERB_ACTIVE', 0.0);
             }
             break;

          case 'DECK_A_SLICER_RATE':
          case 'DECK_B_SLICER_RATE':
             // Map 0.0-1.0 to Slicer Pattern (1/16 to 1/2)
             // 0.0 = Fast (1/16 = 0.0625), 1.0 = Slow (1/2 = 0.5)
             const pattern = 0.0625 + (v * (0.5 - 0.0625));
             this.engine.updateDspParam('SLICER_PATTERN', pattern);
             this.dispatchUpdate('SLICER_PATTERN', pattern);
             break;
          
          case 'MASTER_SLAM_AMOUNT':
             this.updateSlam(v);
             // Dispatch handled in updateSlam? No.
             this.dispatchUpdate('SLAM_AMOUNT', v);
             break;

          case 'MASTER_COMP_THRESH':
             this.engine.updateDspParam('COMP_ACTIVE', 1.0);
             this.engine.updateDspParam('COMP_THRESH', v);
             this.dispatchUpdate('COMP_ACTIVE', 1.0);
             this.dispatchUpdate('COMP_THRESH', v);
             break;
      }
  }

  // Handle Boolean Parameters separately or in applyParam check
  // See line 167 in original file
  private applyBooleanParam(id: ParameterID, val: boolean) {
       if (id === 'DECK_A_SLICER_ON') {
           this.engine.updateDspParam('SLICER_TARGET', 0.0); // A
           this.engine.updateDspParam('SLICER_ACTIVE', val ? 1.0 : 0.0);
       } else if (id === 'DECK_B_SLICER_ON') {
           this.engine.updateDspParam('SLICER_TARGET', 1.0); // B
           this.engine.updateDspParam('SLICER_ACTIVE', val ? 1.0 : 0.0);
       }
       
       // --- Transport (Smart Playback) ---
       // These are ONE-SHOT commands - only execute once per keyframe
       else if (id === 'DECK_A_PLAY' || id === 'DECK_B_PLAY' || 
                id === 'DECK_A_STOP' || id === 'DECK_B_STOP') {
           // Only act if value is TRUE (Trigger)
           if (val === true) {
               // Grace period: Ignore transport commands in first 0.5 bars
               // SafetyNet has already established the correct play state
               if (this.currentBar < this.gracePeriodEndBar) {
                   // Log only once per command to avoid spam
                   if (!this.loggedBlockedCommands.has(`grace_${id}`)) {
                       this.loggedBlockedCommands.add(`grace_${id}`);
                       console.log(`[AutomationEngine] Ignoring ${id} during grace period`);
                   }
                   return;
               }
               
               // SOURCE DECK PROTECTION: Never stop the source deck during a mix
               // A->B: Source is A, should NOT be stopped
               // B->A: Source is B, should NOT be stopped
               if (this.mixDirection === 'A->B' && id === 'DECK_A_STOP') {
                   // Log only once to avoid spam
                   if (!this.loggedBlockedCommands.has(id)) {
                       this.loggedBlockedCommands.add(id);
                       console.log(`[AutomationEngine] Blocked ${id} - Source deck A protected`);
                   }
                   return;
               }
               if (this.mixDirection === 'B->A' && id === 'DECK_B_STOP') {
                   if (!this.loggedBlockedCommands.has(id)) {
                       this.loggedBlockedCommands.add(id);
                       console.log(`[AutomationEngine] Blocked ${id} - Source deck B protected`);
                   }
                   return;
               }
               
               // TARGET DECK PROTECTION: Never stop the target (incoming) deck
               // A->B: Target is B, should NEVER be stopped - it must keep playing after mix
               // B->A: Target is A, should NEVER be stopped - it must keep playing after mix
               if (this.mixDirection === 'A->B' && id === 'DECK_B_STOP') {
                   if (!this.loggedBlockedCommands.has(id)) {
                       this.loggedBlockedCommands.add(id);
                       console.log(`[AutomationEngine] Blocked ${id} - Target deck B must keep playing after mix`);
                   }
                   return;
               }
               if (this.mixDirection === 'B->A' && id === 'DECK_A_STOP') {
                   if (!this.loggedBlockedCommands.has(id)) {
                       this.loggedBlockedCommands.add(id);
                       console.log(`[AutomationEngine] Blocked ${id} - Target deck A must keep playing after mix`);
                   }
                   return;
               }
               
               // Find the exact keyframe time for this command from the score
               // This ensures we track by keyframe, not by current bar position
               const keyframeTime = this.findKeyframeTimeForCommand(id);
               const commandKey = `${id}_${keyframeTime}`;
               
               // Check if already executed
               if (this.executedOneShotCommands.has(commandKey)) {
                   return; // Already executed, skip
               }
               
               // Mark as executed
               this.executedOneShotCommands.add(commandKey);
               
               // Now dispatch
               if (id === 'DECK_A_PLAY') {
                   this.dispatchPlaybackCommand('A', true);
               }
               else if (id === 'DECK_B_PLAY') {
                   this.dispatchPlaybackCommand('B', true);
               }
               else if (id === 'DECK_A_STOP') {
                   this.dispatchPlaybackCommand('A', false);
               }
               else if (id === 'DECK_B_STOP') {
                   this.dispatchPlaybackCommand('B', false);
               }
           }
       }
   }

   /**
    * Find the keyframe time for a transport command based on current bar position
    * This returns the time of the keyframe that is currently active
    */
   private findKeyframeTimeForCommand(id: ParameterID): number {
       if (!this.score) return -1;
       
       const track = this.score.tracks.find(t => t.target_id === id);
       if (!track || !track.points || track.points.length === 0) return -1;
       
       // Find the most recent keyframe that has passed
       for (let i = track.points.length - 1; i >= 0; i--) {
           const point = track.points[i];
           if (this.currentBar >= point.time) {
               return point.time;
           }
       }
       
       return track.points[0].time;
   }

  private dispatchPlaybackCommand(deckId: 'A' | 'B', playing: boolean) {
        // console.log(`[AutomationEngine] Force Playback State Deck ${deckId}: ${playing}`);
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('deck-play-toggle', {
                detail: { deckId, playing } // Explicit state prevents toggling loop
            }));
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
