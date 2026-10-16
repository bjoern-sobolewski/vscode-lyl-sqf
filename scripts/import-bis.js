// Explicit maintainer import. Never downloaded or inferred during activation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const source = path.resolve(process.argv[2]);
const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json')));
if (pkg.publisher !== 'skacekachna' || pkg.version !== '0.12.4' || pkg.license !== 'MIT') throw new Error('Expected reviewed SQFLint 0.12.4 input');
const bytes = fs.readFileSync(path.join(source, 'definitions/documentation.json'));
const functions = Object.values(JSON.parse(bytes)).filter(e => e.type === 'function' && /^BIS_fnc_/i.test(e.title) && e.compatibility?.some(c => c.game === 'arma3'));
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'data/bis-functions.json'), JSON.stringify({ schema: 1,
  provenance: { package: 'skacekachna.sqflint', version: pkg.version, source: pkg.repository.url,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    documentation: 'Bohemia Interactive Community Wiki contributors; historical snapshot, not installed-engine availability',
    copyright: 'https://community.bistudio.com/wiki/Bohemia_Interactive_Community:Copyrights' }, functions }, null, 2) + '\n');
fs.copyFileSync(path.join(source, 'LICENSE.txt'), path.join(root, 'licenses/SQFLint.txt'));
console.log(`Imported ${functions.length} documented Arma 3 BIS functions; no engine-command or CBA/ACE data copied.`);
