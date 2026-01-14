import type { AudioEngine } from '../audio/engine';
import './atoms/bio-slider'; // Ensure custom elements are registered

// --- UI Helper Functions ---

export const createAiSlider = (label: string, prompt: string, engine: AudioEngine) => {
    const slider = document.createElement('bio-slider');
    slider.setAttribute('label', label);
    slider.setAttribute('value', "0");
    slider.addEventListener('change', (e: any) => {
        const val = e.detail / 100.0;
        engine.updateAiPrompt('A', prompt, val);
        engine.updateAiPrompt('B', prompt, val);
    });
    return slider;
};

export const createComboSlot = (label: string, options: string[], engine: AudioEngine) => {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.flex = '1';
    wrapper.style.border = '1px solid #333';
    wrapper.style.background = 'black';
    
    // Header / Dropdown
    const select = document.createElement('select');
    Object.assign(select.style, {
        background: 'black', color: 'white', border: 'none',
        borderBottom: '1px solid #333', fontSize: '0.6rem',
        padding: '4px', fontFamily: 'monospace', outline: 'none'
    });
    
    options.forEach(opt => {
        const el = document.createElement('option');
        el.value = opt;
        el.textContent = opt.split(' ').slice(0, 2).join(' ').toUpperCase(); // Short label
        select.appendChild(el);
    });
    wrapper.appendChild(select);
    
    const slider = document.createElement('bio-slider');
    slider.setAttribute('label', ''); 
    slider.style.flex = "1";
    slider.style.border = "none"; 
    
    let currentPrompt = options[0];
    
    select.onchange = (e: any) => {
        currentPrompt = e.target.value;
        const val = Number(slider.getAttribute('value')) / 100.0;
        if (val > 0) engine.updateAiPrompt('A', currentPrompt, val);
    };
    
    slider.addEventListener('change', (e: any) => {
         const val = e.detail / 100.0;
         engine.updateAiPrompt('A', currentPrompt, val);
    });
    
    wrapper.appendChild(slider);
    return wrapper;
};

export const createCustomSlot = (engine: AudioEngine) => {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.flex = '1';
    wrapper.style.border = '1px solid #333';
    wrapper.style.background = 'black';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'CUSTOM PROMPT';
    Object.assign(input.style, {
        background: 'black', color: '#00ff88', border: 'none',
        borderBottom: '1px solid #333', fontSize: '0.6rem',
        padding: '4px', fontFamily: 'monospace', outline: 'none'
    });
    wrapper.appendChild(input);
    
    const slider = document.createElement('bio-slider');
    slider.setAttribute('label', '');
    slider.style.flex = "1";
    slider.style.border = "none";
    
    let prompt = "";
    
    input.onchange = (e: any) => {
        prompt = e.target.value;
    };
    
    slider.addEventListener('change', (e: any) => {
         const val = e.detail / 100.0;
         if (prompt) engine.updateAiPrompt('A', prompt, val);
    });
    
    wrapper.appendChild(slider);
    return wrapper;
};

// --- FX Module Helpers ---

export const createFxModule = (title: string, paramPrefix: string, onEdit: () => void, engine: AudioEngine) => {
    const wrapper = document.createElement('div');
    wrapper.className = "bg-black";
    wrapper.style.position = "relative";
    wrapper.style.width = "100%";
    wrapper.style.height = "100%";
    wrapper.style.minHeight = "80px";

    // 1. BIG TOGGLE BUTTON (Background)
    const toggleBtn = document.createElement('button');
    Object.assign(toggleBtn.style, {
        position: "absolute", top: "0", left: "0", width: "100%", height: "100%",
        background: "repeating-linear-gradient(45deg, #000, #000 2px, #111 2px, #111 4px)",
        border: "1px solid white", color: "white", cursor: "pointer",
        display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
        transition: "all 0.1s", userSelect: "none"
    });
    
    let isActive = false;
    
    const labelMain = document.createElement('span');
    labelMain.textContent = title;
    Object.assign(labelMain.style, { fontSize: "1.5rem", fontWeight: "bold", letterSpacing: "0.1em" });
    
    const labelSub = document.createElement('span');
    labelSub.textContent = "OFF";
    Object.assign(labelSub.style, { fontSize: "0.6rem", letterSpacing: "0.3em", marginTop: "4px" });
    
    toggleBtn.appendChild(labelMain);
    toggleBtn.appendChild(labelSub);
    
    toggleBtn.onmouseenter = () => {
         if (!isActive) {
             toggleBtn.style.background = "#333";
             toggleBtn.style.color = "#ccc";
         }
    };
    toggleBtn.onmouseleave = () => {
         if (!isActive) {
             toggleBtn.style.background = "repeating-linear-gradient(45deg, #000, #000 2px, #111 2px, #111 4px)";
             toggleBtn.style.color = "white";
         }
    };
    
    toggleBtn.onclick = () => {
         isActive = !isActive;
         engine.updateDspParam(`${paramPrefix}_ACTIVE`, isActive ? 1.0 : 0.0);
         
         labelSub.textContent = isActive ? "ACTIVE" : "OFF";
         
         if (isActive) {
             toggleBtn.style.background = "white";
             toggleBtn.style.color = "black";
         } else {
             toggleBtn.style.background = "repeating-linear-gradient(45deg, #000, #000 2px, #111 2px, #111 4px)";
             toggleBtn.style.color = "white";
         }
    };
    
    wrapper.appendChild(toggleBtn);

    // 2. OVERLAY CONTROLS
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: "absolute", top: "0", left: "0", width: "100%", height: "100%",
        pointerEvents: "none", zIndex: "10"
    });
    
    // EDIT BUTTON
    const editBtn = document.createElement('button');
    editBtn.textContent = "EDIT";
    editBtn.className = "text-xxs b-all px-1 bg-black text-white hover:bg-white hover:text-black";
    Object.assign(editBtn.style, {
        position: "absolute", top: "4px", left: "4px", pointerEvents: "auto"
    });
    editBtn.onclick = (e) => { e.stopPropagation(); onEdit(); };
    
    // A/B SWITCH
    const abSwitch = document.createElement('div');
    abSwitch.className = "flex b-all rounded overflow-hidden";
    Object.assign(abSwitch.style, {
        position: "absolute", top: "4px", right: "4px", pointerEvents: "auto", transform: "scale(0.8)"
    });
    
    let target: 'A' | 'B' = 'A';
    const btnA = document.createElement('button');
    btnA.textContent = "A";
    btnA.className = "px-2 py-0 text-xs font-bold";
    Object.assign(btnA.style, { background: "white", color: "black" });
    
    const btnB = document.createElement('button');
    btnB.textContent = "B";
    btnB.className = "px-2 py-0 text-xs font-bold";
    Object.assign(btnB.style, { background: "black", color: "#555" });
    
    const updateTargetVisuals = () => {
         if (target === 'A') {
             btnA.style.background = "#fff"; btnA.style.color = "#000";
             btnB.style.background = "#000"; btnB.style.color = "#555";
         } else {
             btnA.style.background = "#000"; btnA.style.color = "#555";
             btnB.style.background = "#fff"; btnB.style.color = "#000";
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
    Object.assign(el.style, {
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '280px', background: 'rgba(0,0,0,0.95)', border: `1px solid ${color}`,
        padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', zIndex: 2000,
        boxShadow: `0 0 30px ${color}4d`
    });
    const t = document.createElement('div');
    t.textContent = title;
    t.style.cssText = `color:${color}; font-weight:bold; font-size:1rem; text-align:center; margin-bottom:10px;`;
    el.appendChild(t);
    return el;
};

export const mkSliderHelper = (parent: HTMLElement, name: string, param: string, def: number, min: number, max: number, engine: AudioEngine) => {
     const row = document.createElement('div');
     const slabel = document.createElement('div');
     slabel.textContent = name;
     Object.assign(slabel.style, { fontSize: "0.7rem", marginBottom: "4px" });
     
     const inp = document.createElement('input');
     inp.type = "range"; inp.min = "0"; inp.max = "100";
     const currentVal = engine.getDspParam(param) ?? def;
     inp.value = String(currentVal * 100); inp.style.width = "100%";
     inp.oninput = (e: any) => {
         const v = Number(e.target.value) / 100;
         engine.updateDspParam(param, v);
     };
     row.appendChild(slabel); row.appendChild(inp);
     parent.appendChild(row);
};
