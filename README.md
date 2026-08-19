
# Plataforma Estudiantil - Plataforma Académica

Este es el repositorio oficial de la Plataforma Estudiantil.

La arquitectura actual sirve múltiples escuelas desde una sola base Supabase y un solo despliegue. La operación, seguridad, alta de escuelas, dominios, SMTP y recuperación están documentadas en [docs/MULTITENANCY.md](docs/MULTITENANCY.md).

## Sincronización con GitHub

Para subir tus cambios y sobrescribir cualquier archivo en GitHub con la versión actual de esta terminal (hacer que prevalezcan estos archivos), ejecuta el siguiente comando en la terminal de Firebase Studio:

```bash
npm run sync:force
```

Este comando realiza lo siguiente:
1. Agrega todos los archivos (`git add .`)
2. Intenta crear un commit. Si no hay cambios nuevos, simplemente avanza.
3. Realiza un push forzado a la rama principal (`git push origin main --force`) enviando todos los commits pendientes.
