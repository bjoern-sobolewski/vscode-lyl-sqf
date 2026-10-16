const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(predicate, label, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await predicate()) return; await sleep(200); }
  throw new Error('Timed out: ' + label);
}
async function run() {
  const root = process.env.LYL_EDITOR_ROOT, reportFile = process.env.LYL_EDITOR_REPORT;
  const findings = [];
  const mark = value => { findings.push(value); console.log('PASS ' + value); };
  const extension = vscode.extensions.getExtension('liveyourlife.lyl-sqf');
  assert.ok(extension, 'packaged extension discovered');
  const api = await extension.activate(); assert.ok(api.ready); mark('packaged VSIX activation and automatic verified provisioning');
  const session = api.sessions[0];
  const file = path.join(root, 'mission/core/inv/fn_majorLootReturnPlan.sqf'), uri = vscode.Uri.file(file);
  const bytes = await fs.readFile(file), originalHash = crypto.createHash('sha256').update(bytes).digest('hex');
  const document = await vscode.workspace.openTextDocument(uri); await vscode.window.showTextDocument(document);
  const autoSave = vscode.workspace.getConfiguration('files', document).get('autoSave');
  console.log('Effective SQF auto-save: ' + autoSave);
  assert.equal(autoSave, 'off', 'Repository buffer tests require effective auto-save off before any edit');
  const original = document.getText();
  async function replace(text) {
    const edit = new vscode.WorkspaceEdit(); edit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
    assert.ok(await vscode.workspace.applyEdit(edit));
  }
  try {
    assert.equal(document.languageId, 'sqf');
    await replace('private _x = ;\nowner objNull;\nsleep 1;');
    await assert.rejects(session.run(['--verify-file', file]), /saved repository bytes/);
    await eventually(() => vscode.languages.getDiagnostics(uri).some(d => String(typeof d.code === 'object' ? d.code.value : d.code).startsWith('SPE')), 'dirty parser syntax error');
    await eventually(() => vscode.languages.getDiagnostics(uri).filter(d => d.source === 'LYL command context').length === 2, 'shared unresolved context findings');
    assert.ok(vscode.languages.getDiagnostics(uri).some(d => d.message.includes('unresolved context'))); mark('unsaved diagnostics and unresolved execution context in the real repository');
    const hovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', uri, new vscode.Position(1, 2));
    const hover = hovers.flatMap(h => h.contents.map(c => c.value || String(c))).join('\n');
    for (const value of ['Overload', 'Engine version', 'locality', 'Scheduling', 'server', 'headless']) assert.ok(hover.toLowerCase().includes(value.toLowerCase()), value);
    mark('command hover: overloads, types, version, locality, scheduling and HC restriction');
    await replace('private _x = 1;\n');
    await eventually(() => !vscode.languages.getDiagnostics(uri).some(d => /^(SPE|LYL-SQF)/.test(String(typeof d.code === 'object' ? d.code.value : d.code))), 'diagnostics clear on dirty repair');
    mark('repair clears stale diagnostics without saving');
    await replace('\uFEFFprivate _s = "Grüße";\n');
    await eventually(() => vscode.languages.getDiagnostics(uri).some(d => String(typeof d.code === 'object' ? d.code.value : d.code) === 'BOM' && d.message.includes('[policy]')), 'dirty BOM encoding policy');
    await replace('private _s = "Grüße";\n');
    await eventually(() => !vscode.languages.getDiagnostics(uri).some(d => String(typeof d.code === 'object' ? d.code.value : d.code) === 'BOM'), 'BOM encoding policy repair');
    mark('BOM rejected as policy and cleared after unsaved repair; Unicode retained');
    await replace('getPo');
    await eventually(async () => {
      const completion = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', uri, new vscode.Position(0, 5));
      return completion.items.some(item => (typeof item.label === 'string' ? item.label : item.label.label).toLowerCase() === 'getpos');
    }, 'command completion after buffer synchronization');
    mark('fork command completion in VS Code');
    await replace(original);
    await vscode.commands.executeCommand('workbench.action.files.revert');
    assert.equal(document.isDirty, false);
    assert.equal(crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'), originalHash); mark('repository bytes preserved');
    const gateExit = await vscode.commands.executeCommand('lylSqf.verifySelected', uri);
    assert.ok(gateExit === 0 || gateExit === 1, 'verification command reports the actual shared gate exit');
    mark('selected-file command executed the shared verifier (exit ' + gateExit + '; existing findings retained)');
    const suites = await session.host.request('tests', { files: [file] }); assert.ok(suites.some(s => s.id === 'loot.matching'));
    assert.equal(await session.run(['--runtime', 'sqfvm', '--suite', 'loot.matching']), 0); mark('relevant existing loot.matching suite executed through the shared published host');
    // Allow full-repository background diagnostics to settle; retain backlog.
    await sleep(3000);
    const categories = {}, codes = {};
    for (const diagnostics of session.transport.diagnostics.values()) for (const d of diagnostics) { codes[d.code] = (codes[d.code] || 0) + 1; }
    for (const [, diagnostics] of vscode.languages.getDiagnostics()) for (const d of diagnostics) { const label = d.message.match(/^\[([^\]]+)\]/)?.[1] || d.source || 'other'; categories[label] = (categories[label] || 0) + 1; }
    const commands = await vscode.commands.getCommands(true);
    for (const command of ['lylSqf.verifySelected', 'lylSqf.verifyChanged', 'lylSqf.runRelevantTests', 'lylSqf.showProcessed']) assert.ok(commands.includes(command));
    mark('local verification/test commands registered; full repository diagnostic backlog retained');
    await fs.writeFile(reportFile, JSON.stringify({ successful: true, tests: findings, forkRevision: session.tools.manifest.forkRevision, repositoryHashPreserved: originalHash, fullRepository: { diagnosticAliases: session.transport.diagnostics.size, categories, codes }, limits: 'Static editor integration and SQF-VM suite only; no new native or multiplayer validation.' }, null, 2));
  } finally {
    if (document.isDirty) { await replace(original); await vscode.commands.executeCommand('workbench.action.files.revert'); }
    assert.equal(crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'), originalHash, 'disk bytes must remain unchanged throughout unsaved-buffer tests');
  }
}
module.exports = { run: async () => {
  let timer;
  try {
    await Promise.race([run(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Packaged VS Code test exceeded 180 seconds')), 180000); })]);
  } finally { clearTimeout(timer); }
} };
