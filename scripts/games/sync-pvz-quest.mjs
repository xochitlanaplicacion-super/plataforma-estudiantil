import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Mechanical packaging only: no database, deploy, downloads or student records.
const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = resolve(process.argv[2] || resolve(project, '../CARPETA DE JUEGOS NUEVOS/pvz-aula-prueba-local/public'));
const destination = resolve(project, 'public/games/pvz-quest');
const template = resolve(project, 'src/lib/games/pvz-quest/template.html');
const files = [];
async function copyTree(from, to, folder) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('No se empaquetan enlaces simbólicos.');
    if (entry.isDirectory()) { await copyTree(resolve(from, entry.name), resolve(to, entry.name), `${folder}/${entry.name}`); continue; }
    if (entry.name.startsWith('.') || /^(Thumbs\.db|ss_)/i.test(entry.name)) continue;
    if (!/\.(js|css|png|jpg|webp|gif|ico|mp3|ogg|wav)$/i.test(entry.name)) continue;
    await copyFile(resolve(from, entry.name), resolve(to, entry.name));
    files.push(`${folder}/${entry.name}`);
  }
}
const html = await readFile(resolve(source, 'classroom/index.html'), 'utf8');
if (!html.includes('Plantas') || !html.includes('quest-theme.css')) throw new Error('La plantilla Quest no está lista.');
await copyTree(resolve(source, 'classroom'), resolve(destination, 'classroom'), 'classroom');
await copyTree(resolve(source, 'assets'), resolve(destination, 'assets'), 'assets');
await mkdir(dirname(template), { recursive: true });
await writeFile(template, html);
// Keep the pure regression checks beside the version being shipped, rather
// than relying on a separate local prototype after a clone or deployment.
const checks = resolve(project, 'tests/games/pvz-quest');
await mkdir(checks, { recursive: true });
for (const name of ['engine', 'live-engine', 'tactical-engine', 'balance', 'questions', 'renderer', 'sound-events']) {
  const sourceTest = await readFile(resolve(source, `../tests/classroom-${name}.test.mjs`), 'utf8');
  await writeFile(resolve(checks, `${name}.test.mjs`), sourceTest
    .replaceAll('../public/classroom/', '../../../public/games/pvz-quest/classroom/')
    .replaceAll('../public/assets/', '../../../public/games/pvz-quest/assets/'));
}
await writeFile(resolve(destination, 'manifest.json'), JSON.stringify({
  name: 'Plantas vs Zombies Quest', source: 'https://github.com/aayush-musyaju/plant-vs-zombies',
  note: 'Adaptación educativa comunitaria. No es un producto oficial de PopCap/EA. La plantilla jugable requiere sesión de profesor.',
  files: files.sort(),
}, null, 2));
console.log(`Empaquetados ${files.length} recursos. HTML privado: src/lib/games/pvz-quest/template.html`);
