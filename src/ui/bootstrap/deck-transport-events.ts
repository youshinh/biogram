import type { AudioEngine } from '../../audio/engine';

type DeckLike = {
  isPlaying: boolean;
};

export function setupDeckTransportEvents(params: {
  engine: AudioEngine;
  deckA: DeckLike;
  deckB: DeckLike;
}) {
  const { engine, deckA, deckB } = params;

  const handleDeckPlayToggle = (e: Event) => {
    const detail = (e as CustomEvent).detail || {};
    const deckId = detail.deck || detail.deckId;
    if (import.meta.env.DEV) console.log(`[Main] deck-play-toggle received: ${deckId}, playing: ${detail.playing}`);
    if (!deckId) return;

    const deck = deckId as 'A' | 'B';
    let playing = detail.playing;

    // If playing state is not specified (e.g. from AI Automation), toggle based on current engine state
    if (playing === undefined) {
      playing = engine.isDeckStopped(deck);
    }

    if (playing) {
      engine.setTapeStop(deck, false);
      engine.unmute(deck); // Ensure we are unmuted (fixes GEN silence bug)
      engine.resume();
      if (import.meta.env.DEV) console.log('[Main] Engine Resumed (Sync)');
    } else {
      engine.setTapeStop(deck, true);
    }

    // Sync UI (DeckController listens to this)
    window.dispatchEvent(new CustomEvent('deck-play-sync', {
      detail: { deck, playing }
    }));
  };

  const handleDeckBpmChange = (e: Event) => {
    const detail = (e as CustomEvent).detail || {};
    const { deck, bpm } = detail;
    if (import.meta.env.DEV) console.log(`Deck ${deck} BPM: ${bpm}`);
    engine.setDeckBpm(deck as 'A' | 'B', bpm);
  };

  const handleDeckSyncToggle = (e: Event) => {
    const detail = (e as CustomEvent).detail || {};
    const { deck, sync } = detail;
    const deckEl = deck === 'A' ? deckA : deckB;

    if (sync) {
      deckEl.isPlaying = true;
      if (import.meta.env.DEV) console.log(`[UI SYNC] Set Deck ${deck} UI to PLAYING`);
      engine.setTapeStop(deck as 'A' | 'B', false);
      engine.syncDeck(deck as 'A' | 'B');
    } else {
      engine.unsyncDeck(deck as 'A' | 'B');
    }
  };

  const handleMasterBpmChange = (e: Event) => {
    const bpm = (e as CustomEvent).detail;
    engine.setMasterBpm(bpm);
  };

  window.addEventListener('deck-play-toggle', handleDeckPlayToggle as EventListener);
  window.addEventListener('deck-bpm-change', handleDeckBpmChange as EventListener);
  window.addEventListener('deck-sync-toggle', handleDeckSyncToggle as EventListener);
  window.addEventListener('bpm-change', handleMasterBpmChange as EventListener);

  return {
    dispose: () => {
      window.removeEventListener('deck-play-toggle', handleDeckPlayToggle as EventListener);
      window.removeEventListener('deck-bpm-change', handleDeckBpmChange as EventListener);
      window.removeEventListener('deck-sync-toggle', handleDeckSyncToggle as EventListener);
      window.removeEventListener('bpm-change', handleMasterBpmChange as EventListener);
    }
  };
}
