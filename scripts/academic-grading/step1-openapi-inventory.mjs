import crypto from 'node:crypto';
import fs from 'node:fs';
import dotenv from 'dotenv';

const envPath = process.argv[2] ?? '.env.local';
const env = dotenv.parse(fs.readFileSync(envPath));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y una clave secreta exclusivamente de servidor en el archivo de entorno.');
}

const response = await fetch(`${url}/rest/v1/`, {
  headers: {
    apikey: key,
    Accept: 'application/openapi+json',
  },
});
const body = await response.text();

if (!response.ok) {
  throw new Error(`OpenAPI respondió HTTP ${response.status}.`);
}

const document = JSON.parse(body);
const definitions = document.definitions ?? document.components?.schemas ?? {};
const expected = [
  'profiles', 'niveles', 'carreras', 'grados', 'grupos', 'materias',
  'grupo_materias', 'asignaciones_profesor', 'inscripciones_alumno',
  'ejercicios', 'resultados_ejercicios', 'fechas_evaluacion', 'auditoria',
  'ciclos_escolares', 'periodos_evaluacion', 'esquemas_evaluacion',
  'criterios_evaluacion', 'subcriterios_evaluacion', 'snapshots_calificaciones',
];

console.log(`OPENAPI|status=${response.status}|content_type=${response.headers.get('content-type')}`);
console.log(`OPENAPI|sha256=${crypto.createHash('sha256').update(body).digest('hex')}|bytes=${Buffer.byteLength(body)}`);
for (const name of expected) {
  const definition = definitions[name];
  console.log(`OPENAPI_TABLE|${name}|exists=${Boolean(definition)}|columns=${definition ? Object.keys(definition.properties ?? {}).length : 0}`);
}
