import { LitElement, html, css } from 'lit';
import { customElement, state, property } from 'lit/decorators.js';
import type { LoopSample } from '../../audio/db/library-store';

@customElement('loop-library-panel')
export class LoopLibraryPanel extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100%;
      background: #0a0a0a;
      color: #888;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      overflow: hidden;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: #111;
      border-bottom: 1px solid #222;
    }

    .title {
      font-size: 10px;
      font-weight: bold;
      color: #10b981;
      letter-spacing: 1px;
    }

    .count {
      color: #444;
    }

    .list {
      height: calc(100% - 40px);
      overflow-y: auto;
      padding: 4px;
    }

    .item {
      display: flex;
      flex-direction: column;
      padding: 8px 10px;
      margin: 2px 0;
      background: #111;
      border: 1px solid #222;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .item:hover {
      background: #1a1a1a;
      border-color: #10b981;
    }

    .item.selected {
      background: #0d2818;
      border-color: #10b981;
    }

    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }

    .item-name {
      color: #ccc;
      font-weight: bold;
      font-size: 12px;
    }

    .item-bpm {
      color: #10b981;
      font-size: 10px;
    }

    .item-meta {
      display: flex;
      gap: 8px;
      color: #555;
      font-size: 9px;
    }

    .item-prompt {
      color: #666;
      font-size: 9px;
      margin-top: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .item-actions {
      display: flex;
      gap: 4px;
      margin-top: 6px;
    }

    .btn {
      padding: 4px 8px;
      background: #222;
      border: 1px solid #333;
      color: #888;
      font-size: 9px;
      cursor: pointer;
      border-radius: 2px;
      transition: all 0.15s ease;
    }

    .btn:hover {
      background: #333;
      color: #fff;
    }

    .btn.load {
      background: #0d2818;
      border-color: #10b981;
      color: #10b981;
    }

    .btn.load:hover {
      background: #10b981;
      color: #000;
    }

    .btn.delete {
      color: #ef4444;
      border-color: #333;
    }

    .btn.delete:hover {
      background: #ef4444;
      color: #fff;
      border-color: #ef4444;
    }

    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #444;
      text-align: center;
      padding: 20px;
    }

    .empty-icon {
      font-size: 24px;
      margin-bottom: 8px;
      opacity: 0.5;
    }

    /* Scrollbar */
    .list::-webkit-scrollbar {
      width: 4px;
    }
    .list::-webkit-scrollbar-track {
      background: #0a0a0a;
    }
    .list::-webkit-scrollbar-thumb {
      background: #333;
      border-radius: 2px;
    }
  `;

  @state() private samples: LoopSample[] = [];
  @state() private selectedId: string | null = null;
  @property({ type: String }) targetDeck: 'A' | 'B' = 'A';

  private libraryStore: any = null;

  async connectedCallback() {
    super.connectedCallback();
    await this.loadLibrary();
  }

  private async loadLibrary() {
    try {
      const { LibraryStore } = await import('../../audio/db/library-store');
      this.libraryStore = new LibraryStore();
      await this.libraryStore.init();
      this.samples = await this.libraryStore.getAllSamples();
    } catch (e) {
      console.error('[LoopLibrary] Failed to load:', e);
    }
  }

  private formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private formatDate(timestamp: number): string {
    const d = new Date(timestamp);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  private handleSelect(id: string) {
    this.selectedId = this.selectedId === id ? null : id;
  }

  private async handleLoad(sample: LoopSample) {
    this.dispatchEvent(new CustomEvent('loop-load', {
      detail: { sample, deck: this.targetDeck },
      bubbles: true,
      composed: true
    }));
  }

  private async handleDelete(sample: LoopSample, e: Event) {
    e.stopPropagation();
    if (!confirm(`"${sample.name}" を削除しますか?`)) return;
    
    try {
      await this.libraryStore.deleteSample(sample.id);
      this.samples = this.samples.filter(s => s.id !== sample.id);
    } catch (err) {
      console.error('[LoopLibrary] Delete failed:', err);
    }
  }

  private async handleExport(sample: LoopSample, e: Event) {
    e.stopPropagation();
    
    // Generate WAV file
    const wavData = this.createWavFile(sample.pcmData);
    const blob = new Blob([wavData], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sample.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private createWavFile(pcmData: Float32Array): ArrayBuffer {
    const numChannels = 1;
    const sampleRate = 44100;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = pcmData.length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true);  // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Audio data
    let offset = 44;
    for (let i = 0; i < pcmData.length; i++) {
      const sample = Math.max(-1, Math.min(1, pcmData[i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, int16, true);
      offset += 2;
    }

    return buffer;
  }

  render() {
    return html`
      <div class="header">
        <span class="title">LOOP LIBRARY</span>
        <span class="count">${this.samples.length} loops</span>
      </div>
      
      <div class="list">
        ${this.samples.length === 0 
          ? html`
            <div class="empty">
              <div class="empty-icon">💾</div>
              <div>ライブラリが空です</div>
              <div style="font-size: 9px; margin-top: 4px;">SAVEボタンでループを保存</div>
            </div>
          `
          : this.samples.map(sample => html`
            <div class="item ${this.selectedId === sample.id ? 'selected' : ''}"
                 @click="${() => this.handleSelect(sample.id)}">
              <div class="item-header">
                <span class="item-name">${sample.name}</span>
                <span class="item-bpm">${sample.bpm.toFixed(0)} BPM</span>
              </div>
              <div class="item-meta">
                <span>${this.formatDuration(sample.duration)}</span>
                <span>${this.formatDate(sample.createdAt)}</span>
              </div>
              <div class="item-prompt">${sample.prompt}</div>
              
              ${this.selectedId === sample.id ? html`
                <div class="item-actions">
                  <button class="btn load" @click="${() => this.handleLoad(sample)}">
                    LOAD → ${this.targetDeck}
                  </button>
                  <button class="btn" @click="${(e: Event) => this.handleExport(sample, e)}">
                    WAV
                  </button>
                  <button class="btn delete" @click="${(e: Event) => this.handleDelete(sample, e)}">
                    DEL
                  </button>
                </div>
              ` : ''}
            </div>
          `)
        }
      </div>
    `;
  }

  // Public method for external refresh
  async refresh() {
    await this.loadLibrary();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'loop-library-panel': LoopLibraryPanel;
  }
}
