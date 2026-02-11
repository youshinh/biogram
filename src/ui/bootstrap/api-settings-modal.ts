export type ApiSettingsModalOptions = {
  getStoredApiKey: () => string;
  setApiKey: (apiKey: string) => void;
  clearApiKey: () => void;
  onSaved: () => void;
};

export type ApiSettingsModalController = {
  open: (required?: boolean) => void;
};

export const createApiSettingsModalController = (
  options: ApiSettingsModalOptions
): ApiSettingsModalController => {
  let overlayEl: HTMLDivElement | null = null;

  const createStyledBtn = (label: string, isPrimary = false, isDanger = false): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.textContent = label;

    const baseBg = isPrimary
      ? 'rgba(34, 211, 238, 0.15)'
      : isDanger
        ? 'rgba(239, 68, 68, 0.15)'
        : 'rgba(255, 255, 255, 0.05)';

    const accentColor = isPrimary ? '#22d3ee' : isDanger ? '#ef4444' : '#a1a1aa';

    Object.assign(btn.style, {
      padding: '10px 20px',
      borderRadius: '0.75rem',
      border: `1px solid ${isPrimary || isDanger ? `${accentColor}44` : 'rgba(255, 255, 255, 0.1)'}`,
      background: baseBg,
      color: isPrimary || isDanger ? accentColor : '#a1a1aa',
      fontSize: '11px',
      fontFamily: "'JetBrains Mono', monospace",
      fontWeight: 'bold',
      letterSpacing: '0.1em',
      cursor: 'pointer',
      transition: 'all 0.2s cubic-bezier(0.23, 1, 0.32, 1)',
      backdropFilter: 'blur(10px)',
      textShadow: isPrimary || isDanger ? `0 0 10px ${accentColor}66` : 'none'
    });

    btn.onmouseenter = () => {
      btn.style.background = isPrimary
        ? 'rgba(34, 211, 238, 0.25)'
        : isDanger
          ? 'rgba(239, 68, 68, 0.25)'
          : 'rgba(255, 255, 255, 0.1)';
      btn.style.borderColor = accentColor;
      btn.style.color = '#fff';
      btn.style.boxShadow = `0 0 15px ${accentColor}33`;
      btn.style.transform = 'translateY(-1px)';
    };
    btn.onmouseleave = () => {
      btn.style.background = baseBg;
      btn.style.borderColor = isPrimary || isDanger ? `${accentColor}44` : 'rgba(255, 255, 255, 0.1)';
      btn.style.color = isPrimary || isDanger ? accentColor : '#a1a1aa';
      btn.style.boxShadow = 'none';
      btn.style.transform = 'none';
    };
    btn.onmousedown = () => {
      btn.style.transform = 'translateY(1px) scale(0.98)';
      btn.style.filter = 'brightness(0.8)';
    };
    btn.onmouseup = () => {
      btn.style.transform = 'translateY(-1px)';
      btn.style.filter = 'none';
    };

    return btn;
  };

  const open = (required = false): void => {
    if (overlayEl) return;

    const overlay = document.createElement('div');
    overlayEl = overlay;
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      background: 'rgba(0,0,0,0.4)',
      backdropFilter: 'blur(20px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '2500',
      opacity: '0',
      transition: 'opacity 0.3s ease'
    });

    const panel = document.createElement('div');
    Object.assign(panel.style, {
      width: 'min(92vw, 420px)',
      background: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(40px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '1.5rem',
      padding: '24px',
      color: '#d4d4d8',
      fontFamily: "'Comfortaa', sans-serif",
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      transform: 'scale(0.95)',
      transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
    });

    const title = document.createElement('h3');
    title.textContent = 'REALTIME API SETTINGS';
    Object.assign(title.style, {
      margin: '0 0 12px 0',
      fontSize: '0.65rem',
      fontFamily: "'JetBrains Mono', monospace",
      letterSpacing: '0.2em',
      color: '#3f3f46',
      fontWeight: 'bold'
    });
    panel.appendChild(title);

    const desc = document.createElement('p');
    desc.textContent = required
      ? 'Realtime deck generation key is missing. Save it locally to proceed.'
      : 'Save Gemini API Key locally for realtime deck generation. Reloads page after saving.';
    Object.assign(desc.style, {
      margin: '0 0 20px 0',
      color: '#a1a1aa',
      fontSize: '13px',
      lineHeight: '1.6'
    });
    panel.appendChild(desc);

    const input = document.createElement('input');
    input.type = 'password';
    input.value = options.getStoredApiKey();
    input.placeholder = 'AIza...';
    Object.assign(input.style, {
      width: '100%',
      boxSizing: 'border-box',
      padding: '12px 16px',
      borderRadius: '0.75rem',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      background: 'rgba(255, 255, 255, 0.05)',
      color: '#fff',
      marginBottom: '20px',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '14px',
      outline: 'none',
      transition: 'border-color 0.2s, box-shadow 0.2s'
    });
    input.onfocus = () => {
      input.style.borderColor = 'rgba(34, 211, 238, 0.5)';
      input.style.boxShadow = '0 0 0 2px rgba(34, 211, 238, 0.2)';
    };
    input.onblur = () => {
      input.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      input.style.boxShadow = 'none';
    };
    panel.appendChild(input);

    const actions = document.createElement('div');
    Object.assign(actions.style, {
      display: 'flex',
      gap: '12px',
      justifyContent: 'flex-end'
    });

    const closeBtn = createStyledBtn('CLOSE');
    if (required) {
      closeBtn.disabled = true;
      closeBtn.style.opacity = '0.3';
      closeBtn.style.cursor = 'not-allowed';
      closeBtn.style.background = '#18181b';
    }

    const clearBtn = createStyledBtn('CLEAR', false, true);
    const saveBtn = createStyledBtn('SAVE', true);

    const closeModal = () => {
      overlay.style.opacity = '0';
      panel.style.transform = 'scale(0.95)';
      window.setTimeout(() => {
        overlay.remove();
        overlayEl = null;
      }, 300);
    };

    closeBtn.onclick = () => closeModal();
    overlay.onclick = (e) => {
      if (required) return;
      if (e.target === overlay) closeModal();
    };
    clearBtn.onclick = () => {
      if (confirm('Clear the API Key?')) {
        options.clearApiKey();
        input.value = '';
      }
    };
    saveBtn.onclick = () => {
      const key = input.value.trim();
      if (!key) {
        alert('Please enter an API Key.');
        return;
      }
      options.setApiKey(key);
      alert('API Key saved. Reloading to apply changes.');
      options.onSaved();
    };

    actions.appendChild(closeBtn);
    actions.appendChild(clearBtn);
    actions.appendChild(saveBtn);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      panel.style.transform = 'scale(1)';
    });

    input.focus();
  };

  return { open };
};
