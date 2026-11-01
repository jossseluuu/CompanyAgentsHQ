# ADR 0005: alternativas en proceso para Redis y MinIO

**Contexto.** La arquitectura usa Redis y MinIO, pero debe poder arrancarse y probarse en un equipo sin Docker.

**Decisión.** Bus, cola y almacenamiento se eligen por entorno: `BUS_BACKEND`, `QUEUE_BACKEND` y `STORAGE_BACKEND`. `scripts/devserver.py` usa PostgreSQL embebido y procesa la cola dentro de la API.

**Consecuencias.** Las pruebas corren contra PostgreSQL y pgvector reales. La cola en proceso no sobrevive a un reinicio por sí sola; la recuperación se apoya en las tareas guardadas en base de datos (`recover`).
