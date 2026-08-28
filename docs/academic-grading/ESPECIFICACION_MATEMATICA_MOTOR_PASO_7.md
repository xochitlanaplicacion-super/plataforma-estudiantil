# Especificación matemática del motor académico determinista v1

## Contrato y dominio

El motor recibe un dataset ya autorizado, acotado y sin PII. No autentica ni decide permisos. Su única escala de salida es `0.0000–10.0000`; los porcentajes `0–100` existen exclusivamente como ponderaciones. La implementación canónica está duplicada deliberadamente en TypeScript con enteros fijos y PostgreSQL con `numeric`, y ambas consumen los mismos casos dorados.

La precisión interna contractual es de ocho decimales. El total exacto se expresa con cuatro y la presentación con `0`, `1` o `2`, siempre `HALF_UP`. Toda cifra JSON del breakdown se serializa como texto decimal fijo: evita pérdida IEEE-754 y hace posible exigir diferencia exacta cero.

## Cadena de cálculo

Para cada fuente `s`:

1. Si su escala es `0-10`, `ratio_s = nota_s / 10`.
2. Si su escala es `0-1`, `ratio_s = valor_s`.
3. Se valida `0 ≤ ratio_s ≤ 1`; un valor negativo, `10.0001` o `1.0001` se rechaza.
4. La nota canónica explicable de la fuente es `nota_s = ratio_s × 10`.

Para una unidad con fuentes computables `S`:

`ratio_unidad = round8(sum(ratio_s) / |S|)`

Para un criterio híbrido con subcriterios computables `H`, pesos internos `w_h` y `D_h = sum(w_h)`:

`ratio_criterio = round8(sum(ratio_h × w_h) / D_h)`

Para criterios computables `C`, pesos superiores `W_c` y `D_c = sum(W_c)`:

`aporte_c = round4(ratio_c × 10 × W_c / D_c)`

`total_exacto = sum(aporte_c)`

El peso efectivo presentado es `W_c × 100 / D_c`. Por ello un elemento excluido no se convierte en cero: sale del numerador y del denominador, y los aportes explican exactamente el total. Los pesos configurados de criterios y de cada conjunto interno deben sumar `100.0000`; el motor rechaza cualquier otro contrato.

## Estados y denominadores

| Estado/caso | Periodo abierto | Periodo cerrado |
|---|---|---|
| `calificado` | Incluye valor validado | Incluye valor validado |
| `no_entregado` | Excluye y advierte; no inventa cero | Incluye ratio `0.00000000` |
| `justificado` | Excluye y advierte | Excluye y advierte |
| `sin_capturar`, `pendiente`, `entregado`, `tardio` | Excluye y advierte | Excluye y advierte |
| participación, denominador cero, regla `cero` | Incluye ratio cero | Incluye ratio cero |
| participación, denominador cero, regla `excluir` | Excluye y advierte | Excluye y advierte |

Si no queda ninguna fuente o criterio computable, el total es `null`, nunca `NaN` ni `Infinity`. El contrato `complete` permanece falso mientras haya pendientes, no entregados abiertos, denominador cero excluido o unidades sin datos. Una justificación se informa, pero no vuelve incompleto el cálculo por sí sola.

`ausente` no se guarda como un octavo estado ambiguo. Antes de calcular, el flujo institucional debe clasificar la ausencia como `no_entregado` o `justificado`; cualquier estado no perteneciente al contrato canónico se rechaza en TypeScript y SQL. Así la ausencia no puede convertirse silenciosamente en cero.

La normalización de participación ocurre en `vista_participacion_normalizada`: `min(1,max(0,puntos/meta))` para meta fija, o `min(1,max(0,puntos/maximo_grupo))` para máximo. El motor recibe ese ratio y no vuelve a normalizarlo.

## Determinismo, orden y equivalencia heredada

- Criterios y subcriterios se ordenan por `(orden,id)`; fuentes por `id`.
- Ningún cálculo depende del orden recibido.
- No se modifica la nota fuente ni se persiste un valor redondeado.
- Una nota heredada `L` en `0–100` es equivalente sólo si `abs(L/10 - total_exacto) ≤ tolerancia`. En certificación la tolerancia acordada es `0.0000`.
- El flag `ACADEMIC_GRADING_ENGINE_V2_ENABLED` queda apagado por defecto. Desactivarlo restaura la lectura heredada antes del corte; el Paso 7 no cambia consumidores productivos.

## Seguridad y rendimiento

`public.calcular_calificacion_academica(jsonb)` es `IMMUTABLE SECURITY INVOKER`, no realiza I/O, admite hasta 100 criterios, 1,000 fuentes y 1 MiB, y no es ejecutable por `anon`. `public.calcular_resultado_academico(uuid,uuid,uuid)` es `STABLE SECURITY INVOKER`: consulta una sola vez `vista_desglose_calificacion`, hereda su RLS y no acepta `tenant_id` del cliente. El adaptador TypeScript aplica los mismos filtros, solicita `limit+1` y rechaza truncamiento; no incorpora nombre, correo, matrícula ni identificador personal al dataset del motor.

No se añadió índice: el `EXPLAIN` demuestra que los índices académicos existentes cubren asignación, periodo y matrícula. Añadir otro sin evidencia duplicaría escritura y almacenamiento.

## Evidencia compartida

`tests/fixtures/academic-grading-step7-golden.json` cubre notas y pesos 0/5/10, ratios 0/0.5/1, directo, actividades, híbrido, participación por meta/máximo ya normalizada, no entrega abierta/cerrada, justificado, ambos tratamientos de denominador cero y redondeo. TypeScript y pgTAP cargan el mismo archivo y exigen coincidencia exacta del total y cada aporte.

Referencias de implementación consultadas: [funciones de base de datos Supabase](https://supabase.com/docs/guides/database/functions), [pruebas de base de datos con pgTAP](https://supabase.com/docs/guides/database/testing) y [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).
