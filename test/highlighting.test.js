'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const tm = require('vscode-textmate');
const onig = require('vscode-oniguruma');
const { semanticTokens } = require('../src/highlighting');
let registry;
before(async () => {
  const wasm = fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
  await onig.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
  registry = new tm.Registry({ onigLib: Promise.resolve({ createOnigScanner: p => new onig.OnigScanner(p), createOnigString: s => new onig.OnigString(s) }),
    loadGrammar: async scope => JSON.parse(fs.readFileSync(path.join(__dirname, '../languages', scope === 'sqf' ? 'sqf.json' : 'config.json'), 'utf8')) });
});
async function tokenize(language, text) {
  const grammar = await registry.loadGrammar(language);
  let state = tm.INITIAL;
  return text.split('\n').map(line => {
    const result = grammar.tokenizeLine(line, state); state = result.ruleStack;
    return result.tokens.map(t => ({ text: line.slice(t.startIndex, t.endIndex), scopes: t.scopes }));
  });
}
function has(tokens, text, scope) { return tokens.some(t => t.text === text && t.scopes.includes(scope)); }
function semantic(text, options) { return semanticTokens(text, options).map(t => ({ ...t, text: text.slice(t.start, t.end) })); }

test('SQF fallback keeps calls, declarations, operators, nested brackets and numbers distinct', async () => {
  const [call, declaration, numeric, literals] = await tokenize('sqf', '[_unit] CALL LYL_fnc_example;\nprivate _fn = { hint "ready"; };\n(1.5e-3 + .25 + 0xFF + $FF) >= 1;\nTRUE; NIL; ObjNull; _1; player;');
  assert.ok(has(call, 'CALL', 'keyword.control.sqf')); assert.ok(has(call, 'LYL_fnc_example', 'entity.name.function.sqf'));
  assert.ok(has(declaration, '_fn', 'entity.name.function.sqf')); assert.ok(has(declaration, '}', 'meta.brace.curly.sqf'));
  for (const number of ['1.5e-3', '.25', '0xFF', '$FF', '1']) assert.ok(has(numeric, number, 'constant.numeric.sqf'), number);
  assert.ok(has(numeric, '(', 'meta.brace.paren.sqf')); assert.ok(has(numeric, ')', 'meta.brace.paren.sqf'));
  assert.ok(has(numeric, '>=', 'keyword.operator.sqf'));
  assert.ok(has(literals, 'TRUE', 'constant.language.boolean.sqf')); assert.ok(has(literals, 'ObjNull', 'constant.language.null.sqf'));
  assert.ok(has(literals, '_1', 'variable.other.private.sqf')); assert.ok(has(literals, 'player', 'variable.language.vobject.sqf'));
  const [config] = await tokenize('config', 'class Example: Base { values[] = {1e-3, 0xFF}; path = "scripts\\new"; };');
  assert.ok(has(config, 'class', 'storage.type.arma_config'));
  assert.ok(has(config, 'Example', 'entity.name.class.arma_config'));
  assert.ok(has(config, 'Base', 'entity.other.inherited-class.arma_config'));
  for (const property of ['values', 'path']) assert.ok(has(config, property, 'variable.other.property.arma_config'));
  for (const file of ['sqf', 'config']) {
    const g = require('../languages/' + file + '.json');
    const visit = value => { if (!value || typeof value !== 'object') return; if (value.include?.startsWith('#')) assert.ok(g.repository[value.include.slice(1)], value.include); Object.values(value).forEach(visit); };
    visit(g);
  }
});

test('both grammars preserve quoted paths, doubled quotes, placeholders and comment boundaries', async () => {
  for (const language of ['sqf', 'config']) {
    const suffix = language === 'sqf' ? 'sqf' : 'arma_config';
    const rows = await tokenize(language, '"scripts\\new\\test.sqf"; "https://example.test/*"; // real\n"a""b %1"; \'a\'\'b %2\';\n/* "ignored"\ncomment */ "visible";');
    assert.ok(has(rows[0], 'scripts\\new\\test.sqf', 'string.quoted.double.' + suffix));
    assert.ok(!rows[0].some(t => /\\[nt]/.test(t.text) && t.scopes.some(s => s.startsWith('constant.character.escape'))));
    assert.ok(has(rows[0], 'https://example.test/*', 'string.quoted.double.' + suffix));
    assert.ok(rows[0].some(t => t.text.includes('// real') && t.scopes.includes('comment.line.' + suffix)));
    assert.ok(has(rows[1], '""', 'constant.character.escape.quote.' + suffix));
    assert.ok(has(rows[1], "''", 'constant.character.escape.quote.' + suffix));
    for (const placeholder of ['%1', '%2']) assert.ok(has(rows[1], placeholder, 'constant.other.placeholder.' + suffix));
    assert.ok(rows[2].every(t => t.scopes.includes('comment.block.' + suffix)));
    assert.ok(has(rows[3], 'visible', 'string.quoted.double.' + suffix));
  }
});

test('preprocessor directives and continued definitions do not leak into the next statement', async () => {
  for (const language of ['sqf', 'config']) {
    const suffix = language === 'sqf' ? 'sqf' : 'arma_config';
    const rows = await tokenize(language, '#define LIMIT 1.5e-3 \\\n + 1\n#ifdef LIMIT\n#include <common.hpp>\n#endif\nprivate _plain = 25;');
    assert.ok(has(rows[0], '#define', 'keyword.control.directive.define.' + suffix));
    assert.ok(has(rows[0], 'LIMIT', 'variable.other.constant.macro.' + suffix));
    assert.ok(rows[1].every(t => t.scopes.includes('meta.preprocessor.define.' + suffix)));
    assert.ok(has(rows[2], '#ifdef', 'keyword.control.directive.' + suffix));
    assert.ok(has(rows[3], 'common.hpp', 'string.quoted.other.include.' + suffix));
    assert.ok(!rows[5].some(t => t.scopes.some(s => s.startsWith('meta.preprocessor'))));
    const crlf = await tokenize(language, '#define LIMIT 25 \\\r\n + 1\r\nLIMIT;');
    assert.ok(crlf[1].filter(t => t.text.trim()).every(t => t.scopes.includes('meta.preprocessor.define.' + suffix)));
    assert.ok(!crlf[2].some(t => t.scopes.some(s => s.startsWith('meta.preprocessor'))));
  }
});

test('semantic colors use supplied command/function references and keep language keywords', () => {
  const text = 'if (true and not false) then { player; ctrlWebBrowserAction; BIS_fnc_example; Registered_fnc_example; Unknown_fnc_example; };';
  const result = semantic(text, { commands: new Set(['if', 'true', 'then', 'and', 'not', 'false', 'player', 'ctrlwebbrowseraction']), functions: new Map([['bis_fnc_example', true], ['registered_fnc_example', false]]) });
  assert.deepEqual(result.map(t => [t.text, t.type, t.modifiers]), [
    ['ctrlWebBrowserAction', 'function', ['defaultLibrary']], ['BIS_fnc_example', 'function', ['defaultLibrary']], ['Registered_fnc_example', 'function', []]
  ]);
});

test('params color explicit declarations and same-scope uses, preserving shadow and callback uncertainty', () => {
  const text = '_arg; params ["_arg", ["_other", [1,2]], ["_third", {params ["_inner"]; _inner;}]]; _ARG; "_arg"; { _arg; params ["_arg"]; _arg; }; private ["_arg"]; _arg; _other;';
  const result = semantic(text);
  assert.deepEqual(result.map(t => t.text), ['_arg', '_other', '_third', '_inner', '_inner', '_ARG', '_arg', '_arg', '_other']);
  assert.ok(result.filter(t => t.modifiers.includes('declaration')).length === 5);
  assert.equal(semantic('params ["_arg", ["_broken", 0]; _arg;').length, 0, 'unbalanced params cannot create bindings');
  assert.equal(semantic('params ["_arg"]; private _arg = 2; _arg;').length, 1);
  assert.equal(semantic('params ["_arg"]; private "_arg"; _arg;').length, 1);
  assert.equal(semantic('params ["_dynamic" + _suffix, ["_computed" + _suffix, 0]]; _dynamic; _computed;').length, 0);
  const unicode = '"😀"; params ["_unit"]; _unit;';
  assert.equal(semantic(unicode)[0].start, unicode.indexOf('_unit'));
});

test('macros are case-sensitive and respect undef, quoted text and UTF-16 offsets', () => {
  const text = '// 😀\r\n#define LIMIT 25\r\nLIMIT; limit; "LIMIT"; /* LIMIT */\r\n#undef LIMIT\r\nLIMIT;';
  const result = semantic(text);
  assert.deepEqual(result.map(t => [t.text, t.type, t.modifiers]), [['LIMIT', 'macro', ['declaration', 'readonly']], ['LIMIT', 'macro', ['readonly']]]);
  assert.equal(result[0].start, text.indexOf('LIMIT'));
  assert.equal(semantic('"params [""_fake""]"; // params ["_comment"]\n_fake; _comment;').length, 0);
  assert.equal(semantic('#define BODY params ["_fake"]; \\\n_fake;\n_fake;').filter(t => t.type === 'parameter').length, 0);
  assert.deepEqual(semantic('#define SIZE 5\nclass Test { value = SIZE; };', { language: 'arma-config' }).map(t => t.type), ['macro', 'macro']);
  assert.equal(semantic('#define define 2\n#define other define').filter(t => t.text === 'define').length, 2, 'directive keywords cannot become macro references');
});

test('indentation recognizes blocks and arrays while ignoring quoted delimiters and line comments', () => {
  for (const language of ['sqf', 'config']) {
    const config = require('../languages/' + language + '.configuration.json');
    const increase = new RegExp(config.indentationRules.increaseIndentPattern), decrease = new RegExp(config.indentationRules.decreaseIndentPattern);
    for (const line of ['if (true) then {', 'params [', 'params ["_unit",', 'class Test { // explanation']) assert.ok(increase.test(line), line);
    for (const line of ['hint "{";', "hint '[';", '// {', '/* [ */', 'params ["_unit"];']) assert.ok(!increase.test(line), line);
    for (const line of ['};', '    ];', ')']) assert.ok(decrease.test(line));
  }
});
