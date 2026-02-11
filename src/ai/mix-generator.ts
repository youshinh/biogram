import type { AutomationScore } from '../types/ai-mix';
import type {
    IntegratedMixPlan,
    MixDirection,
    PromptContextInput,
    VisualPlanTrack
} from '../types/integrated-ai-mix';
import { validateIntegratedMixPlan } from './integrated-plan-validator';
import { ModelRouter, type PlannerModel } from './model-router';

const SYSTEM_PROMPT = `
You are a world-class Ambient Techno DJ and Audio Engineer.
Your task is to create an "Integrated Mix Plan (JSON)" for audio + visual auto-mix.

## Output Constraints
* Output MUST be raw JSON only.
* Root keys MUST be: meta, audio_plan, visual_plan, post_actions, prompt_context_ref.
* meta.version MUST be "3.0".
* session_mode: "single" | "free".

## Audio Safety Rules
* CROSSFADER range: 0.0(A) .. 1.0(B).
* A->B crossfader should progress 0 -> 1, B->A should progress 1 -> 0.
* EQ and volume MUST stay in 0.0 .. 1.0.
* EQ baseline MUST start at 0.67 for HI/MID/LOW on both decks (no jump to 1.0 at bar 0).
* Avoid aggressive EQ boosts; keep practical EQ range around 0.2 .. 0.82 unless explicitly required.
* TRIM / DRIVE / SLICER are forbidden.
* SLAM, FILTER_RES, and any global FILTER controls are forbidden in AI plans.
* Allowed automation scope: CROSSFADER + deck EQ + mild ECHO_SEND/REVERB_MIX only.
* A->B: STOP only DECK_A. B->A: STOP only DECK_B.

## Visual Rules
* Allowed transition types: fade_in, fade_out, crossfade, soft_overlay, sweep_line_smear.
* Forbidden styles: strong flash, aggressive glitch, rapid strobe.
* VISUAL_INTENSITY range: 0.0 .. 1.0 (default around 0.35).
* VISUAL_MODE must be one of: organic, wireframe, monochrome, rings, waves, halid, glaze, gnosis, suibokuga, grid, ai_grid.

## Prompt-aware Requirement
* You MUST reflect prompt_context_ref in both audio_plan and visual_plan decisions.
* If prompt includes ink/sumi/japan, prefer suibokuga in at least one phase.
* If prompt includes organic/ambient/deep, prefer organic or waves in at least one phase.
* If key_root/scale_prompt are provided, preserve harmonic continuity and avoid abrupt key clash.
* If arrangement_hint is provided, align transition contour (presence -> handoff -> wash out) with it.
`;

export class MixGenerator {
    private router: ModelRouter;

    constructor() {
        this.router = new ModelRouter();
    }

    async generateScore(
        userRequest: string,
        currentBpm: number,
        context: { isAStopped: boolean, isBStopped: boolean } = { isAStopped: false, isBStopped: false },
        promptContext?: PromptContextInput,
        preferredVisual: string = 'organic'
    ): Promise<AutomationScore | null> {
        const plan = await this.generateIntegratedPlan(
            userRequest,
            currentBpm,
            context,
            promptContext,
            preferredVisual
        );
        return plan.audio_plan;
    }

    async generateIntegratedPlan(
        userRequest: string,
        currentBpm: number,
        context: { isAStopped: boolean, isBStopped: boolean } = { isAStopped: false, isBStopped: false },
        promptContext?: PromptContextInput,
        preferredVisual: string = 'organic'
    ): Promise<IntegratedMixPlan> {
        const direction = this.extractDirection(userRequest);
        const totalBars = this.extractDurationBars(userRequest);
        const promptCtx = this.normalizePromptContext(promptContext, direction);
        const contextHash = this.computeContextHash(promptCtx);
        const templatePlan = JSON.parse(
            this.buildTemplatePlanJson(direction, currentBpm, totalBars, promptCtx, contextHash, preferredVisual)
        ) as IntegratedMixPlan;
        this.enforceAudioMotionPlan(templatePlan);
        this.enforceVisualTransitionPlan(templatePlan);
        this.attachPlannerMetadata(templatePlan, 'template');

        const promptText = `
User Input: "${userRequest}"
Current BPM: ${currentBpm}
Direction: ${direction}
Duration Bars: ${totalBars}
Preferred Visual: ${preferredVisual}
[CONTEXT]
Deck A Stopped: ${context.isAStopped}
Deck B Stopped: ${context.isBStopped}
Source Deck: ${promptCtx.sourceDeck}
Target Deck: ${promptCtx.targetDeck}
Source Prompt: ${promptCtx.sourcePrompt}
Target Prompt: ${promptCtx.targetPrompt}
Source Playing: ${promptCtx.sourcePlaying}
Target Playing: ${promptCtx.targetPlaying}
Context Hash: ${contextHash}
[MUSICAL_CONTEXT]
Key Root: ${promptCtx.keyRoot || 'N/A'}
Scale Label: ${promptCtx.scaleLabel || 'N/A'}
Scale Prompt: ${promptCtx.scalePrompt || 'N/A'}
Source Generated Prompt: ${promptCtx.sourceGeneratedPrompt || 'N/A'}
Target Generated Prompt: ${promptCtx.targetGeneratedPrompt || 'N/A'}
Arrangement Hint: ${promptCtx.arrangementHint || 'N/A'}
[INSTRUCTION]
- Build integrated JSON root with meta/audio_plan/visual_plan/post_actions/prompt_context_ref.
- Keep audio_plan compatible with existing AutomationScore.
- Include VISUAL_TRANSITION_TYPE and allow sweep_line_smear when suitable.
`;

        try {
            const routed = await this.router.generateMixPlanOnlyWithPro(
                {
                    systemPrompt: SYSTEM_PROMPT,
                    userPrompt: promptText,
                    timeoutMs: 60000
                },
                () => this.buildTemplatePlanJson(direction, currentBpm, totalBars, promptCtx, contextHash, preferredVisual)
            );
            console.log(`[MixGenerator] Model used: ${routed.modelUsed}`);
            let plannerUsed: PlannerModel = routed.modelUsed;
            let plan: IntegratedMixPlan;
            try {
                plan = this.parseIntegratedResponse(
                    routed.text,
                    direction,
                    currentBpm,
                    totalBars,
                    promptCtx,
                    contextHash,
                    preferredVisual
                );
            } catch (parseError) {
                console.warn('[MixGenerator] Parse failed. Retrying with gemini-3-flash-preview.', parseError);
                console.warn('[MixGenerator][Debug] Pro raw text preview:', routed.text.slice(0, 6000));
                const flashRetry = await this.router.generateMixPlanWithFlashPreview(
                    {
                        systemPrompt: SYSTEM_PROMPT,
                        userPrompt: promptText,
                        timeoutMs: 60000
                    },
                    () => this.buildTemplatePlanJson(direction, currentBpm, totalBars, promptCtx, contextHash, preferredVisual)
                );
                try {
                    plan = this.parseIntegratedResponse(
                        flashRetry.text,
                        direction,
                        currentBpm,
                        totalBars,
                        promptCtx,
                        contextHash,
                        preferredVisual
                    );
                    this.attachPlannerMetadata(plan, flashRetry.modelUsed);
                    plannerUsed = flashRetry.modelUsed;
                } catch (retryParseError) {
                    console.warn('[MixGenerator][Debug] Flash preview raw text:', flashRetry.text.slice(0, 6000));
                    this.markFallbackReason(
                        templatePlan,
                        `response parse failed: ${parseError instanceof Error ? parseError.message : String(parseError)} / flash-preview retry parse failed: ${retryParseError instanceof Error ? retryParseError.message : String(retryParseError)}`
                    );
                    return templatePlan;
                }
            }
            this.enforceAudioMotionPlan(plan);
            this.enforceVisualTransitionPlan(plan);
            const errors = validateIntegratedMixPlan(plan);
            if (errors.length > 0) {
                console.warn('[MixGenerator] Integrated plan validation failed, applying safe template', errors);
                this.markFallbackReason(templatePlan, `plan validation failed: ${errors.join('; ')}`);
                return templatePlan;
            }
            this.attachPlannerMetadata(plan, plannerUsed);
            if (plannerUsed === 'template') {
                this.markFallbackReason(
                    plan,
                    routed.fallbackReason || 'planner returned template fallback'
                );
            }
            return plan;

        } catch (e: any) {
            console.error(`[MixGenerator] Generation failed. Using safe template.`, e);
            this.markFallbackReason(
                templatePlan,
                `mix generation exception: ${e instanceof Error ? e.message : String(e)}`
            );
            return templatePlan;
        }
    }

    private parseIntegratedResponse(
        text: string,
        direction: MixDirection,
        bpm: number,
        totalBars: number,
        promptCtx: PromptContextInput,
        contextHash: string,
        preferredVisual: string
    ): IntegratedMixPlan {
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const raw = JSON.parse(cleaned) as any;
        const candidate = this.extractPlanCandidate(raw);
        let normalized: IntegratedMixPlan;
        try {
            normalized = this.normalizeToIntegratedPlan(
                candidate,
                direction,
                bpm,
                totalBars,
                promptCtx,
                contextHash,
                preferredVisual
            );
        } catch (e) {
            console.warn('[MixGenerator][Debug] Parsed root shape:', this.summarizeObjectShape(raw));
            console.warn('[MixGenerator][Debug] Extracted candidate shape:', this.summarizeObjectShape(candidate));
            throw e;
        }
        if (!normalized?.audio_plan?.tracks || !normalized?.visual_plan?.tracks) {
            throw new Error('Invalid Integrated Schema');
        }
        return normalized;
    }

    private normalizeToIntegratedPlan(
        raw: any,
        direction: MixDirection,
        bpm: number,
        totalBars: number,
        promptCtx: PromptContextInput,
        contextHash: string,
        preferredVisual: string
    ): IntegratedMixPlan {
        const template = JSON.parse(
            this.buildTemplatePlanJson(direction, bpm, totalBars, promptCtx, contextHash, preferredVisual)
        ) as IntegratedMixPlan;

        // Strict shape
        if (raw?.audio_plan?.tracks && raw?.visual_plan?.tracks) {
            return raw as IntegratedMixPlan;
        }

        // Alternate but valid-ish shape (audio + visual containers)
        if (raw?.audio?.tracks && raw?.visual?.tracks) {
            return this.normalizeToIntegratedPlan({
                meta: raw?.meta ?? {},
                audioPlan: raw.audio,
                visualPlan: raw.visual,
                postActions: raw?.postActions ?? raw?.post_actions,
                promptContextRef: raw?.promptContextRef ?? raw?.prompt_context_ref
            }, direction, bpm, totalBars, promptCtx, contextHash, preferredVisual);
        }

        // If only audio plan exists, merge into template visual/post sections.
        if (raw?.audio_plan?.tracks && !raw?.visual_plan?.tracks) {
            template.audio_plan = raw.audio_plan as AutomationScore;
            if (raw?.meta?.target_bpm) template.meta.target_bpm = Number(raw.meta.target_bpm);
            if (raw?.meta?.total_bars) template.meta.total_bars = Number(raw.meta.total_bars);
            return template;
        }

        // Common alias shape (camelCase from model output)
        if (raw?.audioPlan?.tracks && raw?.visualPlan?.tracks) {
            const mapped: IntegratedMixPlan = {
                meta: {
                    version: '3.0',
                    session_mode: raw?.meta?.session_mode ?? raw?.meta?.sessionMode ?? 'single',
                    direction: raw?.meta?.direction ?? direction,
                    target_bpm: Number(raw?.meta?.target_bpm ?? raw?.meta?.targetBpm ?? bpm),
                    total_bars: Number(raw?.meta?.total_bars ?? raw?.meta?.totalBars ?? totalBars),
                    pattern: raw?.meta?.pattern,
                    max_runtime_min: raw?.meta?.max_runtime_min ?? raw?.meta?.maxRuntimeMin,
                    description: raw?.meta?.description,
                    plan_model: raw?.meta?.plan_model ?? raw?.meta?.planModel
                } as any,
                audio_plan: raw.audioPlan,
                visual_plan: raw.visualPlan,
                post_actions: raw.post_actions ?? raw.postActions ?? {
                    regen_stopped_deck: true,
                    next_trigger_sec: 0,
                    safety_reset: {
                        crossfader_to_target: true,
                        reset_eq_to_default: true,
                        disable_fx_tail: true
                    }
                },
                prompt_context_ref: raw.prompt_context_ref ?? raw.promptContextRef ?? {
                    source_deck: promptCtx.sourceDeck,
                    target_deck: promptCtx.targetDeck,
                    source_prompt: promptCtx.sourcePrompt,
                    target_prompt: promptCtx.targetPrompt,
                    source_is_playing: promptCtx.sourcePlaying,
                    target_is_playing: promptCtx.targetPlaying,
                    context_hash: contextHash,
                    key_root: promptCtx.keyRoot || undefined,
                    scale_label: promptCtx.scaleLabel || undefined,
                    scale_prompt: promptCtx.scalePrompt || undefined,
                    source_generated_prompt: promptCtx.sourceGeneratedPrompt || undefined,
                    target_generated_prompt: promptCtx.targetGeneratedPrompt || undefined,
                    arrangement_hint: promptCtx.arrangementHint || undefined
                }
            };
            return mapped;
        }

        // Backward compatibility: old AutomationScore root (meta/tracks/post_mix_reset)
        if (raw?.tracks && raw?.post_mix_reset) {
            template.audio_plan = raw as AutomationScore;
            if (raw?.meta?.target_bpm) template.meta.target_bpm = raw.meta.target_bpm;
            if (raw?.meta?.total_bars) template.meta.total_bars = raw.meta.total_bars;
            return template;
        }

        // Very old/partial shape: tracks only
        if (raw?.tracks && !raw?.post_mix_reset) {
            template.audio_plan = {
                ...template.audio_plan,
                tracks: raw.tracks
            } as AutomationScore;
            if (raw?.meta?.target_bpm) template.meta.target_bpm = Number(raw.meta.target_bpm);
            if (raw?.meta?.total_bars) template.meta.total_bars = Number(raw.meta.total_bars);
            return template;
        }

        // Flexible salvage path: rebuild from partial aliases and section-based visual plans.
        const audioSource =
            raw?.audio_plan ??
            raw?.audioPlan ??
            raw?.audio ??
            raw?.mix_plan ??
            raw?.mixPlan;
        const visualSource =
            raw?.visual_plan ??
            raw?.visualPlan ??
            raw?.visual ??
            raw?.visuals ??
            raw?.vj_plan ??
            raw?.vjPlan;

        const normalizedAudioTracks = this.normalizeAudioTracksFromAny(
            audioSource ?? raw,
            direction,
            totalBars
        );
        const normalizedVisual = this.normalizeVisualTracksFromAny(visualSource, totalBars, preferredVisual);

        if (normalizedAudioTracks.length > 0 || normalizedVisual.length > 0) {
            if (normalizedAudioTracks.length > 0) {
                const postMixReset =
                    audioSource?.post_mix_reset ??
                    audioSource?.postMixReset ??
                    template.audio_plan.post_mix_reset;
                template.audio_plan = {
                    ...template.audio_plan,
                    meta: {
                        ...template.audio_plan.meta,
                        ...(audioSource?.meta ?? raw?.meta ?? {})
                    },
                    tracks: normalizedAudioTracks as any,
                    post_mix_reset: postMixReset
                } as AutomationScore;
            }
            if (normalizedVisual.length > 0) {
                template.visual_plan = { tracks: normalizedVisual };
            }
            const mergedMeta = raw?.meta ?? {};
            if (mergedMeta?.target_bpm) template.meta.target_bpm = Number(mergedMeta.target_bpm);
            if (mergedMeta?.targetBpm) template.meta.target_bpm = Number(mergedMeta.targetBpm);
            if (mergedMeta?.total_bars) template.meta.total_bars = Number(mergedMeta.total_bars);
            if (mergedMeta?.totalBars) template.meta.total_bars = Number(mergedMeta.totalBars);
            if (mergedMeta?.direction === 'A->B' || mergedMeta?.direction === 'B->A') {
                template.meta.direction = mergedMeta.direction;
            }
            if (mergedMeta?.session_mode === 'single' || mergedMeta?.session_mode === 'free') {
                template.meta.session_mode = mergedMeta.session_mode;
            }
            if (mergedMeta?.sessionMode === 'single' || mergedMeta?.sessionMode === 'free') {
                template.meta.session_mode = mergedMeta.sessionMode;
            }
            return template;
        }

        throw new Error('Unrecognized plan shape');
    }

    private extractPlanCandidate(raw: any): any {
        if (!raw) return raw;
        if (Array.isArray(raw)) {
            const firstObj = raw.find((v) => v && typeof v === 'object');
            return firstObj ?? raw[0] ?? raw;
        }
        if (typeof raw !== 'object') return raw;

        // Common wrappers from model answers
        const directCandidates = [
            raw.plan,
            raw.integrated_plan,
            raw.integratedMixPlan,
            raw.result,
            raw.output,
            raw.data
        ];
        for (const c of directCandidates) {
            if (c && typeof c === 'object') return c;
        }

        // JSON string wrapped in a field
        const stringCandidates = [raw.json, raw.plan_json, raw.output_json];
        for (const s of stringCandidates) {
            if (typeof s === 'string') {
                try {
                    return JSON.parse(s);
                } catch {
                    // ignore parse error and continue
                }
            }
        }

        // Shallow recursive search for likely plan object.
        const visited = new Set<any>();
        const queue: Array<{ node: any; depth: number }> = [{ node: raw, depth: 0 }];
        while (queue.length > 0) {
            const { node, depth } = queue.shift()!;
            if (!node || typeof node !== 'object' || visited.has(node)) continue;
            visited.add(node);
            if (this.looksLikePlanShape(node)) return node;
            if (depth >= 3) continue;
            for (const v of Object.values(node)) {
                if (v && typeof v === 'object') queue.push({ node: v, depth: depth + 1 });
            }
        }

        return raw;
    }

    private looksLikePlanShape(node: any): boolean {
        if (!node || typeof node !== 'object') return false;
        if (node?.audio_plan?.tracks || node?.audioPlan?.tracks) return true;
        if (Array.isArray(node?.audio_plan) || Array.isArray(node?.audioPlan)) return true;
        if (node?.audio_plan?.events || node?.audioPlan?.events) return true;
        if (node?.audio?.tracks && node?.visual?.tracks) return true;
        if (node?.audio?.automation_tracks || node?.audio_plan?.automation_tracks) return true;
        if (node?.visual_plan?.sections || node?.visual?.sections) return true;
        if (Array.isArray(node?.visual_plan) || Array.isArray(node?.visualPlan)) return true;
        if (node?.visual_plan?.transitions || node?.visual?.transitions) return true;
        if (node?.tracks && (node?.post_mix_reset || node?.meta)) return true;
        if (node?.visual_plan?.tracks && (node?.post_actions || node?.prompt_context_ref)) return true;
        return false;
    }

    private normalizeAudioTracksFromAny(
        audioSource: any,
        direction: MixDirection,
        totalBars: number
    ): Array<{ target_id: string; points: Array<{ time: number; value: number | boolean; curve: string }> }> {
        if (!audioSource || typeof audioSource !== 'object') return [];

        if (Array.isArray(audioSource?.tracks) && audioSource.tracks.length > 0) {
            return audioSource.tracks;
        }
        if (Array.isArray(audioSource?.automation_tracks) && audioSource.automation_tracks.length > 0) {
            return audioSource.automation_tracks;
        }

        const tracks = new Map<string, Array<{ time: number; value: number | boolean; curve: string }>>();
        const pushPoint = (target: string, time: number, value: number | boolean, curve: string) => {
            const canonical = this.canonicalizeAudioTarget(target);
            if (!canonical) return;
            if (!tracks.has(canonical)) tracks.set(canonical, []);
            tracks.get(canonical)!.push({
                time: Math.max(0, Math.min(totalBars, Number(time))),
                value,
                curve: this.normalizeCurve(curve)
            });
        };

        // Shape A: audio_plan.events[]
        const events = Array.isArray(audioSource?.events) ? audioSource.events : [];
        for (const event of events) {
            if (!event || typeof event !== 'object') continue;
            if (event.type === 'automation') {
                const bar = Number(event.bar ?? event.time ?? 0);
                const duration = Math.max(0, Number(event.duration ?? 0));
                const startVal = event.start_val ?? event.start ?? event.from ?? event.value;
                const endVal = event.end_val ?? event.end ?? event.to ?? event.value;
                const curve = String(event.curve ?? 'LINEAR');
                if (typeof startVal === 'number' || typeof startVal === 'boolean') {
                    pushPoint(String(event.target ?? ''), bar, startVal, 'HOLD');
                }
                if (typeof endVal === 'number' || typeof endVal === 'boolean') {
                    pushPoint(String(event.target ?? ''), bar + duration, endVal, curve);
                }
            } else if (event.action === 'stop_deck') {
                const deck = String(event.target ?? '').toUpperCase() === 'B' ? 'B' : 'A';
                pushPoint(`DECK_${deck}_STOP`, Number(event.bar ?? 0), true, 'STEP');
            } else if (event.action === 'play_deck') {
                const deck = String(event.target ?? '').toUpperCase() === 'B' ? 'B' : 'A';
                pushPoint(`DECK_${deck}_PLAY`, Number(event.bar ?? 0), true, 'STEP');
            }
        }
        if (tracks.size > 0) {
            return this.finalizeTrackMap(tracks);
        }

        // Shape B: audio_plan[] snapshots
        const snapshots = Array.isArray(audioSource) ? audioSource : [];
        for (const snap of snapshots) {
            if (!snap || typeof snap !== 'object') continue;
            const bar = Number(snap.bar ?? snap.time ?? 0);
            if (typeof snap.crossfader === 'number') {
                pushPoint('CROSSFADER', bar, snap.crossfader, 'LINEAR');
            }
            const mapDeck = (deck: 'A' | 'B', block: any) => {
                if (!block || typeof block !== 'object') return;
                if (typeof block.eq_hi === 'number') pushPoint(`DECK_${deck}_EQ_HI`, bar, block.eq_hi, 'LINEAR');
                if (typeof block.eq_mid === 'number') pushPoint(`DECK_${deck}_EQ_MID`, bar, block.eq_mid, 'LINEAR');
                if (typeof block.eq_low === 'number') pushPoint(`DECK_${deck}_EQ_LOW`, bar, block.eq_low, 'LINEAR');
                if (typeof block.echo_send === 'number') pushPoint(`DECK_${deck}_ECHO_SEND`, bar, block.echo_send, 'LINEAR');
                if (typeof block.reverb_mix === 'number') pushPoint(`DECK_${deck}_REVERB_MIX`, bar, block.reverb_mix, 'LINEAR');
                if (block.play === false) pushPoint(`DECK_${deck}_STOP`, bar, true, 'STEP');
                if (block.play === true) pushPoint(`DECK_${deck}_PLAY`, bar, true, 'STEP');
            };
            mapDeck('A', snap.deck_a ?? snap.a);
            mapDeck('B', snap.deck_b ?? snap.b);
        }
        if (tracks.size > 0) {
            return this.finalizeTrackMap(tracks);
        }

        // Fallback: if source contains direct array of automation keyframes-like items
        if (Array.isArray(audioSource)) {
            for (const item of audioSource) {
                if (!item || typeof item !== 'object') continue;
                const target = this.canonicalizeAudioTarget(String(item.target ?? item.target_id ?? ''));
                if (!target) continue;
                if (Array.isArray(item.points)) {
                    for (const p of item.points) {
                        if (typeof p?.value === 'number' || typeof p?.value === 'boolean') {
                            pushPoint(target, Number(p.time ?? 0), p.value, String(p.curve ?? 'LINEAR'));
                        }
                    }
                }
            }
            if (tracks.size > 0) return this.finalizeTrackMap(tracks);
        }

        // Keep deterministic crossfader seed if model gave nothing usable.
        const crossEnd = direction === 'A->B' ? 1 : 0;
        return [{
            target_id: 'CROSSFADER',
            points: [
                { time: 0, value: direction === 'A->B' ? 0 : 1, curve: 'HOLD' },
                { time: totalBars, value: crossEnd, curve: 'SIGMOID' }
            ]
        }];
    }

    private finalizeTrackMap(
        map: Map<string, Array<{ time: number; value: number | boolean; curve: string }>>
    ): Array<{ target_id: string; points: Array<{ time: number; value: number | boolean; curve: string }> }> {
        const tracks: Array<{ target_id: string; points: Array<{ time: number; value: number | boolean; curve: string }> }> = [];
        for (const [target, points] of map.entries()) {
            const sorted = points
                .filter((p) => Number.isFinite(p.time))
                .sort((a, b) => a.time - b.time);
            const deduped: Array<{ time: number; value: number | boolean; curve: string }> = [];
            for (const p of sorted) {
                const last = deduped[deduped.length - 1];
                if (
                    last &&
                    Math.abs(last.time - p.time) < 0.0001 &&
                    last.value === p.value
                ) {
                    continue;
                }
                deduped.push(p);
            }
            if (deduped.length > 0) {
                tracks.push({ target_id: target, points: deduped });
            }
        }
        return tracks;
    }

    private canonicalizeAudioTarget(targetRaw: string): string | null {
        if (!targetRaw) return null;
        const t = targetRaw.trim().toUpperCase().replace(/-/g, '_');
        if (t === 'CROSSFADER') return 'CROSSFADER';
        if (/^DECK_[AB]_EQ_(HI|MID|LOW)$/.test(t)) return t;
        if (/^EQ_(HI|MID|LOW)_[AB]$/.test(t)) {
            const [, band, deck] = t.match(/^EQ_(HI|MID|LOW)_([AB])$/) as RegExpMatchArray;
            return `DECK_${deck}_EQ_${band}`;
        }
        if (/^DECK_[AB]_ECHO_SEND$/.test(t)) return t;
        if (/^ECHO_SEND_[AB]$/.test(t)) {
            const deck = t.endsWith('_B') ? 'B' : 'A';
            return `DECK_${deck}_ECHO_SEND`;
        }
        if (/^DECK_[AB]_REVERB_MIX$/.test(t)) return t;
        if (/^REVERB_MIX_[AB]$/.test(t)) {
            const deck = t.endsWith('_B') ? 'B' : 'A';
            return `DECK_${deck}_REVERB_MIX`;
        }
        if (/^DECK_[AB]_(PLAY|STOP)$/.test(t)) return t;
        return null;
    }

    private normalizeCurve(curveRaw: string): 'STEP' | 'LINEAR' | 'EXP' | 'LOG' | 'SIGMOID' | 'HOLD' {
        const c = String(curveRaw || '').trim().toUpperCase();
        if (c === 'STEP') return 'STEP';
        if (c === 'LINEAR') return 'LINEAR';
        if (c === 'EXP' || c === 'EXPONENTIAL') return 'EXP';
        if (c === 'LOG') return 'LOG';
        if (c === 'SIGMOID' || c === 'EASE_IN' || c === 'EASE_OUT' || c === 'EASE_IN_OUT') return 'SIGMOID';
        if (c === 'HOLD' || c === 'FLAT') return 'HOLD';
        return 'LINEAR';
    }

    private normalizeVisualTracksFromAny(
        visualSource: any,
        totalBars: number,
        preferredVisual: string
    ): VisualPlanTrack[] {
        if (!visualSource || typeof visualSource !== 'object') return [];

        if (Array.isArray(visualSource)) {
            const modePoints: any[] = [];
            const transitionPoints: any[] = [];
            const intensityPoints: any[] = [];
            for (const row of visualSource) {
                if (!row || typeof row !== 'object') continue;
                const t = Math.max(0, Math.min(totalBars, Number(row.bar ?? row.time ?? 0)));
                if (row.visual_mode || row.mode) {
                    modePoints.push({ time: t, value: safeMode(row.visual_mode ?? row.mode), curve: 'STEP' });
                }
                if (row.transition_type || row.transition) {
                    transitionPoints.push({
                        time: t,
                        value: safeTransition(row.transition_type ?? row.transition),
                        curve: 'STEP'
                    });
                }
                if (row.visual_intensity !== undefined || row.intensity !== undefined) {
                    intensityPoints.push({
                        time: t,
                        value: safeIntensity(row.visual_intensity ?? row.intensity),
                        curve: 'HOLD'
                    });
                }
            }
            const tracks: VisualPlanTrack[] = [];
            if (modePoints.length) tracks.push({ target_id: 'VISUAL_MODE', points: modePoints.sort((a, b) => a.time - b.time) });
            if (transitionPoints.length) tracks.push({ target_id: 'VISUAL_TRANSITION_TYPE', points: transitionPoints.sort((a, b) => a.time - b.time) });
            if (intensityPoints.length) {
                intensityPoints.sort((a, b) => a.time - b.time);
                intensityPoints.push({
                    time: totalBars,
                    value: intensityPoints[intensityPoints.length - 1].value,
                    curve: 'LINEAR'
                });
                tracks.push({ target_id: 'VISUAL_INTENSITY', points: intensityPoints });
            }
            return tracks;
        }

        if (Array.isArray(visualSource?.tracks) && visualSource.tracks.length > 0) {
            return visualSource.tracks as VisualPlanTrack[];
        }

        const tracks: VisualPlanTrack[] = [];
        const clampTime = (v: any) => Math.max(0, Math.min(totalBars, Number(v ?? 0)));
        const safeMode = (v: any) =>
            typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : (preferredVisual || 'organic');
        const safeTransition = (v: any) =>
            typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : 'crossfade';
        const safeIntensity = (v: any) => {
            const n = Number(v);
            if (Number.isFinite(n)) return Math.max(0, Math.min(1, n));
            return 0.35;
        };

        if (visualSource?.mode || visualSource?.visual_mode || visualSource?.style) {
            tracks.push({
                target_id: 'VISUAL_MODE',
                points: [
                    { time: 0, value: safeMode(visualSource.mode ?? visualSource.visual_mode ?? visualSource.style), curve: 'STEP' }
                ]
            });
        }

        if (visualSource?.transition || visualSource?.transition_type || visualSource?.visual_transition_type) {
            tracks.push({
                target_id: 'VISUAL_TRANSITION_TYPE',
                points: [
                    {
                        time: 0,
                        value: safeTransition(
                            visualSource.transition ??
                            visualSource.transition_type ??
                            visualSource.visual_transition_type
                        ),
                        curve: 'STEP'
                    }
                ]
            });
        }

        if (visualSource?.intensity !== undefined || visualSource?.visual_intensity !== undefined) {
            tracks.push({
                target_id: 'VISUAL_INTENSITY',
                points: [
                    {
                        time: 0,
                        value: safeIntensity(visualSource.intensity ?? visualSource.visual_intensity),
                        curve: 'HOLD'
                    },
                    {
                        time: totalBars,
                        value: safeIntensity(visualSource.intensity ?? visualSource.visual_intensity),
                        curve: 'LINEAR'
                    }
                ]
            });
        }

        const sections = Array.isArray(visualSource?.sections) ? visualSource.sections : [];
        const transitions = Array.isArray(visualSource?.transitions) ? visualSource.transitions : [];
        if (transitions.length > 0) {
            const modePoints: Array<{ time: number; value: string; curve: 'STEP' }> = [];
            const transitionPoints: Array<{ time: number; value: string; curve: 'STEP' }> = [];
            const intensityPoints: Array<{ time: number; value: number; curve: 'HOLD' | 'LINEAR' }> = [];
            modePoints.push({
                time: 0,
                value: safeMode(visualSource?.base_mode ?? preferredVisual),
                curve: 'STEP'
            });
            transitionPoints.push({
                time: 0,
                value: safeTransition('crossfade'),
                curve: 'STEP'
            });
            intensityPoints.push({
                time: 0,
                value: safeIntensity(visualSource?.intensity_baseline ?? 0.35),
                curve: 'HOLD'
            });

            for (const tr of transitions) {
                const t = clampTime(tr?.bar ?? tr?.start_bar ?? tr?.time ?? 0);
                if (tr?.target_mode || tr?.mode || tr?.visual_mode) {
                    modePoints.push({
                        time: t,
                        value: safeMode(tr.target_mode ?? tr.mode ?? tr.visual_mode),
                        curve: 'STEP'
                    });
                }
                if (tr?.type || tr?.transition || tr?.transition_type) {
                    transitionPoints.push({
                        time: t,
                        value: safeTransition(tr.type ?? tr.transition ?? tr.transition_type),
                        curve: 'STEP'
                    });
                }
                if (tr?.intensity !== undefined || tr?.visual_intensity !== undefined) {
                    intensityPoints.push({
                        time: t,
                        value: safeIntensity(tr.intensity ?? tr.visual_intensity),
                        curve: 'HOLD'
                    });
                }
            }

            intensityPoints.push({
                time: totalBars,
                value: intensityPoints[intensityPoints.length - 1].value,
                curve: 'LINEAR'
            });
            tracks.push({ target_id: 'VISUAL_MODE', points: modePoints.sort((a, b) => a.time - b.time) });
            tracks.push({ target_id: 'VISUAL_TRANSITION_TYPE', points: transitionPoints.sort((a, b) => a.time - b.time) });
            tracks.push({ target_id: 'VISUAL_INTENSITY', points: intensityPoints.sort((a, b) => a.time - b.time) });
        }
        if (sections.length > 0) {
            const modePoints: Array<{ time: number; value: string; curve: 'STEP' }> = [];
            const transitionPoints: Array<{ time: number; value: string; curve: 'STEP' }> = [];
            const intensityPoints: Array<{ time: number; value: number; curve: 'HOLD' | 'LINEAR' }> = [];
            for (const section of sections) {
                const t = clampTime(section?.start_bar ?? section?.start ?? section?.time ?? 0);
                modePoints.push({ time: t, value: safeMode(section?.mode ?? section?.visual_mode), curve: 'STEP' });
                transitionPoints.push({
                    time: t,
                    value: safeTransition(section?.transition ?? section?.transition_type),
                    curve: 'STEP'
                });
                intensityPoints.push({
                    time: t,
                    value: safeIntensity(section?.intensity),
                    curve: 'HOLD'
                });
            }
            if (modePoints.length > 0) {
                tracks.push({ target_id: 'VISUAL_MODE', points: modePoints });
            }
            if (transitionPoints.length > 0) {
                tracks.push({ target_id: 'VISUAL_TRANSITION_TYPE', points: transitionPoints });
            }
            if (intensityPoints.length > 0) {
                intensityPoints.push({
                    time: totalBars,
                    value: intensityPoints[intensityPoints.length - 1].value,
                    curve: 'LINEAR'
                });
                tracks.push({ target_id: 'VISUAL_INTENSITY', points: intensityPoints });
            }
        }

        return tracks;
    }

    private summarizeObjectShape(value: any): string {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (Array.isArray(value)) {
            const first = value.find((v) => v && typeof v === 'object') ?? value[0];
            return `array(len=${value.length}, first=${this.summarizeObjectShape(first)})`;
        }
        if (typeof value !== 'object') return typeof value;
        const keys = Object.keys(value).slice(0, 20);
        return `object(keys=${keys.join(',')})`;
    }

    private normalizePromptContext(
        promptContext: PromptContextInput | undefined,
        direction: MixDirection
    ): PromptContextInput {
        const fallbackSource = direction === 'A->B' ? 'A' : 'B';
        const fallbackTarget = fallbackSource === 'A' ? 'B' : 'A';
        const sourceDeck = promptContext?.sourceDeck ?? fallbackSource;
        const targetDeck = promptContext?.targetDeck ?? fallbackTarget;
        return {
            sourceDeck,
            targetDeck,
            sourcePrompt: promptContext?.sourcePrompt?.trim() || 'Unknown',
            targetPrompt: promptContext?.targetPrompt?.trim() || 'Unknown',
            sourcePlaying: promptContext?.sourcePlaying ?? true,
            targetPlaying: promptContext?.targetPlaying ?? true,
            keyRoot: promptContext?.keyRoot?.trim() || '',
            scaleLabel: promptContext?.scaleLabel?.trim() || '',
            scalePrompt: promptContext?.scalePrompt?.trim() || '',
            sourceGeneratedPrompt: promptContext?.sourceGeneratedPrompt?.trim() || '',
            targetGeneratedPrompt: promptContext?.targetGeneratedPrompt?.trim() || '',
            arrangementHint: promptContext?.arrangementHint?.trim() || ''
        };
    }

    private extractDirection(userRequest: string): MixDirection {
        const req = userRequest.toUpperCase();
        return req.includes('B->A') ? 'B->A' : 'A->B';
    }

    private extractDurationBars(userRequest: string): number {
        const m = userRequest.match(/Duration:\s*(\d+)\s*Bars?/i);
        if (!m) return 64;
        const bars = Number(m[1]);
        if (Number.isNaN(bars)) return 64;
        return Math.min(512, Math.max(8, bars));
    }

    private computeContextHash(ctx: PromptContextInput): string {
        const raw = `${ctx.sourceDeck}|${ctx.targetDeck}|${ctx.sourcePrompt}|${ctx.targetPrompt}|${ctx.sourcePlaying}|${ctx.targetPlaying}`;
        // Small deterministic hash for prompt context tracking in browser runtime.
        let h = 2166136261;
        for (let i = 0; i < raw.length; i++) {
            h ^= raw.charCodeAt(i);
            h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
        }
        return (h >>> 0).toString(16).padStart(8, '0');
    }

    private buildTemplatePlanJson(
        direction: MixDirection,
        bpm: number,
        totalBars: number,
        promptCtx: PromptContextInput,
        contextHash: string,
        preferredVisual: string
    ): string {
        const crossStart = direction === 'A->B' ? 0 : 1;
        const crossEnd = direction === 'A->B' ? 1 : 0;
        const sourceDeck = direction === 'A->B' ? 'A' : 'B';
        const targetDeck = sourceDeck === 'A' ? 'B' : 'A';
        const stopTarget = sourceDeck === 'A' ? 'DECK_A_STOP' : 'DECK_B_STOP';
        const postDeck = sourceDeck === 'A' ? 'DECK_A' : 'DECK_B';
        const eqPrefix = sourceDeck === 'A' ? 'DECK_A' : 'DECK_B';

        const visualTracks: VisualPlanTrack[] = [
            {
                target_id: 'VISUAL_MODE',
                points: [
                    { time: 0, value: 'wireframe', curve: 'STEP' },
                    { time: totalBars * 0.3, value: preferredVisual || 'organic', curve: 'STEP' },
                    { time: totalBars * 0.7, value: 'organic', curve: 'STEP' }
                ]
            },
            {
                target_id: 'VISUAL_TRANSITION_TYPE',
                points: [
                    { time: 0, value: 'crossfade', curve: 'STEP' },
                    { time: totalBars * 0.3, value: 'sweep_line_smear', curve: 'STEP' },
                    { time: Math.min(totalBars, totalBars * 0.3 + 0.2), value: 'crossfade', curve: 'STEP' },
                    { time: totalBars * 0.7, value: 'sweep_line_smear', curve: 'STEP' },
                    { time: Math.min(totalBars, totalBars * 0.7 + 0.2), value: 'crossfade', curve: 'STEP' }
                ]
            },
            {
                target_id: 'VISUAL_INTENSITY',
                points: [
                    { time: 0, value: 0.35, curve: 'HOLD' },
                    { time: totalBars, value: 0.35, curve: 'LINEAR' }
                ]
            }
        ];

        const template: IntegratedMixPlan = {
            meta: {
                version: '3.0',
                session_mode: 'single',
                direction,
                target_bpm: bpm,
                total_bars: totalBars,
                description: `Safe Template ${direction}`,
                plan_model: 'template'
            },
            audio_plan: {
                meta: {
                    version: '2.0',
                    type: 'DEEP_SPECTRAL_MIX',
                    target_bpm: bpm,
                    total_bars: totalBars,
                    description: `Template ${direction}`
                },
                tracks: [
                    {
                        target_id: 'CROSSFADER',
                        points: [
                            { time: 0, value: crossStart, curve: 'HOLD' },
                            { time: totalBars, value: crossEnd, curve: 'SIGMOID' }
                        ]
                    },
                    {
                        target_id: stopTarget as any,
                        points: [{ time: Math.max(1, totalBars - 1), value: true, curve: 'STEP' }]
                    }
                ],
                post_mix_reset: {
                    target_deck: postDeck as 'DECK_A' | 'DECK_B',
                    actions: [
                        { target: `${eqPrefix}_EQ_LOW` as any, value: 0.67, wait_bars: 0 },
                        { target: `${eqPrefix}_EQ_MID` as any, value: 0.67, wait_bars: 0 },
                        { target: `${eqPrefix}_EQ_HI` as any, value: 0.67, wait_bars: 0 }
                    ]
                }
            },
            visual_plan: { tracks: visualTracks },
            post_actions: {
                regen_stopped_deck: true,
                next_trigger_sec: 0,
                safety_reset: {
                    crossfader_to_target: true,
                    reset_eq_to_default: true,
                    disable_fx_tail: true
                }
            },
            prompt_context_ref: {
                source_deck: promptCtx.sourceDeck,
                target_deck: promptCtx.targetDeck,
                source_prompt: promptCtx.sourcePrompt,
                target_prompt: promptCtx.targetPrompt,
                source_is_playing: promptCtx.sourcePlaying,
                target_is_playing: promptCtx.targetPlaying,
                context_hash: contextHash,
                key_root: promptCtx.keyRoot || undefined,
                scale_label: promptCtx.scaleLabel || undefined,
                scale_prompt: promptCtx.scalePrompt || undefined,
                source_generated_prompt: promptCtx.sourceGeneratedPrompt || undefined,
                target_generated_prompt: promptCtx.targetGeneratedPrompt || undefined,
                arrangement_hint: promptCtx.arrangementHint || undefined
            }
        };

        // Keep prompt-aware visual bias in template as well.
        const lowSource = promptCtx.sourcePrompt.toLowerCase();
        const lowTarget = promptCtx.targetPrompt.toLowerCase();
        if (/(sumi|ink|japan|suibokuga)/.test(lowSource) || /(sumi|ink|japan|suibokuga)/.test(lowTarget)) {
            visualTracks[0].points[1].value = 'suibokuga';
        } else if (/(ambient|organic|deep)/.test(lowSource) || /(ambient|organic|deep)/.test(lowTarget)) {
            visualTracks[0].points[1].value = 'organic';
        }

        return JSON.stringify(template);
    }

    private attachPlannerMetadata(plan: IntegratedMixPlan, modelUsed: PlannerModel) {
        plan.meta.plan_model = modelUsed;
        const base = (plan.meta.description || '').trim();
        const marker = `[Planner:${modelUsed}]`;
        if (!base) {
            plan.meta.description = marker;
            return;
        }
        if (!base.includes(marker)) {
            plan.meta.description = `${base} ${marker}`.trim();
        }
    }

    private markFallbackReason(plan: IntegratedMixPlan, reason: string) {
        this.attachPlannerMetadata(plan, 'template');
        plan.meta.plan_fallback_reason = reason.slice(0, 240);
    }

    private enforceAudioMotionPlan(plan: IntegratedMixPlan) {
        if (!plan.audio_plan) return;
        if (!Array.isArray(plan.audio_plan.tracks)) {
            plan.audio_plan.tracks = [];
        }

        const allowedTargets = new Set<string>([
            'CROSSFADER',
            'DECK_A_EQ_LOW', 'DECK_A_EQ_MID', 'DECK_A_EQ_HI',
            'DECK_B_EQ_LOW', 'DECK_B_EQ_MID', 'DECK_B_EQ_HI',
            'DECK_A_ECHO_SEND', 'DECK_B_ECHO_SEND',
            'DECK_A_REVERB_MIX', 'DECK_B_REVERB_MIX'
        ]);

        const totalBars = Math.max(8, Number(plan.meta.total_bars || 64));
        const direction = plan.meta.direction === 'B->A' ? 'B->A' : 'A->B';
        const source = direction === 'A->B' ? 'A' : 'B';
        const target = source === 'A' ? 'B' : 'A';
        const crossStart = direction === 'A->B' ? 0 : 1;
        const crossEnd = direction === 'A->B' ? 1 : 0;

        const normalizePoints = (points: Array<{ time: number; value: number | boolean | string; curve: any }>) =>
            points
                .map((p) => ({
                    time: Math.max(0, Math.min(totalBars, Number(p.time))),
                    value: p.value,
                    curve: p.curve
                }))
                .sort((a, b) => a.time - b.time);

        const numericMotion = (points: Array<{ value: number | boolean | string }>) => {
            const nums = points.filter((p) => typeof p.value === 'number').map((p) => Number(p.value));
            if (nums.length < 2) return 0;
            return Math.max(...nums) - Math.min(...nums);
        };

        const upsertTrack = (
            targetId: string,
            points: Array<{ time: number; value: number | boolean | string; curve: any }>,
            minMotion = 0.05
        ) => {
            const normalized = normalizePoints(points as any);
            const index = plan.audio_plan.tracks.findIndex((t) => String(t.target_id) === targetId);
            if (index < 0) {
                plan.audio_plan.tracks.push({ target_id: targetId as any, points: normalized as any });
                return;
            }
            const existing = plan.audio_plan.tracks[index];
            const hasEnoughMotion = numericMotion(existing.points as any) >= minMotion;
            if (!hasEnoughMotion) {
                existing.points = normalized as any;
            } else {
                existing.points = normalizePoints(existing.points as any) as any;
            }
        };

        upsertTrack('CROSSFADER', [
            { time: 0, value: crossStart, curve: 'HOLD' },
            { time: totalBars * 0.72, value: direction === 'A->B' ? 0.82 : 0.18, curve: 'SIGMOID' },
            { time: totalBars, value: crossEnd, curve: 'SIGMOID' }
        ], 0.18);

        upsertTrack(`DECK_${source}_EQ_LOW`, [
            { time: 0, value: 0.67, curve: 'HOLD' },
            { time: totalBars * 0.4, value: 0.58, curve: 'LINEAR' },
            { time: totalBars * 0.68, value: 0.42, curve: 'SIGMOID' },
            { time: totalBars, value: 0.67, curve: 'LINEAR' }
        ]);
        upsertTrack(`DECK_${source}_EQ_MID`, [
            { time: 0, value: 0.67, curve: 'HOLD' },
            { time: totalBars * 0.5, value: 0.55, curve: 'LINEAR' },
            { time: totalBars, value: 0.67, curve: 'LINEAR' }
        ]);
        upsertTrack(`DECK_${source}_EQ_HI`, [
            { time: 0, value: 0.67, curve: 'HOLD' },
            { time: totalBars * 0.45, value: 0.56, curve: 'LINEAR' },
            { time: totalBars * 0.8, value: 0.44, curve: 'SIGMOID' },
            { time: totalBars, value: 0.67, curve: 'LINEAR' }
        ]);

        upsertTrack(`DECK_${target}_EQ_LOW`, [
            { time: 0, value: 0.50, curve: 'HOLD' },
            { time: totalBars * 0.5, value: 0.60, curve: 'LINEAR' },
            { time: totalBars, value: 0.67, curve: 'SIGMOID' }
        ]);
        upsertTrack(`DECK_${target}_EQ_MID`, [
            { time: 0, value: 0.52, curve: 'HOLD' },
            { time: totalBars * 0.5, value: 0.62, curve: 'LINEAR' },
            { time: totalBars, value: 0.67, curve: 'SIGMOID' }
        ]);
        upsertTrack(`DECK_${target}_EQ_HI`, [
            { time: 0, value: 0.55, curve: 'HOLD' },
            { time: totalBars * 0.5, value: 0.64, curve: 'LINEAR' },
            { time: totalBars, value: 0.67, curve: 'SIGMOID' }
        ]);

        // Enforce practical EQ safety regardless of model output:
        // - baseline at bar 0 is always 0.67
        // - clamp overall EQ range to avoid harsh boosts/cuts
        for (const track of plan.audio_plan.tracks) {
            const targetId = String(track.target_id);
            if (!/^DECK_[AB]_EQ_(HI|MID|LOW)$/.test(targetId)) continue;
            if (!Array.isArray(track.points) || track.points.length === 0) continue;

            track.points = track.points
                .map((p) => {
                    const numeric = typeof p.value === 'number' ? p.value : Number(p.value);
                    const clamped = Number.isFinite(numeric)
                        ? Math.max(0.2, Math.min(0.82, numeric))
                        : 0.67;
                    return { ...p, value: clamped };
                })
                .sort((a, b) => a.time - b.time);

            if (track.points[0].time > 0) {
                track.points.unshift({ time: 0, value: 0.67, curve: 'HOLD' } as any);
            } else {
                track.points[0].time = 0;
                track.points[0].value = 0.67;
                track.points[0].curve = 'HOLD';
            }
        }

        upsertTrack(`DECK_${target}_ECHO_SEND`, [
            { time: 0, value: 0.0, curve: 'HOLD' },
            { time: totalBars * 0.5, value: 0.16, curve: 'LINEAR' },
            { time: totalBars * 0.75, value: 0.10, curve: 'LINEAR' },
            { time: totalBars, value: 0.03, curve: 'LINEAR' }
        ]);
        upsertTrack(`DECK_${target}_REVERB_MIX`, [
            { time: 0, value: 0.06, curve: 'HOLD' },
            { time: totalBars * 0.5, value: 0.18, curve: 'LINEAR' },
            { time: totalBars * 0.8, value: 0.14, curve: 'LINEAR' },
            { time: totalBars, value: 0.05, curve: 'LINEAR' }
        ]);

        for (const track of plan.audio_plan.tracks) {
            const targetId = String(track.target_id);
            if (targetId.endsWith('_ECHO_SEND')) {
                track.points = (track.points || []).map((p) => ({
                    ...p,
                    value: typeof p.value === 'number' ? Math.max(0, Math.min(0.22, p.value)) : 0.0
                }));
            }
            if (targetId.endsWith('_REVERB_MIX')) {
                track.points = (track.points || []).map((p) => ({
                    ...p,
                    value: typeof p.value === 'number' ? Math.max(0, Math.min(0.22, p.value)) : 0.0
                }));
            }
        }

        // Hard gate: remove all non-safety-approved parameters from AI automation.
        plan.audio_plan.tracks = plan.audio_plan.tracks.filter((t) => allowedTargets.has(String(t.target_id)));
    }

    private enforceVisualTransitionPlan(plan: IntegratedMixPlan) {
        if (!plan.visual_plan) {
            plan.visual_plan = { tracks: [] };
        }
        if (!Array.isArray(plan.visual_plan.tracks)) {
            plan.visual_plan.tracks = [];
        }

        const safeMode = (v: any) =>
            typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : 'organic';
        const safeTransition = (v: any): 'fade_in' | 'fade_out' | 'crossfade' | 'soft_overlay' | 'sweep_line_smear' => {
            const t = typeof v === 'string' ? v.trim().toLowerCase() : 'crossfade';
            if (t === 'fade_in' || t === 'fade_out' || t === 'crossfade' || t === 'soft_overlay' || t === 'sweep_line_smear') {
                return t;
            }
            return 'crossfade';
        };

        let modeTrack = plan.visual_plan.tracks.find((t) => t.target_id === 'VISUAL_MODE');
        if (!modeTrack) {
            modeTrack = {
                target_id: 'VISUAL_MODE',
                points: [{ time: 0, value: 'organic', curve: 'STEP' }]
            };
            plan.visual_plan.tracks.push(modeTrack);
        }
        modeTrack.points = [...modeTrack.points]
            .map((p) => ({
                time: Math.max(0, Number(p.time) || 0),
                value: safeMode(p.value),
                curve: p.curve || 'STEP'
            }))
            .sort((a, b) => a.time - b.time);
        if (!modeTrack.points.length) {
            modeTrack.points.push({ time: 0, value: 'organic', curve: 'STEP' });
        }
        if (Math.abs(modeTrack.points[0].time) > 0.001) {
            modeTrack.points.unshift({
                time: 0,
                value: safeMode(modeTrack.points[0].value),
                curve: 'STEP'
            });
        }

        let transitionTrack = plan.visual_plan.tracks.find((t) => t.target_id === 'VISUAL_TRANSITION_TYPE');
        if (!transitionTrack) {
            transitionTrack = {
                target_id: 'VISUAL_TRANSITION_TYPE',
                points: [{ time: 0, value: 'crossfade', curve: 'STEP' }]
            };
            plan.visual_plan.tracks.push(transitionTrack);
        }

        transitionTrack.points = [...transitionTrack.points]
            .map((p) => ({
                time: Math.max(0, Number(p.time) || 0),
                value: safeTransition(p.value),
                curve: p.curve || 'STEP'
            }))
            .sort((a, b) => a.time - b.time);
        if (!transitionTrack.points.length) {
            transitionTrack.points.push({ time: 0, value: 'crossfade', curve: 'STEP' });
        }
        if (Math.abs(transitionTrack.points[0].time) > 0.001) {
            transitionTrack.points.unshift({
                time: 0,
                value: safeTransition(transitionTrack.points[0].value),
                curve: 'STEP'
            });
        }
    }
}
