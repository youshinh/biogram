export type VisualMode =
  | 'organic'
  | 'wireframe'
  | 'monochrome'
  | 'rings'
  | 'waves'
  | 'suibokuga'
  | 'grid'
  | 'ai_grid';

export type ZenVisualMode = Exclude<VisualMode, 'ai_grid'>;

export const VISUAL_MODES: readonly VisualMode[] = [
  'organic',
  'wireframe',
  'monochrome',
  'rings',
  'waves',
  'suibokuga',
  'grid',
  'ai_grid'
] as const;

export const ZEN_VISUAL_MODES: readonly ZenVisualMode[] = [
  'organic',
  'wireframe',
  'monochrome',
  'rings',
  'suibokuga',
  'waves',
  'grid'
] as const;

