# 0010. Eliminar la empresa también borra su auditoría

**Contexto.** `audit_events` es de solo inserción (RNF-TRA-02), pero el dueño debe poder borrar todos sus datos.

**Decisión.** El disparador admite `DELETE` solo de las filas cuya empresa coincide con `app.purge_company`, un ajuste local de la transacción que fija `DELETE /company` tras comprobar el nombre y la contraseña. `UPDATE`, `TRUNCATE` y el borrado de cualquier otra empresa siguen prohibidos. Se borran también los ficheros del almacén, los eventos en tiempo real y la caché de embeddings. La cuenta del dueño se conserva.

**Consecuencias.** No queda rastro auditado del borrado: solo una línea `company_deleted` en el log, sin datos de la empresa. Cualquiera con acceso de escritura a la base de datos podría usar esta vía, igual que ya podía quitar el disparador. Si el trabajo de un agente sigue en curso al borrar, fallará al guardar y solo quedará en el log. Exportar antes es decisión del dueño.
