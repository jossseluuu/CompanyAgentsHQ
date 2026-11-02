# ADR 0002: escena 3D con cámara ortográfica y primitivas

**Contexto.** La especificación pedía aspecto isométrico con giro de cámara, y recursos CC0 en glTF.

**Decisión.** React Three Fiber con cámara ortográfica a 45° y 35°. Muebles y personajes se construyen con bloques y las paredes usan instancing: una sola llamada de dibujo por sala. El estilo se inspira en juegos de bloques como Pixel Gun: personajes cuadrados, colores vivos y texturas de pocos píxeles sin suavizar, generadas en `pixelTextures.ts`. Es una inspiración de estilo: no se usa ningún personaje ni recurso de esos juegos.

Cada mueble se funde en una malla con color por vértice y los árboles y paredes usan instancing: el detalle no se paga en llamadas de dibujo.

**Consecuencias.** No hay ficheros binarios que descargar ni licencias que seguir. Un pack glTF puede sustituir a `MODELS` en `Furniture.tsx` sin tocar la escena.
