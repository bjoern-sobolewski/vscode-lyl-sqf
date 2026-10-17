'use strict';
const vscode = require('vscode');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { LanguageClient } = require('vscode-languageclient/node');
const { provision, verifySharedSources, Host, hoverMarkdown } = require('./shared');
const { startTransport } = require('./transport');
const { EditorFeatures, registerReferences } = require('./editor-features');
const { registerHighlighting } = require('./semantic-highlighting');

let active;
async function activate(context) {
  const log = vscode.window.createOutputChannel('LYL SQF'); context.subscriptions.push(log);
  const sessions = [];
  const highlighting = registerHighlighting(context, document => sessions.find(s => s.owns(document))?.features);
  const find = uri => sessions.find(s => uri && vscode.workspace.getWorkspaceFolder(uri)?.uri.toString() === s.folder.uri.toString()) || sessions[0];
  registerReferences(context, find);
  if (!vscode.workspace.isTrusted) return;
  const folders = vscode.workspace.workspaceFolders || [];
  const roots = [];
  for (const folder of folders) if (await fs.stat(path.join(folder.uri.fsPath, 'tests/sqf/syntax.json')).catch(() => null)) roots.push(folder);
  if (!roots.length) { log.appendLine('Open a full LiveYourLife repository to enable project analysis.'); return; }
  const tools = await provision(context.extensionPath, context.globalStorageUri.fsPath);
  const output = text => log.appendLine(text);
  for (const folder of roots) {
    await verifySharedSources(folder.uri.fsPath, tools.manifest);
    const session = new Session(context, folder, tools, log, highlighting); sessions.push(session);
    try { await session.start(); } catch (error) { for (const started of sessions) await started.stop(); throw error; }
  }
  active = { sessions, tools, async dispose() { for (const session of sessions) await session.stop(); } };
  context.subscriptions.push({ dispose() { active?.dispose(); } });
  function selected(uri, all) { return all?.length ? all : uri ? [uri] : vscode.window.activeTextEditor ? [vscode.window.activeTextEditor.document.uri] : []; }
  const command = (name, fn) => context.subscriptions.push(vscode.commands.registerCommand(name, async (...args) => {
    try { return await fn(...args); } catch (e) { output(e.stack || e.message); log.show(true); vscode.window.showErrorMessage(`LYL SQF: ${e.message}`); }
  }));
  command('lylSqf.verifySelected', async (uri, all) => {
    const files = selected(uri, all), session = find(files[0]);
    if (!files.length) throw new Error('Select one or more SQF/config files.');
    const args = [];
    for (const file of files) {
      if (find(file) !== session || !/\.(sqf|hpp|inc|h|cpp|ext|sqm|rvmat|bikb|bisurf)$/i.test(file.fsPath)) throw new Error('Select SQF/config files from one repository.');
      args.push('--verify-file', file.fsPath);
    }
    return session.run(args);
  });
  command('lylSqf.verifyChanged', () => find(vscode.window.activeTextEditor?.document.uri).run(['--verify-changed']));
  command('lylSqf.runRelevantTests', async (uri, all) => {
    const files = selected(uri, all), session = find(files[0]);
    const suites = await session.host.request('tests', { files: files.map(f => f.fsPath) });
    if (!suites.length) { vscode.window.showInformationMessage('No existing suite is mapped to the selected files. This is a coverage gap, not a passing test.'); return; }
    const choices = suites.flatMap(s => s.runtimes.map(runtime => ({ label: `${s.id} (${runtime}; ${s.role})`, description: s.limitations, suite: s.id, runtime })));
    const choice = await vscode.window.showQuickPick(choices, { title: 'Run an existing suite on saved source', placeHolder: 'Native Arma uses the existing isolated server/HC runner' });
    if (choice) return session.run(['--runtime', choice.runtime, '--suite', choice.suite]);
  });
  command('lylSqf.rebuildWorkspace', async () => { const s = find(vscode.window.activeTextEditor?.document.uri); await s.restart(); });
  command('lylSqf.showProcessed', async () => {
    const document = vscode.window.activeTextEditor?.document; if (!document) return;
    const s = find(document.uri);
    const content = await s.client.sendRequest('hemtt/processed', { url: document.uri.toString() });
    if (content === null) throw new Error('Preprocessing failed. Inspect diagnostics and LYL SQF output.');
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ language: document.languageId, content }));
  });
  return { sessions, ready: true };
}

class Session {
  constructor(context, folder, tools, log, highlighting) {
    this.context = context; this.folder = folder; this.root = folder.uri.fsPath; this.tools = tools; this.log = log;
    this.highlighting = highlighting;
    this.disposables = []; this.timers = new Map(); this.contextFindings = vscode.languages.createDiagnosticCollection('LYL command context');
    context.subscriptions.push(this.contextFindings);
    this.jobs = new Set(); this.generation = 0;
  }
  owns(document) { return document.uri.scheme === 'file' && vscode.workspace.getWorkspaceFolder(document.uri)?.uri.toString() === this.folder.uri.toString(); }
  mapped(document) { return this.owns(document) && this.transport?.mapper.aliases(document.uri.toString()).length > 0; }
  async start() {
    const generation = ++this.generation;
    this.stage = path.join(this.context.globalStorageUri.fsPath, 'snapshots', crypto.randomUUID());
    this.host = new Host(this.tools.host, this.root, this.stage, text => this.log.appendLine(text));
    const snapshot = await this.host.request('prepare', { arma: vscode.workspace.getConfiguration('lylSqf').get('armaDirectory') || null });
    for (const limitation of snapshot.limitations) this.log.appendLine(`[compatibility limitation] ${limitation}`);
    if (snapshot.limitations.length) vscode.window.showWarningMessage('LYL SQF: some installed game headers are unavailable. See LYL SQF output; missing includes remain diagnostics.');
    this.transport = await startTransport(this.tools.hls, this.host, snapshot, this.root, text => this.log.appendLine(text));
    this.client = new LanguageClient('lylSqf-' + this.folder.name, 'LYL HEMTT', async () => this.transport, {
      documentSelector: [{ scheme: 'file', pattern: new vscode.RelativePattern(this.folder, '**/*.{sqf,ext,hpp,inc,h,cpp,sqm,rvmat,bikb,bisurf}') }],
      workspaceFolder: this.folder,
      outputChannel: this.log,
      middleware: {
        provideHover: async (document, position, token, next) => {
          const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z_0-9]*|[!+*/%<>=&|^-]+/);
          const word = range ? document.getText(range) : '';
          const doc = word ? await this.host.request('hover', { command: word }) : null;
          const markdown = hoverMarkdown(doc);
          if (markdown) { const md = new vscode.MarkdownString(markdown); md.isTrusted = false; md.supportHtml = false; return new vscode.Hover(md); }
          return next(document, position, token);
        }
      }
    });
    await this.client.start();
    this.features = new EditorFeatures(this, snapshot);
    await this.features.start();
    this.log.appendLine(`Ready: ${this.folder.name}; HEMTT fork ${this.tools.manifest.forkRevision}; ${snapshot.files.length} mapped sources/aliases. Static analysis only.`);
    const schedule = document => {
      if (!this.mapped(document)) {
        if (this.owns(document) && /\.(sqf|hpp|inc|h|cpp|ext|sqm|rvmat|bikb|bisurf)$/i.test(document.uri.fsPath)) {
          const diagnostic = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), '[compatibility limitation] This file has no analysis mapping yet. Save a new file and rebuild the analysis workspace, or use Verify Selected Files. No live parser coverage is claimed.', vscode.DiagnosticSeverity.Information);
          diagnostic.source = 'LYL analysis coverage'; this.contextFindings.set(document.uri, [diagnostic]);
        }
        return;
      }
      const key = document.uri.toString(); clearTimeout(this.timers.get(key));
      const version = document.version, text = document.getText();
      this.timers.set(key, setTimeout(async () => {
        this.timers.delete(key);
        try {
          const report = await this.host.request('analyze', { path: path.relative(this.root, document.uri.fsPath), text });
          if (document.isClosed || document.version !== version || this.generation !== generation) return;
          this.contextFindings.set(document.uri, report.findings.map(f => {
            const unresolved = f.severity === 'review', kind = unresolved ? 'compatibility limitation · unresolved context' : 'likely runtime defect';
            const start = new vscode.Position(Math.max(0, f.line - 1), Math.max(0, f.column - 1));
            const diagnostic = new vscode.Diagnostic(new vscode.Range(start, start.translate(0, 1)), `[${kind}] ${f.message}\nEntry: ${report.context.role}/${report.context.scheduling}. ${report.context.evidence}\n${report.limitation}`, unresolved ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error);
            diagnostic.source = 'LYL command context'; diagnostic.code = { value: f.code, target: vscode.Uri.parse(f.source) }; return diagnostic;
          }));
        } catch (e) { if (this.generation === generation) this.log.appendLine(`Context analysis failed: ${e.message}`); }
      }, vscode.workspace.getConfiguration('lylSqf').get('debounceMs', 350)));
    };
    this.disposables.push(vscode.workspace.onDidOpenTextDocument(schedule), vscode.workspace.onDidChangeTextDocument(e => schedule(e.document)),
      vscode.workspace.onDidCloseTextDocument(d => { clearTimeout(this.timers.get(d.uri.toString())); this.contextFindings.delete(d.uri); }));
    // Layout and control changes need a fresh VFS/index; ordinary header edits
    // retain the server's include-dependency graph and all dirty overlays.
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.folder, '**/*.{sqf,hpp,inc,h,cpp,ext,sqm,rvmat,bikb,bisurf,json}'));
    this.disposables.push(watcher);
    let rebuild;
    const rebuildSoon = () => { clearTimeout(rebuild); rebuild = setTimeout(() => this.restart().catch(e => this.log.appendLine(e.message)), 700); };
    this.disposables.push({ dispose: () => clearTimeout(rebuild) });
    const relevant = uri => {
      const relative = path.relative(this.root, uri.fsPath).replaceAll('\\', '/');
      if (/(^|\/)(node_modules|bin|obj|\.git)\//.test(relative) || /^z_cmd\/(\.generated|mission\.dev|mission\.uidev)\//.test(relative)) return false;
      return /\.(sqf|hpp|h|inc|cpp|ext|sqm|rvmat|bikb|bisurf)$/i.test(relative) || /^(tests\/sqf\/(commands\/|syntax\.json|functions\.json)|z_cmd\/dependencies\/manifest\.json)/.test(relative);
    };
    this.disposables.push(watcher.onDidCreate(uri => { if (relevant(uri)) rebuildSoon(); }), watcher.onDidDelete(uri => { if (relevant(uri)) rebuildSoon(); }),
      watcher.onDidChange(async uri => {
        if (!relevant(uri)) return;
        const aliases = this.transport.mapper.aliases(uri.toString());
        if (!aliases.length) { rebuildSoon(); return; }
        const open = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
        if (open?.isDirty) { this.features.invalidate(); return; }
        try {
          const text = await fs.readFile(uri.fsPath, 'utf8');
          await this.host.request('update', { path: path.relative(this.root, uri.fsPath), text });
          // Saving with a different encoding can change only the disk BOM, with
          // no text edit. Refresh an open HLS overlay as well as the disk snapshot.
          if (open) await this.client.sendNotification('textDocument/didChange', { textDocument: { uri: uri.toString(), version: open.version }, contentChanges: [{ text: open.getText() }] });
          for (const alias of aliases) await this.client.sendNotification('workspace/didChangeWatchedFiles', { changes: [{ uri: alias, type: 2 }] });
          this.features.invalidate();
        } catch (e) { this.log.appendLine(`Header refresh failed: ${e.message}`); }
      }), vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('lylSqf.armaDirectory')) rebuildSoon(); }));
    for (const document of vscode.workspace.textDocuments) schedule(document);
  }
  async run(args) {
    const dirty = vscode.workspace.textDocuments.filter(d => this.owns(d) && d.isDirty && /\.(sqf|hpp|inc|h|cpp|ext|sqm|rvmat|bikb|bisurf)$/i.test(d.uri.fsPath));
    if (dirty.length) throw new Error('Verification/tests use saved repository bytes. Save or discard dirty SQF/config buffers first; live editor diagnostics already analyze unsaved changes.');
    const arma = vscode.workspace.getConfiguration('lylSqf').get('armaDirectory');
    if (arma) args = [...args, '--arma-directory', arma];
    this.log.show(true); this.log.appendLine('Shared local gate: ' + JSON.stringify(args));
    const child = spawn(this.tools.host, [this.root, 'test', ...args], { cwd: this.root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    this.jobs.add(child);
    child.stdout.on('data', b => this.log.append(b.toString())); child.stderr.on('data', b => this.log.append(b.toString()));
    const exit = await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); }); this.jobs.delete(child);
    this.log.appendLine(`Gate exit ${exit}. Native/multiplayer behavior is verified only by the explicitly selected runtime/scenario.`);
    if (exit !== 0) vscode.window.showWarningMessage('LYL SQF verification failed or is incomplete. See LYL SQF output and results.json.');
    return exit;
  }
  async restart() {
    if (this.restarting) return this.restarting;
    this.restarting = (async () => { await this.stop(); await this.start(); })().finally(() => { this.restarting = undefined; });
    return this.restarting;
  }
  async stop() {
    ++this.generation;
    this.features?.dispose();
    for (const d of this.disposables.splice(0)) d.dispose();
    for (const timer of this.timers.values()) clearTimeout(timer); this.timers.clear();
    this.contextFindings.clear();
    for (const job of this.jobs) job.kill(); this.jobs.clear();
    if (this.client) await this.client.stop().catch(() => {});
    this.transport?.dispose(); this.host?.dispose();
    if (this.stage) {
      const base = path.resolve(this.context.globalStorageUri.fsPath, 'snapshots') + path.sep;
      if (path.resolve(this.stage).startsWith(base)) await fs.rm(this.stage, { recursive: true, force: true }).catch(() => {});
    }
  }
}
async function deactivate() { await active?.dispose(); }
module.exports = { activate, deactivate };
