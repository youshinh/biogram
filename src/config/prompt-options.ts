export const ROOT_OPTIONS = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
] as const;

export const SCALE_OPTIONS = [
  { label: 'MAJOR', prompt: 'Major scale, uplifting, happy' },
  { label: 'MINOR', prompt: 'Minor scale, emotional, sad' },
  { label: 'DORIAN', prompt: 'Dorian mode, jazzy, soulful' },
  { label: 'PHRYGIAN', prompt: 'Phrygian mode, spanish, exotic tension' },
  { label: 'LYDIAN', prompt: 'Lydian mode, dreamy, floating' },
  { label: 'WHOLE TONE', prompt: 'Whole tone scale, dreamy, mysterious, floating' },
  { label: 'RYUKYU', prompt: 'Ryukyu pentatonic scale, Okinawan, peaceful, island breeze' },
  { label: '12-TONE', prompt: '12-tone serialism, atonal, avant-garde, chaotic' },
  { label: 'DISSONANT', prompt: 'Dissonant harmony, tension, anxiety, clash' },
  { label: 'NOISE', prompt: 'Noise music, texture, glitch, harsh' },
  { label: 'ATONAL', prompt: 'Atonal, no key, chaotic, avant-garde' }
] as const;
