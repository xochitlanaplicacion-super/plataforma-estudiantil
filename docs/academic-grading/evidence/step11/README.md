# Evidencia visual — Paso 11

Arnés local: `/academic-step11-evidence`. Sólo usa datos sintéticos y, en producción normal, responde 404. El middleware únicamente omite autenticación para esta ruta en `localhost` durante desarrollo.

## Artefactos

- `flujo-guardado-desktop-1440.png`: edición y recarga confirmada, recibo de correlación y una sola solicitud.
- `conflicto-sin-sobrescritura.png`: conflicto 409 con el valor local preservado hasta conciliación explícita.
- `grupo-200-alumnos.png`: búsqueda sobre 200 alumnos simulados.
- `movil-360.png`: tarjetas por alumno; no hay tabla horizontal.
- `tableta-768.png`: tabla compacta desde el breakpoint `md`.
- `estado-loading.png`, `estado-empty.png`, `estado-error.png`, `estado-forbidden.png`, `estado-closed.png`: estados obligatorios.
- `flujo-paso11.webm`: recorrido E2E completo.

Comando reproducible:

```bash
ACADEMIC_STEP11_EVIDENCE=true npx playwright test tests/e2e/academic-gradebook-step11.spec.ts --project=chromium-desktop
```

Resultado canónico: `1 passed`; un clic en Guardar lote produjo exactamente una llamada, el conflicto no efectuó un segundo guardado y las vistas 360/768/1440 respetaron el patrón responsive.
