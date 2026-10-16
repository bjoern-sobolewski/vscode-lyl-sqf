'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');

const hash = data => crypto.createHash('sha256').update(data).digest('hex');

// VS Code hides an encoding BOM from TextDocument.getText(). Preserve the disk
// marker when forwarding full buffers so opening/editing cannot hide a violation.
async function withDiskBom(file, text) {
  if (text.startsWith('\uFEFF')) return text;
  let handle;
  try {
    handle = await fs.open(file, 'r');
    const prefix = Buffer.alloc(3);
    const { bytesRead } = await handle.read(prefix, 0, 3, 0);
    return bytesRead === 3 && prefix.equals(Buffer.from([0xEF, 0xBB, 0xBF])) ? '\uFEFF' + text : text;
  } catch (error) {
    if (error.code === 'ENOENT') return text;
    throw error;
  } finally { await handle?.close(); }
}
async function provision(extension, storage) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('LYL SQF currently packages Windows x64 tooling only.');
  const manifest = JSON.parse((await fs.readFile(path.join(extension, 'server/tools.json'), 'utf8')).replace(/^\uFEFF/, ''));
  const tools = {};
  for (const [name, tool] of Object.entries(manifest.tools)) {
    if (!/^[a-zA-Z0-9_.-]+\.exe$/.test(tool.file) || !/^[a-f0-9]{64}$/.test(tool.sha256)) throw new Error('Invalid bundled tool pin');
    const bytes = await fs.readFile(path.join(extension, 'server', tool.file));
    if (hash(bytes) !== tool.sha256) throw new Error(`Bundled ${name} checksum mismatch; reinstall a verified VSIX.`);
    const dir = path.join(storage, 'tools', tool.sha256);
    await fs.mkdir(dir, { recursive: true });
    const target = path.join(dir, tool.file);
    const existing = await fs.readFile(target).catch(() => null);
    if (!existing || hash(existing) !== tool.sha256) {
      const temp = target + '.' + crypto.randomUUID() + '.tmp';
      await fs.writeFile(temp, bytes, { flag: 'wx' });
      await fs.rename(temp, target).catch(async error => {
        // An identical concurrent activation may have finished first.
        if (hash(await fs.readFile(target).catch(() => Buffer.alloc(0))) !== tool.sha256) throw error;
        await fs.rm(temp, { force: true });
      });
    }
    tools[name] = target;
  }
  return { ...tools, manifest };
}

async function verifySharedSources(root, manifest) {
  for (const [file, expected] of Object.entries(manifest.sharedSources || {})) {
    if (!file.startsWith('z_cmd/Arma3.DevTools/') || file.includes('..')) throw new Error('Invalid shared-source stamp');
    const actual = await fs.readFile(path.join(root, file));
    if (hash(Buffer.from(actual.toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'))) !== expected) throw new Error(`Shared analysis source changed: ${file}. Rebuild/reinstall the local VSIX before using the editor; the gate and editor must use the same analysis implementation.`);
  }
}

class Host {
  constructor(exe, root, stage, log) {
    this.next = 0; this.pending = new Map();
    this.process = spawn(exe, [root, 'serve', stage], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.process.stderr.on('data', b => log(b.toString()));
    createInterface({ input: this.process.stdout }).on('line', line => {
      try {
        const message = JSON.parse(line), pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id); clearTimeout(pending.timer);
        message.error ? pending.reject(new Error(message.error)) : pending.resolve(message.result);
      } catch (error) { log(String(error)); }
    });
    const fail = error => { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); } this.pending.clear(); };
    this.process.on('error', fail);
    this.process.on('exit', code => fail(new Error(`Analysis host exited (${code})`)));
  }
  request(method, params = {}) {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Analysis host ${method} timed out`)); }, 120000);
      this.pending.set(id, { resolve, reject, timer });
      this.process.stdin.write(JSON.stringify({ id, method, params }) + '\n', error => { if (error) { clearTimeout(timer); this.pending.delete(id); reject(error); } });
    });
  }
  dispose() { this.process.kill(); }
}

function category(code, message = '') {
  if (code === 'BOM') return 'policy';
  if (/^(CCHU|L-C(?:01|06|07|08|10))$/.test(code)) return 'syntax';
  if (code === 'L-C04') return 'compatibility limitation';
  if (/^(SPE|PE)/.test(code)) return /unsupported|not supported|has_include|missing|not found/i.test(message) ? 'compatibility limitation' : 'syntax';
  if (/^LYL-SQF/.test(code)) return /unresolved|unknown|review/i.test(message) ? 'compatibility limitation' : 'likely runtime defect';
  if (/^L-S(?:08|09|12)$/.test(code)) return 'likely runtime defect';
  if (/^L-/.test(code)) return 'policy';
  if (/^(CPE|CE)/.test(code)) return 'syntax';
  return 'compatibility limitation';
}

// Preserve all fields, overloads, notes and unknown values from the shared snapshot.
function hoverMarkdown(doc) {
  if (!doc) return undefined;
  const c = doc.command, contract = doc.contract;
  const json = value => JSON.stringify(value, null, 2);
  const section = (title, value) => `\n\n### ${title}\n\n\`\`\`json\n${json(value)}\n\`\`\``;
  return `## ${c.name}\n\n[Official documentation](${c.source}) · snapshot ${doc.revision}\n\n${c.description || ''}` +
    section('Engine version', c.since || 'Unspecified') +
    section('Argument locality / effect locality', { arguments: c.argument_loc || 'Unspecified', effects: c.effect_loc || 'Unspecified' }) +
    (c.syntax || []).map((s, i) => section(`Overload ${i + 1}: arguments, types and return`, s)).join('') +
    section('Scheduling, execution role and restrictions', contract || 'No reviewed project contract; scheduling and execution restrictions remain unspecified. Read the documentation notes.') +
    section('Full documentation notes / examples', Object.fromEntries(Object.entries(c).filter(([key]) => !['name', 'description', 'since', 'argument_loc', 'effect_loc', 'syntax'].includes(key)))) +
    '\n\nUnspecified metadata does not mean unrestricted behavior. This snapshot is not an installed-engine availability check.';
}

function uriMapper(snapshot, rootUri, stageUri) {
  const { pathToFileURL } = require('node:url');
  const to = new Map(), from = new Map();
  const key = uri => decodeURIComponent(uri).toLowerCase().replace(/\/$/, '');
  for (const file of snapshot.files) {
    const source = pathToFileURL(file.source).href, target = pathToFileURL(file.target).href;
    const k = key(source); if (!to.has(k)) to.set(k, []);
    to.get(k).push(target); from.set(key(target), source);
  }
  const aliases = uri => to.get(key(uri)) || [];
  const roots = [key(rootUri), key(stageUri)];
  const uriCache = [new Map(), new Map()];
  function mapUri(uri, outbound) {
    const cache = uriCache[Number(outbound)];
    if (cache.has(uri)) return cache.get(uri);
    const normalized = key(uri);
    const mapped = outbound
      ? normalized === roots[0] ? stageUri : to.get(normalized)?.[0] || uri
      : normalized === roots[1] ? rootUri : from.get(normalized) || uri;
    // Bound retention for long editor sessions and navigation outside mounts.
    if (cache.size >= 16384) cache.clear();
    cache.set(uri, mapped);
    return mapped;
  }
  const map = (value, outbound) => {
    if (typeof value === 'string' && value.startsWith('file:')) return mapUri(value, outbound);
    if (value && typeof value === 'object') {
      let copy;
      // Most diagnostics contain no URIs. Retain unchanged branches instead of
      // rebuilding every range, position, message and code on every response.
      for (const k of Object.keys(value)) {
        const mapped = map(value[k], outbound);
        if (mapped !== value[k]) {
          if (!copy) copy = Array.isArray(value) ? value.slice() : { ...value };
          copy[k] = mapped;
        }
      }
      return copy || value;
    }
    return value;
  };
  return { aliases, map };
}

module.exports = { hash, withDiskBom, provision, verifySharedSources, Host, category, hoverMarkdown, uriMapper };
