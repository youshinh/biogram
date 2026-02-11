import { ROOT_OPTIONS, SCALE_OPTIONS } from '../../config/prompt-options';
import { createAiSlider, createComboSlot, createCustomSlot } from '../ui-helpers';

type BioSliderElement = HTMLElement & { value?: number | string };

type ControlGridPanelOptions = {
  uiState: any;
};

export type ControlGridPanel = {
  element: HTMLElement;
  getSliderByName: (name: string) => BioSliderElement | null;
  setSliderValue: (slider: BioSliderElement, value: number) => void;
};

export const createControlGridPanel = (options: ControlGridPanelOptions): ControlGridPanel => {
  const controlsContainer = document.createElement('div');
  controlsContainer.slot = 'controls';
  controlsContainer.style.display = 'grid';
  controlsContainer.className = 'controls-grid';

  const sliderRefs: { name: string; slider: BioSliderElement }[] = [];
  const comboRefs: { name: string; select: HTMLSelectElement; slider: BioSliderElement }[] = [];
  const setSliderValue = (slider: BioSliderElement, value: number) => {
    const current = Number(slider.value ?? 0);
    if (Math.abs(current - value) < 0.5) return;
    slider.value = value;
    slider.dispatchEvent(
      new CustomEvent('change', {
        detail: value,
        bubbles: true,
        composed: true
      })
    );
  };

  const createAiSliderWithRef = (label: string, onChange: (val: number) => void): HTMLElement => {
    const wrapper = createAiSlider(label, onChange);
    const slider = wrapper.querySelector('bio-slider') as BioSliderElement | null;
    if (slider) sliderRefs.push({ name: label, slider });
    return wrapper;
  };

  const createComboSlotWithRef = (label: string, values: string[], onChange: (sel: string, val: number) => void): HTMLElement => {
    const wrapper = createComboSlot(label, values, onChange);
    const select = wrapper.querySelector('select') as HTMLSelectElement;
    const slider = wrapper.querySelector('bio-slider') as BioSliderElement | null;
    if (select && slider) comboRefs.push({ name: label, select, slider });
    return wrapper;
  };

  controlsContainer.appendChild(createAiSliderWithRef('AMBIENT', (v) => {
    options.uiState.valAmbient = v;
  }));
  controlsContainer.appendChild(createAiSliderWithRef('MINIMAL', (v) => {
    options.uiState.valMinimal = v;
  }));
  controlsContainer.appendChild(createAiSliderWithRef('DUB', (v) => {
    options.uiState.valDub = v;
  }));
  controlsContainer.appendChild(createAiSliderWithRef('IMPACT', (v) => {
    options.uiState.valImpact = v;
  }));
  controlsContainer.appendChild(createAiSliderWithRef('COLOR', (v) => {
    options.uiState.valColor = v;
  }));

  controlsContainer.appendChild(
    createComboSlotWithRef(
      'TEXTURE',
      ['Field Recordings Nature', 'Industrial Factory Drone', 'Tape Hiss Lo-Fi', 'Underwater Hydrophone'],
      (sel, val) => {
        options.uiState.typeTexture = sel;
        options.uiState.valTexture = val;
      }
    )
  );
  controlsContainer.appendChild(
    createComboSlotWithRef(
      'PULSE',
      ['Sub-bass Pulse', 'Granular Clicks', 'Deep Dub Tech Rhythm', 'Industrial Micro-beats'],
      (sel, val) => {
        options.uiState.typePulse = sel;
        options.uiState.valPulse = val;
      }
    )
  );

  controlsContainer.appendChild(
    createCustomSlot((text) => {
      options.uiState.theme = text;
    })
  );

  const scaleLabels = SCALE_OPTIONS.map((o) => o.label);
  const keyScaleRandomWrapper = document.createElement('div');
  keyScaleRandomWrapper.className = 'flex flex-col flex-1 border border-white/20 bg-black/40 rounded-lg overflow-hidden';

  const createInlineSelect = (lbl: string, vals: readonly string[], onUpdate: (val: string) => void) => {
    const container = document.createElement('div');
    container.className = 'flex flex-col border-b border-white/10 py-1 mb-1';

    const header = document.createElement('div');
    header.textContent = lbl;
    header.className = 'bg-black/50 text-zinc-500 text-[9px] px-1.5 py-0.5 font-mono tracking-wider mb-1';
    container.appendChild(header);

    const sel = document.createElement('select');
    sel.className = 'bg-transparent text-white text-[11px] p-1.5 font-mono outline-none w-full appearance-none cursor-pointer hover:bg-white/5';

    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '---';
    noneOpt.style.backgroundColor = '#000';
    noneOpt.style.color = '#fff';
    sel.appendChild(noneOpt);

    vals.forEach((opt) => {
      const el = document.createElement('option');
      el.value = opt;
      el.textContent = opt.split(' ').slice(0, 2).join(' ').toUpperCase();
      el.style.backgroundColor = '#000';
      el.style.color = '#fff';
      sel.appendChild(el);
    });

    sel.onchange = (e: any) => onUpdate(e.target.value);
    container.appendChild(sel);
    return { container, sel };
  };

  const keySelect = createInlineSelect('KEY', ROOT_OPTIONS, (root) => {
    options.uiState.keyRoot = root;
  });
  keyScaleRandomWrapper.appendChild(keySelect.container);

  const scaleSelect = createInlineSelect('SCALE', scaleLabels, (scaleLbl) => {
    const opt = SCALE_OPTIONS.find((o) => o.label === scaleLbl);
    if (opt) {
      options.uiState.scaleLabel = opt.label;
      options.uiState.scalePrompt = opt.prompt;
    } else {
      options.uiState.scaleLabel = '';
      options.uiState.scalePrompt = '';
    }
  });
  keyScaleRandomWrapper.appendChild(scaleSelect.container);

  const randomBtnContainer = document.createElement('div');
  randomBtnContainer.className = 'flex-1 flex items-center justify-center py-2';

  const randomBtn = document.createElement('button');
  randomBtn.textContent = 'RANDOM';
  randomBtn.style.width = '80px';
  randomBtn.style.height = '80px';
  randomBtn.style.borderRadius = '50%';
  randomBtn.className =
    'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white font-mono text-xs font-bold border border-white/10 transition-all duration-150 cursor-pointer flex items-center justify-center shadow-lg active:scale-95 active:border-tech-cyan/50 tracking-wider';

  randomBtn.onclick = () => {
    sliderRefs.forEach((ref) => {
      const randomVal = Math.floor(Math.random() * 100);
      setSliderValue(ref.slider, randomVal);
    });

    comboRefs.forEach((ref) => {
      const optionCount = ref.select.options.length;
      const randomIndex = Math.floor(Math.random() * optionCount);
      ref.select.selectedIndex = randomIndex;
      ref.select.dispatchEvent(new Event('change', { bubbles: true }));
      setSliderValue(ref.slider, Math.floor(Math.random() * 100));
    });

    const keyOpts = keySelect.sel.options;
    if (keyOpts.length > 1) {
      keySelect.sel.selectedIndex = Math.floor(Math.random() * (keyOpts.length - 1)) + 1;
      keySelect.sel.dispatchEvent(new Event('change'));
    }

    const scaleOpts = scaleSelect.sel.options;
    if (scaleOpts.length > 1) {
      scaleSelect.sel.selectedIndex = Math.floor(Math.random() * (scaleOpts.length - 1)) + 1;
      scaleSelect.sel.dispatchEvent(new Event('change'));
    }

    randomBtn.style.color = '#fff';
    randomBtn.style.borderColor = '#fff';
    setTimeout(() => {
      randomBtn.style.color = '';
      randomBtn.style.borderColor = '';
    }, 150);
  };

  randomBtnContainer.appendChild(randomBtn);
  keyScaleRandomWrapper.appendChild(randomBtnContainer);
  controlsContainer.appendChild(keyScaleRandomWrapper);

  return {
    element: controlsContainer,
    getSliderByName: (name: string) => sliderRefs.find((s) => s.name === name)?.slider ?? null,
    setSliderValue
  };
};
