import type { AudioEngine } from '../audio/engine';
import type { ThreeViz } from '../ui/visuals/ThreeViz';
import type { ParameterId } from './parameter-registry';
import { clamp01 } from './parameter-registry';

type ApplySource = 'midi' | 'ui' | 'automation';

type ControlRouterOptions = {
  getEngine: () => AudioEngine | null | undefined;
  getThreeViz: () => ThreeViz | null | undefined;
};

export class ControlRouter {
  private readonly getEngine: ControlRouterOptions['getEngine'];
  private readonly getThreeViz: ControlRouterOptions['getThreeViz'];

  constructor(options: ControlRouterOptions) {
    this.getEngine = options.getEngine;
    this.getThreeViz = options.getThreeViz;
  }

  applyParameter(id: ParameterId, value: number | string | boolean, source: ApplySource = 'midi'): void {
    const engine = this.getEngine();
    const viz = this.getThreeViz();

    switch (id) {
      case 'CROSSFADER': {
        const v = clamp01(Number(value));
        engine?.setCrossfader(v);
        this.dispatchMixerUpdate('crossfader', v);
        this.dispatchMixerChange('CROSSFADER', v);
        return;
      }
      case 'TRIM_A': {
        const v = Number(value);
        engine?.updateDspParam('TRIM_A', v);
        this.dispatchMixerUpdate('volumeA', clamp01(v / 2));
        return;
      }
      case 'TRIM_B': {
        const v = Number(value);
        engine?.updateDspParam('TRIM_B', v);
        this.dispatchMixerUpdate('volumeB', clamp01(v / 2));
        return;
      }
      case 'EQ_A_LOW': {
        const v = Number(value);
        engine?.setEq('A', 'LOW', v);
        this.dispatchMixerUpdate('lowA', clamp01(v / 1.5));
        return;
      }
      case 'EQ_A_MID': {
        const v = Number(value);
        engine?.setEq('A', 'MID', v);
        this.dispatchMixerUpdate('midA', clamp01(v / 1.5));
        return;
      }
      case 'EQ_A_HI': {
        const v = Number(value);
        engine?.setEq('A', 'HI', v);
        this.dispatchMixerUpdate('highA', clamp01(v / 1.5));
        return;
      }
      case 'EQ_B_LOW': {
        const v = Number(value);
        engine?.setEq('B', 'LOW', v);
        this.dispatchMixerUpdate('lowB', clamp01(v / 1.5));
        return;
      }
      case 'EQ_B_MID': {
        const v = Number(value);
        engine?.setEq('B', 'MID', v);
        this.dispatchMixerUpdate('midB', clamp01(v / 1.5));
        return;
      }
      case 'EQ_B_HI': {
        const v = Number(value);
        engine?.setEq('B', 'HI', v);
        this.dispatchMixerUpdate('highB', clamp01(v / 1.5));
        return;
      }
      case 'FILTER_ACTIVE':
      case 'TAPE_ACTIVE':
      case 'REVERB_ACTIVE':
      case 'CLOUD_ACTIVE':
      case 'DECIMATOR_ACTIVE':
      case 'SPECTRAL_GATE_ACTIVE': {
        const v = Number(value) > 0.5 ? 1 : 0;
        engine?.updateDspParam(id, v);
        this.dispatchMixerUpdate(id, v);
        this.dispatchParamChange(id, v);
        if (viz) viz.sendMessage(id, v);
        return;
      }
      case 'HPF':
      case 'LPF':
      case 'FILTER_Q':
      case 'FILTER_DRIVE':
      case 'DUB':
      case 'BLOOM_WET':
      case 'CLOUD_MIX':
      case 'CLOUD_DENSITY':
      case 'BITS':
      case 'GATE_THRESH':
      case 'GATE_RELEASE': {
        const v = Number(value);
        engine?.updateDspParam(id, v);
        this.dispatchMixerUpdate(id, v);
        this.dispatchParamChange(id, v);
        if (viz) viz.sendMessage(id, v);
        return;
      }

      case 'VISUAL_INTENSITY':
      case 'VISUAL_BLEND':
      case 'VISUAL_OVERLAY_ALPHA': {
        const v = clamp01(Number(value));
        viz?.sendMessage(id, v);
        return;
      }
      case 'VISUAL_MODE': {
        if (typeof value === 'string') viz?.setMode(value as any);
        return;
      }
      case 'VISUAL_TRANSITION_TYPE': {
        if (typeof value === 'string') {
          viz?.setTransitionType(value);
          viz?.sendMessage('VISUAL_TRANSITION_TYPE', value);
        }
        return;
      }
      case 'VISUAL_FADE_DURATION': {
        const sec = Math.max(0.3, Math.min(3.0, Number(value)));
        viz?.setFadeTransitionDurationSec(sec);
        return;
      }

      case 'DECK_A_TOGGLE_PLAY':
        this.dispatchDeckAction('A', 'toggle-play');
        return;
      case 'DECK_B_TOGGLE_PLAY':
        this.dispatchDeckAction('B', 'toggle-play');
        return;
      case 'DECK_A_TOGGLE_SYNC':
        this.dispatchDeckAction('A', 'toggle-sync');
        return;
      case 'DECK_B_TOGGLE_SYNC':
        this.dispatchDeckAction('B', 'toggle-sync');
        return;
      case 'DECK_A_LOAD_RANDOM':
        this.dispatchDeckAction('A', 'load-random');
        return;
      case 'DECK_B_LOAD_RANDOM':
        this.dispatchDeckAction('B', 'load-random');
        return;

      case 'VISUAL_MODE_ORGANIC':
        viz?.setMode('organic');
        return;
      case 'VISUAL_MODE_WIREFRAME':
        viz?.setMode('wireframe');
        return;
      case 'VISUAL_MODE_GNOSIS':
        viz?.setMode('gnosis');
        return;
      case 'VISUAL_TRANSITION_CROSSFADE':
        viz?.setTransitionType('crossfade');
        return;
      case 'VISUAL_TRANSITION_SWEEP':
        viz?.setTransitionType('sweep_line_smear');
        return;
      default:
        if (import.meta.env.DEV) {
          console.warn(`[ControlRouter] Unhandled parameter id: ${id} (source=${source})`);
        }
    }
  }

  private dispatchDeckAction(deck: 'A' | 'B', action: string): void {
    window.dispatchEvent(new CustomEvent('deck-action', { detail: { deck, action } }));
  }

  private dispatchMixerUpdate(parameter: string, value: number): void {
    window.dispatchEvent(new CustomEvent('mixer-update', { detail: { parameter, value } }));
  }

  private dispatchMixerChange(id: string, val: number): void {
    window.dispatchEvent(new CustomEvent('mixer-change', { detail: { id, val } }));
  }

  private dispatchParamChange(id: string, val: number): void {
    window.dispatchEvent(new CustomEvent('param-change', { detail: { id, val } }));
  }
}
