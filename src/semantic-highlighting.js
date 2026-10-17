'use strict';
const vscode = require('vscode');
const { semanticTokens, tokenTypes, tokenModifiers } = require('./highlighting');
const bis = require('../data/bis-functions.json');
const bisFunctions = new Map(bis.functions.map(fn => [fn.title.toLowerCase(), true]));

function registerHighlighting(context, featuresForDocument) {
  const changed = new vscode.EventEmitter();
  const legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);
  const cache = new WeakMap();
  const provider = {
    onDidChangeSemanticTokens: changed.event,
    provideDocumentSemanticTokens(document, cancellation) {
      if (cancellation.isCancellationRequested) return;
      const features = featuresForDocument(document), previous = cache.get(document);
      if (previous?.version === document.version && previous.language === document.languageId && previous.features === features && previous.index === features?.functions && previous.commands === features?.names) return previous.tokens;
      const functions = new Map(bisFunctions);
      for (const fn of features?.functions || []) functions.set(fn.name.toLowerCase(), false);
      const tokens = new vscode.SemanticTokensBuilder(legend);
      for (const item of semanticTokens(document.getText(), { commands: features?.names, functions, language: document.languageId })) {
        if (cancellation.isCancellationRequested) return;
        tokens.push(new vscode.Range(document.positionAt(item.start), document.positionAt(item.end)), item.type, item.modifiers);
      }
      const value = tokens.build();
      cache.set(document, { version: document.version, language: document.languageId, features, index: features?.functions, commands: features?.names, tokens: value });
      return value;
    }
  };
  context.subscriptions.push(changed, vscode.languages.registerDocumentSemanticTokensProvider([{ language: 'sqf' }, { language: 'arma-config' }], provider, legend));
  return changed;
}
module.exports = { registerHighlighting };
