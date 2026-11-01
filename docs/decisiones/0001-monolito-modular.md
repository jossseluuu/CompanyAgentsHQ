# ADR 0001: monolito modular

**Estado:** aceptada.

**Contexto.** Una sola persona desarrolla y mantiene el proyecto.

**Decisión.** Un único backend dividido en dominios. Cada dominio expone `service.py`; los demás solo usan esa interfaz o el bus de eventos. `tests/test_architecture.py` hace fallar el CI si alguien se salta el límite.

**Consecuencias.** Un solo despliegue y transacciones simples. `runtime` y `knowledge` se pueden extraer más adelante, porque su frontera ya está definida. `runtime` orquesta a casi todos los dominios: es el módulo con más dependencias.
