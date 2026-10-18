// Real protocol test. No VS Code mocks, no engine execution, no worktree edits.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { createMessageConnection } = require('vscode-jsonrpc/node');
const { Host, hoverMarkdown } = require('../src/shared');
const { startTransport } = require('../src/transport');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function eventually(check, label, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await check()) return; await sleep(100); }
  throw new Error('Timed out: ' + label);
}
async function main() {
  const extension = path.resolve(__dirname, '..'), root = require('../scripts/project').armaRepository();
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'lyl-lsp-'));
  const fixture = path.join(temp, 'repo'), stage = path.join(temp, 'snapshot');
  const log = [];
  let host, transport, rpc;
  try {
    for (const folder of ['tests/sqf/commands', 'mission', 'shared', '@life_server', '@life_hc', '@life_shared', 'z_cmd']) await fs.mkdir(path.join(fixture, folder), { recursive: true });
    for (const name of ['reference.json', 'contracts.json']) await fs.copyFile(path.join(root, 'tests/sqf/commands', name), path.join(fixture, 'tests/sqf/commands', name));
    await fs.copyFile(path.join(root, 'tests/sqf/syntax.json'), path.join(fixture, 'tests/sqf/syntax.json'));
    await fs.writeFile(path.join(fixture, 'tests/sqf/commands/contexts.json'), JSON.stringify({ schema: 1, files: { 'mission/context.sqf': { role: 'hc', scheduling: 'unscheduled', evidence: 'Integration fixture' } } }));
    await fs.writeFile(path.join(fixture, 'shared/test.hpp'), '#define VALUE 1\n');
    const script = '#include "test.hpp"\nprivate _x = VALUE;\n_x';
    await fs.writeFile(path.join(fixture, 'mission/live.sqf'), script);
    await fs.writeFile(path.join(fixture, 'mission/context.sqf'), 'owner objNull; sleep 1;');
    await fs.writeFile(path.join(fixture, 'mission/description.ext'), '#include "config.hpp"\n');
    await fs.writeFile(path.join(fixture, 'shared/config.hpp'), '#define CFG_VALUE 1\nclass Test { value = CFG_VALUE; };\n');
    const functionsConfig = '#define DOC_TAG "TEST"\nurls[]={"https://example.test/*", "a/*b*/c"};\nclass CfgFunctions { class Namespace { tag = DOC_TAG; class Group { file = "functions"; class registered; class override { file = "custom.sqf"; }; }; }; };\n/* actual comment */\n';
    await fs.writeFile(path.join(fixture, 'shared/functions.hpp'), functionsConfig);
    await fs.appendFile(path.join(fixture, 'mission/description.ext'), '#include "functions.hpp"\n');
    const compatibility = 'private _text = "a\u00a0b\u202fc\u200bd\u0001e";\nprivate _a=1, _b=2;\nif (isNil"_missing") then {};\nfor"_i"from 0 to 1 do {};\nobjNull setDammage 0;\nobjNull addWeapon ["arifle_MX_F",true];\ncontrolNull ctrlWebBrowserAction ["Deflate","data"];\n#if __has_include("test.hpp")\nprivate _available = true;\n#endif\n/* native preprocessing removes this';
    await fs.writeFile(path.join(fixture, 'mission/compat.sqf'), compatibility);
    const nativeDiagnostics = 'format ["%2", "unused", "two"];\nformat ["%1", 1, 2];\nformat ["%3", 1];\n"probe" addPublicVariableEventHandler {};\n';
    await fs.writeFile(path.join(fixture, 'mission/native-diagnostics.sqf'), nativeDiagnostics);
    const callbackDiagnostics = 'params [["_sentinel", "", [[]]]];\nG_stop = {G_first = nil};\nG_first = addMissionEventHandler ["Ended", {call G_stop}];\nprivate _second = addMissionEventHandler ["MPEnded", {call G_stop}];\nremoveMissionEventHandler ["Ended", G_first];\naddMissionEventHandler ["Ended", {player setFuel true}];\nparams [["_broken", 0, "wrong schema"]];\n';
    await fs.writeFile(path.join(fixture, 'mission/callback-diagnostics.sqf'), callbackDiagnostics);
    await fs.writeFile(path.join(fixture, 'mission/consumer.ext'), '#define WIDTH 42\n#include "fragment.cpp"\n');
    await fs.writeFile(path.join(fixture, 'mission/fragment.cpp'), 'class Compat { name = "original"; width = WIDTH; };\n');
    await fs.writeFile(path.join(fixture, 'mission/disk-bom.sqf'), '\uFEFFprivate _text = "Grüße";\n');
    // Exercise backend shared forwarding includes too.
    await fs.writeFile(path.join(fixture, '@life_shared/script_macros.hpp'), '#include "test.hpp"\n');
    await fs.writeFile(path.join(fixture, '@life_server/backend.sqf'), '#include "\\life_shared\\script_macros.hpp"\nVALUE');
    host = new Host(path.join(extension, 'server/LYL.Sqf.EditorHost.exe'), fixture, stage, l => log.push(l));
    const snapshot = await host.request('prepare', { arma: process.env.LYL_ARMA_DIRECTORY || 'D:/Games/Steam/steamapps/common/Arma 3' });
    assert.ok(snapshot.files.some(f => f.source.endsWith('description.ext')));
    assert.ok(snapshot.files.filter(f => f.source.endsWith('test.hpp')).length >= 4, 'shared overlays staged for each component');
    assert.equal(snapshot.limitations.length, 0, JSON.stringify(snapshot.limitations));
    const context = await host.request('analyze', { path: 'mission/context.sqf', text: 'owner objNull; sleep 1;' });
    assert.equal(context.findings.filter(f => f.severity === 'error').length, 2);
    const unknown = await host.request('analyze', { path: 'mission/live.sqf', text: 'owner objNull; sleep 1;' });
    assert.equal(unknown.findings.filter(f => f.severity === 'review').length, 2);
    const stored = await host.request('analyze', { path: 'mission/context.sqf', text: 'private _callback = { owner objNull; sleep 1; };' });
    assert.ok(stored.findings.every(f => f.severity === 'review'));
    const hover = hoverMarkdown(await host.request('hover', { command: 'owner' }));
    assert.ok(hover.includes('headless client') && hover.includes('server'));
    // Upstream raw TOML lints must inspect the same dirty sources as the parser.
    await fs.mkdir(path.join(stage, '.hemtt/lints'), { recursive: true });
    await fs.writeFile(path.join(stage, '.hemtt/lints/raw.toml'), 'message = "Raw source marker"\n[sqf.file]\npatterns = ["DIRTY_MARKER"]\n[config.file]\npatterns = ["DIRTY_MARKER"]\n');
    transport = await startTransport(path.join(extension, 'server/hemtt-language-server.exe'), host, snapshot, fixture, l => log.push(l));
    rpc = createMessageConnection(transport.reader, transport.writer); const diags = new Map();
    const sendRequest = rpc.sendRequest.bind(rpc);
    rpc.sendRequest = (method, ...args) => Promise.race([sendRequest(method, ...args), new Promise((_, reject) => { const t = setTimeout(() => reject(new Error('LSP request timed out: ' + method)), 20000); t.unref(); })]);
    rpc.onRequest('workspace/workspaceFolders', () => [{ uri: pathToFileURL(fixture).href, name: 'fixture' }]);
    rpc.onRequest('workspace/diagnostic/refresh', () => null);
    rpc.onRequest('client/registerCapability', () => null);
    rpc.onNotification('textDocument/publishDiagnostics', p => diags.set(p.uri.toLowerCase(), p.diagnostics));
    rpc.listen();
    const capabilities = await rpc.sendRequest('initialize', { processId: process.pid, rootUri: pathToFileURL(fixture).href, workspaceFolders: [{ uri: pathToFileURL(fixture).href, name: 'fixture' }], capabilities: { workspace: { workspaceFolders: true, diagnostics: { refreshSupport: true } } } });
    assert.equal(capabilities.capabilities.textDocumentSync, 1);
    await rpc.sendNotification('initialized', {});
    const uri = file => pathToFileURL(path.join(fixture, file)).href;
    const diagnostics = file => diags.get(uri(file).toLowerCase()) || [];
    const open = async (file, text, version = 1) => rpc.sendNotification('textDocument/didOpen', { textDocument: { uri: uri(file), languageId: file.endsWith('.sqf') ? 'sqf' : 'arma-config', version, text } });
    const change = async (file, text, version) => rpc.sendNotification('textDocument/didChange', { textDocument: { uri: uri(file), version }, contentChanges: [{ text }] });
    await open('mission/live.sqf', script);
    await open('mission/compat.sqf', compatibility);
    await open('mission/native-diagnostics.sqf', nativeDiagnostics);
    await open('mission/callback-diagnostics.sqf', callbackDiagnostics);
    await eventually(() => diagnostics('mission/callback-diagnostics.sqf').filter(d => d.code === 'L-S12').length >= 2, 'callback body and malformed schema diagnostics');
    const callbackFindings = diagnostics('mission/callback-diagnostics.sqf').filter(d => d.code === 'L-S12');
    assert.ok(callbackFindings.every(d => [5, 6].includes(d.range.start.line)), JSON.stringify(callbackFindings));
    assert.ok(callbackFindings.some(d => d.range.start.line === 5), 'invalid callback body still diagnosed');
    assert.ok(callbackFindings.some(d => d.range.start.line === 6), 'invalid params schema still diagnosed');
    console.log('PASS native params sentinels and callback registration state');
    await eventually(() => diagnostics('mission/native-diagnostics.sqf').some(d => d.code === 'L-S09'), 'native diagnostic findings');
    const nativeFindings = diagnostics('mission/native-diagnostics.sqf');
    assert.ok(!nativeFindings.some(d => d.code === 'L-S08' && d.range.start.line === 0), 'skipped indices are supported');
    assert.ok(nativeFindings.some(d => d.code === 'L-S08' && d.range.start.line === 1 && d.severity === 2), 'unused argument is advisory');
    assert.ok(nativeFindings.some(d => d.code === 'L-S08' && d.range.start.line === 2 && d.severity === 1), 'missing argument remains an error');
    assert.ok(nativeFindings.some(d => d.code === 'L-S09' && d.severity === 2), 'ordinary public variable handler is advisory');
    await open('mission/fragment.cpp', 'class Compat { name = "original"; width = WIDTH; };\n');
    await change('mission/fragment.cpp', 'class Compat { name = "dirty"; width = WIDTH; };\n', 2);
    await eventually(async () => JSON.stringify(await rpc.sendRequest('hemtt/config/structure', { url: uri('mission/consumer.ext'), classes: ['Compat'] })).includes('dirty'), 'included CPP dirty refresh through its parent macro context');
    assert.ok(!diagnostics('mission/fragment.cpp').some(d => d.code === 'L-C01'), 'fragment is not independently parsed without parent macros');
    assert.equal(await fs.readFile(path.join(fixture, 'mission/fragment.cpp'), 'utf8'), 'class Compat { name = "original"; width = WIDTH; };\n');
    console.log('PASS native diagnostic severities and included CPP parent/dirty context');
    // Request barrier: hover/token processing means the initial open ran.
    await eventually(async () => {
      const result = await rpc.sendRequest('hemtt/processed', { url: uri('mission/live.sqf') });
      return result?.includes('_x = 1');
    }, 'initial macro expansion');
    console.log('PASS initial expansion');
    await change('mission/live.sqf', 'private _x = ;', 2);
    await eventually(() => diagnostics('mission/live.sqf').some(d => /^SPE/.test(d.code)), 'unsaved syntax diagnostic');
    await change('mission/live.sqf', script, 3);
    await eventually(() => !diagnostics('mission/live.sqf').some(d => /^SPE/.test(d.code)), 'syntax diagnostic cleared without save');
    console.log('PASS unsaved SQF diagnostics');
    // VS Code's text model hides an encoding BOM. Opening/editing must not
    // silently remove the disk violation from the disposable analysis snapshot.
    await open('mission/disk-bom.sqf', 'private _text = "Grüße";\n');
    await eventually(() => diagnostics('mission/disk-bom.sqf').some(d => d.code === 'BOM'), 'saved BOM survives editor normalization');
    await change('mission/disk-bom.sqf', 'private _text = "Grüße!";\n', 2);
    await eventually(() => diagnostics('mission/disk-bom.sqf').some(d => d.code === 'BOM'), 'editing does not hide saved BOM');
    await fs.writeFile(path.join(fixture, 'mission/disk-bom.sqf'), 'private _text = "Grüße";\n');
    await change('mission/disk-bom.sqf', 'private _text = "Grüße";\n', 3);
    await eventually(() => !diagnostics('mission/disk-bom.sqf').some(d => d.code === 'BOM'), 'saved encoding repair clears BOM');
    await change('mission/live.sqf', '\uFEFF' + script, 4);
    await eventually(() => diagnostics('mission/live.sqf').some(d => d.code === 'BOM'), 'unsaved SQF BOM policy');
    await change('mission/live.sqf', script, 5);
    await eventually(() => !diagnostics('mission/live.sqf').some(d => d.code === 'BOM'), 'SQF BOM policy clears after repair');
    await open('shared/test.hpp', '#define VALUE 1\n');
    await change('shared/test.hpp', '\uFEFF#define VALUE 1\n', 2);
    await eventually(() => diagnostics('shared/test.hpp').some(d => d.code === 'BOM'), 'included-header BOM policy');
    await change('shared/test.hpp', '#define VALUE 1\n', 3);
    await eventually(() => !diagnostics('shared/test.hpp').some(d => d.code === 'BOM'), 'included-header BOM repair');
    await change('shared/test.hpp', '#define VALUE )\n', 4);
    await eventually(() => [...diags.values()].flat().some(d => /^SPE/.test(d.code)), 'unsaved included-header invalidation');
    await change('shared/test.hpp', '#define VALUE 2\n', 5);
    await eventually(async () => (await rpc.sendRequest('hemtt/processed', { url: uri('mission/live.sqf') }))?.includes('_x = 2'), 'dirty include expansion');
    console.log('PASS dirty headers');
    assert.equal(await fs.readFile(path.join(fixture, 'shared/test.hpp'), 'utf8'), '#define VALUE 1\n', 'worktree header untouched');
    await rpc.sendNotification('textDocument/didClose', { textDocument: { uri: uri('shared/test.hpp') } });
    await fs.writeFile(path.join(fixture, 'shared/test.hpp'), '#define VALUE 3\n');
    await host.request('update', { path: 'shared/test.hpp', text: '#define VALUE 3\n' });
    await rpc.sendNotification('workspace/didChangeWatchedFiles', { changes: [{ uri: uri('shared/test.hpp'), type: 2 }] });
    await eventually(async () => (await rpc.sendRequest('hemtt/processed', { url: uri('mission/live.sqf') }))?.includes('_x = 3'), 'saved included-header invalidation');
    const definition = await rpc.sendRequest('textDocument/definition', { textDocument: { uri: uri('mission/live.sqf') }, position: { line: 1, character: 14 } });
    assert.ok(JSON.stringify(definition).toLowerCase().includes('test.hpp'), 'macro navigation maps back to original header');
    const completion = await rpc.sendRequest('textDocument/completion', { textDocument: { uri: uri('mission/live.sqf') }, position: { line: 2, character: 0 }, context: { triggerKind: 1 } });
    assert.ok(completion && (Array.isArray(completion) ? completion.length : completion.items.length) > 0, 'command completion');
    await change('mission/live.sqf', 'getPo', 6);
    await eventually(async () => {
      const candidates = await rpc.sendRequest('textDocument/completion', { textDocument: { uri: uri('mission/live.sqf') }, position: { line: 0, character: 5 }, context: { triggerKind: 1 } });
      return (Array.isArray(candidates) ? candidates : candidates?.items || []).some(item => item.label.toLowerCase() === 'getpos');
    }, 'command prefix completion');
    console.log('PASS navigation and completion');
    const { registrations } = require('../src/authoring');
    const rootConfig = { path: 'mission/description.ext', virtualPrefix: '/' };
    await eventually(async () => {
      const structure = await rpc.sendRequest('hemtt/config/structure', { url: uri(rootConfig.path), classes: ['CfgFunctions'] });
      assert.deepEqual(structure.limitations, []);
      return registrations(structure.properties, rootConfig).functions.some(f => f.name === 'TEST_fnc_registered' && f.virtualPath === '/functions/fn_registered.sqf');
    }, 'exact-root CfgFunctions with included macros and forward registration');
    await open('shared/functions.hpp', functionsConfig);
    await change('shared/functions.hpp', functionsConfig.replace('"TEST"', '"DIRTY"').replace('"custom.sqf"', '"unsaved.sqf"'), 2);
    await eventually(async () => {
      const structure = await rpc.sendRequest('hemtt/config/structure', { url: uri(rootConfig.path), classes: ['CfgFunctions'] });
      const functions = registrations(structure.properties, rootConfig).functions;
      return functions.some(f => f.name === 'DIRTY_fnc_override' && f.virtualPath === '/unsaved.sqf') && !functions.some(f => f.name.startsWith('TEST_'));
    }, 'unsaved included CfgFunctions tag and file override');
    await rpc.sendNotification('textDocument/didClose', { textDocument: { uri: uri('shared/functions.hpp') } });
    await eventually(async () => registrations((await rpc.sendRequest('hemtt/config/structure', { url: uri(rootConfig.path), classes: ['CfgFunctions'] })).properties, rootConfig).functions.some(f => f.name === 'TEST_fnc_registered'), 'discard restores registered functions');
    await open('mission/description.ext', '#define BAD(a,b) a\n__EXEC(_value = call { str (1 + 2) }; _text = "a ) (";)\nunsupported = {not_a_config_literal};\nunknown = BAD(1);\n#include "functions.hpp"\n');
    await eventually(async () => {
      const structure = await rpc.sendRequest('hemtt/config/structure', { url: uri(rootConfig.path), classes: ['CfgFunctions'] });
      return structure.provisional?.some(message => message.includes('PE25') && message.includes('not executed')) && structure.provisional.some(message => message.includes('PE9')) &&
        registrations(structure.properties, rootConfig).functions.some(f => f.name === 'TEST_fnc_registered');
    }, 'unsupported EXEC retains literal registrations with explicit provisional findings');
    await eventually(() => [...diags.values()].flat().some(d => d.code === 'PE25'), 'ordinary diagnostics retain unsupported EXEC failure');
    await change('mission/description.ext', 'class CfgFunctions {};\n', 2);
    await eventually(async () => !registrations((await rpc.sendRequest('hemtt/config/structure', { url: uri(rootConfig.path), classes: ['CfgFunctions'] })).properties, rootConfig).functions.length, 'dirty root include removal clears registrations');
    await change('mission/live.sqf', '#define TEST_MACRO(first,second) [first,second]\nTEST_MACRO(1,2)', 7);
    await eventually(async () => {
      const signature = await rpc.sendRequest('textDocument/signatureHelp', { textDocument: { uri: uri('mission/live.sqf') }, position: { line: 1, character: 13 } });
      return signature?.signatures.some(s => s.label.includes('TEST_MACRO(first, second)'));
    }, 'existing function-like macro signature help');
    console.log('PASS exact config roots, dirty included registrations, overrides, discard, provisional EXEC, root include removal and preserved macro signatures');
    await change('mission/description.ext', '#include "config.hpp"\n', 3);
    await open('shared/config.hpp', '#define CFG_VALUE 1\nclass Test { value = CFG_VALUE; };\n');
    await change('shared/config.hpp', '\uFEFF#define CFG_VALUE 1\nclass Test { value = CFG_VALUE; };\n', 2);
    await eventually(() => diagnostics('shared/config.hpp').some(d => d.code === 'BOM'), 'included config-header BOM policy');
    await change('shared/config.hpp', '#define CFG_VALUE 1\nclass Test { value = CFG_VALUE; };\n', 3);
    await eventually(() => !diagnostics('shared/config.hpp').some(d => d.code === 'BOM'), 'included config-header BOM repair');
    await change('shared/config.hpp', '#define CFG_VALUE 1\nclass Test { value[] = {1,,}; };\n', 4);
    await eventually(() => [...diags.values()].flat().some(d => /^(CCHU|L-C01|L-C08)/.test(d.code)), 'config-header unsaved error');
    await change('shared/config.hpp', '#define CFG_VALUE 1\nclass Test { value = CFG_VALUE; };\n', 5);
    await change('mission/live.sqf', script + '\n// DIRTY_MARKER\n', 8);
    await eventually(() => diagnostics('mission/live.sqf').some(d => d.code === 'L-TOML'), 'raw TOML lint sees dirty SQF comment');
    await change('mission/live.sqf', script, 9);
    await eventually(() => !diagnostics('mission/live.sqf').some(d => d.code === 'L-TOML'), 'raw TOML SQF repair clears without save');
    await change('mission/description.ext', '#include "config.hpp"\n// DIRTY_MARKER\n', 4);
    await eventually(() => diagnostics('mission/description.ext').some(d => d.code === 'L-TOML'), 'raw TOML lint sees dirty config comment');
    await change('mission/description.ext', '#include "config.hpp"\n', 5);
    await eventually(() => !diagnostics('mission/description.ext').some(d => d.code === 'L-TOML'), 'raw TOML config repair clears without save');
    assert.equal(await fs.readFile(path.join(fixture, 'mission/live.sqf'), 'utf8'), script, 'SQF TOML checks never write original source');
    assert.equal(await fs.readFile(path.join(fixture, 'mission/description.ext'), 'utf8'), '#include "config.hpp"\n#include "functions.hpp"\n', 'config TOML checks never write original source');
    const copiedPath = await rpc.sendRequest('hemtt/path_copy', { url: uri('mission/live.sqf') });
    assert.equal(typeof copiedPath, 'string');
    assert.ok(copiedPath.endsWith('\\live.sqf') && !copiedPath.includes('/'), 'upstream path-copy endpoint retained alongside structure/performance methods');
    console.log('PASS dirty SQF/config raw TOML findings and repair; upstream path copy');
    const forbidden = diagnostics('mission/compat.sqf').filter(d => /^(SPE|PE)/.test(d.code));
    assert.deepEqual(forbidden, [], 'all fork compatibility regressions pass through actual LSP');
    console.log('PASS: shared layout, installed headers, HC/unscheduled and unresolved contexts, rich hover, unsaved SQF/config diagnostics, header invalidation, macro navigation, completion, fork compatibility regressions; worktree untouched.');
    await fs.mkdir(path.join(extension, 'test-results'), { recursive: true });
    await fs.writeFile(path.join(extension, 'test-results/protocol.json'), JSON.stringify({ successful: true, snapshotFiles: snapshot.files.length, limitations: snapshot.limitations, diagnostics: Object.fromEntries(diags) }, null, 2));
    await rpc.sendRequest('shutdown'); await rpc.sendNotification('exit');
  } catch (error) { console.error(log.slice(-35).join('\n')); throw error; }
  finally { rpc?.dispose(); transport?.dispose(); host?.dispose(); await fs.rm(temp, { recursive: true, force: true }).catch(() => {}); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
