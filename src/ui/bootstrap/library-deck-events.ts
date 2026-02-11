import type { LibraryStore } from '../../audio/db/library-store';
import { getLibraryStore as getSharedLibraryStore } from '../../audio/db/library-store-singleton';
import { analyzeAudioValidity } from '../../audio/utils/audio-analysis';

type DeckId = 'A' | 'B';

export type LibraryDeckEventsOptions = {
  engine: any;
  deckA: any;
  deckB: any;
  uiState: any;
  getIsSlamming: () => boolean;
  generatePrompt: (state: any) => string;
  getDisplayPromptParts: (state: any) => string[];
};

export const setupLibraryDeckEvents = (options: LibraryDeckEventsOptions) => {
  let libraryStore: LibraryStore | null = null;

  const getLibraryStore = async () => {
    if (!libraryStore) {
      libraryStore = await getSharedLibraryStore();
    }
    return libraryStore;
  };

  const buildDeckPromptState = (deck: DeckId) => {
    const currentBpm = options.engine.masterBpm;
    return {
      ...options.uiState,
      deckId: deck,
      deckPrompt: deck === 'A' ? (options.uiState.deckAPrompt || options.uiState.theme) : (options.uiState.deckBPrompt || options.uiState.theme),
      currentBpm,
      keyRoot: options.uiState.keyRoot,
      scalePrompt: options.uiState.scalePrompt,
      scaleLabel: options.uiState.scaleLabel,
      isSlamming: options.getIsSlamming()
    };
  };

  const getDeckEl = (deck: DeckId) => (deck === 'A' ? options.deckA : options.deckB);

  const handleLoadRandom = (e: CustomEvent) => {
    const deck = e.detail.deck as DeckId;
    if (import.meta.env.DEV) console.log(`[GEN HANDLER] Event received for Deck ${deck}`);

    if (options.engine.isDeckStopped(deck)) {
      if (import.meta.env.DEV) console.log(`[GEN HANDLER] Deck ${deck} is STOPPED -> Clearing Buffer & Visuals`);
      options.engine.mute(deck);
      options.engine.clearBuffer(deck);

      const targetDeck = getDeckEl(deck);
      if (deck === 'A') {
        if (import.meta.env.DEV) console.log('[GEN HANDLER] Clearing Visualizer A');
        options.deckA.clearVisualizer();
      } else {
        if (import.meta.env.DEV) console.log('[GEN HANDLER] Clearing Visualizer B');
        options.deckB.clearVisualizer();
      }

      const state = buildDeckPromptState(deck);
      const prompt = options.generatePrompt(state);
      options.engine.resetAiSession(deck, prompt);
      targetDeck.generatedPrompt = options.getDisplayPromptParts(state).join(' • ');
      if (import.meta.env.DEV) console.log(`[GEN ${deck} (HARD RESET)] ${prompt}`);
      return;
    }

    if (import.meta.env.DEV) console.log(`[GEN HANDLER] Deck ${deck} is PLAYING -> No forced clear.`);
    const state = buildDeckPromptState(deck);
    const prompt = options.generatePrompt(state);
    options.engine.updateAiPrompt(deck, prompt, 1.0);
    getDeckEl(deck).generatedPrompt = options.getDisplayPromptParts(state).join(' • ');
    if (import.meta.env.DEV) console.log(`[GEN ${deck} (Update)] ${prompt}`);
  };

  const showSaveDialog = (): Promise<{ bars: number; name: string } | null> => {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      Object.assign(overlay.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: '2000'
      });

      const dialog = document.createElement('div');
      Object.assign(dialog.style, {
        background: '#111',
        border: '1px solid #333',
        borderRadius: '8px',
        padding: '20px',
        width: '300px',
        color: '#ccc',
        fontFamily: 'monospace'
      });

      const now = new Date();
      const defaultName = `Loop_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;

      dialog.innerHTML = `
                <h3 style="margin: 0 0 16px 0; color: #10b981; font-size: 14px;">💾 SAVE LOOP</h3>
                
                <label style="display: block; margin-bottom: 4px; font-size: 11px; color: #888;">小節数</label>
                <select id="save-bars" style="width: 100%; padding: 8px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px; margin-bottom: 12px; font-size: 14px;">
                    <option value="8">8 小節</option>
                    <option value="16">16 小節</option>
                    <option value="32" selected>32 小節</option>
                    <option value="64">64 小節</option>
                    <option value="128">128 小節</option>
                </select>
                
                <label style="display: block; margin-bottom: 4px; font-size: 11px; color: #888;">名前</label>
                <input id="save-name" type="text" value="${defaultName}" 
                       style="width: 100%; padding: 8px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px; margin-bottom: 16px; box-sizing: border-box;">
                
                <div style="display: flex; gap: 8px;">
                    <button id="save-cancel" style="flex: 1; padding: 10px; background: #333; border: 1px solid #444; color: #888; border-radius: 4px; cursor: pointer;">CANCEL</button>
                    <button id="save-confirm" style="flex: 1; padding: 10px; background: #10b981; border: none; color: #000; border-radius: 4px; cursor: pointer; font-weight: bold;">SAVE</button>
                </div>
            `;

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      const barsSelect = dialog.querySelector('#save-bars') as HTMLSelectElement;
      const nameInput = dialog.querySelector('#save-name') as HTMLInputElement;
      const cancelBtn = dialog.querySelector('#save-cancel') as HTMLButtonElement;
      const confirmBtn = dialog.querySelector('#save-confirm') as HTMLButtonElement;

      nameInput.focus();
      nameInput.select();

      const cleanup = () => overlay.remove();
      cancelBtn.onclick = () => {
        cleanup();
        resolve(null);
      };
      overlay.onclick = (evt) => {
        if (evt.target === overlay) {
          cleanup();
          resolve(null);
        }
      };

      confirmBtn.onclick = () => {
        const bars = parseInt(barsSelect.value, 10);
        const name = nameInput.value.trim() || defaultName;
        cleanup();
        resolve({ bars, name });
      };
      nameInput.onkeydown = (evt) => {
        if (evt.key === 'Enter') confirmBtn.click();
      };
    });
  };

  const handleSaveLoop = async (e: CustomEvent) => {
    const deck = e.detail.deck as DeckId;
    if (import.meta.env.DEV) console.log(`[SAVE HANDLER] Saving loop from Deck ${deck}`);

    const result = await showSaveDialog();
    if (!result) {
      if (import.meta.env.DEV) console.log('[SAVE HANDLER] Save cancelled by user');
      return;
    }
    const { bars, name } = result;

    const loopData = options.engine.extractLoopBuffer(deck, bars);
    if (!loopData) {
      console.warn('[SAVE HANDLER] Failed to extract loop data');
      return;
    }

    const validityResult = analyzeAudioValidity(loopData.pcmData, 44100, 0.001, 0.8);
    if (!validityResult.hasEnoughAudio) {
      const validPercent = Math.round(validityResult.validRatio * 100);
      const proceed = confirm(
        `⚠️ 警告: オーディオの ${validPercent}% しか有効な音声がありません。\n` +
        `(${100 - validPercent}% が無音部分です)\n\n` +
        'このまま保存しますか？'
      );
      if (!proceed) {
        if (import.meta.env.DEV) console.log('[SAVE HANDLER] Save cancelled due to insufficient audio');
        return;
      }
    }

    const targetDeck = getDeckEl(deck);
    const prompt = targetDeck.generatedPrompt || options.uiState.theme || 'Unknown';
    const promptState = {
      ...options.uiState,
      deckId: deck,
      deckPrompt: options.uiState.theme,
      currentBpm: options.engine.masterBpm,
      keyRoot: options.uiState.keyRoot,
      scalePrompt: options.uiState.scalePrompt,
      scaleLabel: options.uiState.scaleLabel,
      isSlamming: options.getIsSlamming()
    };
    const tags = options.getDisplayPromptParts(promptState);
    if (import.meta.env.DEV) console.log('[SAVE HANDLER] Auto-generated tags:', tags);

    let brightness = 0;
    let energy = 0;
    let rhythm = 0;
    const samples = loopData.pcmData;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.abs(samples[i]);
      energy += s * s;
      if (i > 0 && Math.sign(samples[i]) !== Math.sign(samples[i - 1])) {
        brightness += 1;
      }
    }
    energy = Math.sqrt(energy / samples.length);
    brightness = (brightness / samples.length) * 100;
    rhythm = 0.5;

    try {
      const store = await getLibraryStore();
      await store.saveSample({
        name,
        prompt,
        duration: loopData.duration,
        bpm: loopData.bpm,
        tags,
        vector: { brightness, energy, rhythm },
        pcmData: loopData.pcmData,
        validAudioRatio: validityResult.validRatio
      });
      if (import.meta.env.DEV) {
        console.log(
          `[SAVE HANDLER] Loop saved: ${name} (${loopData.duration.toFixed(1)}s @ ${loopData.bpm} BPM) ` +
          `[Valid: ${Math.round(validityResult.validRatio * 100)}%] [Tags: ${tags.join(', ')}]`
        );
      }

      alert(`ループを保存しました: ${name}\nタグ: ${tags.slice(0, 5).join(', ')}${tags.length > 5 ? '...' : ''}`);
      window.dispatchEvent(new CustomEvent('library-updated', { bubbles: true, composed: true }));
    } catch (err) {
      console.error('[SAVE HANDLER] Failed to save loop:', err);
      alert('保存に失敗しました');
    }
  };

  options.deckA.addEventListener('deck-load-random', handleLoadRandom as EventListener);
  options.deckB.addEventListener('deck-load-random', handleLoadRandom as EventListener);
  options.deckA.addEventListener('deck-save-loop', handleSaveLoop as EventListener);
  options.deckB.addEventListener('deck-save-loop', handleSaveLoop as EventListener);

  return {
    dispose: () => {
      options.deckA.removeEventListener('deck-load-random', handleLoadRandom as EventListener);
      options.deckB.removeEventListener('deck-load-random', handleLoadRandom as EventListener);
      options.deckA.removeEventListener('deck-save-loop', handleSaveLoop as EventListener);
      options.deckB.removeEventListener('deck-save-loop', handleSaveLoop as EventListener);
    }
  };
};
