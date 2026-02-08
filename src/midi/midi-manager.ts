export class MidiManager {
    private midi: WebMidi.MIDIAccess | null = null;
    private inputs: Map<string, WebMidi.MIDIInput> = new Map();

    constructor() {
        this.init();
    }

    private async init() {
        if (!navigator.requestMIDIAccess) {
            console.warn('[MIDI] Web MIDI API not supported.');
            return;
        }

        try {
            this.midi = await navigator.requestMIDIAccess();
            console.log('[MIDI] Access granted');
            
            // Initial scan
            this.midi.inputs.forEach((input) => {
                this.addInput(input);
            });

            // Listen for connection changes
            this.midi.onstatechange = (e: WebMidi.MIDIConnectionEvent) => {
                const port = e.port;
                if (port.type === 'input') {
                    if (port.state === 'connected') {
                        this.addInput(port as WebMidi.MIDIInput);
                    } else if (port.state === 'disconnected') {
                        this.removeInput(port.id);
                    }
                }
            };

        } catch (err) {
            console.error('[MIDI] Access denied or failed', err);
        }
    }

    private addInput(input: WebMidi.MIDIInput) {
        if (this.inputs.has(input.id)) return;
        
        console.log(`[MIDI] Input connected: ${input.name} (${input.manufacturer})`);
        this.inputs.set(input.id, input);
        
        input.onmidimessage = (e) => this.handleMessage(e);
    }

    private removeInput(id: string) {
        if (this.inputs.has(id)) {
            console.log(`[MIDI] Input disconnected: ${id}`);
            this.inputs.delete(id);
        }
    }

    private handleMessage(e: WebMidi.MIDIMessageEvent) {
        const data = e.data;
        if (!data || data.length < 2) return;

        const status = data[0] & 0xF0;
        const channel = data[0] & 0x0F;
        const noteOrCC = data[1];
        const velocityOrValue = data[2] || 0;

        // Debug Log (Development)
        // console.log(`[MIDI Info] Status: ${status.toString(16)}, Note/CC: ${noteOrCC}, Val: ${velocityOrValue}`);

        // Default Mapping Logic
        // CC Mapping
        if (status === 0xB0) { // Control Change
            this.handleCC(noteOrCC, velocityOrValue);
        }
        // Note On Mapping
        else if (status === 0x90 && velocityOrValue > 0) { // Note On
            this.handleNoteOn(noteOrCC, velocityOrValue);
        }
    }

    private handleCC(cc: number, value: number) {
        const normValue = value / 127.0; // 0.0 - 1.0

        // Mixer Mappings
        if (cc === 1) { // Crossfader
            this.dispatchMixer('crossfader', normValue);
        } else if (cc === 2) { // Volume A
            this.dispatchMixer('volumeA', normValue);
        } else if (cc === 3) { // Volume B
            this.dispatchMixer('volumeB', normValue);
        }
        // EQ Mappings (Example: 4,5,6 -> Low, Mid, High A)
        else if (cc === 4) this.dispatchMixer('lowA', normValue);
        else if (cc === 5) this.dispatchMixer('midA', normValue);
        else if (cc === 6) this.dispatchMixer('highA', normValue);
        
        // EQ B
        else if (cc === 7) this.dispatchMixer('lowB', normValue);
        else if (cc === 8) this.dispatchMixer('midB', normValue);
        else if (cc === 9) this.dispatchMixer('highB', normValue);
    }

    private handleNoteOn(note: number, velocity: number) {
        // Deck A Actions
        if (note === 36 || note === 48) { // C1 or C2 -> Play A
            this.dispatchDeck('A', 'toggle-play');
        } else if (note === 37 || note === 49) { // C#1 -> Sync A
            this.dispatchDeck('A', 'toggle-sync');
        } else if (note === 38 || note === 50) { // D1 -> Cue/Load A (GEN)
            this.dispatchDeck('A', 'load-random');
        }

        // Deck B Actions
        else if (note === 40 || note === 52) { // E1 -> Play B
            this.dispatchDeck('B', 'toggle-play');
        } else if (note === 41 || note === 53) { // F1 -> Sync B
            this.dispatchDeck('B', 'toggle-sync');
        } else if (note === 42 || note === 54) { // F#1 -> Cue/Load B
            this.dispatchDeck('B', 'load-random');
        }
        
        // Grid Shift Example (Map to some keys if needed)
    }

    private dispatchMixer(param: string, value: number) {
        const event = new CustomEvent('mixer-update', {
            detail: { parameter: param, value: value }
        });
        window.dispatchEvent(event);
    }

    private dispatchDeck(deck: 'A' | 'B', action: string) {
        const event = new CustomEvent('deck-action', {
            detail: { deck: deck, action: action }
        });
        window.dispatchEvent(event);
    }
}
