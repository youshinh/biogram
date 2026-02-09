import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const schemaPath = path.join(root, 'supercontroll', 'integrated-ai-mix.schema.json');
const evalPath = path.join(root, 'supercontroll', 'eval', 'IntegratedMixEvalSet.v1.json');

function loadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function main() {
  const schema = loadJson(schemaPath);
  const evalSet = loadJson(evalPath);

  const rootRequired = schema.required || [];
  const expectedRoot = ['meta', 'audio_plan', 'visual_plan', 'post_actions', 'prompt_context_ref'];
  for (const key of expectedRoot) {
    if (!rootRequired.includes(key)) {
      throw new Error(`Schema missing required root key: ${key}`);
    }
  }

  if (!Array.isArray(evalSet.cases)) {
    throw new Error('Eval set "cases" must be an array');
  }
  if (evalSet.cases.length < 10 || evalSet.cases.length > 15) {
    throw new Error(`Eval set size must be 10..15. current=${evalSet.cases.length}`);
  }

  const ids = new Set();
  for (const c of evalSet.cases) {
    if (!c.id || !c.title || !c.expected) {
      throw new Error(`Invalid eval case: ${JSON.stringify(c)}`);
    }
    if (ids.has(c.id)) throw new Error(`Duplicate eval case id: ${c.id}`);
    ids.add(c.id);
  }

  console.log('Integrated spec validation passed.');
  console.log(`- schema: ${schemaPath}`);
  console.log(`- eval cases: ${evalSet.cases.length}`);
}

main();
