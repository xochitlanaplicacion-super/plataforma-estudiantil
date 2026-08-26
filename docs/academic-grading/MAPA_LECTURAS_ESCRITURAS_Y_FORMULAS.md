# Mapa exhaustivo de lecturas, escrituras y fórmulas heredadas

Corte de código: commit base `3b1b3a9d967d64f31fa9e75676d9cd4d20940ad1`. Búsqueda reproducible:

```bash
rg -n "calificacion_manual|suma_calificaciones|historico_intentos|resultados_ejercicios|promedioAcumulado|promedioMateria|promedioGrupo" src
```

## Escrituras

| Archivo y símbolo | Entrada | Fórmula/escritura | Autorización actual | Consumidores/riesgo |
|---|---|---|---|---|
| `src/lib/actions/alumno.ts:230` `saveExerciseResult` | `calificacionIntento` 0–100 desde jugador | `nuevaSuma = suma + intento`; `calificacion = min(100,nuevaSuma/intentos)`; histórico guarda intento 0–100; bloquea si intento ≥100 | Usa cliente de sesión y `auth.getUser`; no revalida matrícula/asignación/ciclo porque aún no existen | Fuente automática principal; mezcla con manual y hace upsert alumno-ejercicio sin `tenant_id` explícito |
| `src/lib/actions/entregas.ts:294` `calificarEntregaDescriptiva` | docente introduce 0–10 | `calificacion_manual = nota`; `calificacion = nota*10`; `bloqueado=true`; estado `calificado` | `requireTenantSession`; profesor pasa helper de pertenencia, admin/superuser tenant | Crea doble verdad y obliga a consumidores a conocer dos escalas |
| `src/lib/actions/entregas.ts:178` envío descriptivo | metadatos de archivo | upsert en el mismo registro de resultado | Alumno tenant autenticado; verifica ejercicio | Nota y entrega comparten fila/estado; migración debe preservar archivo/caducidad |
| `src/app/api/cron/limpiar-entregas/route.ts:65` limpieza | caducidad del archivo | pone metadatos de Storage en `null`; no cambia nota | secreto de cron + cliente admin | Debe preservar calificación/histórico al limpiar evidencia |

## Lecturas y cálculos de alumno

| Archivo | Lectura/fórmula heredada | Presentación | Riesgo |
|---|---|---|---|
| `src/lib/actions/alumno.ts:151` | `calificacion ?? calificacion_manual` | modelo de ejercicios del alumno | Si `calificacion` existe será base 100; fallback puede ser base 10 |
| `src/app/dashboard/alumno/page.tsx:101` | suma `calificacion`, divide promedio entre 10 | promedio 0–10 | Descriptiva funciona sólo porque fue duplicada *10; fallback manual no entra |
| `src/app/dashboard/alumno/materias/page.tsx:64` | promedio de `calificacion`, vencidos cuentan 0, divide entre 10 | tarjeta de materia | Fórmula duplicada y política implícita de no entrega |
| `src/app/dashboard/alumno/components/SubjectCard.tsx:453` | muestra `Number(ex.calificacion).toFixed(1)` | etiqueta “Nota” | Recibe valor heredado posiblemente 0–100 aunque otras partes lo tratan 0–10 |
| `src/app/dashboard/alumno/ejercicios/[id]/page.tsx:30` | lee sólo `calificacion_manual` para descriptiva | entrega existente | Fuente paralela manual |
| `src/app/dashboard/alumno/ejercicios/[id]/ClientStudentPlayer.tsx:49` | usa resultado de `saveExerciseResult` | toast con `%` | Confirma que el contrato automático actual es 0–100 |
| `src/components/shared/EntregaAlumno.tsx:75` | presencia de `calificacion_manual` define calificada | muestra `/10` | Correcto sólo para descriptivas; estado depende del campo |
| `src/app/api/chat/alumno/route.ts:107` | suma `calificacion` sin dividir | texto mezcla `${calif}/10` y `(prom*10)/100` | Declara 0–10 mientras el campo es 0–100; puede alucinar resultados 10× |

## Lecturas y cálculos de profesor/admin

| Archivo | Lectura/fórmula heredada | Presentación | Riesgo |
|---|---|---|---|
| `src/lib/actions/academic.ts:854` | `calificacion ?? calificacion_manual`; promedia y divide entre 10 | rendimiento por alumno/materia/grupo | Fallback manual 0–10 también se divide entre 10; profesor se autoriza por sesión pero la consulta usa admin |
| `src/app/dashboard/profesor/grupos/page.tsx:443` | consume promedio ya 0–10 | umbral 6 | Depende de fórmula duplicada del action |
| `src/app/dashboard/profesor/grupos/page.tsx:667` | consume detalle que puede seguir 0–100 | umbral 6, muestra directo | Un 50/100 aparece 50.0 y aprobado |
| `src/lib/actions/auditoria.ts:124` | `calificacion ?? calificacion_manual`; vencidos=0; divide entre 10 | promedios y ranking | Misma ambigüedad; política de no entrega implícita |
| `src/app/dashboard/admin/auditoria/page.tsx:267` | consume promedio base 0–10 | umbrales 70/50 | Umbrales pertenecen a 0–100 y clasifican casi todo como rojo |
| `src/components/shared/PanelEntregasProfesor.tsx:133` | muestra `calificacion` directo | tarjeta automática | Correcto hoy en porcentaje, incompatible con futura escala sin migración coordinada |
| `src/components/shared/PanelEntregasProfesor.tsx:151` | recorre `historico_intentos[*].calificacion` | muestra valor directo | Histórico 0–100 sin etiqueta de unidad canónica |
| `src/components/shared/PanelEntregasProfesor.tsx:238` | muestra `calificacion_manual/10` | tarjeta descriptiva | Fuente paralela manual |
| `src/components/shared/PanelEntregasGlobales.tsx` | filtra/edita `calificacion_manual` | panel admin | Debe migrar a comando único auditado y concurrencia |
| `src/app/api/chat/copilot/route.ts:105` | promedia `calificacion` directo | texto `/100` | Contrato 0–100 explícito; no usa manual ni vencidos |

## Lecturas sin fórmula de nota

- `src/lib/actions/entregas.ts` obtiene paneles de entregas y URLs firmadas; selecciona ambos campos y el histórico.
- `src/app/api/cron/limpiar-entregas/route.ts` usa la tabla sólo para retención de archivos.
- `src/lib/database.types.ts` declara las cuatro columnas heredadas y debe regenerarse tras migraciones.
- `src/components/shared/PanelEntregasGlobales.tsx` y `PanelEntregasProfesor.tsx` mantienen estado local de notas manuales.

## Exclusión explícita

`acreditaciones.calificacion_numerica` y su interfaz corresponden al módulo de acreditación por áreas y no a `resultados_ejercicios` ni a la futura libreta. No se cambiarán bajo este plan sin nueva autorización.

## Punto de convergencia requerido

Los pasos 7, 9 y 12 deben reemplazar todas las fórmulas anteriores por un motor/contrato compartido y un read model 0–10. El Paso 14 sólo podrá retirar las rutas heredadas después de una búsqueda equivalente que no encuentre divisiones/multiplicaciones compensatorias ni etiquetas `/100` para notas.
