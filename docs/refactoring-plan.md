# Bio:gram Refactoring Plan (No-Regression Track)

## Goal
- Keep current features unchanged.
- Improve maintainability and startup/runtime efficiency.
- Reduce risk by applying small, verifiable steps.

## Progress Snapshot (2026-02-11)
- Done:
  - Fixed initialize button requiring multiple presses.
  - MIDI default set to OFF and enabled on demand.
  - Deferred MIDI manager construction until settings open.
  - Deferred AI helper instances (mix/grid/texture/automation) until first use.
  - Removed duplicated CSS import path (`main.ts` only).
  - Extracted system initialization overlay to `src/ui/bootstrap/system-initializer.ts`.
  - Extracted API settings modal to `src/ui/bootstrap/api-settings-modal.ts`.
  - Extracted prompt option constants to `src/config/prompt-options.ts`.
- Remaining:
  - Decompose `src/app.ts` event wiring into feature modules.
  - Improve chunking strategy for large `app` bundle.
  - Add lightweight regression checks for critical flows.

## Constraints
- No behavior change for user-facing flow.
- No destructive migration or API changes.
- Every step must pass `npm run build`.

## Phase 1: Structure Cleanup (Safe)
- 1. Extract remaining UI bootstraps from `src/app.ts`:
  - `ai-mix` event wiring
  - visual event wiring
  - library import/event wiring
- 2. Keep `src/app.ts` as orchestrator:
  - compose services
  - call bootstrap modules
  - register cleanup

## Phase 2: Performance-Oriented Splits (Low Risk)
- 1. Split mode-specific entry points:
  - controller path vs viz-only path
  - avoid loading audio/control modules in viz-only runtime
- 2. Add Vite manual chunk policy:
  - separate `three`
  - separate UI custom elements
  - separate AI/generation clients
- 3. Measure:
  - cold startup time
  - JS payload and first interaction latency

## Phase 3: Duplication / Dead Code Reduction
- 1. Consolidate duplicated inline style builders into shared helpers.
- 2. Remove stale aliases and unused mode mappings if not externally used.
- 3. Normalize repeated event payload parsing (`any` heavy handlers).

## Phase 4: Regression Safety Net
- 1. Add smoke checks (scripted):
  - app boot
  - initialize flow
  - deck A/B generation
  - MIDI enable/disable
  - AI mix generate/start/abort
- 2. Add manual QA checklist in docs.

## Execution Order
1. Phase 1 (ongoing)
2. Phase 2
3. Phase 3
4. Phase 4

## Rollback Policy
- Each change is small and isolated.
- If a regression appears, revert the latest module extraction only.
- Keep changes in separate commits for surgical rollback.
