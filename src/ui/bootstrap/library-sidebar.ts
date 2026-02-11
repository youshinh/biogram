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
  let panelModulePromise: Promise<unknown> | null = null;
  let libraryPanel: LoopLibraryPanelElement | null = null;
  const libraryPanelContainer = document.createElement('div');

  const isMobile = () => window.innerWidth <= 1024;
  const panelWidth = () => isMobile() ? '100vw' : '300px';

  Object.assign(libraryPanelContainer.style, {
    position: 'fixed',
    top: '0',
    right: `-${isMobile() ? '100vw' : '300px'}`,
    width: panelWidth(),
    height: '100vh',
    background: '#0a0a0a',
    borderLeft: '1px solid #222',
    zIndex: '2000',
    transition: 'right 0.3s ease-in-out',
    boxShadow: '-4px 0 20px rgba(0,0,0,0.5)'
  });

  document.body.appendChild(libraryPanelContainer);

  const ensureLibraryPanel = async () => {
    if (libraryPanel) return libraryPanel;
    if (!panelModulePromise) {
      panelModulePromise = import('../modules/loop-library-panel');
    }
    await panelModulePromise;
    libraryPanel = document.createElement('loop-library-panel') as LoopLibraryPanelElement;
    libraryPanelContainer.appendChild(libraryPanel);
    return libraryPanel;
  };

  const setLibraryPanelVisible = async (visible: boolean) => {
    libraryPanelVisible = visible;
    const width = panelWidth();
    libraryPanelContainer.style.width = width;
    libraryPanelContainer.style.right = libraryPanelVisible ? '0' : `-${width}`;
    sideToggleBtn.style.right = libraryPanelVisible ? width : '0';
    if (libraryPanelVisible) {
      (await ensureLibraryPanel()).refresh?.();
    }
  };

  const toggleLibraryPanel = async () => {
    await setLibraryPanelVisible(!libraryPanelVisible);
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
    zIndex: '2001',
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
  sideToggleBtn.onclick = () => {
    void toggleLibraryPanel();
  };
  document.body.appendChild(sideToggleBtn);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  Object.assign(closeBtn.style, {
    position: 'absolute',
    top: '10px',
    right: '10px',
    width: '44px',
    height: '44px',
    background: 'transparent',
    border: 'none',
    color: '#71717a',
    fontSize: '24px',
    cursor: 'pointer',
    zIndex: '2002',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px'
  });
  closeBtn.onmouseenter = () => {
    closeBtn.style.color = 'white';
    closeBtn.style.background = '#7f1d1d';
  };
  closeBtn.onmouseleave = () => {
    closeBtn.style.color = '#71717a';
    closeBtn.style.background = 'transparent';
  };
  closeBtn.onclick = () => {
    void setLibraryPanelVisible(false);
  };
  libraryPanelContainer.appendChild(closeBtn);

  const handleLoopLoad = (event: Event) => {
    const e = event as LoopLoadEvent;
    const { sample, deck } = e.detail;

    engine.loadSampleToBuffer(deck, sample.pcmData, sample.bpm);
    const targetDeck = deck === 'A' ? deckA : deckB;
    targetDeck.bpm = sample.bpm;
    targetDeck.generatedPrompt = `[LOOP] ${sample.name}`;
    void setLibraryPanelVisible(false);
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
