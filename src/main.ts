import '../index.css';

// Suppress the noisy Lit dev-mode warning in local dev logs.
// This does not change runtime behavior.
const litWarnings = ((globalThis as any).litIssuedWarnings ??= new Set<string>());
litWarnings.add('dev-mode');

const preboot = document.createElement('div');
preboot.className = 'boot-overlay';

const stage = document.createElement('div');
stage.className = 'boot-stage';

const logo = document.createElement('div');
logo.className = 'boot-logo visible';
logo.textContent = 'Bio:gram';



stage.appendChild(logo);

preboot.appendChild(stage);
document.body.appendChild(preboot);

const params = new URLSearchParams(window.location.search);
const appModulePromise = params.get('mode') === 'viz'
  ? import('./viz-app')
  : import('./app');

void appModulePromise
  .then(() => {
    preboot.style.opacity = '0';
    window.setTimeout(() => preboot.remove(), 220);
  })
  .catch((err) => {
    console.error('[Boot] Failed to load app module:', err);
  });
