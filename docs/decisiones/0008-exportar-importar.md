# ADR 0008: exportar e importar la empresa

**Contexto.** El dueño necesita copias de seguridad y poder mover la empresa a otra instalación (RF-EMP-06 y 07).

**Decisión.** Un ZIP con un JSON por tabla y los ficheros aparte. Las tablas se recorren desde los metadatos: una tabla nueva viaja sola. Se conservan los identificadores, de modo que la cadena de auditoría sigue siendo verificable. No viajan la cuenta, sus avisos, las sesiones ni los vectores. Importar exige un dueño sin empresa y todo ocurre en una transacción.

**Consecuencias.** Tras importar hay que reindexar, lo que requiere el proveedor de embeddings activo. Lo que estaba en marcha queda bloqueado con el motivo `imported`. No se puede importar sobre una empresa existente, y `max_import_mb` limita el tamaño. Por ahora el ZIP se construye en memoria.
