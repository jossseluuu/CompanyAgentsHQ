# Estado de los requisitos

**Hecho** significa implementado y con prueba automática o recorrido en navegador. **Parcial** indica qué falta. **Sin verificar** significa que el código existe, pero este entorno no permitió ejecutarlo o medirlo.

## Cambios sobre la especificación

- No es un TFG: se eliminan memoria, defensa, tutor y evaluación con usuarios. La métrica SUS (RNF-USA-04) y el tiempo de primer objetivo (RNF-USA-05) quedan sin medir.
- El nombre es CompanyAgentsHQ.
- Licencia propietaria (ADR 0003).
- Modelos y embeddings intercambiables, incluidos locales y Ollama (ADR 0004).
- `temperature` solo se aplica a modelos locales: la API de Claude ya no la admite.

## Validación con un modelo real

Probado el 1 de noviembre de 2026 con `qwen3:8b` y `bge-m3` en Ollama 0.40, en una RTX 5050 Laptop de 8 GB.

| Prueba | Resultado |
|---|---|
| Chat | Correcto: 45 s con el modelo sin cargar |
| PDF subido a Finanzas y pregunta a la CFO | Correcto: cifra exacta y cita con documento y página, en 36 s |
| Objetivo completo | Correcto: plan, aprobación, delegación y revisión. 8 tareas en 31 minutos |
| Acción sensible | Correcto: `delete_file` espera al dueño; al rechazarla, el fichero se conserva |
| Auditoría | Correcto: `/audit/verify` devuelve `valid: true` con 130 eventos |

Fue una sola pasada con una empresa de prueba: no mide la calidad de lo que escribe el modelo. Citó un `[1]` sin fuente en un chat sin documentos. `qwen3.5:4b` no se ha probado: no llegó a descargarse.

## Funcionales

| Módulo | Hecho | Pendiente o parcial |
|---|---|---|
| EMP | 01–07 | 08 (D) sin hacer; 09, 10 (F) |
| OFI | 01–09, 11, 13 | 10 (D) sin hacer; 12, 14 (F) |
| SAL | 01–07, 09; 08 sin vista previa | 10 (F) |
| AGE | 01–14 | |
| FIC | 01–08 | 09, 10 (D) |
| SUP | 01–09 | 10 (D) |
| MOV | 01–08, 10 | 03 con animación por código; 09 (D) |
| DES | 01–03 | 04 (D); 05 (F) |
| ARC | 01–04, 08–10; 06 | 05 carpetas en API, sin interfaz (D); 07 (D) |
| CON | 01–11, 13 | 12, 15 (D); 14 (F) |
| TAR | 01–12 | |
| APR | 01–03; 06 parcial | 04 (D); 05 (F) |
| REU | 01–04 | 02: los agentes reciben estado de reunión; 05 (F) |
| FIN | 01–04, 06; 05; 07 CSV | 07 PDF (D) |
| AUD | 01–07, 09, 11 | 08: informe diario en vez de semanal; 10, 13 (D); 12 (F) |
| OTR | 01–03, 06, 07 | 04, 05 (D); 08, 09, 10 (F) |

## No funcionales

| Requisito | Estado |
|---|---|
| REN-03 carga < 3 s | Medido: 1,0 s con el servidor de desarrollo local |
| REN-07 A* < 5 ms | Medido: mediana 2,2 ms y máximo 4,9 ms en 100 × 100 |
| REN-01 ≥ 50 fps | Medido: 142 fps con 20 agentes en una RTX 5050 Laptop, en Edge con Direct3D 11 |
| REN-02, 08 | Sin medir (D) |
| REN-04, 05, 06 | Medido en local con un solo cliente, sin concurrencia: p95 de 32 ms en 300 GET de la API; PDF de 50 páginas indexado en 6,7 s con `bge-m3`; búsqueda con 10.000 fragmentos en 94 ms de mediana, con un pico de 5,0 s en 20 consultas. **El pico no se ha explicado** |
| TRE-01 a 04 | Hecho: reconexión con `since`, interpolación en el cliente y pestañas sincronizadas probadas. Sin medir los 500 ms |
| ESC-01 a 04, 07 a 09 | Hecho; límites comprobados por `test_architecture.py` |
| ESC-05 | **Sin verificar**: la cola arq y Redis no se han ejecutado. Sí se ha probado el registro de trabajos |
| ESC-06 | Sin medir (D) |
| COS-01 a 05, 08 | Hecho |
| COS-06 | Implementado; sin probar con la API real |
| COS-07 | Sin medir (D): no hay clave de API |
| SEG-01 a 06 | Hecho. SEG-03: en local, cookie Secure desactivada por HTTP |
| SEG-09 | En CI, sin ejecutar: no hay remoto |
| SEG-08, 10 | Sin hacer (D) |
| TRA-01 a 04, 06 | Hecho. TRA-02 incluye disparador en la base de datos |
| TRA-05 | Sin borrado automático: se conserva todo (D) |
| FIA-01 a 03, 05 | Hecho. La API ofrece `/health`; en Compose hay comprobación por servicio |
| FIA-04 | Sin hacer (D) |
| USA-01, 03, 07 | Hecho |
| USA-02 | Revisado a ojo; sin auditoría automática |
| USA-04, 05 | Eliminados con la evaluación de usuarios |
| USA-06 | Solo probado en Chromium |
| MAN-01 | Backend 83 %. Frontend: ver `npx vitest run --coverage`; la escena WebGL queda excluida y se cubre con el recorrido en navegador |
| MAN-03, 05, 06, 08, 09 | ruff, mypy, eslint y tsc sin errores. MAN-05: OpenAPI automático, respuestas sin esquema tipado. MAN-06: `docker compose up` **sin verificar**, Docker no estaba instalado |
| MAN-02 | Workflow escrito, sin ejecutar: no hay remoto |
| MAN-04 | Hecho |
| MAN-07 | Un flujo E2E principal; faltan dos (D) |

## Entregables que no se han hecho

- Repositorio en GitHub, issues, milestones y project board: no hay `gh` ni autorización.
- GIF y vídeo de demo: el README usa una captura.
- Cliente de API generado desde OpenAPI: es escrito a mano.
- Modelos glTF: descartados, el estilo de bloques se genera por código (ADR 0002).
