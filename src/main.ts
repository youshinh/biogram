import '../index.css';

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

void import('./app')
  .then(() => {
    preboot.style.opacity = '0';
    window.setTimeout(() => preboot.remove(), 220);
  })
  .catch((err) => {
    console.error('[Boot] Failed to load app module:', err);
  });
