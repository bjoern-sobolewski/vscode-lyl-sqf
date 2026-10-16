// Repeatable real-repository workload. All edits target disposable snapshots.
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const inspector = require('node:inspector');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { pathToFileURL } = require('node:url');
const { createMessageConnection } = require('vscode-jsonrpc/node');
const root = require('../scripts/project').armaRepository(), extension = path.resolve(__dirname, '..');
const option = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i < 0 ? fallback : process.argv[i + 1]; };
const clientPath = path.resolve(option('client', path.join(extension, 'src')));
const { Host, hoverMarkdown } = require(path.join(clientPath, 'shared'));
const { startTransport } = require(path.join(clientPath, 'transport'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(check, label, timeout = 120000) {
  const end = performance.now() + timeout;
  while (performance.now() < end) { if (await check()) return; await sleep(20); }
  throw new Error('Timed out: ' + label);
}
async function main() {
  const label = option('label', 'current');
  const output = path.resolve(option('output', path.join(extension, 'test-results/performance', label + '-' + Date.now())));
  await fs.mkdir(output, { recursive: true });
  const stage = path.join(output, 'snapshot');
  const metrics = { label, node: process.version, timestamp: new Date().toISOString(), root, phases: {}, operations: [], logBytes: 0, notifications: 0, diagnosticBytes: 0, refreshes: 0 };
  const initialCpu = process.cpuUsage();
  metrics.snapshot = stage;
  const session = new inspector.Session(); session.connect();
  const post = promisify(session.post.bind(session));
  await post('Profiler.enable'); await post('Profiler.setSamplingInterval', { interval: 1000 }); await post('Profiler.start');
  const loop = monitorEventLoopDelay({ resolution: 10 }); loop.enable();
  let host, transport, rpc, lastMessage = performance.now();
  const diags = new Map(), logs = [];
  const log = s => { metrics.logBytes += Buffer.byteLength(s); logs.push(s); };
  const timing = async (name, action) => { const start = performance.now(); const result = await action(); const ms = performance.now() - start; metrics.phases[name] = Math.round(ms * 100) / 100; console.log(name + ': ' + ms.toFixed(1) + ' ms'); return result; };
  const drain = async () => { await eventually(() => performance.now() - lastMessage >= 300, 'diagnostics settle'); };
  async function processMetrics(name) {
    if (!transport?.process?.pid) return;
    const ids = [transport.process.pid, host.process.pid].join(',');
    const cmd = 'Get-Process -Id ' + ids + ' | Select-Object Id,ProcessName,TotalProcessorTime,WorkingSet64,PeakWorkingSet64 | ConvertTo-Json -Compress';
    const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-Command', cmd], { windowsHide: true });
    metrics[name] = JSON.parse(stdout.replace(/^\uFEFF/, ''));
  }
  try {
    host = new Host(path.resolve(option('host', path.join(extension, 'server/LYL.Sqf.EditorHost.exe'))), root, stage, log);
    const snapshot = await timing('prepare', () => host.request('prepare', { arma: option('arma', 'D:/Games/Steam/steamapps/common/Arma 3') }));
    metrics.mappedSources = snapshot.files.length; metrics.limitations = snapshot.limitations;
    process.env.HEMTT_PROFILE = '1';
    transport = await timing('connect', () => startTransport(path.resolve(option('hls', path.join(extension, 'server/hemtt-language-server.exe'))), host, snapshot, root, log));
    rpc = createMessageConnection(transport.reader, transport.writer);
    const send = rpc.sendRequest.bind(rpc);
    rpc.sendRequest = (method, params) => Promise.race([params === undefined ? send(method) : send(method, params), new Promise((_, reject) => { const t = setTimeout(() => reject(new Error('Request timeout: ' + method)), 120000); t.unref(); })]);
    rpc.onRequest('workspace/diagnostic/refresh', () => { metrics.refreshes++; lastMessage = performance.now(); return null; });
    rpc.onRequest('client/registerCapability', () => null);
    rpc.onNotification('textDocument/publishDiagnostics', p => {
      metrics.notifications++; metrics.diagnosticBytes += Buffer.byteLength(JSON.stringify(p));
      diags.set(p.uri.toLowerCase(), p.diagnostics); lastMessage = performance.now();
    });
    rpc.listen();
    await timing('initialize', () => rpc.sendRequest('initialize', { processId: process.pid, rootUri: pathToFileURL(root).href, workspaceFolders: [{ uri: pathToFileURL(root).href, name: 'repository' }], capabilities: { workspace: { diagnostics: { refreshSupport: true } } } }));
    await timing('startupAnalysis', async () => { await rpc.sendNotification('initialized', {}); await eventually(() => metrics.refreshes >= 2, 'initial SQF and config scans'); await drain(); });
    await processMetrics('startupProcesses');
    metrics.startupNotifications = metrics.notifications; metrics.startupDiagnosticBytes = metrics.diagnosticBytes;
    const file = path.join(root, 'mission/core/inv/fn_majorLootReturnPlan.sqf'), uri = pathToFileURL(file).href;
    const original = await fs.readFile(file), text = original.toString('utf8').replace(/^\uFEFF/, '');
    const open = async (uri, content, languageId = 'sqf') => {
      const initial = metrics.refreshes;
      await rpc.sendNotification('textDocument/didOpen', { textDocument: { uri, languageId, version: 1, text: content } });
      await eventually(() => metrics.refreshes >= initial + 2 * transport.mapper.aliases(uri).length, 'all open aliases analyzed'); await drain();
    };
    await timing('openFile', () => open(uri, text));
    let version = 1;
    for (let i = 0; i < 3; i++) {
      const start = performance.now(), count = metrics.notifications, bytes = metrics.diagnosticBytes;
      const initial = metrics.refreshes;
      await rpc.sendNotification('textDocument/didChange', { textDocument: { uri, version: ++version }, contentChanges: [{ text: 'private _lyl = ;' }] });
      await eventually(() => (diags.get(uri.toLowerCase()) || []).some(d => /^SPE/.test(d.code)), 'dirty error');
      const firstDiagnosticMs = performance.now() - start;
      await eventually(() => metrics.refreshes >= initial + 2 * transport.mapper.aliases(uri).length, 'all edit aliases analyzed');
      metrics.operations.push({ kind: 'editError', ms: firstDiagnosticMs, completeMs: performance.now() - start, notifications: metrics.notifications - count, diagnosticBytes: metrics.diagnosticBytes - bytes });
      const repair = performance.now();
      const repairing = metrics.refreshes;
      await rpc.sendNotification('textDocument/didChange', { textDocument: { uri, version: ++version }, contentChanges: [{ text: 'private _lyl = 1;' }] });
      await eventually(() => !(diags.get(uri.toLowerCase()) || []).some(d => /^SPE/.test(d.code)), 'repair');
      const firstRepairMs = performance.now() - repair;
      await eventually(() => metrics.refreshes >= repairing + 2 * transport.mapper.aliases(uri).length, 'all repair aliases analyzed');
      metrics.operations.push({ kind: 'editRepair', ms: firstRepairMs, completeMs: performance.now() - repair });
      await drain();
    }
    await timing('commandHover20', async () => { for (let i = 0; i < 20; i++) assert.ok(hoverMarkdown(await host.request('hover', { command: 'owner' })).includes('headless')); });
    await timing('contextChecks20', async () => { for (let i = 0; i < 20; i++) assert.equal((await host.request('analyze', { path: path.relative(root, file), text: 'owner objNull; sleep 1;' })).findings.length, 2); });
    const header = path.join(root, 'shared/macros/ids/community-goal-ids.hpp');
    const headerUri = pathToFileURL(header).href, headerText = await fs.readFile(header, 'utf8');
    await timing('openSharedHeader', () => open(headerUri, headerText, 'arma-config'));
    await timing('changeSharedHeader', async () => {
      const initial = metrics.refreshes;
      await rpc.sendNotification('textDocument/didChange', { textDocument: { uri: headerUri, version: 2 }, contentChanges: [{ text: headerText + '\n// benchmark overlay\n' }] });
      await eventually(() => metrics.refreshes >= initial + 2 * transport.mapper.aliases(headerUri).length, 'all shared header aliases analyzed'); await drain();
    });
    await processMetrics('finalProcesses');
    metrics.rustPhases = await rpc.sendRequest('hemtt/performance').catch(() => null);
    const normalized = [];
    for (const [file, findings] of diags) for (const d of findings) normalized.push(JSON.stringify([file, d.code, d.range, d.severity, d.message]));
    normalized.sort(); metrics.diagnosticInventory = normalized;
    assert.deepEqual(await fs.readFile(file), original, 'production bytes preserved');
    const { profile } = await post('Profiler.stop');
    await fs.writeFile(path.join(output, 'adapter.cpuprofile'), JSON.stringify(profile));
    metrics.adapterCpuMicroseconds = process.cpuUsage(initialCpu);
    loop.disable(); metrics.eventLoop = { meanMs: loop.mean / 1e6, maxMs: loop.max / 1e6, p99Ms: loop.percentile(99) / 1e6 }; metrics.nodeMemory = process.memoryUsage();
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(metrics, null, 2));
    await fs.writeFile(path.join(output, 'hls.log'), logs.join(''));
    console.log('Result: ' + path.join(output, 'results.json'));
    await rpc.sendRequest('shutdown'); await rpc.sendNotification('exit');
  } finally {
    loop.disable(); session.disconnect(); rpc?.dispose(); transport?.dispose(); host?.dispose();
    const safe = path.resolve(output) + path.sep;
    if (path.resolve(stage).startsWith(safe)) await fs.rm(stage, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
