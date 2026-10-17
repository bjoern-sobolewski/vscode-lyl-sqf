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
  async function colors(document) {
    const legend = await vscode.commands.executeCommand('vscode.provideDocumentSemanticTokensLegend', document.uri);
    const result = await vscode.commands.executeCommand('vscode.provideDocumentSemanticTokens', document.uri);
    assert.ok(legend?.tokenTypes && result?.data, 'registered semantic token provider');
    const tokens = []; let line = 0, character = 0;
    for (let i = 0; i < result.data.length; i += 5) {
      const [deltaLine, deltaCharacter, length, type, modifiers] = result.data.slice(i, i + 5);
      line += deltaLine; character = deltaLine ? deltaCharacter : character + deltaCharacter;
      const text = document.getText(new vscode.Range(line, character, line, character + length));
      tokens.push({ text, type: legend.tokenTypes[type], modifiers: legend.tokenModifiers.filter((_, bit) => modifiers & (1 << bit)) });
    }
    return tokens;
  }
  try {
    assert.equal(document.languageId, 'sqf');
    await session.features.refresh();
    await replace('// 😀 UTF-16 ranges\n#define LYL_COLOR_LIMIT 25\nparams ["_unit", ["_target", objNull]];\n_unit distance _target;\n[_unit] call session_fnc_updateInv;\nBIS_fnc_relPos; ctrlWebBrowserAction; LYL_COLOR_LIMIT;');
    let highlighted = await colors(document);
    for (const name of ['_unit', '_target']) assert.ok(highlighted.some(t => t.text === name && t.type === 'parameter' && t.modifiers.includes('declaration')));
    assert.ok(highlighted.some(t => t.text === '_unit' && t.type === 'parameter' && !t.modifiers.length));
    for (const name of ['session_fnc_updateInv', 'BIS_fnc_relPos', 'ctrlWebBrowserAction']) assert.ok(highlighted.some(t => t.text === name && t.type === 'function'), name);
    assert.equal(highlighted.filter(t => t.text === 'LYL_COLOR_LIMIT' && t.type === 'macro').length, 2);
    await replace('params ["_changed"]; _unit; _changed;');
    highlighted = await colors(document);
    assert.ok(!highlighted.some(t => t.text === '_unit'));
    assert.equal(highlighted.filter(t => t.text === '_changed' && t.type === 'parameter').length, 2);
    mark('semantic function/command, macro and parameter colors follow dirty UTF-16 buffers and repair');
    const indentEditor = await vscode.window.showTextDocument(document);
    indentEditor.options = { insertSpaces: true, tabSize: 4 };
    for (const source of ['if (true) then {}', 'params []']) {
      await replace(source);
      indentEditor.selection = new vscode.Selection(document.positionAt(source.length - 1), document.positionAt(source.length - 1));
      await vscode.commands.executeCommand('type', { text: '\n' });
      assert.match(document.getText(), /[\[{]\r?\n[ \t]+\r?\n[\]}]/, 'Enter indents paired SQF blocks/arrays');
    }
    mark('packaged SQF Enter indentation for code blocks and parameter arrays');
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
    await replace('BIS_fnc_relPo');
    const bisCompletion = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', uri, document.positionAt(document.getText().length));
    assert.ok(bisCompletion.items.some(i => i.label === 'BIS_fnc_relPos' && i.detail.includes('BIS function')));
    await replace('BIS_fnc_relPos');
    const bisHovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', uri, new vscode.Position(0, 6));
    const bisHover = bisHovers.flatMap(h => h.contents.map(c => c.value || String(c))).join('\n');
    for (const value of ['BIS function', 'Provenance', 'Returns:', 'position']) assert.ok(bisHover.includes(value), value);
    mark('packaged BIS function completion, documented arguments/returns and provenance');
    async function signatureAt(text, marker = '|') {
      const offset = text.indexOf(marker); await replace(text.replace(marker, ''));
      return vscode.commands.executeCommand('vscode.executeSignatureHelpProvider', uri, document.positionAt(offset), ',');
    }
    let signature = await signatureAt('_unit setVariable ["key", [1, [2, 3|]], true]');
    assert.ok(signature?.signatures.length);
    assert.equal(signature.signatures[signature.activeSignature || 0].activeParameter ?? signature.activeParameter, 2);
    signature = await signatureAt('_origin getPos [100, |45]');
    assert.ok(signature.signatures.some(s => s.label.includes('heading')));
    assert.equal(signature.signatures[signature.activeSignature || 0].activeParameter ?? signature.activeParameter, 2);
    signature = await signatureAt('getPos |objNull');
    assert.ok(signature.signatures.some(s => s.label.includes('location')));
    assert.ok(signature.signatures.some(s => s.label.includes('object')));
    signature = await signatureAt('_unit addWeapon ["arifle_MX_F", |true]');
    assert.ok(signature.signatures.some(s => s.parameters.some(p => p.label.includes('Boolean'))), 'reviewed Boolean addWeapon correction');
    await replace('#define LYL_HINT(first,second) [first,second]\nformat ["%1", LYL_HINT(1,2)]');
    await eventually(async () => {
      const result = await vscode.commands.executeCommand('vscode.executeSignatureHelpProvider', uri, new vscode.Position(1, 24), ',');
      return result?.signatures.some(s => s.label.includes('LYL_HINT(first, second)'));
    }, 'macro hints alongside command hints');
    mark('packaged command hints: unary/binary overloads, nested arrays, reviewed corrections and preserved macro signatures');
    await session.features.refresh();
    await fs.writeFile(reportFile.replace('results.json', 'function-index.json'), JSON.stringify({ functions: session.features.functions, findings: session.features.findings }, null, 2));
    assert.ok(session.features.functions.some(f => f.name === 'session_fnc_updateInv'), 'actual included mission CfgFunctions');
    assert.ok(session.features.functions.some(f => f.root === '@life_server/config.cpp'), 'actual addon root registrations');
    const initialFunctionCount = session.features.functions.length;
    const configUri = vscode.Uri.file(path.join(root, 'mission/cfg_functions.hpp'));
    const configDocument = await vscode.workspace.openTextDocument(configUri), configOriginal = configDocument.getText();
    const configHash = crypto.createHash('sha256').update(await fs.readFile(configUri.fsPath)).digest('hex');
    assert.equal(vscode.workspace.getConfiguration('files', configDocument).get('autoSave'), 'off', 'Config buffer tests require effective auto-save off before any edit');
    const replaceConfig = async text => {
      const edit = new vscode.WorkspaceEdit(); edit.replace(configUri, new vscode.Range(configDocument.positionAt(0), configDocument.positionAt(configDocument.getText().length)), text);
      assert.ok(await vscode.workspace.applyEdit(edit));
    };
    try {
      await replaceConfig('#define LYL_CONFIG_VALUE 5\nclass Example { value = LYL_CONFIG_VALUE; };');
      assert.equal((await colors(configDocument)).filter(t => t.text === 'LYL_CONFIG_VALUE' && t.type === 'macro').length, 2);
      const configEditor = await vscode.window.showTextDocument(configDocument);
      configEditor.options = { insertSpaces: true, tabSize: 4 };
      await replaceConfig('class Example {}');
      configEditor.selection = new vscode.Selection(0, 15, 0, 15);
      await vscode.commands.executeCommand('type', { text: '\n' });
      assert.match(configDocument.getText(), /\{\r?\n[ \t]+\r?\n\}/);
      mark('packaged config macro colors and class Enter indentation');
      await replaceConfig('class CfgFunctions { class Integration { tag="LYLEDITOR"; class Group { file="core\\inv"; class majorLootReturnPlan; class unresolved {file="/missing/editor-test.sqf";}; }; }; };');
      assert.ok(configDocument.isDirty, 'Config fixture must remain unsaved');
      await replace('LYLEDITOR_fnc_');
      await eventually(async () => {
        const result = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', uri, document.positionAt(document.getText().length));
        return result.items.some(i => i.label === 'LYLEDITOR_fnc_majorLootReturnPlan') && result.items.some(i => i.label === 'LYLEDITOR_fnc_unresolved' && i.detail.includes('unresolved'));
      }, 'dirty included config registration completion');
      assert.ok(session.features.findings.some(f => f.scope.endsWith('/unresolved') && f.message.includes('unavailable')));
      await replace('LYLEDITOR_fnc_majorLootReturnPlan');
      const definitions = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', uri, new vscode.Position(0, 15));
      assert.ok(JSON.stringify(definitions).toLowerCase().includes('fn_majorlootreturnplan.sqf'));
      assert.ok((await colors(document)).some(t => t.text === 'LYLEDITOR_fnc_majorLootReturnPlan' && t.type === 'function'), 'dirty config index supplies semantic function names');
      await replaceConfig(configOriginal);
      await vscode.window.showTextDocument(configDocument); await vscode.commands.executeCommand('workbench.action.files.revert');
      await session.features.refresh();
      assert.ok(!session.features.functions.some(f => f.name.startsWith('LYLEDITOR_')));
      assert.ok(!(await colors(document)).some(t => t.text === 'LYLEDITOR_fnc_majorLootReturnPlan'), 'discard removes stale semantic registration');
    } finally {
      if (configDocument.isDirty) { await replaceConfig(configOriginal); await vscode.window.showTextDocument(configDocument); await vscode.commands.executeCommand('workbench.action.files.revert'); }
      assert.equal(crypto.createHash('sha256').update(await fs.readFile(configUri.fsPath)).digest('hex'), configHash);
      await vscode.window.showTextDocument(document);
    }
    mark(`CfgFunctions: ${initialFunctionCount} real registrations, unsaved included tag/path changes, unresolved missing file and navigation; config bytes preserved`);
    await replace('');
    const editor = await vscode.window.showTextDocument(document); editor.options = { ...editor.options, insertSpaces: true, tabSize: 4 };
    const snippets = JSON.parse(await fs.readFile(path.join(extension.extensionPath, 'snippets/sqf.json'), 'utf8'));
    await editor.insertSnippet(new vscode.SnippetString(snippets['If then'].body.join('\n')));
    assert.match(document.getText(), /if \(condition\) then \{\r?\n {4}/);
    await vscode.commands.executeCommand('leaveSnippet');
    mark('packaged snippets insert placeholders with editor indentation');
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
    for (const command of ['lylSqf.verifySelected', 'lylSqf.verifyChanged', 'lylSqf.runRelevantTests', 'lylSqf.showProcessed', 'lylSqf.openWiki', 'lylSqf.unitEvents', 'lylSqf.uiEvents', 'lylSqf.commandIndex']) assert.ok(commands.includes(command));
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
