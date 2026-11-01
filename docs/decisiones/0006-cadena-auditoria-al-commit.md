# ADR 0006: la cadena de auditoría se escribe justo antes del commit

**Contexto.** Encadenar cada evento al registrarlo tomaba un candado global en mitad de la transacción. Dos revisiones simultáneas se bloquearon entre sí: una tenía el candado y esperaba la fila del agente, y la otra al revés.

**Decisión.** `record` acumula los eventos en la sesión y `chain_pending` los encadena antes del commit, cuando ya no se piden más bloqueos. Los trabajos, además, se repiten si PostgreSQL detecta un interbloqueo.

**Consecuencias.** Las transacciones concurrentes no se interbloquean por la cadena, y la prueba `test_concurrent_reviews_do_not_deadlock` lo vigila.
