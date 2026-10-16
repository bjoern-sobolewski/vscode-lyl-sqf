'use strict';
const net = require('node:net');
const { spawn } = require('node:child_process');
const { StreamMessageReader, StreamMessageWriter } = require('vscode-jsonrpc/node');
const { uriMapper, category, withDiskBom } = require('./shared');
const { pathToFileURL, fileURLToPath } = require('node:url');
const path = require('node:path');

async function startTransport(exe, host, snapshot, root, log) {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let child;
  const socket = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child?.kill(); server.close(); reject(new Error('HEMTT language server connection timed out')); }, 30000);
    server.once('connection', connection => { clearTimeout(timer); resolve(connection); });
    child = spawn(exe, [String(server.address().port)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', b => log(b.toString())); child.stderr.on('data', b => log(b.toString()));
    child.once('error', error => { clearTimeout(timer); server.close(); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`HEMTT language server exited (${code})`)); });
  });
  server.close();
  const reader = new StreamMessageReader(socket), writer = new StreamMessageWriter(socket);
  const mapper = uriMapper(snapshot, pathToFileURL(root).href, pathToFileURL(snapshot.root).href);
  let chain = Promise.resolve();
  const diagnostics = new Map();
  const byFile = new Map(), published = new Map();
  const transport = {
    reader: {
      onError: reader.onError, onClose: reader.onClose, onPartialMessage: reader.onPartialMessage,
      dispose: () => reader.dispose(),
      listen(callback) {
        return reader.listen(message => {
          // vscode-languageclient deliberately omits WorkspaceFoldersFeature
          // for a per-folder client. HLS still requests it: answer with this
          // session's staged root rather than exposing other repository roots.
          if (message.method === 'workspace/workspaceFolders' && message.id !== undefined) {
            writer.write({ jsonrpc: '2.0', id: message.id, result: [{ uri: pathToFileURL(snapshot.root).href, name: path.basename(root) }] }).catch(error => log(`Workspace response failed: ${error.message}`));
            return;
          }
          if (message.method === 'textDocument/publishDiagnostics') {
            const original = message.params.uri;
            const mappedFindings = mapper.map(message.params.diagnostics, false);
            diagnostics.set(original, mappedFindings);
            const uri = mapper.map(original, false), key = uri.toLowerCase(), combined = new Map();
            if (!byFile.has(key)) byFile.set(key, new Map());
            byFile.get(key).set(original, mappedFindings);
            // A full mission can publish thousands of batches. Index aliases by
            // physical file; scanning every repository alias for each batch
            // stalls the VS Code extension host. Skip identical republishing.
            for (const findings of byFile.get(key).values()) {
              for (const finding of findings) {
                const kind = category(String(finding.code || ''), finding.message);
                const diagnostic = { ...finding, source: `LYL HEMTT · ${kind}`, message: `[${kind}] ${finding.message}` };
                combined.set(JSON.stringify(diagnostic), diagnostic);
              }
            }
            const merged = [...combined.values()], fingerprint = JSON.stringify([message.params.version, merged]);
            if (published.get(key) !== fingerprint) {
              published.set(key, fingerprint);
              callback({ ...message, params: { ...message.params, uri, diagnostics: merged } });
            }
          } else callback(mapper.map(message, false));
        });
      }
    },
    writer: {
      onError: writer.onError, onClose: writer.onClose,
      dispose: () => writer.dispose(), end: () => writer.end(),
      write(message) {
        const action = async () => {
          if (message.method === 'initialize') {
            message = mapper.map(message, true);
            if (message.params.rootPath) message.params.rootPath = snapshot.root;
            return writer.write(message);
          }
          const doc = message.params?.textDocument;
          if (doc && ['textDocument/didOpen', 'textDocument/didChange', 'textDocument/didClose'].includes(message.method)) {
            const aliases = mapper.aliases(doc.uri);
            if (!aliases.length) return; // Files outside the configured source mounts have no invented context.
            let text = message.method.endsWith('didOpen') ? doc.text : message.params.contentChanges?.[0]?.text;
            if (text !== undefined) {
              text = await withDiskBom(fileURLToPath(doc.uri), text);
              message = message.method.endsWith('didOpen')
                ? { ...message, params: { ...message.params, textDocument: { ...doc, text } } }
                : { ...message, params: { ...message.params, contentChanges: [{ text }] } };
              await host.request('update', { path: path.relative(root, fileURLToPath(doc.uri)), text });
            } else if (message.method.endsWith('didClose')) {
              // Revert only disposable snapshots when a dirty document is discarded.
              const fs = require('node:fs/promises');
              const disk = await fs.readFile(fileURLToPath(doc.uri), 'utf8').catch(() => undefined);
              if (disk !== undefined) await host.request('update', { path: path.relative(root, fileURLToPath(doc.uri)), text: disk });
            }
            for (const uri of aliases) {
              const mapped = mapper.map(message, true); mapped.params.textDocument.uri = uri;
              await writer.write(mapped);
            }
            return;
          }
          await writer.write(mapper.map(message, true));
        };
        const next = chain.then(action); chain = next.catch(error => log(`LSP transport: ${error.message}`));
        return next;
      }
    },
    mapper, diagnostics, process: child,
    dispose() { socket.destroy(); child.kill(); reader.dispose(); writer.dispose(); }
  };
  return transport;
}
module.exports = { startTransport };
