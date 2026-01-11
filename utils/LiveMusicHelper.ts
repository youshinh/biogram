/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import type { LiveMusicGenerationConfig, PlaybackState, Prompt } from '../types';
import type { AudioChunk, GoogleGenAI, LiveMusicFilteredPrompt, LiveMusicServerMessage, LiveMusicSession } from '@google/genai';
import { decode, decodeAudioData } from './audio';
import { throttle } from './throttle';

export class LiveMusicHelper extends EventTarget {

  private ai: GoogleGenAI;
  private model: string;

  private session: LiveMusicSession | null = null;
  private sessionPromise: Promise<LiveMusicSession> | null = null;

  private connectionError = true;

  private filteredPrompts = new Set<string>();
  private nextStartTime = 0;
  private bufferTime = 2;

  public readonly audioContext: AudioContext;
  public extraDestination: AudioNode | null = null;

  public readonly analyserNode: AnalyserNode;
  private readonly bassBoostNode: BiquadFilterNode;
  private outputNode: GainNode;
  private playbackState: PlaybackState = 'stopped';

  private args: LiveMusicGenerationConfig = { bpm: 120, density: 0.5, guidance: 0.5 };
  private prompts: Map<string, Prompt>;

  constructor(ai: GoogleGenAI, model: string) {
    super();
    this.ai = ai;
    this.model = model;
    this.prompts = new Map();
    this.prompts = new Map();
    this.audioContext = new AudioContext({ sampleRate: 48000 });
    
    // Audio Graph: Source -> BassBoost -> Analyser -> Output -> Destination
    this.outputNode = this.audioContext.createGain();
    
    this.bassBoostNode = this.audioContext.createBiquadFilter();
    this.bassBoostNode.type = 'lowshelf';
    this.bassBoostNode.frequency.value = 150; // Boost below 150Hz
    this.bassBoostNode.gain.value = 0; // Default flat

    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 2048;

    this.bassBoostNode.connect(this.analyserNode);
    this.analyserNode.connect(this.outputNode);
  }

  private getSession(): Promise<LiveMusicSession> {
    if (!this.sessionPromise) this.sessionPromise = this.connect();
    return this.sessionPromise;
  }

  private async connect(): Promise<LiveMusicSession> {
    this.sessionPromise = this.ai.live.music.connect({
      model: this.model,
      callbacks: {
        onmessage: async (e: LiveMusicServerMessage) => {
          if (e.setupComplete) {
            this.connectionError = false;
          }
          if (e.filteredPrompt) {
            this.filteredPrompts = new Set([...this.filteredPrompts, e.filteredPrompt.text!])
            this.dispatchEvent(new CustomEvent<LiveMusicFilteredPrompt>('filtered-prompt', { detail: e.filteredPrompt }));
          }
          if (e.serverContent?.audioChunks) {
            await this.processAudioChunks(e.serverContent.audioChunks);
          }
        },
        onerror: () => {
          this.connectionError = true;
          this.stop();
          this.dispatchEvent(new CustomEvent('error', { detail: 'Connection error, please restart audio.' }));
        },
        onclose: () => {
          this.connectionError = true;
          this.stop();
          this.dispatchEvent(new CustomEvent('error', { detail: 'Connection error, please restart audio.' }));
        },
      },
    });
    return this.sessionPromise;
  }

  private setPlaybackState(state: PlaybackState) {
    this.playbackState = state;
    this.dispatchEvent(new CustomEvent('playback-state-changed', { detail: state }));
  }

  private async processAudioChunks(audioChunks: AudioChunk[]) {
    if (this.playbackState === 'paused' || this.playbackState === 'stopped') return;
    const audioBuffer = await decodeAudioData(
      decode(audioChunks[0].data!),
      this.audioContext,
      48000,
      2,
    );
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    // Connect to the beginning of our custom graph instead of directly to output
    source.connect(this.bassBoostNode);
    if (this.nextStartTime === 0) {
      this.nextStartTime = this.audioContext.currentTime + this.bufferTime;
      setTimeout(() => {
        this.setPlaybackState('playing');
      }, this.bufferTime * 1000);
    }
    if (this.nextStartTime < this.audioContext.currentTime) {
      this.setPlaybackState('loading');
      this.nextStartTime = 0;
      return;
    }
    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
  }

  public get activePrompts() {
    return Array.from(this.prompts.values())
      .filter((p) => {
        return !this.filteredPrompts.has(p.text) && p.weight !== 0;
      })
  }

  public readonly setWeightedPrompts = throttle(async (prompts: Map<string, Prompt>) => {
    this.prompts = prompts;

    if (this.activePrompts.length === 0) {
      this.dispatchEvent(new CustomEvent('error', { detail: 'There needs to be one active prompt to play.' }));
      this.pause();
      return;
    }

    // store the prompts to set later if we haven't connected yet
    // there should be a user interaction before calling setWeightedPrompts
    if (!this.session) return;

    const weightedPrompts = this.activePrompts.map((p) => {
      return {text: p.text, weight: p.weight};
    });
    try {
      await this.session.setWeightedPrompts({
        weightedPrompts,
      });
    } catch (e: any) {
      this.dispatchEvent(new CustomEvent('error', { detail: e.message }));
      this.pause();
    }
  }, 200);

  public readonly setMusicGenerationConfig = throttle(
    async (config: LiveMusicGenerationConfig) => {
      this.args = { ...this.args, ...config };
      if (!this.session) return;
      try {
        // @ts-ignore - The SDK definition might be missing in the installed version, 
        // but checking the method existence at runtime is safer if types are not perfectly aligned.
        if (typeof this.session.setMusicGenerationConfig === 'function') {
             // @ts-ignore - Adjusting to match the expected signature: { musicGenerationConfig: ... }
             await this.session.setMusicGenerationConfig({ musicGenerationConfig: config });
        } else {
             console.warn('setMusicGenerationConfig is not available in the current SDK session.');
        }
      } catch (e: any) {
        // WebSocket errors are common during connection/disconnection. 
        // Log as warning instead of error to avoid cluttering console during development.
        console.warn('Failed to set music generation config:', e);
      }
    },
    200,
  );

  public setBassBoost(db: number) {
    // db range typically 0 to 20 for noticeable boost
    this.bassBoostNode.gain.setTargetAtTime(db, this.audioContext.currentTime, 0.1);
  }

  public get analyser() {
      return this.analyserNode;
  }

  public async play() {
    this.setPlaybackState('loading');
    this.session = await this.getSession();
    // Send initial configuration
    await this.setMusicGenerationConfig(this.args);
    await this.setWeightedPrompts(this.prompts);
    this.audioContext.resume();
    this.session.play();
    this.outputNode.connect(this.audioContext.destination);
    if (this.extraDestination) this.outputNode.connect(this.extraDestination);
    this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    this.outputNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.1);
  }

  public pause() {
    if (this.session) this.session.pause();
    this.setPlaybackState('paused');
    this.outputNode.gain.setValueAtTime(1, this.audioContext.currentTime);
    this.outputNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
    this.nextStartTime = 0;
    // Don't recreate the output node here to preserve connections, just mute it
  }

  public stop() {
    if (this.session) this.session.stop();
    this.setPlaybackState('stopped');
    this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    this.outputNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.1);
    this.nextStartTime = 0;
    this.session = null;
    this.sessionPromise = null;
  }

  public async playPause() {
    switch (this.playbackState) {
      case 'playing':
        return this.pause();
      case 'paused':
      case 'stopped':
        return this.play();
      case 'loading':
        return this.stop();
    }
  }

}
