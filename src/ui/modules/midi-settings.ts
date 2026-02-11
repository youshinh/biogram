import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { MidiMapping } from '../../midi/midi-mapping-store';
import { PARAMETER_REGISTRY } from '../../control/parameter-registry';

@customElement('midi-settings')
export class MidiSettings extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      right: 16px;
      top: 56px;
      z-index: 3000;
      font-family: 'JetBrains Mono', monospace;
    }

    .panel {
      width: min(92vw, 860px);
      max-height: min(70vh, 620px);
      overflow: auto;
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: rgba(0, 0, 0, 0.92);
      backdrop-filter: blur(12px);
      color: #e5e7eb;
      border-radius: 12px;
      padding: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }

    th,
    td {
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding: 6px;
      text-align: left;
      white-space: nowrap;
    }

    select,
    input {
      background: rgba(24, 24, 27, 1);
      color: #e5e7eb;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 6px;
      font-family: inherit;
      font-size: 11px;
      padding: 4px 6px;
      min-width: 64px;
    }

    .actions {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
      align-items: center;
      justify-content: space-between;
    }

    .btn {
      background: #18181b;
      color: #e5e7eb;
      border: 1px solid rgba(255, 255, 255, 0.2);
      padding: 6px 10px;
      border-radius: 8px;
      font-family: inherit;
      font-size: 11px;
      cursor: pointer;
    }

    .hint {
      color: #a1a1aa;
      font-size: 10px;
      letter-spacing: 0.08em;
    }
  `;

  @state() private open = false;
  @state() private mappings: MidiMapping[] = [];
  @state() private midiEnabled = false;

  private parameterIds = Object.keys(PARAMETER_REGISTRY);

  connectedCallback(): void {
    super.connectedCallback();
    this.reloadMappings();
  }

  private reloadMappings() {
    const midiManager = window.midiManager;
    if (!midiManager) return;
    this.mappings = midiManager.getMappings();
    this.midiEnabled = midiManager.isEnabled();
  }

  private toggleOpen = () => {
    this.open = !this.open;
    if (this.open) this.reloadMappings();
  };

  public togglePanel(): void {
    this.toggleOpen();
  }

  private updateMapping(index: number, key: keyof MidiMapping, value: string) {
    const next = [...this.mappings];
    const row = { ...next[index] };

    if (key === 'number' || key === 'min' || key === 'max') {
      const n = Number(value);
      (row as any)[key] = Number.isFinite(n) ? n : (key === 'number' ? 0 : undefined);
    } else if (key === 'channel') {
      (row as any)[key] = value === '*' ? '*' : Number(value);
    } else {
      (row as any)[key] = value;
    }

    next[index] = row;
    this.mappings = next;
  }

  private saveMappings = () => {
    window.midiManager?.setMappings(this.mappings);
  };

  private resetMappings = () => {
    window.midiManager?.resetMappings();
    this.reloadMappings();
  };

  private toggleMidiEnabled = async () => {
    const midiManager = window.midiManager;
    if (!midiManager) return;
    if (midiManager.isEnabled()) {
      midiManager.disable();
    } else {
      await midiManager.enable();
    }
    this.reloadMappings();
  };

  render() {
    return html`
      ${this.open
        ? html`
            <div class="panel">
              <div class="actions">
                <div>
                  <div>MIDI MAPPING</div>
                  <div class="hint">CC/NOTE -> PARAMETER ROUTING (${this.midiEnabled ? 'ON' : 'OFF'})</div>
                </div>
                <div>
                  <button class="btn" @click=${this.toggleMidiEnabled}>${this.midiEnabled ? 'DISABLE MIDI' : 'ENABLE MIDI'}</button>
                  <button class="btn" @click=${this.saveMappings}>SAVE</button>
                  <button class="btn" @click=${this.resetMappings}>RESET</button>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>No</th>
                    <th>Mode</th>
                    <th>Parameter</th>
                    <th>Min</th>
                    <th>Max</th>
                  </tr>
                </thead>
                <tbody>
                  ${this.mappings.map(
                    (mapping, index) => html`
                      <tr>
                        <td>
                          <select
                            .value=${mapping.messageType}
                            @change=${(e: Event) => this.updateMapping(index, 'messageType', (e.target as HTMLSelectElement).value)}
                          >
                            <option value="cc">cc</option>
                            <option value="note">note</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="127"
                            .value=${String(mapping.number)}
                            @input=${(e: Event) => this.updateMapping(index, 'number', (e.target as HTMLInputElement).value)}
                          />
                        </td>
                        <td>
                          <select
                            .value=${mapping.mode}
                            @change=${(e: Event) => this.updateMapping(index, 'mode', (e.target as HTMLSelectElement).value)}
                          >
                            <option value="absolute">absolute</option>
                            <option value="toggle">toggle</option>
                            <option value="trigger">trigger</option>
                          </select>
                        </td>
                        <td>
                          <select
                            .value=${mapping.parameterId}
                            @change=${(e: Event) => this.updateMapping(index, 'parameterId', (e.target as HTMLSelectElement).value)}
                          >
                            ${this.parameterIds.map(
                              (id) => html`<option value=${id}>${id}</option>`
                            )}
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            .value=${mapping.min === undefined ? '' : String(mapping.min)}
                            @input=${(e: Event) => this.updateMapping(index, 'min', (e.target as HTMLInputElement).value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            .value=${mapping.max === undefined ? '' : String(mapping.max)}
                            @input=${(e: Event) => this.updateMapping(index, 'max', (e.target as HTMLInputElement).value)}
                          />
                        </td>
                      </tr>
                    `
                  )}
                </tbody>
              </table>
            </div>
          `
        : null}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'midi-settings': MidiSettings;
  }
}
