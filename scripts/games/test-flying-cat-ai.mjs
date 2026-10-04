// Optional live provider smoke test. Uses the existing local server key without
// printing it; never writes activities, results or other student data to Supabase.
import { build } from 'esbuild';
import { config } from 'dotenv';
import { mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

config({ path: '.env.local', quiet: true });
const apiKey = process.env.OPENROUTER_SLIDES_API_KEY || process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error('No hay clave del proveedor configurada localmente.');
const directory = await mkdtemp(join(tmpdir(), 'flying-cat-ai-'));
const output = join(directory, 'generation.mjs');
await build({ entryPoints: ['src/lib/ai/flying-cat-generation.ts'], bundle: true, platform: 'node', format: 'esm',
  outfile: output, alias: { '@': resolve('src') } });
const { generateFlyingCatQuestions, inspectFlyingCatGeneration } = await import(pathToFileURL(output).href);

for (const [index, sample] of [
  { count: 10, prompt: 'Description de un Transjordan y comp palabras los numbers de trabajos la description en Español las palabras en ingles' },
  { count: 3, prompt: 'profesiones para primero secundaria, descipciones muy cortas en español y opciones en ingles, 8 opciones por pregunta' },
  { count: 3, prompt: 'Tipos de energía. Casos de uso en español para sexto de primaria.' },
].entries()) {
  const usage = [];
  const started = Date.now();
  const items = await generateFlyingCatQuestions({ ...sample, apiKey, onUsage: async (tokens) => { usage.push(tokens); } });
  assert.equal(items.length, sample.count);
  assert.equal(inspectFlyingCatGeneration(JSON.stringify({ items }), sample.count).error, undefined);
  for (const item of items) {
    assert(item.options.length >= 2 && item.options.length <= 4);
    assert(item.feedback.trim());
    assert(item.options[item.correctIndex]);
  }
  console.log(JSON.stringify({ case: index + 1, status: 'PASS', count: items.length,
    seconds: Math.round((Date.now() - started) / 1000), attempts: usage.length,
    // Educational sample text only, to inspect the requested language split.
    sample: { prompt: items[0].prompt, options: items[0].options, correctAnswer: items[0].options[items[0].correctIndex], feedback: items[0].feedback } }));
}
