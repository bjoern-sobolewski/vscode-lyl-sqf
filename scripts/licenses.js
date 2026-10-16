// Collect upstream notices from the pinned build inputs, without changing licenses.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const extension = path.resolve(__dirname, '..'), fork = path.resolve(process.argv[2]);
const output = path.join(extension, 'licenses'), catalog = [];
fs.mkdirSync(output, { recursive: true });
function collect(kind, name, dir, info = {}) {
  const target = path.join(output, kind, name.replace(/[^A-Za-z0-9_.-]/g, '_'));
  fs.mkdirSync(target, { recursive: true });
  let count = 0;
  function scan(current, depth) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isFile() && /^(licen[sc]e|notice|copying|copyright|third.?party)/i.test(entry.name)) {
        fs.copyFileSync(file, path.join(target, path.relative(dir, file).replaceAll(path.sep, '_'))); count++;
      } else if (entry.isDirectory() && depth < 2 && /^(licen[sc]es?|legal|notices?)$/i.test(entry.name)) scan(file, depth + 1);
    }
  }
  if (fs.existsSync(dir)) scan(dir, 0);
  if (info.license_file) {
    const file = path.resolve(dir, info.license_file);
    if (fs.existsSync(file)) { fs.copyFileSync(file, path.join(target, path.basename(file))); count++; }
  }
  catalog.push({ kind, name, license: info.license || 'See upstream notices', repository: info.repository, notices: count });
}
const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--format-version', '1', '--locked', '--filter-platform', 'x86_64-pc-windows-msvc'], { cwd: fork, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
const nodes = new Map(metadata.resolve.nodes.map(n => [n.id, n]));
const hls = metadata.packages.find(p => p.name === 'hemtt-language-server');
const used = new Set();
function visit(id) { if (used.has(id)) return; used.add(id); for (const dep of nodes.get(id)?.deps || []) if (dep.dep_kinds.some(k => k.kind !== 'dev')) visit(dep.pkg); }
visit(hls.id);
for (const pkg of metadata.packages.filter(p => used.has(p.id))) collect('rust', pkg.name + '-' + pkg.version, path.dirname(pkg.manifest_path), pkg);
const seen = new Set();
function npm(dir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json')));
  for (const name of Object.keys(pkg.dependencies || {})) {
    let base = dir, located;
    while (true) {
      const candidate = path.join(base, 'node_modules', name);
      if (fs.existsSync(path.join(candidate, 'package.json'))) { located = candidate; break; }
      const parent = path.dirname(base); if (parent === base) break; base = parent;
    }
    if (!located || seen.has(located)) continue;
    seen.add(located); const dependency = JSON.parse(fs.readFileSync(path.join(located, 'package.json')));
    collect('npm', dependency.name + '-' + dependency.version, located, dependency); npm(located);
  }
}
npm(extension);
if (!process.argv[3]) throw new Error('Pass the Arma repository as the third argument.');
const assets = JSON.parse(fs.readFileSync(path.join(extension, 'host/obj/project.assets.json')));
for (const [name, library] of Object.entries(assets.libraries)) if (library.type === 'package') {
  for (const folder of Object.keys(assets.packageFolders)) {
    const dir = path.join(folder, library.path); if (fs.existsSync(dir)) { collect('dotnet', name, dir); break; }
  }
}
const runtimeBase = path.join(os.homedir(), '.nuget/packages/microsoft.netcore.app.runtime.win-x64');
for (const version of fs.readdirSync(runtimeBase)) collect('dotnet', 'Microsoft.NETCore.App-runtime-' + version, path.join(runtimeBase, version));
fs.writeFileSync(path.join(output, 'catalog.json'), JSON.stringify(catalog, null, 2));
console.log(`Collected notices for ${catalog.length} pinned dependencies.`);
