const fs = require('node:fs/promises');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { createWriteStream } = require('node:fs');
const yauzl = require('yauzl');
const { runTests } = require('@vscode/test-electron');
async function main() {
  const extension = path.resolve(__dirname, '..'), root = require('../scripts/project').armaRepository();
  const output = path.join(extension, 'test-results', 'vscode-' + Date.now());
  const extracted = path.join(output, 'vsix'); await fs.mkdir(extracted, { recursive: true });
  const archive = path.join(extension, `lyl-sqf-${require('../package.json').version}.vsix`);
  await new Promise((resolve, reject) => yauzl.open(archive, { lazyEntries: true }, (error, zip) => {
    if (error) return reject(error);
    zip.on('error', reject); zip.on('end', resolve);
    zip.on('entry', async entry => {
      const destination = path.resolve(extracted, entry.fileName);
      if (!destination.startsWith(extracted + path.sep)) { zip.close(); reject(new Error('Unsafe VSIX entry')); return; }
      try {
        if (entry.fileName.endsWith('/')) { await fs.mkdir(destination, { recursive: true }); zip.readEntry(); return; }
        await fs.mkdir(path.dirname(destination), { recursive: true });
        zip.openReadStream(entry, async (error, stream) => {
          if (error) return reject(error);
          try { await pipeline(stream, createWriteStream(destination)); zip.readEntry(); } catch (e) { reject(e); }
        });
      } catch (e) { reject(e); }
    }); zip.readEntry();
  }));
  const workspace = path.join(output, 'repository.code-workspace');
  await fs.writeFile(workspace, JSON.stringify({ folders: [{ path: root }], settings: {
    'files.autoSave': 'off', 'files.associations': { '*.sqf': 'sqf', '*.hpp': 'arma-config', '*.inc': 'arma-config', '*.ext': 'arma-config' },
    '[sqf]': { 'files.autoSave': 'off' },
    '[arma-config]': { 'files.autoSave': 'off' },
    'security.workspace.trust.enabled': false, 'extensions.autoCheckUpdates': false, 'extensions.autoUpdate': false,
    'telemetry.telemetryLevel': 'off', 'update.mode': 'none', 'workbench.startupEditor': 'none'
  } }));
  const exit = await runTests({ ...(process.env.LYL_VSCODE_EXE ? { vscodeExecutablePath: process.env.LYL_VSCODE_EXE } : { version: '1.105.1' }),
    extensionDevelopmentPath: path.join(extracted, 'extension'), extensionTestsPath: path.join(__dirname, 'vscode-suite.js'),
    extensionTestsEnv: { LYL_EDITOR_REPORT: path.join(output, 'results.json'), LYL_EDITOR_ROOT: root },
    launchArgs: [workspace, '--user-data-dir', path.join(output, 'profile'), '--extensions-dir', path.join(output, 'extensions'), '--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--disable-gpu', '--no-sandbox']
  });
  if (exit !== 0) throw new Error('VS Code test host failed: ' + exit);
  console.log('Packaged VSIX validation report: ' + path.join(output, 'results.json'));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
