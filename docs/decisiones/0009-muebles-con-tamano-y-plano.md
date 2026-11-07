# 0009. Muebles con tamaño y editor en plano

## Contexto

Cada mueble ocupaba una casilla, aunque la mesa de reuniones se dibujaba de 3 × 3. Editar la oficina exigía elegir paredes en listas y escribir coordenadas.

## Decisión

- `furniture` guarda `width`, `depth` y `variant`. `grid_x` y `grid_y` son la esquina superior izquierda, y girar 90° cruza ancho y fondo.
- Los tamaños y estéticas válidos están en `office/furniture_catalog.py`, no en la base de datos.
- Cada modelo 3D se construye para su tamaño: se repite por casilla o se ensancha manteniendo patas y grosor. Las estéticas cambian materiales, no piezas. Sigue siendo una malla fundida por mueble.
- El editor principal es un plano SVG. Las reglas del cliente solo avisan: decide la API. La vista 3D sigue disponible desde el editor.
- Una puerta debe llevar al exterior de la sala, y cada puesto debe alcanzarse desde alguna puerta.
- Las reglas de trabajo y de seguridad del prompt no se editan desde la interfaz: se muestran, pero la protección frente a órdenes escondidas en ficheros no es opcional.

## Consecuencias

La migración `0002` da a las mesas de reuniones existentes su huella real de 3 × 3 y las desplaza una casilla para mantenerlas centradas. Una mesa pegada a una pared o a otro mueble puede quedar solapada hasta moverla.
