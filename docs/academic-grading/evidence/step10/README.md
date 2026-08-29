# Evidencia visual reproducible — Paso 10

El arnés usa datos completamente sintéticos y no se conecta a Supabase. En producción la ruta conserva la autenticación del middleware y responde 404 salvo una habilitación explícita; su fin es certificar la experiencia sin copiar PII o datos escolares a las evidencias.

Ejecución:

```bash
ACADEMIC_STEP10_EVIDENCE=true npx playwright test tests/e2e/academic-configuration-step10.spec.ts --project=chromium-desktop
```

Artefactos aprobados:

- `estado-loading.png`: skeleton accesible.
- `estado-empty.png`: vacío guiado.
- `estado-error.png`: error y reintento.
- `estado-forbidden.png`: 403 sin datos.
- `movil-360.png`, `tableta-768.png`, `escritorio-1440.png`: viewports requeridos.
- `flujo-activado.png`: borrador con criterio 100% y confirmación activa.
- `flujo-paso10.webm`: recorrido completo por teclado/formulario.

El E2E también falla si aparece un color HEX/RGB/HSL dentro del contenido del arnés.
