// Fail on changed findings; timing changes are evidence, not a flaky threshold.
'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const [baselinePath, currentPath] = process.argv.slice(2);
if (!baselinePath || !currentPath) throw new Error('Usage: node test/compare-performance.js BASELINE/results.json CURRENT/results.json');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const baseline = read(baselinePath), current = read(currentPath);
function inventory(run, file) {
  const stage = (run.snapshot || require('node:path').join(require('node:path').dirname(file), 'snapshot'));
  const prefix = pathToFileURL(require('node:path').resolve(stage)).href.toLowerCase();
  return run.diagnosticInventory.map(text => {
    const record = JSON.parse(text);
    // Vendored-header findings have no production-source alias. Normalize only
    // this workload's disposable snapshot prefix; keep every other field exact.
    if (record[0].startsWith(prefix + '/')) record[0] = '$SNAPSHOT' + record[0].slice(prefix.length);
    return JSON.stringify(record);
  }).sort();
}
assert.deepEqual(inventory(current, currentPath), inventory(baseline, baselinePath), 'Diagnostic inventory changed: investigate before accepting timings');
const median = values => { const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
const cpu = (run, host) => run.finalProcesses.find(p => host ? p.ProcessName.includes('EditorHost') : !p.ProcessName.includes('EditorHost')).TotalProcessorTime.TotalSeconds;
const rows = {};
function row(name, before, after) { rows[name] = { before, after, reductionPercent: Math.round((1 - after / before) * 10000) / 100 }; }
for (const name of Object.keys(baseline.phases)) if (current.phases[name] !== undefined) row(name + 'Ms', baseline.phases[name], current.phases[name]);
row('editCompleteMedianMs', median(baseline.operations.map(o => o.completeMs)), median(current.operations.map(o => o.completeMs)));
row('diagnosticNotifications', baseline.notifications, current.notifications);
row('diagnosticBytes', baseline.diagnosticBytes, current.diagnosticBytes);
row('hlsCpuSeconds', cpu(baseline, false), cpu(current, false));
row('hostCpuSeconds', cpu(baseline, true), cpu(current, true));
console.log(JSON.stringify({ sameDiagnosticInventory: true, findings: current.diagnosticInventory.length, baseline: baseline.label, current: current.label, rows }, null, 2));
