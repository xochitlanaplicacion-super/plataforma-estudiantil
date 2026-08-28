# Resultados de cierre — Paso 6

## Alcance completado

- Helpers privados de pertenencia, asignación exacta y matrícula.
- RLS forzada en once tablas académicas.
- Sustitución integral de políticas antiguas, incluidas las políticas `FOR ALL` de profesor.
- Políticas separadas por operación y grants mínimos.
- Tres vistas `security_invoker`: libreta, desglose y alumno.
- Seis índices específicos para predicados RLS.
- Capa TypeScript de lecturas mediante `SupabaseClient<Database>` de sesión; no crea ni acepta cliente administrativo.
- Contrato neutral 401/403/404/409/500 sin filtrar mensajes SQL.
- Matriz de dos tenants, dos profesores del mismo grupo, alumno, admin, suspendidos y anon.

## Evidencia automatizada

Comando canónico:

```bash
npm run test:paso6
```

Resultado aprobado:

- pgTAP estructura limpia: 43/43.
- pgTAP estructura existente: 43/43.
- pgTAP matriz RLS/grants/IDOR: 31/31.
- Total pgTAP ejecutado: 117 aserciones.
- PostgREST con JWT: profesor A, profesor A2, alumno A, admin A, suspendido y anon aprobados.
- EXPLAIN: `academic_direct_grades_rls_idx` utilizado.
- `supabase db lint --schema public,private --fail-on error`: cero errores.
- Auditoría propia: cero políticas permisivas `FOR ALL` en fuentes y cero `SECURITY DEFINER` privados sin `search_path=''`.
- Rollback transaccional: vistas/helpers nuevos desaparecen y se recupera la política segura previa del Paso 5.
- Unitarias: 64/64 en 10 archivos.
- Componentes: 7/7 en 3 archivos.
- TypeScript: cero errores.
- Playwright: 2 escenarios localizados.
- Build de producción: compilación aprobada y 53 páginas generadas.

La ejecución usa PostgreSQL Supabase 17.6 y PostgREST 12.2.12 desechables. Los contenedores y la red se eliminan al finalizar.

## Aislamiento demostrado

- Tenant A nunca obtiene filas B y viceversa.
- Dos profesores del mismo grupo sólo ven/modifican su asignación exacta.
- El alumno sólo consulta su matrícula y nunca abre la libreta de profesor.
- Usuario o tenant suspendido obtiene cero filas.
- `auth.uid()` nulo falla cerrado.
- Parámetros UUID manipulados devuelven cero filas.
- Anon carece de grants.
- Un profesor no puede editar directamente `resultados_ejercicios` ni borrar fuentes.
- Las vistas no contienen PII de perfil ni datos de institución.

## Estado de migración

La migración fue creada mediante Supabase CLI y sólo se aplicó a bases locales desechables. No se ejecutó `supabase db push`, no hubo DDL/DML remoto, backfill productivo, despliegue ni push Git.

## Rollback

Antes de cualquier aplicación remota, revertir el commit local del Paso 6. Tras una aplicación futura, no se debe restaurar una política amplia de profesor: retirar consumidores y aplicar una migración compensatoria deny-by-default mientras se corrige. El arnés demuestra rollback transaccional al estado posterior al Paso 5.

## Límite canónico

El motor determinista, ponderaciones finales y explicación de la nota pertenecen al Paso 7 y no fueron iniciados.
