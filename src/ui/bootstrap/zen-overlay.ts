import type { AudioEngine } from '../../audio/engine';
import type { ThreeViz } from '../visuals/ThreeViz';
import { ZEN_VISUAL_MODES, type VisualMode, type ZenVisualMode } from '../visuals/modes';

type VisualControlsLike = HTMLElement & {
  toggleZenMode?: () => void;
  currentMode?: VisualMode;
  requestUpdate?: () => void;
};

export function setupZenOverlay(params: {
  engine: AudioEngine;
  threeViz: ThreeViz;
  vizControls: VisualControlsLike;
  viewContainer: HTMLElement;
  sideToggleBtn: HTMLButtonElement;
  libraryPanelContainer: HTMLDivElement;
  isLibraryPanelVisible: () => boolean;
}) {
  const {
    engine,
    threeViz,
    vizControls,
    viewContainer,
    sideToggleBtn,
    libraryPanelContainer,
    isLibraryPanelVisible
  } = params;

  const zenOverlay = document.createElement('div');
  Object.assign(zenOverlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    display: 'none',
    zIndex: '1500'
  });

  const zenOffBtn = document.createElement('button');
  zenOffBtn.textContent = '×';
  zenOffBtn.setAttribute('aria-label', 'Exit Zen Mode');
  zenOffBtn.title = 'Exit Zen Mode';
  Object.assign(zenOffBtn.style, {
    position: 'absolute',
    top: '18px',
    right: '18px',
    width: '40px',
    height: '40px',
    padding: '0',
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '999px',
    cursor: 'pointer',
    pointerEvents: 'auto',
    opacity: '0',
    transition: 'opacity 0.3s, border-color 0.2s, box-shadow 0.2s, color 0.2s',
    fontFamily: 'monospace',
    fontWeight: 'bold',
    zIndex: '1501',
    fontSize: '26px',
    lineHeight: '1',
    letterSpacing: '0px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  });
  zenOffBtn.onmouseenter = () => {
    zenOffBtn.style.borderColor = 'rgba(248,113,113,0.9)';
    zenOffBtn.style.color = '#fecaca';
    zenOffBtn.style.boxShadow = '0 0 14px rgba(248,113,113,0.35)';
  };
  zenOffBtn.onmouseleave = () => {
    zenOffBtn.style.borderColor = 'rgba(255,255,255,0.3)';
    zenOffBtn.style.color = '#fff';
    zenOffBtn.style.boxShadow = 'none';
  };
  zenOffBtn.onclick = () => {
    vizControls.toggleZenMode?.();
  };
  zenOverlay.appendChild(zenOffBtn);

  const zenPatternContainer = document.createElement('div');
  Object.assign(zenPatternContainer.style, {
    position: 'absolute',
    bottom: '70px',
    right: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    pointerEvents: 'auto',
    opacity: '0',
    transition: 'opacity 0.3s'
  });

  const zenPatternLabels: Record<ZenVisualMode, string> = {
    organic: 'ORG',
    wireframe: 'MTH',
    monochrome: 'PRT',
    rings: 'RNG',
    suibokuga: 'INK',
    waves: 'WAV',
    grid: 'GRZ'
  };

  const updateZenPatternButtons = (activeId: string) => {
    zenPatternContainer.querySelectorAll('button').forEach((b: any) => {
      b.style.color = b.dataset.pattern === activeId ? '#fff' : '#888';
      b.style.borderColor = b.dataset.pattern === activeId ? '#06b6d4' : 'rgba(255,255,255,0.2)';
    });
  };

  ZEN_VISUAL_MODES.forEach((mode) => {
    const btn = document.createElement('button');
    btn.textContent = zenPatternLabels[mode];
    btn.dataset.pattern = mode;
    Object.assign(btn.style, {
      padding: '10px 20px',
      fontSize: '12px',
      fontFamily: 'monospace',
      fontWeight: 'bold',
      letterSpacing: '1px',
      background: 'rgba(0,0,0,0.6)',
      color: '#888',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: '6px',
      cursor: 'pointer',
      transition: 'all 0.2s'
    });
    btn.onclick = () => {
      threeViz.setMode(mode);
      updateZenPatternButtons(mode);
      vizControls.currentMode = mode;
      vizControls.requestUpdate?.();
    };
    zenPatternContainer.appendChild(btn);
  });
  zenOverlay.appendChild(zenPatternContainer);

  const handleVisualModeChange = (e: any) => {
    updateZenPatternButtons(e.detail.mode);
  };
  vizControls.addEventListener('visual-mode-change', handleVisualModeChange);

  const zenMiniCtrl = document.createElement('div');
  Object.assign(zenMiniCtrl.style, {
    position: 'absolute',
    bottom: '30px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '30px',
    alignItems: 'center',
    padding: '12px 40px',
    background: 'rgba(0,0,0,0.3)',
    borderRadius: '40px',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.1)',
    pointerEvents: 'auto',
    opacity: '0',
    transition: 'opacity 0.3s'
  });

  const zenPlayA = document.createElement('button');
  zenPlayA.innerHTML =
    '<div style="width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 10px solid #ccc;"></div>';
  Object.assign(zenPlayA.style, {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: '#18181b',
    border: '1px solid #333',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s'
  });
  const updateZenPlayA = (playing: boolean) => {
    zenPlayA.style.borderColor = playing ? '#06b6d4' : '#333';
    zenPlayA.style.boxShadow = playing ? '0 0 10px rgba(6,182,212,0.4)' : 'none';
    zenPlayA.innerHTML = playing
      ? '<div style="width: 10px; height: 10px; background: #06b6d4; border-radius: 2px;"></div>'
      : '<div style="width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 10px solid #ccc;"></div>';
  };
  zenPlayA.onclick = () => {
    const shouldPlay = engine.isDeckStopped('A');
    window.dispatchEvent(new CustomEvent('deck-play-toggle', { detail: { deck: 'A', playing: shouldPlay } }));
  };

  const zenFader = document.createElement('input');
  zenFader.type = 'range';
  zenFader.min = '0';
  zenFader.max = '1';
  zenFader.step = '0.01';
  zenFader.value = '0.5';
  Object.assign(zenFader.style, {
    width: '180px',
    height: '4px',
    appearance: 'none',
    background: '#333',
    borderRadius: '2px',
    cursor: 'pointer',
    accentColor: '#ccc'
  });
  zenFader.oninput = (e: any) => {
    const val = parseFloat(e.target.value);
    engine.setCrossfader(val);
    window.dispatchEvent(new CustomEvent('mixer-update', { detail: { parameter: 'crossfader', value: val } }));
  };

  const zenPlayB = document.createElement('button');
  zenPlayB.innerHTML =
    '<div style="width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 10px solid #ccc;"></div>';
  Object.assign(zenPlayB.style, {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: '#18181b',
    border: '1px solid #333',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s'
  });
  const updateZenPlayB = (playing: boolean) => {
    zenPlayB.style.borderColor = playing ? '#10b981' : '#333';
    zenPlayB.style.boxShadow = playing ? '0 0 10px rgba(16,185,129,0.4)' : 'none';
    zenPlayB.innerHTML = playing
      ? '<div style="width: 10px; height: 10px; background: #10b981; border-radius: 2px;"></div>'
      : '<div style="width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 10px solid #ccc;"></div>';
  };
  zenPlayB.onclick = () => {
    window.dispatchEvent(new CustomEvent('deck-play-toggle', { detail: { deck: 'B', playing: engine.isDeckStopped('B') } }));
  };

  zenMiniCtrl.appendChild(zenPlayA);
  zenMiniCtrl.appendChild(zenFader);
  zenMiniCtrl.appendChild(zenPlayB);
  zenOverlay.appendChild(zenMiniCtrl);
  document.body.appendChild(zenOverlay);

  const syncZenCrossfader = (detail: any) => {
    if (!detail) return;
    if (detail.id === 'CROSSFADER' && typeof detail.val === 'number') {
      zenFader.value = String(detail.val);
      return;
    }
    if (detail.parameter === 'crossfader' && typeof detail.value === 'number') {
      zenFader.value = String(detail.value);
    }
  };

  // UI操作(mixer-change) と Automation/MIDI(mixer-update) の両方を同期対象にする
  const handleMixerChange = (e: any) => syncZenCrossfader(e.detail);
  const handleMixerUpdate = (e: any) => syncZenCrossfader(e.detail);
  window.addEventListener('mixer-change', handleMixerChange);
  window.addEventListener('mixer-update', handleMixerUpdate);

  const handleZenModeToggle = (e: any) => {
    const isActive = e.detail.active;

    if (isActive) {
      viewContainer.style.display = 'none';
      sideToggleBtn.style.display = 'none';
      libraryPanelContainer.style.display = 'none';

      zenOverlay.style.display = 'block';
      document.body.style.cursor = 'none';
    } else {
      viewContainer.style.display = 'flex';
      sideToggleBtn.style.display = 'block';
      libraryPanelContainer.style.display = 'block';
      if (!isLibraryPanelVisible()) {
        libraryPanelContainer.style.right = '-300px';
      }
      zenOverlay.style.display = 'none';
      document.body.style.cursor = 'auto';
    }
  };
  window.addEventListener('zen-mode-toggle', handleZenModeToggle);

  let zenMouseTimer: any;
  const handleMouseMove = () => {
    if (zenOverlay.style.display === 'block') {
      zenOffBtn.style.opacity = '1';
      zenMiniCtrl.style.opacity = '1';
      zenPatternContainer.style.opacity = '1';
      document.body.style.cursor = 'auto';

      clearTimeout(zenMouseTimer);
      zenMouseTimer = setTimeout(() => {
        if (zenOverlay.style.display === 'block') {
          zenOffBtn.style.opacity = '0';
          zenMiniCtrl.style.opacity = '0';
          zenPatternContainer.style.opacity = '0';
          document.body.style.cursor = 'none';
        }
      }, 1000);
    }
  };
  window.addEventListener('mousemove', handleMouseMove);

  const handleDeckPlaySync = (e: any) => {
    if (e.detail.deck === 'A') updateZenPlayA(e.detail.playing);
    if (e.detail.deck === 'B') updateZenPlayB(e.detail.playing);
  };
  window.addEventListener('deck-play-sync', handleDeckPlaySync);

  return {
    dispose: () => {
      window.removeEventListener('mixer-change', handleMixerChange);
      window.removeEventListener('mixer-update', handleMixerUpdate);
      window.removeEventListener('zen-mode-toggle', handleZenModeToggle);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('deck-play-sync', handleDeckPlaySync);
      vizControls.removeEventListener('visual-mode-change', handleVisualModeChange);
      clearTimeout(zenMouseTimer);
      document.body.style.cursor = 'auto';
      zenOverlay.remove();
    }
  };
}
