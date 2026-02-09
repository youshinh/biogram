
import { GoogleGenAI } from '@google/genai';
import type { AutomationScore } from '../types/ai-mix';
import type {
    IntegratedMixPlan,
    MixDirection,
    PromptContextInput,
    VisualPlanTrack
} from '../types/integrated-ai-mix';
import { validateIntegratedMixPlan } from './integrated-plan-validator';
import { ModelRouter } from './model-router';

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
* TRIM / DRIVE / SLICER are forbidden.
* A->B: STOP only DECK_A. B->A: STOP only DECK_B.

## Visual Rules
* Allowed transition types: fade_in, fade_out, crossfade, soft_overlay, sweep_line_smear.
* Forbidden styles: strong flash, aggressive glitch, rapid strobe.
* VISUAL_INTENSITY range: 0.0 .. 1.0 (default around 0.35).
* VISUAL_MODE must be one of: organic, wireframe, monochrome, rings, waves, suibokuga, grid, ai_grid.

## Prompt-aware Requirement
* You MUST reflect prompt_context_ref in both audio_plan and visual_plan decisions.
* If prompt includes ink/sumi/japan, prefer suibokuga in at least one phase.
* If prompt includes organic/ambient/deep, prefer organic or waves in at least one phase.
`;

export class MixGenerator {
    private ai: GoogleGenAI;
    private router: ModelRouter;

    constructor(apiKey: string) {
        this.ai = new GoogleGenAI({ apiKey });
        this.router = new ModelRouter(this.ai);
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
[INSTRUCTION]
- Build integrated JSON root with meta/audio_plan/visual_plan/post_actions/prompt_context_ref.
- Keep audio_plan compatible with existing AutomationScore.
- Include VISUAL_TRANSITION_TYPE and allow sweep_line_smear when suitable.
`;

        try {
            const routed = await this.router.generateWithFallback(
                {
                    systemPrompt: SYSTEM_PROMPT,
                    userPrompt: promptText,
                    timeoutMs: 20000
                },
                () => this.buildTemplatePlanJson(direction, currentBpm, totalBars, promptCtx, contextHash, preferredVisual)
            );
            console.log(`[MixGenerator] Model used: ${routed.modelUsed}`);
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
                console.warn('[MixGenerator] Parse failed. Using safe template.', parseError);
                return templatePlan;
            }
            const errors = validateIntegratedMixPlan(plan);
            if (errors.length > 0) {
                console.warn('[MixGenerator] Integrated plan validation failed, applying safe template', errors);
                return templatePlan;
            }
            this.enforceVisualTransitionPlan(plan);
            return plan;

        } catch (e: any) {
            console.error(`[MixGenerator] Generation failed. Using safe template.`, e);
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
        const normalized = this.normalizeToIntegratedPlan(
            raw,
            direction,
            bpm,
            totalBars,
            promptCtx,
            contextHash,
            preferredVisual
        );
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
        if (raw?.audio_plan?.tracks && raw?.visual_plan?.tracks) {
            return raw as IntegratedMixPlan;
        }

        // Backward compatibility: old AutomationScore root (meta/tracks/post_mix_reset)
        if (raw?.tracks && raw?.post_mix_reset) {
            const template = JSON.parse(
                this.buildTemplatePlanJson(direction, bpm, totalBars, promptCtx, contextHash, preferredVisual)
            ) as IntegratedMixPlan;
            template.audio_plan = raw as AutomationScore;
            if (raw?.meta?.target_bpm) template.meta.target_bpm = raw.meta.target_bpm;
            if (raw?.meta?.total_bars) template.meta.total_bars = raw.meta.total_bars;
            return template;
        }

        throw new Error('Unrecognized plan shape');
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
            targetPlaying: promptContext?.targetPlaying ?? true
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
                description: `Safe Template ${direction}`
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
                context_hash: contextHash
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

    private enforceVisualTransitionPlan(plan: IntegratedMixPlan) {
        if (!plan.visual_plan) {
            plan.visual_plan = { tracks: [] };
        }
        if (!Array.isArray(plan.visual_plan.tracks)) {
            plan.visual_plan.tracks = [];
        }

        let modeTrack = plan.visual_plan.tracks.find((t) => t.target_id === 'VISUAL_MODE');
        if (!modeTrack) {
            modeTrack = {
                target_id: 'VISUAL_MODE',
                points: [
                    { time: 0, value: 'wireframe', curve: 'STEP' },
                    { time: Math.max(1, plan.meta.total_bars * 0.5), value: 'organic', curve: 'STEP' }
                ]
            };
            plan.visual_plan.tracks.push(modeTrack);
        }
        modeTrack.points = [...modeTrack.points].sort((a, b) => a.time - b.time);

        const modeChangeTimes: number[] = [];
        for (let i = 1; i < modeTrack.points.length; i++) {
            const prev = modeTrack.points[i - 1];
            const curr = modeTrack.points[i];
            if (prev.value !== curr.value) {
                modeChangeTimes.push(curr.time);
            }
        }

        // Free modeでModeが固定だとsetModeが発火せず、遷移が見えない。
        // 最低1回はモード変化を作る。
        if (modeChangeTimes.length === 0) {
            const first = String(modeTrack.points[0]?.value || 'organic');
            const fallbackMode = first === 'wireframe' ? 'organic' : 'wireframe';
            const pivot = Math.max(1, Math.floor(plan.meta.total_bars * 0.45));
            modeTrack.points.push({ time: pivot, value: fallbackMode, curve: 'STEP' });
            modeTrack.points.push({ time: Math.max(pivot + 1, Math.floor(plan.meta.total_bars * 0.75)), value: first, curve: 'STEP' });
            modeTrack.points.sort((a, b) => a.time - b.time);
            modeChangeTimes.push(pivot, Math.max(pivot + 1, Math.floor(plan.meta.total_bars * 0.75)));
        }

        let transitionTrack = plan.visual_plan.tracks.find((t) => t.target_id === 'VISUAL_TRANSITION_TYPE');
        if (!transitionTrack) {
            transitionTrack = {
                target_id: 'VISUAL_TRANSITION_TYPE',
                points: [{ time: 0, value: 'sweep_line_smear', curve: 'STEP' }]
            };
            plan.visual_plan.tracks.push(transitionTrack);
        }

        transitionTrack.points = [...transitionTrack.points].sort((a, b) => a.time - b.time);
        const hasAtTime = (time: number) =>
            transitionTrack!.points.some((p) => Math.abs(p.time - time) < 0.001);

        // Keep default as crossfade, and pulse sweep exactly at mode-change moments.
        if (!hasAtTime(0)) {
            transitionTrack.points.unshift({ time: 0, value: 'crossfade', curve: 'STEP' });
        } else {
            const p0 = transitionTrack.points.find((p) => Math.abs(p.time) < 0.001);
            if (p0) p0.value = 'crossfade';
        }

        for (const t of modeChangeTimes) {
            const pulseEnd = Math.min(plan.meta.total_bars, t + 0.2);
            if (!hasAtTime(t)) {
                transitionTrack.points.push({ time: t, value: 'sweep_line_smear', curve: 'STEP' });
            } else {
                const p = transitionTrack.points.find((pt) => Math.abs(pt.time - t) < 0.001);
                if (p) p.value = 'sweep_line_smear';
            }

            if (!hasAtTime(pulseEnd)) {
                transitionTrack.points.push({ time: pulseEnd, value: 'crossfade', curve: 'STEP' });
            } else {
                const p = transitionTrack.points.find((pt) => Math.abs(pt.time - pulseEnd) < 0.001);
                if (p) p.value = 'crossfade';
            }
        }
        transitionTrack.points.sort((a, b) => a.time - b.time);
    }
}
