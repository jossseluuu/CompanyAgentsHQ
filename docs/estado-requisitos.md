# Estado de los requisitos

**Hecho** significa implementado y con prueba automática o recorrido en navegador. **Parcial** indica qué falta. **Sin verificar** significa que el código existe, pero este entorno no permitió ejecutarlo o medirlo.

## Cambios sobre la especificación

- No es un TFG: se eliminan memoria, defensa, tutor y evaluación con usuarios. La métrica SUS (RNF-USA-04) y el tiempo de primer objetivo (RNF-USA-05) quedan sin medir.
- El nombre es CompanyAgentsHQ.
- Licencia propietaria (ADR 0003).
- Modelos y embeddings intercambiables, incluidos locales y Ollama (ADR 0004).
- `temperature` solo se aplica a modelos locales: la API de Claude ya no la admite.

## Validación con un modelo real

Probado el 1 y 2 de noviembre de 2026 con Ollama 0.40 y `bge-m3`, en una RTX 5050 Laptop de 8 GB y empresas de prueba nuevas.

| Prueba | `qwen3:8b` | `qwen3.5:4b` |
|---|---|---|
| Chat sin documentos, sin citas inventadas | No medido tras el arreglo | Correcto en 3 pasadas: 6 a 24 s |
| Cifra de un PDF con cita | Correcto: 36 s | Correcto en 3 pasadas: 33 a 63 s |
| Dato que no existe en los documentos | No medido | Dice que no lo sabe en 3 pasadas |
| Objetivo completo | Terminado: 8 tareas en 31 min | Terminado en 12 y en 5 min con prompts anteriores. Con los prompts finales, 3 de 4 tareas en unos 8 min y la cuarta escalada al dueño |
| `delete_file` espera al dueño | Correcto | Correcto en 2 pasadas |
| `/audit/verify` | `valid: true` | `valid: true` |

Calidad, leída a mano: son pasadas sueltas, no una medida estadística. Con los prompts finales el boletín se redacta, pero el modelo se inventa detalles que nadie le dio, como notas de cata, y otra tarea describe fotografías que no existen. Revisa lo que escriba antes de usarlo. Las tareas que no se pueden hacer con las herramientas del equipo gastan devoluciones hasta llegar al dueño, que es lo previsto.

## Edición de oficina y equipo

Plano editable, muebles con tamaño y estética, traslado de puestos, página Equipo y vista del prompt completo ([ADR 0009](decisiones/0009-muebles-con-tamano-y-plano.md)). Probado con pruebas automáticas y en Edge con el LLM falso, en empresas nuevas. La migración `0002` se probó en ambos sentidos sobre una base de prueba, no sobre una empresa con uso real. No se ha vuelto a medir REN-01 con muebles grandes. El acceso a salas se aplica ahora a desplazamientos, `read_file`, `search_files`, `write_file` y `delete_file`; una ruta de paso aún puede cruzar una sala denegada con dos puertas. La vista del prompt no depende del proveedor, pero no se ha comprobado con un modelo real.

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
| REN-01 ≥ 50 fps | Medido: 60 fps con 20 agentes y la escena detallada, en Edge. Con 142 fps antes de añadir jardín y sombras |
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
| TRA-01 a 04, 06 | Hecho. TRA-02 incluye disparador en la base de datos; la única excepción es eliminar la empresa ([ADR 0010](decisiones/0010-eliminar-empresa.md)) |
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
- GIF y vídeo de demo: el README usa capturas.
- Cliente de API generado desde OpenAPI: es escrito a mano.
- Modelos glTF: descartados, el estilo de bloques se genera por código (ADR 0002).
