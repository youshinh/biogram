import '../index.css';

const preboot = document.createElement('div');
preboot.className = 'boot-overlay';

const stage = document.createElement('div');
stage.className = 'boot-stage';

const logo = document.createElement('div');
logo.className = 'boot-logo visible';
logo.textContent = 'Bio:gram';

const loading = document.createElement('div');
loading.textContent = 'loading core...';
Object.assign(loading.style, {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '10px',
  letterSpacing: '0.14em',
  color: '#52525b',
  textTransform: 'uppercase'
});

stage.appendChild(logo);
stage.appendChild(loading);
preboot.appendChild(stage);
document.body.appendChild(preboot);

void import('./app')
  .then(() => {
    preboot.style.opacity = '0';
    window.setTimeout(() => preboot.remove(), 220);
  })
  .catch((err) => {
    console.error('[Boot] Failed to load app module:', err);
    loading.textContent = 'failed to load';
    loading.style.color = '#ef4444';
  });
