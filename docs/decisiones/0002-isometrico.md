# ADR 0002: escena 3D con cámara ortográfica y primitivas

**Contexto.** La especificación pedía aspecto isométrico con giro de cámara, y recursos CC0 en glTF.

**Decisión.** React Three Fiber con cámara ortográfica a 45° y 35°. Muebles y personajes se construyen con primitivas y las paredes usan instancing: una sola llamada de dibujo por sala.

**Consecuencias.** No hay ficheros binarios que descargar ni licencias que seguir. El aspecto es más sencillo que con un pack glTF, que puede sustituir a `MODELS` en `Furniture.tsx` sin tocar la escena.
