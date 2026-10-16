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
    const compatibility = 'private _text = "a\u00a0b\u202fc\u200bd\u0001e";\nprivate _a=1, _b=2;\nif (isNil"_missing") then {};\nfor"_i"from 0 to 1 do {};\nobjNull setDammage 0;\nobjNull addWeapon ["arifle_MX_F",true];\ncontrolNull ctrlWebBrowserAction ["Deflate","data"];\n#if __has_include("test.hpp")\nprivate _available = true;\n#endif\n/* native preprocessing removes this';
    await fs.writeFile(path.join(fixture, 'mission/compat.sqf'), compatibility);
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
    await open('mission/description.ext', '#include "config.hpp"\n');
    await open('shared/config.hpp', '#define CFG_VALUE 1\nclass Test { value = CFG_VALUE; };\n');
    await change('shared/config.hpp', '\uFEFF#define CFG_VALUE 1\nclass Test { value = CFG_VALUE; };\n', 2);
    await eventually(() => diagnostics('shared/config.hpp').some(d => d.code === 'BOM'), 'included config-header BOM policy');
    await change('shared/config.hpp', '#define CFG_VALUE 1\nclass Test { value = CFG_VALUE; };\n', 3);
    await eventually(() => !diagnostics('shared/config.hpp').some(d => d.code === 'BOM'), 'included config-header BOM repair');
    await change('shared/config.hpp', '#define CFG_VALUE 1\nclass Test { value[] = {1,,}; };\n', 4);
    await eventually(() => [...diags.values()].flat().some(d => /^(CCHU|L-C01|L-C08)/.test(d.code)), 'config-header unsaved error');
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
