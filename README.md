
# Plataforma Estudiantil - Plataforma Académica

Este es el repositorio oficial de la Plataforma Estudiantil.

## Sincronización con GitHub

Para subir tus cambios y sobrescribir cualquier archivo en GitHub con la versión actual de esta terminal (hacer que prevalezcan estos archivos), ejecuta el siguiente comando en la terminal de Firebase Studio:

```bash
npm run sync:force
```

Este comando realiza lo siguiente:
1. Agrega todos los archivos (`git add .`)
2. Intenta crear un commit. Si no hay cambios nuevos, simplemente avanza.
3. Realiza un push forzado a la rama principal (`git push origin main --force`) enviando todos los commits pendientes.
