import './ui/visuals/ThreeViz';
import type { ThreeViz } from './ui/visuals/ThreeViz';

document.title = 'Bio:gram [PROJECTION]';
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#000';

const viz = document.createElement('three-viz') as ThreeViz;
viz.mode = 'SLAVE';
viz.style.width = '100vw';
viz.style.height = '100vh';
viz.style.display = 'block';

document.body.appendChild(viz);
