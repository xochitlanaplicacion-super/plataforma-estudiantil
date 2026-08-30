# Mapa de resultados por rol — Paso 13

## Fuente canónica

Los resultados visibles no vuelven a calcular promedios en cada pantalla. `results-repository.ts` obtiene únicamente relaciones autorizadas y acotadas; `results-projector.ts` aplica el mismo motor determinista del sistema académico; `results-service.ts` fija rol, actor y tenant desde la sesión autenticada; y los DTO de `results-dto.ts` son la única salida hacia la interfaz.

El estado mostrado tiene estas reglas:

- **Provisional:** cálculo vivo de las capturas autorizadas del periodo abierto.
- **Final:** snapshot inmutable de la versión cerrada; una edición posterior no sustituye silenciosamente ese resultado.
- **Reabierto:** conserva y señala la versión de cierre anterior, pero presenta el cálculo vivo como provisional hasta un nuevo cierre.
- **Sin datos:** estado explícito; nunca se convierte en cero ni participa como una nota inventada.

## Alumno

Ruta: `/dashboard/alumno/calificaciones`.

La sesión determina el alumno; el cliente no envía `student_id`, inscripción, tenant ni matrícula. La consulta queda limitada a sus inscripciones activas y presenta ciclo, periodo, materia, estado provisional/final/reabierto, nota 0–10 y desglose propio por criterio. No existe endpoint ni control de UI para enumerar compañeros.

El dashboard y las tarjetas de materias consumen la misma proyección canónica. Se eliminaron sus fórmulas heredadas y la conversión incorrecta que volvía a dividir resultados entre diez.

## Administrador y superusuario

Ruta: `/dashboard/admin/evaluacion/resultados`; la misma vista sustituye el cálculo heredado de la pestaña académica de auditoría.

La consulta exige sesión `admin` o `superuser`, aplica `tenant_id` en todas las relaciones y permite filtrar ciclo, periodo, asignación, nivel/carrera, grado y grupo. La salida se pagina y muestra avance de captura, notas faltantes y estado de cierre. Un administrador del tenant A no puede seleccionar ni recibir filas del tenant B.

El modo soporte no obtiene detalle académico mediante esta acción: requiere el flujo de soporte auditado definido por la plataforma y no se deduce de parámetros del navegador.

## Exportación

La exportación recibe exclusivamente el conjunto ya autorizado y filtrado. Se genera CSV en memoria, con BOM, neutralización de fórmulas de hoja de cálculo, límite de 1,000 filas y 1 MiB. No crea objetos en Storage, URL pública, archivo temporal persistente ni consulta adicional sin ámbito.

## Marca blanca, accesibilidad y estados

Las vistas usan tokens semánticos existentes (`primary`, `muted`, `destructive`, bordes y fondos del tema del tenant); no contienen colores, logotipos, dominios ni nombres de escuela rígidos. Incluyen estados de carga, vacío y error, etiquetas accesibles, progreso con nombre, navegación por teclado y composiciones verificadas a 360, 768 y 1,440 px.

## Cambios de consumidores

- `src/app/dashboard/alumno/page.tsx`: resumen canónico del alumno.
- `src/app/dashboard/alumno/materias/page.tsx`: nota por materia desde el read model.
- `src/app/dashboard/alumno/components/SubjectCard.tsx`: etiqueta coherente 0–10.
- `src/app/dashboard/admin/auditoria/page.tsx`: supervisión canónica embebida.
- `src/lib/actions/auditoria.ts`: retirada de la fórmula duplicada basada en ejercicios.
- `src/components/layout/DashboardLayout.tsx`: navegación por rol a resultados.

## Límites operativos y rollback

Las páginas de supervisión usan paginación de 25 filas y un conjunto acotado de hasta 200 filas por solicitud; la exportación tiene límites independientes. El rollback de aplicación consiste en revertir el commit del Paso 13 o retirar las nuevas rutas/enlaces. No se requiere rollback de base de datos porque este paso no añade migraciones, DDL, políticas, funciones ni datos.
