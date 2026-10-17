// Read-only, aggregate-only measurements; source text and paths stay private.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const tm = require('vscode-textmate');
const onig = require('vscode-oniguruma');
const { semanticTokens } = require('../src/highlighting');
const root = require('../scripts/project').armaRepository();
const extension = path.resolve(__dirname, '..');
const patterns = ['*.sqf', '*.hpp', '*.inc', '*.h', '*.ext', '*.sqm', '*.rvmat', '*.bikb', '*.bisurf', 'config.cpp'];
const files = [...new Set(execFileSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...patterns], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).split('\0').filter(Boolean))].sort();
const corpus = files.filter(file => fs.existsSync(path.join(root, file))).map(file => ({ file, bytes: fs.readFileSync(path.join(root, file)) }));
function digest(read) {
  const hash = crypto.createHash('sha256');
  for (const item of corpus) { hash.update(item.file); hash.update('\0'); hash.update(read(item)); hash.update('\0'); }
  return hash.digest('hex');
}
const sourceHash = digest(item => item.bytes);
// VS Code 1.105.1 defaults editor.maxTokenizationLineLength to 20,000.
// Still measure every line, and retain/report timeouts outside editor coverage.
const editorLineLimit = 20000, lineBudgetMs = 50;
const reference = JSON.parse(fs.readFileSync(path.join(root, 'tests/sqf/commands/reference.json')));
const commands = new Set(Object.keys(reference.commands).map(name => name.toLowerCase()));
const functions = new Map(require('../data/bis-functions.json').functions.map(fn => [fn.title.toLowerCase(), true]));
function quantile(values, fraction) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor((sorted.length - 1) * fraction)] || 0; }
async function main() {
  const wasm = fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
  await onig.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
  const grammar = {};
  for (const variant of ['before', 'after']) for (const language of ['sqf', 'config']) grammar[variant + language] = JSON.parse(variant === 'before'
    ? execFileSync('git', ['show', 'HEAD:languages/' + language + '.json'], { cwd: extension, encoding: 'utf8' })
    : fs.readFileSync(path.join(extension, 'languages', language + '.json'), 'utf8'));
  const results = {};
  const incomplete = [];
  for (const variant of ['before', 'after']) {
    const setupStart = performance.now();
    const registry = new tm.Registry({ onigLib: Promise.resolve({ createOnigScanner: p => new onig.OnigScanner(p), createOnigString: s => new onig.OnigString(s) }), loadGrammar: async scope => grammar[variant + scope] });
    const grammars = { sqf: await registry.loadGrammar('sqf'), config: await registry.loadGrammar('config') };
    // Lazy Oniguruma compilation is a one-time setup cost, not warm line work.
    // Measure it separately for both variants using identical synthetic input.
    for (const language of ['sqf', 'config']) {
      let state = tm.INITIAL;
      for (const line of ['#define LIMIT 25', '/* comment */', 'params ["_example"];', 'class Example: Base { value = 1; };', '{ private _value = (1 + 2); hint "value %1"; };']) {
        state = grammars[language].tokenizeLine(line, state).ruleStack;
      }
    }
    const setupMilliseconds = performance.now() - setupStart;
    let lines = 0, stoppedEarly = 0;
    const start = performance.now();
    for (const item of corpus) {
      let state = tm.INITIAL;
      const language = /\.sqf$/i.test(item.file) ? 'sqf' : 'config';
      let lineNumber = 0;
      for (const line of item.bytes.toString('utf8').split('\n')) {
        const result = grammars[language].tokenizeLine(line, state, lineBudgetMs);
        if (result.stoppedEarly) incomplete.push({ variant, file: item.file, line: lineNumber + 1, characters: line.length });
        stoppedEarly += Number(result.stoppedEarly); state = result.ruleStack; lines++;
        lineNumber++;
      }
    }
    results[variant] = { setupMilliseconds, milliseconds: performance.now() - start, lines, stoppedEarly,
      incompleteWithinEditorLimit: incomplete.filter(item => item.variant === variant && item.characters < editorLineLimit).length };
    registry.dispose();
  }
  const durations = []; let emittedTokens = 0;
  for (const item of corpus) {
    const start = performance.now();
    emittedTokens += semanticTokens(item.bytes.toString('utf8'), { commands, functions, language: /\.sqf$/i.test(item.file) ? 'sqf' : 'arma-config' }).length;
    durations.push(performance.now() - start);
  }
  assert.equal(digest(item => fs.readFileSync(path.join(root, item.file))), sourceHash, 'source bytes changed during highlighting measurements');
  const report = { files: corpus.length, sourceHash, lineBudgetMs, editorLineLimit, fallback: results, semantic: { totalMs: durations.reduce((a, b) => a + b, 0), medianMs: quantile(durations, 0.5), p95Ms: quantile(durations, 0.95), maxMs: Math.max(...durations), emittedTokens },
    limits: 'One sequential warm tokenizer run per variant, with lazy setup measured separately. Every line is measured, including lines beyond the default editor length limit; timeout counts are retained, so elapsed totals are not a complete-work speed comparison. This is lexical presentation only, not compiler validation or reading-speed evidence. Semantic lookup uses the command snapshot and BIS catalog; project registration discovery is covered by packaged editor tests.' };
  const file = path.join(extension, 'test-results/highlighting-performance.json'); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(extension, 'test-results/highlighting-incomplete-private.json'), JSON.stringify(incomplete, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(results.after.incompleteWithinEditorLimit, 0, 'new grammar must complete within the default editor line-length coverage');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
