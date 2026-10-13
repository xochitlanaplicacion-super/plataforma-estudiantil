const fs = require('node:fs');
const path = require('node:path');
const UglifyJS = require('uglify-js');

const root = path.resolve(__dirname, '..');
const game = path.join(root, 'public/games/squeak-and-destroy');
const template = fs.readFileSync(path.join(root, 'src/lib/games/squeak-and-destroy/template.html'), 'utf8');
const declaration = template.match(/var mods = \[([\s\S]*?)\];/);
if (!declaration) throw new Error('No se encontró el orden de módulos del juego');
const names = [...declaration[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
const source = names.map((name) => fs.readFileSync(path.join(game, 'js', `${name}.js`), 'utf8')).join('\n;\n');
const result = UglifyJS.minify(source, { compress: { passes: 2 }, mangle: true, output: { ascii_only: true } });
if (result.error || !result.code) throw result.error || new Error('No se pudo generar el bundle');
fs.writeFileSync(path.join(game, 'bundle.min.js'), result.code + '\n');
console.log(`Animal Battle Ground: ${names.length} módulos, ${result.code.length} bytes`);
