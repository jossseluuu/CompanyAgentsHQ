# ADR 0004: modelos e embeddings intercambiables

**Contexto.** El dueño quiere poder usar modelos locales descargados y Ollama, además de Claude.

**Decisión.** `LLMClient` y `EmbeddingProvider` son interfaces. El modelo de un agente puede ser un alias (`fast`, `powerful`) o `proveedor:modelo`. En embeddings el valor por defecto es `hash`, gratis y sin red; se cambia a `ollama`, `sentence_transformers` u `openai_compatible` desde Ajustes.

**Consecuencias.** La columna vectorial es de 1024 dimensiones: otras dimensiones se rellenan o recortan y se normalizan. Recortar un modelo mayor de 1024 pierde algo de calidad. Cada fragmento guarda su modelo y cambiar de proveedor reindexa todo. Con `hash` la búsqueda vectorial solo compara palabras, no significado: para uso real conviene `bge-m3` en Ollama.

Con `LLM_PROVIDER=fake` nunca se llama a ningún modelo, aunque un agente tenga otro configurado (RNF-COS-08).
