import type { AudioEngine } from '../../audio/engine';

type DeckLike = {
  bpm: number;
  generatedPrompt: string;
};

type LoopLibraryPanelElement = HTMLElement & {
  refresh?: () => void;
};

type LoopLoadEvent = CustomEvent<{
  sample: { name: string; pcmData: Float32Array; bpm: number };
  deck: 'A' | 'B';
}>;

export function setupLibrarySidebar(params: {
  engine: AudioEngine;
  deckA: DeckLike;
  deckB: DeckLike;
}) {
  const { engine, deckA, deckB } = params;

  let libraryPanelVisible = false;
  const libraryPanel = document.createElement('loop-library-panel') as LoopLibraryPanelElement;
  const libraryPanelContainer = document.createElement('div');

  Object.assign(libraryPanelContainer.style, {
    position: 'fixed',
    top: '0',
    right: '-300px',
    width: '300px',
    height: '100vh',
    background: '#0a0a0a',
    borderLeft: '1px solid #222',
    zIndex: '500',
    transition: 'right 0.3s ease-in-out',
    boxShadow: '-4px 0 20px rgba(0,0,0,0.5)'
  });

  libraryPanelContainer.appendChild(libraryPanel);
  document.body.appendChild(libraryPanelContainer);

  const setLibraryPanelVisible = (visible: boolean) => {
    libraryPanelVisible = visible;
    libraryPanelContainer.style.right = libraryPanelVisible ? '0' : '-300px';
    sideToggleBtn.style.right = libraryPanelVisible ? '300px' : '0';
    if (libraryPanelVisible) {
      libraryPanel.refresh?.();
    }
  };

  const toggleLibraryPanel = () => {
    setLibraryPanelVisible(!libraryPanelVisible);
  };

  const sideToggleBtn = document.createElement('button');
  sideToggleBtn.innerHTML = `
        <span style="writing-mode: vertical-rl; text-orientation: mixed; transform: rotate(180deg);">LIBRARY</span>
    `;

  Object.assign(sideToggleBtn.style, {
    position: 'fixed',
    top: '160px',
    right: '0',
    padding: '24px 8px',
    background: '#18181b',
    color: '#a1a1aa',
    border: '1px solid #27272a',
    borderRight: 'none',
    borderRadius: '8px 0 0 8px',
    cursor: 'pointer',
    zIndex: '499',
    fontSize: '12px',
    fontFamily: 'monospace',
    letterSpacing: '3px',
    boxShadow: '-2px 0 10px rgba(0,0,0,0.5)',
    transition: 'right 0.3s ease-in-out, background 0.2s'
  });

  sideToggleBtn.onmouseenter = () => {
    sideToggleBtn.style.background = '#27272a';
    sideToggleBtn.style.color = 'white';
  };
  sideToggleBtn.onmouseleave = () => {
    sideToggleBtn.style.background = '#18181b';
    sideToggleBtn.style.color = '#a1a1aa';
  };
  sideToggleBtn.onclick = toggleLibraryPanel;
  document.body.appendChild(sideToggleBtn);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  Object.assign(closeBtn.style, {
    position: 'absolute',
    top: '10px',
    right: '10px',
    width: '24px',
    height: '24px',
    background: 'transparent',
    border: 'none',
    color: '#71717a',
    fontSize: '20px',
    cursor: 'pointer',
    zIndex: '501',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px'
  });
  closeBtn.onmouseenter = () => {
    closeBtn.style.color = 'white';
    closeBtn.style.background = '#7f1d1d';
  };
  closeBtn.onmouseleave = () => {
    closeBtn.style.color = '#71717a';
    closeBtn.style.background = 'transparent';
  };
  closeBtn.onclick = () => setLibraryPanelVisible(false);
  libraryPanelContainer.appendChild(closeBtn);

  const handleLoopLoad = (event: Event) => {
    const e = event as LoopLoadEvent;
    const { sample, deck } = e.detail;

    engine.loadSampleToBuffer(deck, sample.pcmData, sample.bpm);
    const targetDeck = deck === 'A' ? deckA : deckB;
    targetDeck.bpm = sample.bpm;
    targetDeck.generatedPrompt = `[LOOP] ${sample.name}`;
    setLibraryPanelVisible(false);
  };

  window.addEventListener('loop-load', handleLoopLoad);

  return {
    sideToggleBtn,
    libraryPanelContainer,
    isPanelVisible: () => libraryPanelVisible,
    toggleLibraryPanel,
    dispose: () => {
      window.removeEventListener('loop-load', handleLoopLoad);
      sideToggleBtn.remove();
      libraryPanelContainer.remove();
    }
  };
}
