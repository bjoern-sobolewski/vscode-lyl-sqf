'use strict';

const grammar = require('../languages/sqf.json');
const tokenTypes = ['function', 'parameter', 'macro'];
const tokenModifiers = ['declaration', 'defaultLibrary', 'readonly'];
// These are language syntax, not a second command-reference table. Keep the
// exclusions tied to the fallback grammar so semantic colors retain keywords.
const syntax = ['access-modifier', 'control-statement', 'word-operators', 'boolean-literal', 'null-literal', 'reserved-literal', 'vObject-statements']
  .map(name => new RegExp('^(?:' + grammar.repository[name].match.replaceAll('(?i)', '') + ')$', 'i'));

function scan(text) {
  const result = [];
  const re = /\/\/[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:""|[^"])*(?:"|$)|'(?:''|[^'])*(?:'|$)|(?:0[xX]|\$)[\da-fA-F]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|[^\s]/g;
  for (const match of text.matchAll(re)) {
    const value = match[0];
    result.push({ value, start: match.index, end: match.index + value.length,
      comment: value.startsWith('//') || value.startsWith('/*'), string: /^['"]/.test(value) });
  }
  return result;
}

// Presentation-only lexical evidence. This never expands macros, infers types,
// resolves dynamic scope, or claims function availability or config validity.
function semanticTokens(text, { commands = new Set(), functions = new Map(), language = 'sqf' } = {}) {
  const all = scan(text).filter(t => !t.comment);
  const result = [], macros = new Set(), declarations = new Map(), shadows = new Map();
  const pairs = new Map(), stack = [];
  let scope = { bindings: new Set() }, directiveEnd = -1;
  function add(t, type, modifiers = [], quoted = false) {
    const start = t.start + (quoted ? 1 : 0), end = t.end - (quoted ? 1 : 0);
    if (end > start) result.push({ start, end, type, modifiers });
  }
  function name(t) {
    return t?.string && /^(['"])_[A-Za-z_0-9]+\1$/.test(t.value) ? t.value.slice(1, -1).toLowerCase() : undefined;
  }
  function arrayNames(open, typed = false) {
    const close = pairs.get(open);
    if (close === undefined) return [];
    const names = [];
    for (let i = open + 1; i < close;) {
      const start = i, first = all[i];
      // Skip the entire element, including defaults and nested code/arrays.
      while (i < close && all[i].value !== ',') { i = (pairs.get(i) ?? i) + 1; }
      let declared;
      if (i === start + 1) declared = first;
      else if (typed && first.value === '[' && pairs.get(start) === i - 1 && [',', ']'].includes(all[start + 2]?.value)) declared = all[start + 1];
      if (name(declared)) names.push(declared);
      i++;
    }
    return names;
  }
  for (let i = 0; i < all.length; i++) {
    const t = all[i];
    if (t.value === '#' && /^[ \t]*$/.test(text.slice(text.lastIndexOf('\n', t.start - 1) + 1, t.start))) {
      directiveEnd = text.indexOf('\n', t.end);
      while (directiveEnd >= 0 && /\\\r?$/.test(text.slice(t.end, directiveEnd))) directiveEnd = text.indexOf('\n', directiveEnd + 1);
      if (directiveEnd < 0) directiveEnd = text.length;
      t.directiveStart = true;
    }
    t.directive = t.start < directiveEnd;
    t.scope = scope;
    if (language !== 'sqf' || t.directive || t.string) continue;
    if (['[', '(', '{'].includes(t.value)) {
      stack.push({ index: i, value: t.value, scope });
      if (t.value === '{') scope = { parent: scope, bindings: new Set() };
    } else if ([']', ')', '}'].includes(t.value)) {
      const expected = { ']': '[', ')': '(', '}': '{' }[t.value];
      if (stack.at(-1)?.value !== expected) { stack.length = 0; continue; }
      const opened = stack.pop(); pairs.set(opened.index, i);
      if (t.value === '}') scope = opened.scope;
    }
  }
  for (let i = 0; i < all.length; i++) {
    const t = all[i];
    if (language !== 'sqf' || t.directive || t.string) continue;
    if (t.value.toLowerCase() === 'params' && all[i + 1]?.value === '[') {
      for (const declared of arrayNames(i + 1, true)) declarations.set(declared, t.scope);
    }
    if (t.value.toLowerCase() === 'private') {
      const next = all[i + 1];
      const declared = next?.value === '[' ? arrayNames(i + 1) : next ? [next] : [];
      for (const local of declared) shadows.set(local, t.scope);
    }
  }
  for (let i = 0; i < all.length; i++) {
    const t = all[i], lower = t.value.toLowerCase();
    if (t.directiveStart) {
      const operation = all[i + 1]?.value, identifier = all[i + 2];
      if (all[i + 1]?.directive) all[i + 1].directiveKeyword = true;
      if (identifier?.directive && /^[A-Za-z_]\w*$/.test(identifier.value)) {
        if (operation === 'define') {
          macros.add(identifier.value); add(identifier, 'macro', ['declaration', 'readonly']);
          identifier.macroDeclaration = true;
        } else if (operation === 'undef') macros.delete(identifier.value);
      }
    }
    if (t.macroDeclaration || t.directiveKeyword) continue;
    if (t.directive) {
      if (!t.string && macros.has(t.value)) add(t, 'macro', ['readonly']);
      continue;
    }
    const shadow = shadows.get(t);
    if (shadow) shadow.bindings.delete(name(t) || lower);
    const declared = declarations.get(t);
    if (declared) { declared.bindings.add(name(t)); add(t, 'parameter', ['declaration'], true); continue; }
    if (t.string || !/^[A-Za-z_]\w*$/.test(t.value)) continue;
    if (macros.has(t.value)) { add(t, 'macro', ['readonly']); continue; }
    if (language !== 'sqf') continue;
    // SQF code blocks can execute later and in dynamic caller scopes. Only
    // color references owned by this exact explicit params scope; don't guess
    // through nested callbacks, shadow declarations, or string-generated code.
    if (!shadow && t.scope.bindings.has(lower)) { add(t, 'parameter'); continue; }
    if (syntax.some(re => re.test(t.value))) continue;
    if (functions.has(lower)) add(t, 'function', functions.get(lower) ? ['defaultLibrary'] : []);
    else if (commands.has(lower)) add(t, 'function', ['defaultLibrary']);
  }
  return result.sort((a, b) => a.start - b.start);
}

module.exports = { semanticTokens, tokenTypes, tokenModifiers };
