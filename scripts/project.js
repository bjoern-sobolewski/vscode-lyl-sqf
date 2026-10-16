// Integration tests/builds use an explicit private project checkout. Never infer it
// from the extension's location or copy mission sources into this public repository.
const fs = require('node:fs');
const path = require('node:path');
function armaRepository() {
  const value = process.env.LYL_ARMA_REPOSITORY;
  if (!value) throw new Error('Set LYL_ARMA_REPOSITORY to the full LiveYourLife checkout for integration tests/profiling.');
  const root = path.resolve(value);
  if (!fs.existsSync(path.join(root, 'tests/sqf/syntax.json'))) throw new Error('LYL_ARMA_REPOSITORY has no tests/sqf/syntax.json');
  return root;
}
module.exports = { armaRepository };
