import { LitElement, html, css } from 'lit';
import { customElement, state, property } from 'lit/decorators.js';
import { LibraryStore, type LoopSample } from '../../audio/db/library-store';
import { BeatDetector } from '../../audio/analysis/beat-detector';
import { calculateVector } from '../../audio/utils/audio-analysis';

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
      padding: 8px 40px 8px 12px; /* Increased right padding for Close btn */
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

    .deck-selector {
      display: flex;
      gap: 4px;
    }

    .deck-btn {
      padding: 2px 8px;
      background: #222;
      border: 1px solid #333;
      color: #666;
      font-size: 10px;
      cursor: pointer;
      border-radius: 2px;
      transition: all 0.15s ease;
    }

    .deck-btn:hover {
      background: #333;
      color: #fff;
    }

    .deck-btn.active {
      background: #10b981;
      border-color: #10b981;
      color: #000;
    }

    .list {
      height: calc(100% - 80px);
      overflow-y: auto;
      padding: 4px;
    }

    .toolbar {
      display: flex;
      gap: 4px;
      padding: 4px 8px;
      background: #111;
      border-bottom: 1px solid #222;
    }

    .toolbar-btn {
      padding: 4px 8px;
      background: #222;
      border: 1px solid #333;
      color: #666;
      font-size: 9px;
      cursor: pointer;
      border-radius: 2px;
      transition: all 0.15s ease;
    }

    .toolbar-btn:hover {
      background: #333;
      color: #fff;
    }

    .toolbar-btn.active {
      background: #10b981;
      border-color: #10b981;
      color: #000;
    }

    .tag-select {
      flex: 1;
      padding: 4px;
      background: #222;
      border: 1px solid #333;
      color: #888;
      font-size: 9px;
      border-radius: 2px;
    }

    .item-tags {
      display: flex;
      gap: 4px;
      margin-top: 4px;
      flex-wrap: wrap;
    }

    .tag {
      padding: 1px 4px;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 2px;
      font-size: 8px;
      color: #888;
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
  @state() private filteredSamples: LoopSample[] = [];
  @state() private selectedId: string | null = null;
  @state() private availableTags: string[] = [];
  @state() private selectedTag: string = '';
  @state() private isRecommendMode: boolean = false;
  @property({ type: String }) targetDeck: 'A' | 'B' = 'A';

  private libraryStore: LibraryStore | null = null;
  
  // Minimum valid audio ratio for displaying samples (lower than this will be hidden)
  private static readonly MIN_VALID_AUDIO_RATIO = 0.8;

  async connectedCallback() {
    super.connectedCallback();
    await this.loadLibrary();
  }

  private async loadLibrary() {
    try {
      this.libraryStore = new LibraryStore();
      await this.libraryStore.init();
      const allSamples = await this.libraryStore.getAllSamples();
      
      // Filter out samples with insufficient audio (but keep legacy samples without validAudioRatio)
      this.samples = allSamples.filter((s) => {
        // If validAudioRatio is not set (legacy data), show it
        if (s.validAudioRatio === undefined) return true;
        // Otherwise, only show samples with enough valid audio
        return s.validAudioRatio >= LoopLibraryPanel.MIN_VALID_AUDIO_RATIO;
      });
      
      this.filteredSamples = this.samples;
      this.availableTags = await this.libraryStore.getAllTags();
    } catch (e) {
      console.error('[LoopLibrary] Failed to load:', e);
    }
  }

  private filterByTag(tag: string) {
    this.selectedTag = tag;
    this.isRecommendMode = false;
    if (!tag) {
      this.filteredSamples = this.samples;
    } else {
      this.filteredSamples = this.samples.filter(s => s.tags.includes(tag));
    }
  }

  private async showRecommendations() {
    this.isRecommendMode = !this.isRecommendMode;
    this.selectedTag = '';
    
    if (this.isRecommendMode) {
      // Get current deck vector from engine
      const engine = window.engine;
      if (engine && engine.getCurrentVector) {
        const vector = engine.getCurrentVector(this.targetDeck);
        if (!this.libraryStore) return;
        this.filteredSamples = await this.libraryStore.findSimilar(vector, 10);
        if (import.meta.env.DEV) console.log('[LoopLibrary] Showing recommendations based on deck', this.targetDeck);
      }
    } else {
      this.filteredSamples = this.samples;
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

  private setTargetDeck(deck: 'A' | 'B') {
    this.targetDeck = deck;
  }

  private async handleLoad(sample: LoopSample, deck: 'A' | 'B') {
    this.dispatchEvent(new CustomEvent('loop-load', {
      detail: { sample, deck },
      bubbles: true,
      composed: true
    }));
  }

  private async handleDelete(sample: LoopSample, e: Event) {
    e.stopPropagation();
    if (!confirm(`"${sample.name}" を削除しますか?`)) return;
    
    try {
      if (!this.libraryStore) return;
      await this.libraryStore.deleteSample(sample.id);
      this.samples = this.samples.filter(s => s.id !== sample.id);
    } catch (err) {
      console.error('[LoopLibrary] Delete failed:', err);
    }
  }

  private handleImportClick() {
    const fileInput = this.shadowRoot?.getElementById('file-input') as HTMLInputElement;
    if (fileInput) fileInput.click();
  }

  private async handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const engine = window.engine;

        if (!engine || !engine.context) {
          console.error('[LoopLibrary] Audio engine not available');
          return;
        }

        const audioBuffer = await engine.context.decodeAudioData(arrayBuffer);
        const pcmData = audioBuffer.getChannelData(0); // Use first channel (Mono)

        // Calculate Vector
        const vector = calculateVector(pcmData);

        // Calculate BPM
        const beatInfo = await BeatDetector.analyze(pcmData, audioBuffer.sampleRate);
        const bpm = beatInfo.bpm > 0 ? beatInfo.bpm : 120; // Default if failed

        // Save to Library
        if (!this.libraryStore) return;
        await this.libraryStore.saveSample({
            name: file.name.replace(/\.[^/.]+$/, ""), // Remove extension
            prompt: 'Imported',
            duration: audioBuffer.duration,
            bpm: bpm,
            tags: ['imported'],
            vector: vector,
            pcmData: pcmData,
            validAudioRatio: 1.0 // Assume imported files are valid
        });

        // Clear input
        input.value = '';

        // Refresh list
        await this.loadLibrary();

      } catch (err) {
        console.error('[LoopLibrary] Import failed:', err);
        alert('ファイルの読み込みに失敗しました。');
      }
    };

    reader.readAsArrayBuffer(file);
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
        <div class="deck-selector">
          <button class="deck-btn ${this.targetDeck === 'A' ? 'active' : ''}"
                  @click="${() => this.setTargetDeck('A')}">A</button>
          <button class="deck-btn ${this.targetDeck === 'B' ? 'active' : ''}"
                  @click="${() => this.setTargetDeck('B')}">B</button>
        </div>
      </div>
      
      <!-- TOOLBAR: Tag Filter + Recommend -->
      <div class="toolbar">
        <input type="file" id="file-input" accept="audio/*" style="display: none"
               @change="${(e: Event) => this.handleFileSelect(e)}">
        <button class="toolbar-btn" @click="${() => this.handleImportClick()}">
          Import
        </button>

        <select class="tag-select" @change="${(e: any) => this.filterByTag(e.target.value)}">
          <option value="">All Tags</option>
          ${this.availableTags.map(tag => html`
            <option value="${tag}" ?selected="${tag === this.selectedTag}">${tag}</option>
          `)}
        </select>
        <button class="toolbar-btn ${this.isRecommendMode ? 'active' : ''}" 
                @click="${this.showRecommendations}">
          ✨ REC
        </button>
      </div>
      
      <div class="list">
        ${this.filteredSamples.length === 0 
          ? html`
            <div class="empty">
              <div class="empty-icon">${this.isRecommendMode ? '✨' : '💾'}</div>
              <div>${this.isRecommendMode ? '推薦なし' : 'ライブラリが空です'}</div>
              <div style="font-size: 9px; margin-top: 4px;">${this.isRecommendMode ? 'デッキを再生してください' : 'SAVEボタンでループを保存'}</div>
            </div>
          `
          : this.filteredSamples.map(sample => html`
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
              ${sample.tags.length > 0 ? html`
                <div class="item-tags">
                  ${sample.tags.map(t => html`<span class="tag">${t}</span>`)}
                </div>
              ` : ''}
              <div class="item-prompt">${sample.prompt}</div>
              
              ${this.selectedId === sample.id ? html`
                <div class="item-actions">
                  <button class="btn load" @click="${() => this.handleLoad(sample, 'A')}">
                    → A
                  </button>
                  <button class="btn load" @click="${() => this.handleLoad(sample, 'B')}">
                    → B
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
