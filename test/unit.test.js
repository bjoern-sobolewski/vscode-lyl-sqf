const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { hash, withDiskBom, provision, verifySharedSources, category, hoverMarkdown, uriMapper } = require('../src/shared');

test('disk BOM survives editor text normalization and encoding-only saves clear it', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lyl-bom-'));
  try {
    const file = path.join(dir, 'source.sqf');
    await fs.writeFile(file, '\uFEFFprivate _s="GrÃ¼ÃŸe";');
    assert.equal(await withDiskBom(file, 'private _s="GrÃ¼ÃŸe";'), '\uFEFFprivate _s="GrÃ¼ÃŸe";');
    assert.equal(await withDiskBom(file, '\uFEFFprivate _s="GrÃ¼ÃŸe";'), '\uFEFFprivate _s="GrÃ¼ÃŸe";');
    await fs.writeFile(file, 'private _s="GrÃ¼ÃŸe";');
    assert.equal(await withDiskBom(file, 'private _s="GrÃ¼ÃŸe";'), 'private _s="GrÃ¼ÃŸe";');
    assert.equal(await withDiskBom(path.join(dir, 'new.sqf'), '1'), '1');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('diagnostic labels keep syntax, runtime, limitations and policy distinct', () => {
  assert.equal(category('SPE2', 'expected expression'), 'syntax');
  assert.equal(category('PE12', 'Include not found'), 'compatibility limitation');
  assert.equal(category('L-S12'), 'likely runtime defect');
  assert.equal(category('L-S23'), 'policy');
  assert.equal(category('BOM', 'UTF-8 BOM is disallowed by encoding policy'), 'policy');
  assert.equal(category('PW6', 'Include uses forward slash'), 'policy');
  assert.equal(category('ULC', 'Unused lint configuration'), 'policy');
  assert.equal(category('UNKNOWN'), 'compatibility limitation');
});
test('rich hover retains every overload, raw prose, locality and explicit unknown restrictions', () => {
  const md = hoverMarkdown({ revision: 'pinned', command: { name: 'test', source: 'https://example.test', description: 'Do not use in event handlers', syntax: [{ params: [{ name: 'x', type: 'Boolean' }], ret: ['String'] }, { params: [], ret: ['Nothing'] }] } });
  for (const expected of ['Overload 1', 'Overload 2', 'Boolean', 'String', 'Nothing', 'Engine version', 'Unspecified', 'scheduling', 'Do not use in event handlers']) assert.ok(md.includes(expected), expected);
});
test('URI mapping supports Windows encoded drives, spaces, aliases and nested navigation locations', () => {
  const source = 'D:\\repo with spaces\\shared\\test.hpp';
  const targets = ['D:\\snapshot\\addons\\mission\\test.hpp', 'D:\\snapshot\\test.hpp'];
  const mapper = uriMapper({ files: targets.map(target => ({ source, target })) }, 'file:///D:/repo%20with%20spaces', 'file:///D:/snapshot');
  const uri = pathToFileURL(source).href.replace('D:', 'd%3A');
  assert.equal(mapper.aliases(uri).length, 2);
  assert.equal(mapper.map({ location: { uri: pathToFileURL(targets[1]).href } }, false).location.uri, pathToFileURL(source).href);
  assert.equal(mapper.map('file:///d%3A/repo%20with%20spaces', true), 'file:///D:/snapshot');
});
test('bundled tools are hash checked, corrupt cache repaired, corrupt package rejected', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lyl-tool-test-'));
  try {
    await fs.mkdir(path.join(dir, 'server'));
    const bytes = Buffer.from('test-tool'), sha256 = hash(bytes);
    await fs.writeFile(path.join(dir, 'server/tool.exe'), bytes);
    await fs.writeFile(path.join(dir, 'server/tools.json'), JSON.stringify({ tools: { host: { file: 'tool.exe', sha256 } } }));
    const storage = path.join(dir, 'storage');
    const first = await provision(dir, storage);
    await fs.writeFile(first.host, 'corruption');
    assert.equal(hash(await fs.readFile((await provision(dir, storage)).host)), sha256);
    await fs.writeFile(path.join(dir, 'server/tool.exe'), 'corrupt package');
    await assert.rejects(provision(dir, storage), /checksum mismatch/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('shared implementation stamp ignores line endings and rejects semantic drift', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lyl-source-test-'));
  try {
    const file = 'z_cmd/Arma3.DevTools/test.cs';
    await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await fs.writeFile(path.join(dir, file), '\uFEFFline1\r\nline2\r\n');
    const manifest = { sharedSources: { [file]: hash(Buffer.from('line1\nline2\n')) } };
    await verifySharedSources(dir, manifest);
    await fs.writeFile(path.join(dir, file), 'changed code');
    await assert.rejects(verifySharedSources(dir, manifest), /Shared analysis source changed/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('URI mapping shares unchanged branches without mutating protocol messages', () => {
  const source = pathToFileURL('D:/repo/a.sqf').href;
  const target = pathToFileURL('D:/snapshot/a.sqf').href;
  const mapper = uriMapper({ files: [{ source: 'D:/repo/a.sqf', target: 'D:/snapshot/a.sqf' }] }, 'file:///D:/repo', 'file:///D:/snapshot');
  const range = { start: { line: 1, character: 2 }, end: { line: 1, character: 3 } };
  const input = { params: { textDocument: { uri: source }, range } };
  const mapped = mapper.map(input, true);
  assert.equal(mapped.params.textDocument.uri, target);
  assert.equal(input.params.textDocument.uri, source);
  assert.equal(mapped.params.range, range);
  assert.equal(mapper.map(range, false), range);
  assert.equal(mapper.map(mapped, false).params.textDocument.uri, source);
});

test('integration project selection is explicit and independent of extension location', async () => {
  const { armaRepository } = require('../scripts/project');
  const saved = process.env.LYL_ARMA_REPOSITORY;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lyl-project-test-'));
  try {
    delete process.env.LYL_ARMA_REPOSITORY;
    assert.throws(armaRepository, /Set LYL_ARMA_REPOSITORY/);
    process.env.LYL_ARMA_REPOSITORY = dir;
    assert.throws(armaRepository, /no tests/);
    await fs.mkdir(path.join(dir, 'tests/sqf'), { recursive: true });
    await fs.writeFile(path.join(dir, 'tests/sqf/syntax.json'), '{}');
    assert.equal(armaRepository(), path.resolve(dir));
  } finally {
    if (saved === undefined) delete process.env.LYL_ARMA_REPOSITORY;
    else process.env.LYL_ARMA_REPOSITORY = saved;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
