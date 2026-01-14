import { css } from 'lit';

export const sharedStyles = css`
  :host {
    --neon-cyan: #00ffff;
    --neon-red: #ff4400;
    --panel-bg: #111;
    --channel-bg: #000;
    --text-gray: #888;
    --border-color: #333;
    
    font-family: 'Verdana', sans-serif;
  }
  
  /* Utilities */
  .b-all { border: 1px solid var(--border-color); }
  .text-xs { font-size: 0.7rem; }
  .flex { display: flex; }
  .flex-col { flex-direction: column; }
  .bg-black { background: #000; }
  .text-white { color: #fff; }
`;
