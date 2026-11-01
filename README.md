# CompanyAgentsHQ

![La oficina isométrica](docs/img/01-oficina.png)

Monta una empresa de agentes de IA con organigrama real y gestiónala desde una oficina isométrica. Das un objetivo a la CEO, apruebas su plan, los jefes revisan a su equipo y todo queda archivado, auditado y con su coste.

## Arrancar

Con Docker:

```bash
docker compose up --build
```

Abre http://localhost:8080. Sin configurar nada funciona en modo simulado, sin llamadas a ningún modelo y sin gasto.

Sin Docker (Windows, macOS o Linux, con Python 3.12 y Node 22):

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -e ".[dev]"     # en macOS y Linux: .venv/bin/pip
.venv/Scripts/python scripts/devserver.py

cd frontend
npm install
npm run dev
```

Abre http://localhost:5173. PostgreSQL con pgvector se instala y arranca solo dentro de `backend/.local`.

## Coste

Por defecto no se paga nada: `LLM_PROVIDER=fake` no llama a ningún modelo y el contador indica «Gasto simulado». Con Ollama tampoco hay coste. Solo la API de Claude factura, y únicamente si pones `LLM_PROVIDER=anthropic` y una clave tuya.

## Usar Ollama (gratis y local)

1. Instala Ollama y define la variable de entorno `OLLAMA_CONTEXT_LENGTH=16384`. El contexto por defecto es corto y los agentes perderían sus instrucciones.
2. Descarga un modelo con soporte de herramientas y otro de embeddings:
   ```bash
   ollama pull <modelo>
   ollama pull bge-m3
   ```
3. Crea `.env` en la raíz del proyecto con `LLM_PROVIDER=ollama` y reinicia la API.
4. En Ajustes elige el modelo potente, el rápido y los embeddings `ollama` / `bge-m3`. Si no eliges modelo, se usa el primero instalado.

Si Ollama está apagado, el agente se pausa con el motivo y su tarea se retoma al reanudarlo. Un modelo sin soporte de herramientas hace fallar sus tareas: los agentes dependen de ellas.

## Usar otros modelos

Copia `.env.example` a `.env` y elige proveedor:

| `LLM_PROVIDER` | Qué necesita |
|---|---|
| `fake` | Nada: respuestas guionizadas de `backend/seeds/fake_llm/script.yaml` |
| `anthropic` | `ANTHROPIC_API_KEY`. La CEO usa `claude-opus-5-5`; el resto, `claude-haiku-5-5` |
| `ollama` | Ollama en marcha. Indica los modelos en Ajustes |
| `openai_compatible` | `OPENAI_BASE_URL`: LM Studio, llama.cpp, vLLM… |

En Ajustes puedes cambiar los modelos potente y rápido, y en la ficha de cada agente fijar uno propio, por ejemplo `ollama:llama3.2`. Allí aparecen los modelos detectados en Ollama y en la caché de Hugging Face.

Los embeddings se cambian también en Ajustes: `hash` (por defecto, sin red), `ollama`, `sentence_transformers` (nombre o ruta de un modelo descargado; requiere `pip install -e ".[local-embeddings]"`) u `openai_compatible`. Al cambiar se reindexa todo. Para uso real, `bge-m3` en Ollama: `hash` solo compara palabras, no significado.

Antes de exponerlo fuera de tu equipo pon `COOKIE_SECURE=true`, sirve la app por HTTPS y cambia `POSTGRES_PASSWORD`, `S3_ACCESS_KEY` y `S3_SECRET_KEY`.

## Pruebas

```bash
cd backend && .venv/Scripts/python -m pytest
cd frontend && npx vitest run
cd frontend && SHOTS=../docs/img npx playwright test   # con la app en marcha y una base vacía
```

## Documentación

- [Especificación](docs/especificacion.md) y sus cambios
- [Estado de cada requisito](docs/estado-requisitos.md)
- [Decisiones de arquitectura](docs/decisiones/)
- [Créditos y licencias](docs/creditos.md)
- API interactiva: `/docs` en el servidor

## Licencia

Software propietario. Todos los derechos reservados: consulta [LICENSE](LICENSE).
