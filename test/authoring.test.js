const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { wikiUrl, functionMarkdown, hintCandidates, commandSignatures, registrations } = require('../src/authoring');
const cls = (name, properties = [], extra = {}) => ({ kind: 'class', name, properties, ...extra });
const entry = (name, literal) => ({ kind: 'entry', name, literal });

test('wiki page resolution never allows selection to alter origin, query or fragment', () => {
  assert.equal(wikiUrl('GETPOS', 'getPos'), 'https://community.bistudio.com/wiki/getPos');
  const url = new URL(wikiUrl('https://evil.test/a?x=1#frag'));
  assert.equal(url.origin, 'https://community.bistudio.com'); assert.equal(url.search, ''); assert.equal(url.hash, '');
  assert.ok(url.pathname.includes('%3F')); assert.equal(wikiUrl(''), undefined); assert.equal(wikiUrl('a\nb'), undefined);
  assert.ok(wikiUrl('!').endsWith('%21'));
});

test('BIS dataset distinguishes functions, preserves parameters and missing returns and excludes CBA/ACE', () => {
  const data = require('../data/bis-functions.json');
  assert.equal(data.functions.length, 1667);
  for (const fn of data.functions) assert.match(fn.title, /^BIS_fnc_/i);
  const text = functionMarkdown({ title: 'BIS_fnc_example', syntaxes: [{ args: [{ name: 'arg' }] }] }, 'test source');
  assert.match(text, /BIS function/); assert.match(text, /Unspecified/); assert.match(text, /Provenance: test source/);
});

const names = new Set(['setvariable', 'select', 'format', 'getpos', 'count']);
function hints(text, doc, marker = '|') {
  const offset = text.indexOf(marker), source = text.replace(marker, '');
  const candidates = hintCandidates(source, offset, names);
  return candidates.map(c => ({ candidate: c, help: commandSignatures(doc[c.name.toLowerCase()], c) }));
}
const docs = { setvariable: { revision: 'reviewed', command: { name: 'setVariable', syntax: [{ call: { kind: 'Binary', arguments: ['target', ['name', 'value', 'public']] }, params: [{ name: 'target', type: 'Object' }, { name: 'name', type: 'String' }, { name: 'value', type: 'Anything' }, { name: 'public', type: 'Boolean' }], ret: ['Nothing'] }] } },
  getpos: { revision: 'reviewed', command: { name: 'getPos', syntax: [
    { call: { kind: 'Unary', arguments: 'object' }, params: [{ name: 'object', type: 'Object' }] },
    { call: { kind: 'Unary', arguments: 'location' }, params: [{ name: 'location', type: 'Location' }] },
    { call: { kind: 'Binary', arguments: ['origin', ['distance', 'heading']] }, params: [{ name: 'origin' }, { name: 'distance' }, { name: 'heading' }] }
  ] } } };

test('command hints count only the owning array and retain nested expression as one parameter', () => {
  assert.equal(hints('_unit setVariable ["key", [1, [2, 3|]], true]', docs)[0].help.activeParameter, 2);
  assert.equal(hints('_unit setVariable ["k,[]", [1,2], |true]', docs)[0].help.activeParameter, 3);
  assert.equal(hints('_unit setVariable ["key", (getPos _unit), |true]', docs)[0].help.activeParameter, 3);
  assert.equal(hints('_unit setVariable ["key", /* , ] */ |1]', docs)[0].help.activeParameter, 2);
  assert.equal(hints('_unit setVariable ["na|me", 1]', docs)[0].help.activeParameter, 1);
  assert.equal(hints('// getPos |', docs).length, 0);
  assert.equal(hints('"getPos |"', docs).length, 0);
  assert.equal(hints('_unit setVariable ["key", 1]; |', docs).length, 0);
  assert.equal(hints('format [TEST_MACRO(1, |2)]', docs).length, 0, 'nested macro hints keep precedence over an outer engine command');
});

test('unary and binary overloaded commands retain alternatives without invented type selection', () => {
  const unary = hints('getPos |objNull', docs)[0].help;
  assert.equal(unary.signatures.filter(s => s.label.includes('getPos object') || s.label.includes('getPos location')).length, 2);
  assert.equal(unary.signatures.length, 2);
  const binary = hints('_origin getPos [100, |45]', docs)[0].help;
  assert.equal(binary.signatures.length, 1); assert.equal(binary.activeParameter, 2);
  assert.match(binary.signatures[0].documentation, /reviewed/);
});

test('config registrations use explicit tags, inherited categories and function file/extension overrides', () => {
  const result = registrations([cls('CfgFunctions', [cls('Namespace', [entry('tag', 'TEST'),
    cls('Base', [entry('file', 'functions/base'), cls('first', [], { external: true })]),
    cls('Derived', [entry('file', 'functions/other'), entry('ext', '.fsm'), cls('second', [entry('file', '/addon/custom.sqf')])], { parent: 'Base' })])])], { path: 'mission/description.ext', virtualPrefix: '/' });
  assert.equal(result.functions.length, 3);
  assert.ok(result.functions.some(f => f.name === 'TEST_fnc_first' && f.virtualPath === '/functions/base/fn_first.sqf'));
  assert.ok(result.functions.some(f => f.scope.includes('Derived/first') && f.virtualPath === '/functions/other/fn_first.fsm'));
  assert.ok(result.functions.some(f => f.name === 'TEST_fnc_second' && f.virtualPath === '/addon/custom.sqf'));
});

test('unresolved tags, inheritance, paths and external categories are explicit; never derive names from files', () => {
  const result = registrations([cls('CfgFunctions', [cls('Tag', [cls('External', [], { external: true }), cls('Functions', [cls('registered', [])], { parent: 'Unknown' })]), cls('Dynamic', [entry('tag', null), cls('Group', [cls('hidden')])])])], { path: 'root', virtualPrefix: '/addon' });
  assert.deepEqual(result.functions.map(f => f.name), ['Tag_fnc_registered']);
  assert.ok(result.functions[0].unresolved.length >= 2);
  for (const expected of ['External', 'inheritance', 'location', 'tag']) assert.ok(result.findings.some(f => (f.scope + f.message).includes(expected)), expected);
});

test('snippets and contributions include requested authoring actions and real tabstops', () => {
  const pkg = require('../package.json'), snippets = require('../snippets/sqf.json');
  assert.ok(pkg.contributes.keybindings.some(k => k.key === 'ctrl+shift+q' && k.when.includes('editorTextFocus')));
  for (const prefix of ['ifthen', 'ifelse', 'foreach', 'forrange', 'while', 'switch', 'params', 'callfnc', 'spawn', 'execVM', 'waitUntil', 'addeh']) {
    const snippet = Object.values(snippets).find(s => s.prefix === prefix); assert.ok(snippet, prefix); assert.match(snippet.body.join('\n'), /\$\{1:/);
  }
  assert.match(Object.values(snippets).find(s => s.prefix === 'waitUntil').description, /first evaluation/);
  assert.ok(fs.existsSync(require('node:path').join(__dirname, '../licenses/SQFLint.txt')));
});
