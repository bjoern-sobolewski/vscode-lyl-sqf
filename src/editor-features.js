'use strict';
const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { wikiUrl, references, functionMarkdown, hintCandidates, commandSignatures, registrations } = require('./authoring');
const bis = require('../data/bis-functions.json');
const bisByName = new Map(bis.functions.map(f => [f.title.toLowerCase(), f]));
const provenance = `${bis.provenance.package} ${bis.provenance.version}; BI Community Wiki contributors`;
function markdown(text) { const md = new vscode.MarkdownString(text); md.isTrusted = false; md.supportHtml = false; return md; }

function registerReferences(context, find) {
  const register = (name, fn) => context.subscriptions.push(vscode.commands.registerCommand(name, fn));
  register('lylSqf.openWiki', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const range = editor.selection.isEmpty ? editor.document.getWordRangeAtPosition(editor.selection.active, /[A-Za-z_][A-Za-z_0-9]*|[!+*/%<>=&|^\-]+/) : editor.selection;
    const text = range ? editor.document.getText(range).trim() : '';
    let canonical = bisByName.get(text.toLowerCase())?.title;
    const session = find(editor.document.uri);
    if (!canonical && session?.features) canonical = (await session.features.documentation(text))?.command.name;
    const url = wikiUrl(text, canonical);
    if (!url) { vscode.window.showWarningMessage('LYL SQF: select a command or a single BI Wiki page name.'); return; }
    return vscode.env.openExternal(vscode.Uri.parse(url));
  });
  for (const [name, page] of Object.entries(references)) register('lylSqf.' + name, () => vscode.env.openExternal(vscode.Uri.parse(wikiUrl(page))));
}

class EditorFeatures {
  constructor(session, snapshot) {
    this.session = session; this.snapshot = snapshot; this.revision = 0; this.cachedRevision = -1;
    this.docs = new Map(); this.functions = []; this.findings = [];
    this.diagnostics = vscode.languages.createDiagnosticCollection('LYL function registrations');
  }
  async start() {
    this.names = new Set((await this.session.host.request('commands')).map(n => n.toLowerCase()));
    const selector = [{ language: 'sqf', scheme: 'file', pattern: new vscode.RelativePattern(this.session.folder, '**/*.sqf') }];
    const disposables = this.session.disposables;
    disposables.push(this.diagnostics,
      vscode.languages.registerCompletionItemProvider(selector, { provideCompletionItems: async (document, position, token) => {
        const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z_0-9]*/), prefix = range ? document.getText(new vscode.Range(range.start, position)).toLowerCase() : '';
        if (!prefix) return [];
        const items = [];
        if ('bis_fnc_'.startsWith(prefix) || prefix.startsWith('bis_')) for (const entry of bis.functions) {
          if (!entry.title.toLowerCase().startsWith(prefix)) continue;
          const item = new vscode.CompletionItem(entry.title, vscode.CompletionItemKind.Function);
          item.detail = 'BIS function · BI Wiki snapshot'; item.documentation = markdown(functionMarkdown(entry, provenance)); item.range = range; items.push(item);
        }
        await this.refresh();
        if (token.isCancellationRequested) return [];
        for (const fn of this.functions) {
          if (!fn.name.toLowerCase().startsWith(prefix)) continue;
          const item = new vscode.CompletionItem(fn.name, vscode.CompletionItemKind.Function);
          item.detail = `CfgFunctions · ${fn.root}${fn.unresolved.length ? ' · unresolved' : ''}`;
          item.documentation = markdown(this.projectMarkdown(fn)); item.range = range; items.push(item);
        }
        return items;
      } }),
      vscode.languages.registerHoverProvider(selector, { provideHover: async (document, position) => {
        const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z_0-9]*/), name = range && document.getText(range).toLowerCase();
        const entry = bisByName.get(name);
        if (entry) return new vscode.Hover(markdown(functionMarkdown(entry, provenance)), range);
        if (!name?.includes('_fnc_')) return;
        await this.refresh(); const functions = this.functions.filter(f => f.name.toLowerCase() === name);
        if (functions.length) return new vscode.Hover(markdown(functions.map(f => this.projectMarkdown(f)).join('\n\n')), range);
      } }),
      vscode.languages.registerDefinitionProvider(selector, { provideDefinition: async (document, position) => {
        const range = document.getWordRangeAtPosition(position), name = range && document.getText(range).toLowerCase();
        if (!name?.includes('_fnc_')) return;
        await this.refresh(); return this.functions.filter(f => f.name.toLowerCase() === name && f.source).map(f => new vscode.Location(vscode.Uri.file(f.source), new vscode.Position(0, 0)));
      } }),
      vscode.languages.registerSignatureHelpProvider(selector, { provideSignatureHelp: async (document, position, token) => {
        const candidates = hintCandidates(document.getText(), document.offsetAt(position), this.names);
        for (const candidate of candidates) {
          if (token.isCancellationRequested) return;
          if (!candidate.binary && !candidate.unary && this.names.has(candidate.previous?.toLowerCase())) {
            const previous = await this.documentation(candidate.previous);
            const kinds = (previous?.command.syntax || []).map(s => s.call.kind);
            if (kinds.length && kinds.every(k => k === 'Nular')) candidate.binary = true;
            else if (kinds.length && kinds.every(k => k !== 'Nular')) candidate.unary = true;
          }
          const result = commandSignatures(await this.documentation(candidate.name), candidate);
          if (result) return result;
        }
      } }, ' ', '[', '(', ','),
      vscode.workspace.onDidChangeTextDocument(e => { if (this.session.owns(e.document) && /\.(hpp|inc|h|cpp|ext)$/i.test(e.document.uri.fsPath)) this.invalidate(); }),
      vscode.workspace.onDidCloseTextDocument(d => { if (this.session.owns(d) && /\.(hpp|inc|h|cpp|ext)$/i.test(d.uri.fsPath)) this.invalidate(); })
    );
    this.invalidate();
  }
  documentation(name) {
    const key = name.toLowerCase();
    if (!this.names.has(key)) return Promise.resolve(null);
    if (!this.docs.has(key)) this.docs.set(key, this.session.host.request('hover', { command: name }).catch(error => { this.docs.delete(key); throw error; }));
    return this.docs.get(key);
  }
  projectMarkdown(fn) {
    return `## ${fn.name} · project function\n\nRegistered by ${fn.root}: ${fn.scope}\n\nFile: ${fn.virtualPath || 'Unresolved'}\n\n` +
      (fn.unresolved.length ? 'Unresolved: ' + fn.unresolved.join('; ') : 'File exists in the configured analysis layout.') +
      '\n\nParameters, return value, machine role and scheduling: unspecified. Registration is not a runtime contract.';
  }
  invalidate() {
    this.revision++; clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refresh().catch(e => this.session.log.appendLine('Function index: ' + e.message)), 650);
  }
  async refresh() {
    if (this.disposed) return;
    if (this.cachedRevision === this.revision) return;
    if (this.running) { await this.running; if (this.cachedRevision !== this.revision) return this.refresh(); return; }
    const revision = this.revision;
    this.running = this.build().then(index => {
      if (this.disposed || revision !== this.revision) return;
      this.functions = index.functions; this.findings = index.findings; this.cachedRevision = revision;
      this.diagnostics.clear();
      const groups = new Map();
      for (const finding of this.findings) {
        const uri = vscode.Uri.file(path.join(this.session.root, finding.root));
        const diagnostic = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), `[compatibility limitation · unresolved registration] ${finding.scope}: ${finding.message}`, vscode.DiagnosticSeverity.Warning);
        diagnostic.source = 'LYL CfgFunctions'; diagnostic.code = 'LYL-CFG-UNRESOLVED';
        if (!groups.has(uri.toString())) groups.set(uri.toString(), { uri, items: [] }); groups.get(uri.toString()).items.push(diagnostic);
      }
      for (const { uri, items } of groups.values()) this.diagnostics.set(uri, items);
    }).finally(() => { this.running = undefined; });
    await this.running;
  }
  async build() {
    const file = path.join(this.session.root, 'tests/sqf/functions.json');
    let layout;
    try { layout = JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) { return { functions: [], findings: [{ root: 'tests/sqf/functions.json', scope: 'CfgFunctions', message: error.code === 'ENOENT' ? 'Function-root manifest is missing; config roots have not been declared.' : 'Cannot read function-root manifest: ' + error.message }] }; }
    if (layout.schema !== 1 || !Array.isArray(layout.roots)) return { functions: [], findings: [{ root: 'tests/sqf/functions.json', scope: 'CfgFunctions', message: 'Invalid function-root manifest; expected schema 1 and roots array' }] };
    // Synchronize dirty config overlays before requesting an exact-root parse.
    // Transport preserves aliases and the disk BOM, using its ordinary queue.
    for (const document of vscode.workspace.textDocuments.filter(d => this.session.mapped(d) && d.isDirty && /\.(hpp|inc|h|cpp|ext)$/i.test(d.uri.fsPath))) {
      await this.session.client.sendNotification('textDocument/didChange', { textDocument: { uri: document.uri.toString(), version: document.version }, contentChanges: [{ text: document.getText() }] });
    }
    const functions = [], findings = [], virtual = new Map();
    for (const mapping of this.snapshot.files) {
      const target = path.relative(this.snapshot.root, mapping.target).replaceAll('\\', '/');
      const match = /^addons\/([^/]+)\/(.*)$/.exec(target);
      if (match) virtual.set('/' + (match[1] === 'mission' ? '' : match[1] + '/') + match[2].toLowerCase(), mapping.source);
    }
    for (const root of layout.roots) {
      if (!root || typeof root.path !== 'string' || typeof root.virtualPrefix !== 'string') { findings.push({ root: 'tests/sqf/functions.json', scope: 'CfgFunctions', message: 'Invalid config-root entry; expected path and virtualPrefix strings' }); continue; }
      const full = path.resolve(this.session.root, root.path);
      if (!full.toLowerCase().startsWith(path.resolve(this.session.root).toLowerCase() + path.sep) || !this.session.transport.mapper.aliases(pathToFileURL(full).href).length) {
        findings.push({ root: 'tests/sqf/functions.json', scope: root.path, message: 'Declared config root is outside the mapped repository or missing' }); continue;
      }
      const result = await this.session.client.sendRequest('hemtt/config/structure', { url: pathToFileURL(full).href, classes: ['CfgFunctions'] });
      for (const message of result.limitations) findings.push({ root: root.path, scope: 'CfgFunctions', message });
      const registration = registrations(result.properties, root);
      for (const message of result.provisional || []) findings.push({ root: root.path, scope: 'CfgFunctions', message: 'Config root has blocking analysis findings; index is provisional: ' + message });
      for (const fn of registration.functions) {
        if (result.provisional?.length) fn.unresolved.push('Config root has blocking analysis findings; registration index is provisional');
        fn.source = fn.virtualPath && virtual.get(fn.virtualPath.toLowerCase());
        if (fn.virtualPath && !fn.source) { fn.unresolved.push('Registered file unavailable in analysis layout'); registration.findings.push({ scope: fn.scope, message: 'Registered file unavailable: ' + fn.virtualPath }); }
        functions.push(fn);
      }
      for (const finding of registration.findings) findings.push({ ...finding, root: root.path });
    }
    return { functions, findings };
  }
  dispose() { this.disposed = true; this.revision++; clearTimeout(this.timer); this.diagnostics.dispose(); }
}
module.exports = { EditorFeatures, registerReferences };
