import type { AudioEngine } from '../audio/engine';
import './atoms/bio-slider'; // Ensure custom elements are registered

// --- UI Helper Functions ---

export const createAiSlider = (label: string, onChange: (val: number) => void) => {
    const wrapper = document.createElement('div');
    wrapper.className = "flex flex-col flex-1 h-full border border-white/20 bg-black/40 rounded-lg overflow-hidden";

    // Header (Visual Match to Select)
    const header = document.createElement('div');
    header.className = "bg-black text-white border-b border-white/20 text-[11px] p-1.5 font-mono w-full truncate border-none";
    // Actually, select has border-b. But here we might want just text.
    // To match exactly: Select has border-b border-white/20.
    header.className = "bg-black text-zinc-400 border-b border-white/20 text-[11px] p-1.5 font-mono w-full truncate pl-2 uppercase tracking-wide";
    header.textContent = label;
    wrapper.appendChild(header);

    const slider = document.createElement('bio-slider');
    slider.setAttribute('label', ''); // Label handled by header
    slider.setAttribute('value', "0");
    slider.className = "flex-1 border-none"; 
    slider.addEventListener('change', (e: any) => {
        onChange(e.detail); 
    });
    wrapper.appendChild(slider);
    return wrapper;
};

export const createComboSlot = (label: string, options: string[], onChange: (selected: string, intens: number) => void) => {
    const wrapper = document.createElement('div');
    wrapper.className = "flex flex-col flex-1 border border-white/20 bg-black/40 rounded-lg overflow-hidden";
    
    // Header / Dropdown
    const select = document.createElement('select');
    select.className = "bg-black text-white border-b border-white/20 text-[11px] p-1.5 font-mono outline-none";
    
    options.forEach(opt => {
        const el = document.createElement('option');
        el.value = opt;
        el.textContent = opt.split(' ').slice(0, 2).join(' ').toUpperCase(); 
        select.appendChild(el);
    });
    wrapper.appendChild(select);
    
    const slider = document.createElement('bio-slider');
    slider.setAttribute('label', ''); 
    slider.className = "flex-1 border-none";
    
    let currentSelection = options[0];
    let currentValue = 0; // 0-100

    const emit = () => onChange(currentSelection, currentValue);
    
    select.onchange = (e: any) => {
        currentSelection = e.target.value;
        emit();
    };
    
    slider.addEventListener('change', (e: any) => {
         currentValue = e.detail;
         emit();
    });
    
    wrapper.appendChild(slider);
    return wrapper;
};

export const createCustomSlot = (onChange: (text: string, intens: number) => void) => {
    const wrapper = document.createElement('div');
    wrapper.className = "flex flex-col flex-1 border border-white/20 bg-black/40 rounded-lg overflow-hidden";
    
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'THEME / PROMPT';
    input.className = "bg-black text-tech-cyan border-b border-white/20 text-[11px] p-1.5 font-mono outline-none placeholder-zinc-700";
    wrapper.appendChild(input);
    
    const slider = document.createElement('bio-slider');
    slider.setAttribute('label', '');
    slider.className = "flex-1 border-none";
    
    let text = "";
    let val = 0;

    const emit = () => onChange(text, val);
    
    input.onchange = (e: any) => {
        text = e.target.value;
        emit();
    };
    
    slider.addEventListener('change', (e: any) => {
         val = e.detail;
         emit();
    });
    
    wrapper.appendChild(slider);
    return wrapper;
};

// Dual Selector Slot (e.g. Key + Scale)
export const createDualSelectorSlot = (labelA: string, optionsA: string[], labelB: string, optionsB: string[], onChange: (selA: string, selB: string) => void) => {
    const wrapper = document.createElement('div');
    wrapper.className = "flex flex-col flex-1 border border-white/20 bg-black/40 rounded-lg overflow-hidden";
    
    // Helper to create select
    const createSelect = (lbl: string, opts: string[], onUpdate: (val: string) => void) => {
        const container = document.createElement('div');
        container.className = "flex flex-col flex-1 border-b border-white/10 last:border-b-0";
        
        const header = document.createElement('div');
        header.textContent = lbl;
        header.className = "bg-black/50 text-zinc-500 text-[9px] px-1.5 py-0.5 font-mono tracking-wider";
        container.appendChild(header);

        const sel = document.createElement('select');
        sel.className = "bg-transparent text-white text-[10px] p-1 font-mono outline-none w-full appearance-none cursor-pointer hover:bg-white/5";
        
        // Add "None" option
        const noneOpt = document.createElement('option');
        noneOpt.value = "";
        noneOpt.textContent = "---";
        noneOpt.style.backgroundColor = "#000";
        noneOpt.style.color = "#fff";
        sel.appendChild(noneOpt);

        opts.forEach(opt => {
            const el = document.createElement('option');
            el.value = opt;
            el.textContent = opt.split(' ').slice(0, 2).join(' ').toUpperCase();
            el.style.backgroundColor = "#000";
            el.style.color = "#fff";
            sel.appendChild(el);
        });
        
        sel.onchange = (e: any) => onUpdate(e.target.value);
        container.appendChild(sel);
        return { container, sel };
    };

    let selectionA = "";
    let selectionB = "";

    const update = () => onChange(selectionA, selectionB);

    const s1 = createSelect(labelA, optionsA, (v) => { selectionA = v; update(); });
    const s2 = createSelect(labelB, optionsB, (v) => { selectionB = v; update(); });

    wrapper.appendChild(s1.container);
    wrapper.appendChild(s2.container);
    
    return wrapper;
};

// --- FX Module Helpers ---
// Note: These might be obsolete if FxRack handles everything, but keeping for compatibility if used elsewhere.
// Reimplementing them to match BIO:GRAM if they are still used.

export const createFxModule = (title: string, paramPrefix: string, onEdit: () => void, engine: AudioEngine) => {
    const wrapper = document.createElement('div');
    wrapper.className = "bg-black relative w-full h-full min-h-[80px] rounded-xl overflow-hidden border border-white/10 group hover:border-white/30 transition-colors";

    // 1. BIG TOGGLE BUTTON (Background)
    const toggleBtn = document.createElement('button');
    toggleBtn.className = "absolute top-0 left-0 w-full h-full cursor-pointer flex flex-col justify-center items-center transition-all duration-100 select-none bg-[repeating-linear-gradient(45deg,#000,#000_2px,#111_2px,#111_4px)] text-white hover:bg-zinc-800 hover:text-zinc-300";
    
    let isActive = false;
    
    const labelMain = document.createElement('span');
    labelMain.textContent = title;
    labelMain.className = "text-xl font-bold tracking-widest";
    
    const labelSub = document.createElement('span');
    labelSub.textContent = "OFF";
    labelSub.className = "text-[11px] tracking-[0.3em] mt-1";
    
    toggleBtn.appendChild(labelMain);
    toggleBtn.appendChild(labelSub);
    
    toggleBtn.onclick = () => {
         isActive = !isActive;
         engine.updateDspParam(`${paramPrefix}_ACTIVE`, isActive ? 1.0 : 0.0);
         
         labelSub.textContent = isActive ? "ACTIVE" : "OFF";
         
         if (isActive) {
             toggleBtn.className = "absolute top-0 left-0 w-full h-full cursor-pointer flex flex-col justify-center items-center transition-all duration-100 select-none bg-white text-black";
         } else {
             toggleBtn.className = "absolute top-0 left-0 w-full h-full cursor-pointer flex flex-col justify-center items-center transition-all duration-100 select-none bg-[repeating-linear-gradient(45deg,#000,#000_2px,#111_2px,#111_4px)] text-white hover:bg-zinc-800 hover:text-zinc-300";
         }
    };
    
    wrapper.appendChild(toggleBtn);

    // 2. OVERLAY CONTROLS
    const overlay = document.createElement('div');
    overlay.className = "absolute top-0 left-0 w-full h-full pointer-events-none z-10";
    
    // EDIT BUTTON
    const editBtn = document.createElement('button');
    editBtn.textContent = "EDIT";
    editBtn.className = "absolute top-1 left-1 pointer-events-auto text-[10px] px-1.5 py-0.5 border border-zinc-800 bg-black text-white hover:bg-white hover:text-black transition-colors";
    editBtn.onclick = (e) => { e.stopPropagation(); onEdit(); };
    
    // A/B SWITCH
    const abSwitch = document.createElement('div');
    abSwitch.className = "absolute top-1 right-1 pointer-events-auto flex border border-zinc-800 rounded overflow-hidden scale-90";
    
    let target: 'A' | 'B' = 'A';
    const btnA = document.createElement('button');
    btnA.textContent = "A";
    btnA.className = "px-2 py-0 text-[10px] font-bold bg-white text-black";
    
    const btnB = document.createElement('button');
    btnB.textContent = "B";
    btnB.className = "px-2 py-0 text-[10px] font-bold bg-black text-zinc-500";
    
    const updateTargetVisuals = () => {
         if (target === 'A') {
             btnA.className = "px-2 py-0 text-[10px] font-bold bg-white text-black";
             btnB.className = "px-2 py-0 text-[10px] font-bold bg-black text-zinc-500";
         } else {
             btnA.className = "px-2 py-0 text-[10px] font-bold bg-black text-zinc-500";
             btnB.className = "px-2 py-0 text-[10px] font-bold bg-white text-black";
         }
    };
    
    btnA.onclick = (e) => { e.stopPropagation(); target = 'A'; updateTargetVisuals(); engine.updateDspParam(`${paramPrefix}_TARGET`, 0.0); };
    btnB.onclick = (e) => { e.stopPropagation(); target = 'B'; updateTargetVisuals(); engine.updateDspParam(`${paramPrefix}_TARGET`, 1.0); };
    
    abSwitch.appendChild(btnA);
    abSwitch.appendChild(btnB);
    
    overlay.appendChild(editBtn);
    overlay.appendChild(abSwitch);
    
    wrapper.appendChild(overlay);
    
    return wrapper;
};

// --- Overlay Helpers ---

export const mkOverlay = (title: string, color: string = '#00ffff') => {
    const el = document.createElement('div');
    el.className = "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] bg-black/95 border p-6 flex flex-col gap-4 z-[2000] shadow-[0_0_30px_rgba(0,0,0,0.5)] backdrop-blur";
    el.style.borderColor = color;
    el.style.boxShadow = `0 0 30px ${color}4d`;

    const t = document.createElement('div');
    t.textContent = title;
    t.className = "text-lg font-bold text-center mb-2 tracking-widest";
    t.style.color = color;
    el.appendChild(t);
    return el;
};

export const mkSliderHelper = (parent: HTMLElement, name: string, param: string, def: number, min: number, max: number, engine: AudioEngine) => {
     const row = document.createElement('div');
     row.className = "flex flex-col w-full";
     
     const slabel = document.createElement('div');
     slabel.textContent = name;
     slabel.className = "text-[11px] text-zinc-400 mb-1 font-mono";
     
     const inp = document.createElement('input');
     inp.type = "range"; inp.min = "0"; inp.max = "100";
     const currentVal = engine.getDspParam(param) ?? def;
     inp.value = String(currentVal * 100); 
     inp.className = "w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white hover:accent-tech-cyan";
     
     inp.oninput = (e: any) => {
         const v = Number(e.target.value) / 100;
         engine.updateDspParam(param, v);
     };
     row.appendChild(slabel); row.appendChild(inp);
     parent.appendChild(row);
};
