'use strict';
const path = require('node:path');

const wikiBase = 'https://community.bistudio.com/wiki/';
const references = {
  unitEvents: 'Arma_3:_Event_Handlers',
  uiEvents: 'User_Interface_Event_Handlers',
  commandIndex: 'Category:Scripting_Commands'
};
function wikiUrl(text, canonical) {
  const name = (canonical || text).trim();
  if (!name || name.length > 200 || /[\r\n\x00-\x1f]/.test(name)) return undefined;
  // Encode the entire page component, including #, ?, / and %. Never accept
  // an origin or an executable URI from selection/documentation text.
  return wikiBase + encodeURIComponent(name).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
function functionMarkdown(entry, provenance) {
  return `## ${entry.title} · BIS function\n\n[BI Wiki](${wikiUrl(entry.title)})\n\n${entry.description || 'Description unavailable.'}\n\n` +
    (entry.syntaxes || []).map(s => '```sqf\n' + (s.code || entry.title) + '\n```\n\n' +
      (s.args || []).map(a => `- ${a.name || '?'}: ${a.type || 'Unspecified'}${a.optional ? ' (optional)' : ''}${a.default !== undefined ? ' · default: ' + a.default : ''} — ${a.desc || 'Description unavailable.'}`).join('\n') +
      '\n\nReturns: ' + JSON.stringify(s.returns || 'Unspecified')).join('\n\n') +
    `\n\nDocumented compatibility: ${JSON.stringify(entry.compatibility || 'Unspecified')}\n\nProvenance: ${provenance}. Documentation snapshot; availability, locality and scheduling are not inferred. Missing contracts remain unspecified.`;
}

// Lexical ranges are UTF-16 offsets, matching VS Code. Comments and escaped
// SQF strings remain single tokens, so their delimiters cannot affect hints.
function tokens(text) {
  const result = [];
  const re = /\/\/[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:""|[^"])*(?:"|$)|'(?:''|[^'])*(?:'|$)|[A-Za-z_][A-Za-z_0-9]*|\d+(?:\.\d+)?|[!+*/%<>=&|^\-]+|[^\s]/g;
  let match;
  while ((match = re.exec(text))) {
    const value = match[0];
    result.push({ value, start: match.index, end: re.lastIndex, comment: value.startsWith('//') || value.startsWith('/*'), string: /^['"]/.test(value) });
  }
  return result;
}
function hintCandidates(text, offset, names) {
  const all = tokens(text), before = all.filter(t => t.start < offset);
  const last = before.at(-1);
  if (last?.comment && offset <= last.end) return [];
  const clean = before.filter(t => !t.comment), result = [];
  for (let i = clean.length - 1; i >= 0; i--) {
    const token = clean[i];
    if (token.value === ';' || token.value === '{' || token.value === '}') break;
    if (token.string || token.end > offset || !names.has(token.value.toLowerCase())) continue;
    const stack = [], pathAtCursor = [];
    let ended = false;
    for (let j = i + 1; j < clean.length; j++) {
      const t = clean[j];
      if (t.string) continue;
      if (['[', '('].includes(t.value)) {
        const previous = clean[j - 1];
        const macro = t.value === '(' && previous && previous.end === t.start && /^[A-Za-z_][A-Za-z_0-9]*$/.test(previous.value) && !names.has(previous.value.toLowerCase());
        stack.push({ kind: t.value, index: 0, macro });
      }
      else if ([']', ')'].includes(t.value)) {
        const expected = t.value === ']' ? '[' : '(';
        if (stack.at(-1)?.kind !== expected) { ended = true; break; }
        stack.pop();
        // A completed right operand should not keep claiming later arguments.
        if (!stack.length && t.end < offset && clean.some(x => x.start >= t.end && x.start < offset)) { ended = true; break; }
      } else if (t.value === ',') {
        if (!stack.length) { ended = true; break; }
        stack.at(-1).index++;
      } else if ([';', '=', '{', '}'].includes(t.value)) { ended = true; break; }
    }
    if (ended || stack.some(level => level.macro)) continue;
    for (const level of stack) if (level.kind === '[') pathAtCursor.push(level.index);
    const previous = clean[i - 1];
    const binary = !!previous && (previous.string || /^[A-Za-z_0-9]/.test(previous.value) || [']', ')'].includes(previous.value)) &&
      !['private', 'then', 'else', 'do', 'case', 'call', 'spawn', 'return'].includes(previous.value.toLowerCase()) &&
      !names.has(previous.value.toLowerCase());
    const unary = !previous || ['=', ';', '(', '[', ',', '{', '}', 'then', 'else', 'do', 'case', 'private'].includes(previous.value.toLowerCase());
    result.push({ name: token.value, binary, unary, previous: previous?.value, path: pathAtCursor, rhsArray: clean[i + 1]?.value === '[' });
  }
  return result;
}
function commandSignatures(doc, candidate) {
  if (!doc) return undefined;
  const command = doc.command, signatures = [];
  function format(tree) { return Array.isArray(tree) ? '[' + tree.map(format).join(', ') + ']' : String(tree); }
  for (const syntax of command.syntax || []) {
    const call = syntax.call;
    if (!call || !['Unary', 'Binary'].includes(call.kind)) continue;
    // Ambiguous operands retain both overload families; don't type-guess.
    if (candidate.binary && call.kind !== 'Binary') continue;
    if (candidate.unary && call.kind !== 'Unary') continue;
    const args = call.arguments, right = call.kind === 'Binary' ? args[1] : args;
    if (candidate.rhsArray && !Array.isArray(right)) continue;
    let target = right;
    for (const index of candidate.path) {
      if (!Array.isArray(target)) break; // nested expression is one parameter
      target = target[index] ?? target.find(v => typeof v === 'string' && /\.\.\.|\b\w+N\b/.test(v));
    }
    const parameters = (syntax.params || []).map(p => ({ label: `${p.name}: ${p.type || 'Unspecified'}`, documentation: p.description || '' }));
    const active = typeof target === 'string' ? (syntax.params || []).findIndex(p => p.name.toLowerCase() === target.toLowerCase()) : -1;
    signatures.push({ label: (call.kind === 'Binary' ? format(args[0]) + ' ' + command.name + ' ' + format(args[1]) : command.name + ' ' + format(args)) + ' → ' + (syntax.ret || ['Unspecified'])[0],
      parameters, ...(active >= 0 ? { activeParameter: active } : {}),
      documentation: `Engine command · ${doc.revision}\n${command.source}\n${command.description || ''}\nReviewed restrictions: ${JSON.stringify(doc.contract || 'Unspecified')}` });
  }
  return signatures.length ? { signatures, activeSignature: 0, ...(signatures[0].activeParameter !== undefined ? { activeParameter: signatures[0].activeParameter } : {}) } : undefined;
}

// This consumes HEMTT's ordered AST, never source regexes or folder names.
function registrations(properties, root) {
  const findings = [], functions = [];
  const issue = (scope, message) => findings.push({ scope, message });
  function classes(items, parentScope = '') {
    const map = new Map();
    for (const node of items || []) {
      const key = node.name?.toLowerCase();
      if (node.kind === 'delete') map.delete(key);
      else if (node.kind === 'class') {
        const existing = map.get(key);
        if (node.external && existing) continue;
        map.set(key, existing && !existing.external && !node.external ? { ...node, properties: [...existing.properties, ...node.properties] } : node);
      }
    }
    function resolve(node, visiting = new Set()) {
      if (!node.parent) return node;
      const key = node.name.toLowerCase(), base = map.get(node.parent.toLowerCase());
      if (visiting.has(key) || !base || base.external) {
        issue(parentScope + '/' + node.name, `Unresolved inheritance: ${node.parent}`);
        return { ...node, uncertain: true };
      }
      const resolved = resolve(base, new Set([...visiting, key]));
      return { ...node, uncertain: resolved.uncertain, properties: [...resolved.properties, ...node.properties] };
    }
    return [...map.values()].map(node => resolve(node));
  }
  function entry(node, name) {
    const value = node.properties?.filter(p => p.name?.toLowerCase() === name && p.kind === 'entry').at(-1);
    return value ? { present: true, value: value.literal } : { present: false };
  }
  for (const cfg of classes(properties).filter(c => c.name.toLowerCase() === 'cfgfunctions')) {
    if (cfg.external) { issue('CfgFunctions', 'External CfgFunctions body unavailable'); continue; }
    for (const tag of classes(cfg.properties, 'CfgFunctions')) {
      if (tag.external) { issue(tag.name, 'External tag body unavailable'); continue; }
      const tagEntry = entry(tag, 'tag'), prefix = tagEntry.present ? tagEntry.value : tag.name;
      for (const category of classes(tag.properties, tag.name)) {
        if (category.external) { issue(tag.name + '/' + category.name, 'External category body unavailable'); continue; }
        const directory = entry(category, 'file'), categoryExt = entry(category, 'ext');
        for (const fn of classes(category.properties, tag.name + '/' + category.name)) {
          const scope = `${tag.name}/${category.name}/${fn.name}`, file = entry(fn, 'file'), ext = entry(fn, 'ext');
          const problems = [];
          if (!prefix || !/^[A-Za-z_][A-Za-z_0-9]*$/.test(prefix)) { issue(scope, 'Nonliteral or invalid function tag; name unresolved'); continue; }
          if (cfg.uncertain || tag.uncertain || category.uncertain || fn.uncertain) problems.push('Unresolved inheritance');
          const extension = ext.present ? ext.value : categoryExt.present ? categoryExt.value : '.sqf';
          // No default-directory inference: registered name remains available,
          // while absent/dynamic file locations are explicitly unresolved.
          let location = file.present ? file.value : directory.value && extension ? directory.value.replace(/[\\/]$/, '') + '/fn_' + fn.name + extension : undefined;
          if (!location) problems.push('File location not established from literal config fields');
          if (location) {
            location = location.replaceAll('\\', '/');
            location = location.startsWith('/') ? path.posix.normalize(location) : path.posix.join(root.virtualPrefix, location);
          }
          const item = { name: `${prefix}_fnc_${fn.name}`, root: root.path, scope, virtualPath: location, unresolved: problems };
          functions.push(item);
          for (const problem of problems) issue(scope, problem);
        }
      }
    }
  }
  return { functions, findings };
}
module.exports = { wikiUrl, references, functionMarkdown, tokens, hintCandidates, commandSignatures, registrations };
