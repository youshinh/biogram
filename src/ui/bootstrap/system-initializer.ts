export type SystemInitializerOptions = {
  hasApiKey: () => boolean;
  openApiSettingsModal: (required?: boolean) => void;
  onInitialize: () => Promise<void>;
  onReady: () => void;
};

export const showSystemInitializationOverlay = (options: SystemInitializerOptions): void => {
  const overlay = document.createElement('div');
  overlay.className = 'boot-overlay';

  const stage = document.createElement('div');
  stage.className = 'boot-stage';

  const logo = document.createElement('div');
  logo.className = 'boot-logo';
  logo.textContent = 'Bio:gram';

  const startBtn = document.createElement('button');
  startBtn.className = 'boot-start-btn';
  startBtn.textContent = options.hasApiKey() ? 'INITIALIZE SYSTEM' : 'SET API KEY';

  stage.appendChild(logo);
  stage.appendChild(startBtn);
  overlay.appendChild(stage);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    logo.classList.add('visible');
  });
  window.setTimeout(() => {
    logo.classList.remove('visible');
  }, 1200);
  window.setTimeout(() => {
    startBtn.classList.add('visible');
  }, 1760);

  let initRequested = false;
  const runInitialization = async () => {
    if (initRequested) return;
    if (!options.hasApiKey()) {
      options.openApiSettingsModal(true);
      return;
    }

    initRequested = true;
    startBtn.disabled = true;
    startBtn.textContent = 'INITIALIZING...';

    try {
      await options.onInitialize();
      options.onReady();
      overlay.style.opacity = '0';
      window.setTimeout(() => {
        overlay.remove();
      }, 420);
    } catch (error) {
      initRequested = false;
      startBtn.disabled = false;
      startBtn.textContent = options.hasApiKey() ? 'INITIALIZE SYSTEM' : 'SET API KEY';
      console.error('[Boot] Failed to initialize system:', error);
    }
  };

  startBtn.addEventListener('click', (e) => {
    e.preventDefault();
    void runInitialization();
  });
  startBtn.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    e.preventDefault();
    void runInitialization();
  });

  if (!options.hasApiKey()) {
    options.openApiSettingsModal(true);
  }
};
