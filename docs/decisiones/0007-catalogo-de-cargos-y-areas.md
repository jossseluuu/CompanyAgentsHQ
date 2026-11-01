# ADR 0007: catálogo de cargos y salas por área

**Contexto.** El dueño quiere 21 cargos directivos que se puedan elegir o no, repartidos en seis áreas, cada una con su sala y su división.

**Decisión.** `backend/seeds/roles.yaml` define áreas y cargos. Las siglas repetidas (CRO, CCO, CSO) se distinguen por su clave, como `cro_risk` y `cro_revenue`. Ningún cargo se crea solo: la plantilla inicial no cambia. Al contratar un cargo sin indicar sala, va a la sala y al departamento de su área. Cuatro áreas usan salas existentes; Personas y legal y Producción y logística se crean con la primera contratación.

| Área | Sala | Departamento |
|---|---|---|
| Alta dirección y estrategia | Despacho CEO | Dirección |
| Finanzas y administración | Finanzas | Finanzas |
| Comercial, marketing y clientes | Marketing | Marketing |
| Tecnología, innovación y producto | Tecnología | Tecnología |
| Personas, legal y organización | Personas y legal | Personas y legal |
| Producción, logística y sostenibilidad | Producción y logística | Producción y logística |

**Consecuencias.** La oficina no se llena de salas vacías y sirve también para empresas ya creadas. Hay que contratar un cargo para ver su sala nueva. Sigue siendo posible escribir un cargo libre desde «Otro cargo…».
