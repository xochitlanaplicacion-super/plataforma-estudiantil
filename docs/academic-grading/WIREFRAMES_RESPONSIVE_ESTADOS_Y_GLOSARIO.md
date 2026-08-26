# Wireframes responsive, navegación, estados y glosario

Documento de diseño contractual. No crea pantallas en Paso 1 y no fija colores: toda implementación debe consumir tokens semánticos de la institución (`primary`, `primary-foreground`, fondo, borde, éxito/advertencia/error accesibles).

## Navegación prevista

- Superuser/admin: menú `Evaluación → Ciclos y periodos`, `Esquemas`, `Libreta`, `Cierres`.
- Profesor: menú `Evaluación → Mis clases → Libreta`.
- Alumno: menú `Calificaciones → Periodo`.
- Platform admin: sin acceso nominal a libreta; sólo métricas globales agregadas fuera de este flujo.

Toda pantalla conserva contexto visible: institución, ciclo, periodo, nivel, carrera (si aplica), grado, grupo, materia y profesor/asignación.

## Escritorio ≥ 1024 px — libreta

```text
┌ Evaluación / Calificaciones ───────────────────────────────────────────────┐
│ Ciclo [▼] Periodo [▼] Nivel [▼] Carrera [▼] Grado [▼] Grupo [▼] Materia [▼]│
│ Asignación docente: …                     Estado: ACTIVO   [Cerrar periodo] │
├ Alumno [buscar] ┬ Criterio A ┬ Actividad 1 ┬ Actividad 2 ┬ Final ┬ Estado ┤
│ Apellido, Nombre│    8.5     │    9.0      │    —        │ 8.7   │ prov.  │
│ …               │            │             │             │       │        │
└────────────────────────────────────────────────────────────────────────────┘
Barra de acciones: cambios pendientes · Guardar lote · Descartar
Panel lateral de celda: valor exacto, estado, observación, historial, auditoría.
```

- Primera columna fija, encabezados fijos, scroll horizontal sólo para actividades.
- Celda editable por teclado: Enter abre, Escape cancela, Tab avanza; foco visible.
- No depender del color: icono, texto y `aria-live` indican guardado/error/conflicto.

## Tableta 768–1023 px

```text
┌ Contexto académico [resumen] [Cambiar] ┐
│ [Buscar alumno] [Actividad ▼] [Estado ▼]│
├ Alumno          │ Nota │ Estado │ Acción│
│ Apellido, Nombre│ 8.5  │ Guard. │ Editar│
└─────────────────────────────────────────┘
```

Una actividad por columna editable; el detalle del alumno se abre en panel/modal amplio. No se comprime una cuadrícula ilegible.

## Móvil 360–767 px

```text
Evaluación
[Ciclo · Periodo · Materia]  [Cambiar]
[Buscar alumno]
┌ Apellido, Nombre ───────────────┐
│ Resultado provisional 8.5 / 10 │
│ Actividades 6/8                 │
│ [Abrir y editar]                │
└─────────────────────────────────┘
```

Detalle móvil:

```text
← Alumno
Actividad [▼]
Estado [Calificado ▼]
Calificación [ 8.5 ] / 10
Observación [ … ]
[Guardar] [Cancelar]
Historial y explicación [expandir]
```

- Inputs numéricos usan `inputMode="decimal"`, límites 0–10 y mensajes junto al campo.
- Botones táctiles ≥44×44 px y orden lógico de foco.

## Vista del alumno

Sólo lectura: selector ciclo/periodo; resumen exacto/visual; desglose por materia, criterio y actividad; explicación de pesos; estado provisional o final; fecha de cierre. Nunca muestra notas de otros alumnos ni controles deshabilitados que sugieran edición.

## Estados obligatorios

| Estado | Mensaje/acción |
|---|---|
| Cargando | skeleton semántico; conservar encabezado/contexto |
| Sin ciclos/periodos | explicar que admin debe configurarlos; sin inventar ciclo |
| Sin asignación | profesor no tiene clase vigente; enlace de soporte interno |
| Sin alumnos | grupo sin matrículas vigentes |
| Sin criterios/actividades | admin debe configurar esquema; guardar nota deshabilitado |
| Sin capturar | guion + etiqueta “Sin capturar”; no mostrar 0 |
| No entregó | etiqueta explícita y consecuencia según regla institucional |
| Justificado | etiqueta explícita; explicación de exclusión/inclusión |
| Guardando | control bloqueado sólo para esa operación; `aria-live=polite` |
| Guardado | confirmación no sólo cromática y nueva `row_version` |
| Error validación | mensaje por campo; conservar entrada |
| Error red/servidor | reintento idempotente; no asumir guardado |
| Conflicto | mostrar valor local vs servidor, actor/fecha permitidos, recargar |
| Periodo cerrado | sólo snapshot; controles de edición ausentes; cierre visible |
| Usuario/tenant suspendido | acceso denegado según matriz; sin datos académicos |
| Acceso ajeno | respuesta genérica, sin confirmar existencia de fila |

## Marca blanca y accesibilidad

- Prohibidos colores institucionales hardcodeados, nombres/logos específicos y gradientes propios de una escuela.
- Usar variables CSS/tokens existentes y `useInstitucion`; los estados pueden tener tokens semánticos con contraste WCAG, acompañados de texto/icono.
- Etiquetas programáticas, encabezados de tabla asociados, descripción de atajos, `aria-live`, focus trap en diálogo y retorno de foco.
- Zoom 200%, teclado completo, lector de pantalla y contraste se validarán en Paso 15.

## Glosario canónico

- **Ciclo escolar:** intervalo institucional que agrupa matrículas, asignaciones y periodos.
- **Periodo:** tramo evaluativo dentro del ciclo; `borrador`, `activo` o `cerrado`.
- **Clase / asignación docente:** vínculo exacto profesor–nivel–carrera–grado–grupo–materia–ciclo; no es sinónimo de materia.
- **Matrícula/inscripción:** vínculo histórico alumno–grupo–ciclo.
- **Esquema de evaluación:** versión de reglas y ponderaciones aplicada a una asignación/periodo.
- **Criterio:** componente ponderado (por ejemplo tareas); sus pesos suman 100%.
- **Subcriterio:** desglose opcional dentro de un criterio.
- **Actividad:** evidencia calificable, automática, descriptiva, directa o participación.
- **Calificación exacta:** valor persistido 0.0000–10.0000.
- **Calificación visual:** exacta formateada con la regla institucional, sin alterar persistencia.
- **Resultado provisional:** cálculo mientras el periodo está editable.
- **Resultado final:** snapshot inmutable al cerrar el periodo.
- **No entregó / justificado / sin capturar:** estados, no números implícitos.
- **Reapertura:** transición excepcional de cerrado a editable, autorizada, motivada y auditada.
