/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { throttle } from '../utils/throttle';

import './PromptController';
import './PlayPauseButton';
import type { PlaybackState, Prompt } from '../types';
import { MidiDispatcher } from '../utils/MidiDispatcher';

/** The grid of prompt inputs. */
@customElement('prompt-dj-midi')
export class PromptDjMidi extends LitElement {
  static override styles = css`
    :host {
      height: 100%;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      box-sizing: border-box;
      position: relative;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      color: #fff;
      overflow: hidden;
    }
    #background {
      will-change: background-image;
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: 100%;
      z-index: -1;
      background: #050505;
      /* Subtle noise texture or radial gradient overlay */
      background-image: radial-gradient(circle at 50% 50%, #111 0%, #000 100%);
    }
    
    #grid {
      width: 90vmin;
      height: 70vmin;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1vmin;
      margin-top: 5vmin;
      position: relative;
      z-index: 10;
    }
    
    prompt-controller {
      width: 100%;
      height: 100%;
    }

    play-pause-button {
      position: relative;
      width: 8vmin;
      margin-top: 3vmin;
      z-index: 20;
    }

    /* Top Left UI */
    #buttons {
      position: absolute;
      top: 20px;
      left: 20px;
      display: flex;
      gap: 10px;
      z-index: 20;
    }
    button, select {
      font-family: 'Courier New', monospace;
      font-size: 11px;
      background: rgba(0,0,0,0.5);
      color: #888;
      border: 1px solid #333;
      padding: 6px 10px;
      cursor: pointer;
      text-transform: uppercase;
      outline: none;
      transition: all 0.2s;
      border-radius: 2px;
      letter-spacing: 1px;
    }
    button:hover, select:hover {
      border-color: #666;
      color: #ccc;
    }
    button.active {
      background: #eee;
      color: #000;
      border-color: #fff;
    }
    select {
      color: #888; 
    }

    /* Top Right Controls */
    #controls {
      position: absolute;
      top: 20px;
      right: 20px;
      padding: 15px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: rgba(0, 0, 0, 0.7);
      border: 1px solid #333;
      border-radius: 2px;
      width: 200px;
      z-index: 20;
      backdrop-filter: blur(8px);
    }
    .control-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .control-group label {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      color: #999;
      text-transform: uppercase;
      letter-spacing: 1px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    /* Global Slider Style */
    input[type=range] {
      -webkit-appearance: none;
      width: 100%;
      background: transparent;
      outline: none;
      cursor: pointer;
      margin: 8px 0;
    }
    input[type=range]::-webkit-slider-runnable-track {
      width: 100%;
      height: 2px;
      background: #444;
      border-radius: 0;
    }
    input[type=range]::-webkit-slider-thumb {
      -webkit-appearance: none;
      height: 16px;
      width: 32px; /* Wider handle */
      border-radius: 2px;
      background: #000;
      border: 1px solid #888;
      margin-top: -7px; /* (16 - 2) / 2 = 7 */
      box-shadow: 0 1px 3px rgba(0,0,0,0.5);
      transition: background 0.2s, border-color 0.2s, transform 0.1s;
    }
    input[type=range]::-webkit-slider-thumb::after {
       content: '';
       position: absolute;
       top: 50%;
       left: 50%;
       width: 20px;
       height: 2px;
       background: #555;
       transform: translate(-50%, -50%);
    }
    input[type=range]:hover::-webkit-slider-thumb {
      border-color: #fff;
      background: #222;
    }
    input[type=range]:active::-webkit-slider-thumb {
      background: #444;
      border-color: #fff;
    }
    input[type=range]:focus::-webkit-slider-thumb {
      border-color: #ccc;
    }
  `;

  private prompts: Map<string, Prompt>;
  private midiDispatcher: MidiDispatcher;

  @property({ type: Boolean }) private showMidi = false;
  @property({ type: String }) public playbackState: PlaybackState = 'stopped';
  @state() public audioLevel = 0;
  @state() private midiInputIds: string[] = [];
  @state() private activeMidiInputId: string | null = null;

  // Music Generation Config State
  @state() private bpm = 120;
  @state() private density = 0.5;
  @state() private guidance = 0.5;
  @state() private bassBoost = 0;

  @property({ type: Object })
  private filteredPrompts = new Set<string>();

  constructor(
    initialPrompts: Map<string, Prompt>,
  ) {
    super();
    this.prompts = initialPrompts;
    this.midiDispatcher = new MidiDispatcher();
  }

  private handlePromptChanged(e: CustomEvent<Prompt>) {
    const { promptId, text, weight, cc } = e.detail;
    const prompt = this.prompts.get(promptId);

    if (!prompt) {
      console.error('prompt not found', promptId);
      return;
    }

    prompt.text = text;
    prompt.weight = weight;
    prompt.cc = cc;

    const newPrompts = new Map(this.prompts);
    newPrompts.set(promptId, prompt);

    this.prompts = newPrompts;
    this.requestUpdate();

    this.dispatchEvent(
      new CustomEvent('prompts-changed', { detail: this.prompts }),
    );
  }

  /** Generates radial gradients - keeping the logic but can be subtle */
  private readonly makeBackground = throttle(
    () => {
      // In bio_gram mode, we might want less intrusive background,
      // but let's keep it subtle to visualize weights
      const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

      const MAX_WEIGHT = 0.5;
      const MAX_ALPHA = 0.15; // Decreased opacity for minimal look

      const bg: string[] = [];
      // Base background
      bg.push('radial-gradient(circle at 50% 50%, #111 0%, #000 100%)');

      [...this.prompts.values()].forEach((p, i) => {
        if (p.weight <= 0.01) return;
        
        const alphaPct = clamp01(p.weight / MAX_WEIGHT) * MAX_ALPHA;
        const alpha = Math.round(alphaPct * 0xff)
          .toString(16)
          .padStart(2, '0');

        const stop = p.weight / 1.5; // Larger spread
        const x = (i % 4) / 3;
        const y = Math.floor(i / 4) / 3;
        // Using simpler colors or just white for minimal look? 
        // Let's keep color but very faint
        const s = `radial-gradient(circle at ${x * 100}% ${y * 100}%, ${p.color}${alpha} 0px, ${p.color}00 ${stop * 100}%)`;

        bg.push(s);
      });

      return bg.join(', ');
    },
    30,
  );

  private toggleShowMidi() {
    return this.setShowMidi(!this.showMidi);
  }

  public async setShowMidi(show: boolean) {
    this.showMidi = show;
    if (!this.showMidi) return;
    try {
      const inputIds = await this.midiDispatcher.getMidiAccess();
      this.midiInputIds = inputIds;
      this.activeMidiInputId = this.midiDispatcher.activeMidiInputId;
    } catch (e: any) {
      this.showMidi = false;
      this.dispatchEvent(new CustomEvent('error', {detail: e.message}));
    }
  }

  private handleMidiInputChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const newMidiId = selectElement.value;
    this.activeMidiInputId = newMidiId;
    this.midiDispatcher.activeMidiInputId = newMidiId;
  }

  private playPause() {
    this.dispatchEvent(new CustomEvent('play-pause'));
  }

  public addFilteredPrompt(prompt: string) {
    this.filteredPrompts = new Set([...this.filteredPrompts, prompt]);
  }

  private handleConfigChange(e: Event, key: 'bpm' | 'density' | 'guidance') {
    const target = e.target as HTMLInputElement;
    const value = parseFloat(target.value);
    
    // Update local state
    if (key === 'bpm') this.bpm = value;
    if (key === 'density') this.density = value;
    if (key === 'guidance') this.guidance = value;

    // Dispatch event
    this.dispatchEvent(new CustomEvent('config-changed', { 
        detail: { 
            bpm: this.bpm, 
            density: this.density, 
            guidance: this.guidance 
        } 
    }));
  }

  private handleBassBoostChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = parseFloat(target.value);
    this.bassBoost = value;
    this.dispatchEvent(new CustomEvent('bass-boost-changed', { detail: { db: value } }));
  }

  override render() {
    const bg = styleMap({
      backgroundImage: this.makeBackground(),
    });
    return html`<div id="background" style=${bg}></div>
      <div id="buttons">
        <button
          @click=${this.toggleShowMidi}
          class=${this.showMidi ? 'active' : ''}
          >MIDI</button
        >
        <select
          @change=${this.handleMidiInputChange}
          .value=${this.activeMidiInputId || ''}
          style=${this.showMidi ? '' : 'visibility: hidden'}>
          ${this.midiInputIds.length > 0
        ? this.midiInputIds.map(
          (id) =>
            html`<option value=${id}>
                    ${this.midiDispatcher.getDeviceName(id)}
                  </option>`,
        )
        : html`<option value="">No devices found</option>`}
        </select>
      </div>
      
      <div id="controls">
        <div class="control-group">
          <label><span>BPM</span> <span>${this.bpm}</span></label>
          <input type="range" min="90" max="140" step="1" .value=${this.bpm.toString()} @input=${(e: Event) => this.handleConfigChange(e, 'bpm')}>
        </div>
        <div class="control-group">
          <label><span>Density</span> <span>${this.density}</span></label>
          <input type="range" min="0" max="1" step="0.1" .value=${this.density.toString()} @input=${(e: Event) => this.handleConfigChange(e, 'density')}>
        </div>
        <div class="control-group">
          <label><span>Guidance</span> <span>${this.guidance}</span></label>
          <input type="range" min="0" max="1" step="0.1" .value=${this.guidance.toString()} @input=${(e: Event) => this.handleConfigChange(e, 'guidance')}>
        </div>
        <div class="control-group">
          <label><span>Bass Boost</span> <span>${this.bassBoost}dB</span></label>
          <input type="range" min="0" max="20" step="1" .value=${this.bassBoost.toString()} @input=${this.handleBassBoostChange}>
        </div>
      </div>

      <div id="grid">${this.renderPrompts()}</div>
      <play-pause-button .playbackState=${this.playbackState} @click=${this.playPause}></play-pause-button>`;
  }

  private renderPrompts() {
    return [...this.prompts.values()].map((prompt) => {
      return html`<prompt-controller
        promptId=${prompt.promptId}
        ?filtered=${this.filteredPrompts.has(prompt.text)}
        cc=${prompt.cc}
        text=${prompt.text}
        weight=${prompt.weight}
        color=${prompt.color}
        .midiDispatcher=${this.midiDispatcher}
        .showCC=${this.showMidi}
        audioLevel=${this.audioLevel}
        @prompt-changed=${this.handlePromptChanged}>
      </prompt-controller>`;
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'prompt-dj-midi': PromptDjMidi;
  }
}
