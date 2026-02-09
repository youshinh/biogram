import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return fallback;
  return process.argv[i + 1];
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function collectTargets(plan) {
  const audio = new Set((plan.audio_plan?.tracks || []).map((t) => t.target_id));
  const visualTransitions = [];
  for (const track of plan.visual_plan?.tracks || []) {
    if (track.target_id === 'VISUAL_TRANSITION_TYPE') {
      for (const pt of track.points || []) visualTransitions.push(pt.value);
    }
  }
  return { audio, visualTransitions };
}

function findCrossfaderEndpoints(plan) {
  const cf = (plan.audio_plan?.tracks || []).find((t) => t.target_id === 'CROSSFADER');
  if (!cf || !cf.points?.length) return null;
  return {
    start: Number(cf.points[0].value),
    end: Number(cf.points[cf.points.length - 1].value)
  };
}

function evaluateCase(plan, testCase, forbidden) {
  const failures = [];
  const { audio, visualTransitions } = collectTargets(plan);

  const exp = testCase.expected || {};
  if (exp.schema_valid && !(plan.meta && plan.audio_plan && plan.visual_plan && plan.post_actions && plan.prompt_context_ref)) {
    failures.push('Missing required root keys');
  }

  if (exp['meta.direction'] && plan.meta?.direction !== exp['meta.direction']) {
    failures.push(`meta.direction mismatch: ${plan.meta?.direction}`);
  }

  const cross = findCrossfaderEndpoints(plan);
  if (exp['audio.crossfader.start'] !== undefined && (!cross || cross.start !== exp['audio.crossfader.start'])) {
    failures.push(`crossfader.start mismatch: ${cross?.start}`);
  }
  if (exp['audio.crossfader.end'] !== undefined && (!cross || cross.end !== exp['audio.crossfader.end'])) {
    failures.push(`crossfader.end mismatch: ${cross?.end}`);
  }

  if (exp['transport.allowed_stop_only']) {
    const stops = (plan.audio_plan?.tracks || [])
      .map((t) => t.target_id)
      .filter((id) => id === 'DECK_A_STOP' || id === 'DECK_B_STOP');
    if (stops.some((id) => id !== exp['transport.allowed_stop_only'])) {
      failures.push(`forbidden stop found: ${JSON.stringify(stops)}`);
    }
  }

  if (exp.forbidden_audio_target_count !== undefined) {
    const forbiddenAudioHits = forbidden.audio_target_id.filter((id) => audio.has(id));
    if (forbiddenAudioHits.length !== exp.forbidden_audio_target_count) {
      failures.push(`forbidden audio target count=${forbiddenAudioHits.length} hits=${forbiddenAudioHits.join(',')}`);
    }
  }

  if (exp.forbidden_visual_transition_count !== undefined) {
    const forbiddenVisualHits = visualTransitions.filter((v) => forbidden.visual_transition.includes(v));
    if (forbiddenVisualHits.length !== exp.forbidden_visual_transition_count) {
      failures.push(`forbidden visual transition count=${forbiddenVisualHits.length}`);
    }
  }

  if (exp.visual_transition_contains && !visualTransitions.includes(exp.visual_transition_contains)) {
    failures.push(`visual transition missing: ${exp.visual_transition_contains}`);
  }

  if (exp.prompt_context_ref_exists && !plan.prompt_context_ref) {
    failures.push('prompt_context_ref missing');
  }

  if (exp.fallback_prompt_applied) {
    const s = (plan.prompt_context_ref?.source_prompt || '').trim();
    const t = (plan.prompt_context_ref?.target_prompt || '').trim();
    if (!s || !t) failures.push('fallback prompt not applied');
  }

  return failures;
}

function main() {
  const planPath = arg('--plan');
  if (!planPath) {
    console.error('Usage: node scripts/eval-integrated-plan.js --plan <plan.json> [--case E01]');
    process.exit(1);
  }

  const caseId = arg('--case');
  const evalPath = path.join(process.cwd(), 'supercontroll', 'eval', 'IntegratedMixEvalSet.v1.json');
  const evalSet = readJson(evalPath);
  const plan = readJson(path.resolve(planPath));
  const cases = caseId
    ? evalSet.cases.filter((c) => c.id === caseId)
    : evalSet.cases;

  if (cases.length === 0) {
    console.error(`No eval case found: ${caseId}`);
    process.exit(1);
  }

  let failCount = 0;
  for (const c of cases) {
    const failures = evaluateCase(plan, c, evalSet.forbidden_patterns);
    if (failures.length) {
      failCount += 1;
      console.log(`[FAIL] ${c.id} ${c.title}`);
      for (const f of failures) console.log(`  - ${f}`);
    } else {
      console.log(`[PASS] ${c.id} ${c.title}`);
    }
  }

  if (failCount > 0) process.exit(2);
}

main();
