type MIDIPortType = "input" | "output";
type MIDIPortDeviceState = "disconnected" | "connected";
type MIDIPortConnectionState = "open" | "closed" | "pending";

interface MIDIPort {
    id: string;
    manufacturer?: string;
    name?: string;
    type: MIDIPortType;
    version?: string;
    state: MIDIPortDeviceState;
    connection: MIDIPortConnectionState;
    onstatechange: ((e: MIDIConnectionEvent) => void) | null;
    open(): Promise<MIDIPort>;
    close(): Promise<MIDIPort>;
}

interface MIDIInput extends MIDIPort {
    onmidimessage: ((e: MIDIMessageEvent) => void) | null;
}

interface MIDIOutput extends MIDIPort {
    send(data: number[] | Uint8Array, timestamp?: number): void;
    clear(): void;
}

interface MIDIMessageEvent extends Event {
    data: Uint8Array;
}

interface MIDIConnectionEvent extends Event {
    port: MIDIPort;
}

interface MIDIAccess extends EventTarget {
    inputs: MIDIInputMap;
    outputs: MIDIOutputMap;
    onstatechange: ((e: MIDIConnectionEvent) => void) | null;
    sysexEnabled: boolean;
}

type MIDIInputMap = Map<string, MIDIInput>;
type MIDIOutputMap = Map<string, MIDIOutput>;

interface Navigator {
    requestMIDIAccess(options?: { sysex: boolean }): Promise<MIDIAccess>;
}

declare namespace WebMidi {
    export type MIDIAccess = MIDIAccess;
    export type MIDIInput = MIDIInput;
    export type MIDIOutput = MIDIOutput;
    export type MIDIMessageEvent = MIDIMessageEvent;
    export type MIDIConnectionEvent = MIDIConnectionEvent;
}
