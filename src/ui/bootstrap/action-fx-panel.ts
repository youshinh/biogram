import { createFxModule, mkOverlay, mkSliderHelper } from '../ui-helpers';
import type { AudioEngine } from '../../audio/engine';

type ActionFxPanelOptions = {
  engine: AudioEngine;
  getIsSlamming: () => boolean;
  setIsSlamming: (value: boolean) => void;
  onPromptRefresh: () => void;
};

export const createActionFxPanel = (options: ActionFxPanelOptions): HTMLElement => {
  const { engine } = options;

  const actionsContainer = document.createElement('div');
  actionsContainer.slot = 'actions';
  actionsContainer.style.height = '100%';
  actionsContainer.style.display = 'flex';
  actionsContainer.style.flexDirection = 'column';
  actionsContainer.style.gap = '8px';

  const gridControls = document.createElement('div');
  gridControls.style.display = 'grid';
  gridControls.style.gridTemplateColumns = '1fr 1fr';
  gridControls.style.gap = '8px';
  gridControls.style.height = '40%';

  let ghostEditorOverlay: HTMLElement | null = null;
  const toggleGhostEditor = () => {
    if (ghostEditorOverlay) {
      ghostEditorOverlay.remove();
      ghostEditorOverlay = null;
      return;
    }

    ghostEditorOverlay = mkOverlay('GHOST PARAMETERS', '#00ffff');
    mkSliderHelper(ghostEditorOverlay, 'FADE LENGTH', 'GHOST_FADE', 0.5, 0, 1, engine);
    mkSliderHelper(ghostEditorOverlay, 'EQUALIZER (Dark<>Bright)', 'GHOST_EQ', 0.5, 0, 1, engine);
    mkSliderHelper(ghostEditorOverlay, 'TAPE ECHO SEND', 'DUB', 0.0, 0, 1, engine);

    const close = document.createElement('button');
    close.textContent = 'CLOSE';
    close.className = 'b-all';
    close.style.padding = '8px';
    close.style.marginTop = '8px';
    close.style.cursor = 'pointer';
    close.onclick = () => toggleGhostEditor();
    ghostEditorOverlay.appendChild(close);
    document.body.appendChild(ghostEditorOverlay);
  };
  gridControls.appendChild(createFxModule('GHOST', 'GHOST', () => toggleGhostEditor(), engine));

  let slicerOverlay: HTMLElement | null = null;
  const toggleSlicerEditor = () => {
    if (slicerOverlay) {
      slicerOverlay.remove();
      slicerOverlay = null;
      return;
    }

    slicerOverlay = mkOverlay('SLICER PARAMS', '#10b981');
    mkSliderHelper(slicerOverlay, 'PATTERN LENGTH', 'SLICER_PATTERN', 0.25, 0, 1, engine);
    mkSliderHelper(slicerOverlay, 'GATE TIME', 'SLICER_GATE', 0.5, 0, 1, engine);
    mkSliderHelper(slicerOverlay, 'SPEED DIV', 'SLICER_SPEED', 0.5, 0, 1, engine);
    mkSliderHelper(slicerOverlay, 'SMOOTHING', 'SLICER_SMOOTH', 0.1, 0, 0.99, engine);
    mkSliderHelper(slicerOverlay, 'RANDOMIZE', 'SLICER_RANDOM', 0, 0, 1, engine);

    const close = document.createElement('button');
    close.textContent = 'CLOSE';
    close.className = 'b-all font-mono text-xs hover:bg-white hover:text-black transition-colors border border-white/20 p-2 mt-2';
    close.onclick = () => toggleSlicerEditor();
    slicerOverlay.appendChild(close);
    document.body.appendChild(slicerOverlay);
  };
  gridControls.appendChild(createFxModule('SLICER', 'SLICER', () => toggleSlicerEditor(), engine));

  actionsContainer.appendChild(gridControls);

  const slamBtn = document.createElement('slam-button');
  slamBtn.style.flex = '1';
  slamBtn.style.position = 'relative';
  slamBtn.setAttribute('label', 'SLAM // MASTER FX');

  const slamConfig = {
    maxCutoff: 10000,
    maxRes: 15.0,
    maxDrive: 4.0,
    maxNoise: 0.1,
    baseCutoff: 20.0,
    baseRes: 1.0,
    baseDrive: 1.0,
    baseNoise: 0.0
  };

  const updateSlamParams = (x: number, y: number) => {
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));

    const intensity = 1.0 - y;
    const cutoff = slamConfig.baseCutoff * Math.pow(slamConfig.maxCutoff / slamConfig.baseCutoff, intensity);
    const resonance = 1.0 + (x * (slamConfig.maxRes - 1.0));
    const drive = 1.0 + (intensity * (slamConfig.maxDrive - 1.0));
    const noiseLevel = intensity * slamConfig.maxNoise;

    engine.updateDspParam('SLAM_CUTOFF', cutoff);
    engine.updateDspParam('SLAM_RES', resonance);
    engine.updateDspParam('SLAM_DRIVE', drive);
    engine.updateDspParam('SLAM_NOISE', noiseLevel);
  };

  let slamOverlay: HTMLElement | null = null;
  const toggleSlamEditor = () => {
    if (slamOverlay) {
      slamOverlay.remove();
      slamOverlay = null;
      return;
    }

    slamOverlay = mkOverlay('SLAM CONFIG', '#ef4444');

    const mkConfigSlider = (
      label: string,
      configKey: keyof typeof slamConfig,
      min: number,
      max: number,
      step: number = 0.01
    ) => {
      const container = document.createElement('div');
      container.className = 'flex flex-col gap-1 mb-2';

      const header = document.createElement('div');
      header.className = 'flex justify-between text-[0.6rem] font-mono text-zinc-400';
      const title = document.createElement('span');
      title.textContent = label;
      const valSpan = document.createElement('span');
      valSpan.textContent = slamConfig[configKey].toFixed(2);
      header.appendChild(title);
      header.appendChild(valSpan);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = String(min);
      slider.max = String(max);
      slider.step = String(step);
      slider.value = String(slamConfig[configKey]);
      slider.className = 'w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-red-500 [&::-webkit-slider-thumb]:rounded-full';
      slider.oninput = (e: Event) => {
        const target = e.target as HTMLInputElement | null;
        if (!target) return;
        const v = parseFloat(target.value);
        slamConfig[configKey] = v;
        valSpan.textContent = v.toFixed(2);
      };

      container.appendChild(header);
      container.appendChild(slider);
      slamOverlay!.appendChild(container);
    };

    mkConfigSlider('MAX DRIVE', 'maxDrive', 1.0, 20.0, 0.1);
    mkConfigSlider('MAX NOISE', 'maxNoise', 0.0, 1.0, 0.01);
    mkConfigSlider('MAX RES', 'maxRes', 1.0, 30.0, 0.5);
    mkConfigSlider('MAX CUTOFF', 'maxCutoff', 1000, 20000, 100);

    const close = document.createElement('button');
    close.textContent = 'CLOSE';
    close.className = 'b-all font-mono text-xs hover:bg-white hover:text-black transition-colors border border-white/20 p-2 mt-2 w-full text-center';
    close.onclick = () => toggleSlamEditor();
    slamOverlay.appendChild(close);
    document.body.appendChild(slamOverlay);
  };

  const releaseSlam = () => {
    if (!options.getIsSlamming()) return;
    options.setIsSlamming(false);
    engine.updateDspParam('SLAM_CUTOFF', 20000.0);
    engine.updateDspParam('SLAM_RES', 0.0);
    engine.updateDspParam('SLAM_DRIVE', 1.0);
    engine.updateDspParam('SLAM_NOISE', 0.0);
    engine.updateDspParam('BITS', 32);
  };

  const handleSlamMove = (e: CustomEvent) => {
    const rect = slamBtn.getBoundingClientRect();
    const x = (e.detail.x - rect.left) / rect.width;
    const y = (e.detail.y - rect.top) / rect.height;
    updateSlamParams(x, y);
  };

  slamBtn.addEventListener('slam-start', (e: Event) => {
    options.setIsSlamming(true);
    options.onPromptRefresh();
    handleSlamMove(e as CustomEvent);
  });
  slamBtn.addEventListener('slam-move', (e: Event) => {
    if (options.getIsSlamming()) handleSlamMove(e as CustomEvent);
  });
  slamBtn.addEventListener('slam-end', () => {
    releaseSlam();
    options.setIsSlamming(false);
    options.onPromptRefresh();
  });

  const slamWrapper = document.createElement('div');
  slamWrapper.style.flex = '1';
  slamWrapper.style.position = 'relative';
  slamWrapper.style.display = 'flex';
  slamWrapper.appendChild(slamBtn);

  const slamEdit = document.createElement('div');
  slamEdit.textContent = 'EDIT';
  slamEdit.style.position = 'absolute';
  slamEdit.style.top = '10px';
  slamEdit.style.left = '10px';
  slamEdit.style.fontSize = '0.7rem';
  slamEdit.style.color = 'white';
  slamEdit.style.border = '1px solid white';
  slamEdit.style.padding = '4px 8px';
  slamEdit.style.backgroundColor = 'rgba(0,0,0,0.8)';
  slamEdit.style.cursor = 'pointer';
  slamEdit.style.zIndex = '100';
  slamEdit.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
  slamEdit.onclick = (e) => {
    e.stopPropagation();
    toggleSlamEditor();
  };
  slamWrapper.appendChild(slamEdit);

  actionsContainer.appendChild(slamWrapper);
  return actionsContainer;
};
