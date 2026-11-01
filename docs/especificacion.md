# Especificación del proyecto

> Documento original, extraído del PDF `AgentHQ — Especificación del proyecto`. Las tablas aparecen como texto.
> Cambios vigentes frente a este texto: [estado de los requisitos](estado-requisitos.md).


AgentHQ — Especificación del proyecto
 Nov 1, 2026  ·  @José Luis
## 1. Resumen ejecutivo
AgentHQ es una aplicación web donde montas una empresa formada por agentes de IA,
organizados con un organigrama real (CEO, CMO, CTO, CFO…), y la gestionas desde una
oficina isométrica 2.5D formada por salas configurables: cada sala tiene uno o varios
agentes y sus propios módulos (archivador, tablón, dashboard financiero, zona de
descanso…), y los agentes se mueven entre salas mientras trabajan.
Problema. Los sistemas multiagente actuales son cajas negras: se configuran en código,
se siguen leyendo logs y no guardan una memoria organizada de lo que producen. Es difícil
saber quién hizo qué, dónde está cada documento y cuánto ha costado.
Propuesta de valor.
Visible: ves a los agentes trabajar en sus salas y su estado en tiempo real.
Organizada: todo lo que se produce queda archivado en el departamento
correspondiente y es buscable.
Controlada: tú eres el Consejo de Administración; las acciones sensibles requieren tu
aprobación y cada agente tiene presupuesto y permisos.
Persistente: la empresa conserva su memoria, archivos e historial entre sesiones.
Público. En una primera etapa, el propio autor: es un Trabajo de Fin de Grado de 4.º curso
y el proyecto estrella de su portafolio. En una segunda etapa, freelancers y pequeñas
empresas que quieran delegar trabajo de oficina en agentes con supervisión.
## 2. Objetivos, no-objetivos y supuestos
El MVP (v0.1) debe permitir dar un objetivo al CEO y ver cómo se reparte, se ejecuta y se
archiva, todo desde la oficina isométrica.
Objetivos del MVP
1. Oficina isométrica navegable con 8 salas creadas desde una plantilla, cada una con sus
módulos.
2. Ocho agentes: CEO, Chief of Staff, CMO, Redactor, CTO, Desarrollador, CFO y Auditor;
con jefes que supervisan a su equipo.
## 3. Chat individual con cada agente.
## 4. Archivador por sala: subir, ver, descargar y buscar ficheros.
5. Delegación: objetivo → plan del CEO → tareas por departamento → resultados
archivados.
## 6. Bandeja de aprobaciones para acciones sensibles.
7. Agentes que caminan por la oficina según lo que hacen, auditoría completa y ficha
detallada de cada agente.
No-objetivos (fuera del MVP)
Editor de oficina (crear salas, mover muebles).
Conectores externos (correo, Drive, GitHub, calendario).
Varios usuarios o varias empresas por cuenta.
Reuniones animadas con agentes caminando.
App móvil.
Supuestos
Un único usuario, que es el dueño de la empresa.
El LLM principal es Claude vía API; el diseño permite cambiar de proveedor.
Se ejecuta en local con Docker Compose y puede desplegarse después en un servidor.
Presupuesto de IA limitado: el sistema debe cortar al alcanzar el límite diario.
### 2.1 Contexto académico
El proyecto lo desarrolla una sola persona, estudiante de 4.º curso de grado, como Trabajo
de Fin de Grado; eso fija el alcance: unas 300 horas (12 ECTS) en unas 20 semanas.
Aspecto Decisión
Dedicación ~15 h/semana: 16 semanas de desarrollo + 4 de
memoria y defensa
Arquitectura Monolito modular (no microservicios): un solo
despliegue, módulos bien separados
Tecnologías Solo herramientas con buena documentación y
comunidad grande
Prioridades Requisitos con prioridad MoSCoW: M entra en el
TFG, D si sobra tiempo, F va al capítulo de trabajo
futuro
Coste de IA Modo simulado con un LLM falso para desarrollar y
testear gratis; modelo barato por defecto; créditos
educativos si hay disponibles
Los requisitos de las secciones 6 y 7 son deliberadamente amplios: describen el producto
completo. La columna de prioridad marca qué entra en el TFG.
## 3. Conceptos clave
Estos términos se usan igual en la interfaz, el código y la base de datos.
Aspecto Decisión
Entregables Memoria, manual técnico, manual de usuario, vídeo
de demo, repositorio público y evaluación con
usuarios
Evaluación Pruebas con 5–8 usuarios (tareas guiadas +
cuestionario SUS), métricas de coste y tiempo por
objetivo
Concepto Definición En el código
Empresa Contenedor raíz: nombre, misión, presupuesto
global
Company
Sala Espacio del mapa con tamaño, posición, equipo y
módulos propios; puede servir a varios fines
Room
Módulo de sala Funcionalidad que se instala en una sala:
archivador, tablón, dashboard financiero, zona
de descanso, panel de auditoría…
RoomModule
Departamento Agrupación lógica de agentes con un jefe; puede
ocupar una o varias salas
Department
Agente Empleado IA con rol, prompt, jefe, herramientas,
permisos, presupuesto, rutina y base de
conocimiento
Agent
Supervisor Agente que revisa y aprueba el trabajo de otros
agentes antes de que llegue al dueño
Supervision
Base de
conocimiento
Colección de documentos indexados (RAG) con
un ámbito: empresa, departamento, sala, módulo
o agente
KnowledgeBase
Ficha Vista completa de un agente: perfil, rendimiento,
coste, historial, conocimiento y auditoría
AgentProfile
## 4. Organigrama y roles
La plantilla inicial tiene ocho agentes: el CEO como único punto de entrada del trabajo,
cuatro jefes que supervisan a su equipo, dos especialistas y un Auditor independiente que
responde solo al dueño.
Concepto Definición En el código
Rutina Reglas de a dónde va un agente según su estado
(trabajar, reunirse, descansar)
Routine
Objetivo Meta que el dueño da al CEO Goal
Tarea Unidad de trabajo asignada a un agente, con
estado y resultado
Task
Fichero Documento guardado en un archivador; puede
alimentar una o varias bases de conocimiento
File
Aprobación Acción propuesta que espera la decisión del
dueño o de un supervisor
Approval
Reunión Conversación entre varios agentes que produce
un acta
Meeting
Traza Registro paso a paso de una tarea: contexto
enviado, respuesta del modelo, herramientas
usadas
Trace
Evento de auditoría Registro inmutable y encadenado de cualquier
acción
AuditEvent
Dueño El usuario humano; actúa como Consejo de
Administración
Owner
Cada rol tiene su prompt de sistema en backend/app/agents/prompts/<rol>.md  con
cinco apartados fijos: identidad, responsabilidades, a quién reporta, herramientas
permitidas y formato de entrega.
organigrama del MVP · 5 agentes + especialistas futuros
Rol Sala Responsabilidades Puede delegar en Modelo
CEO Despacho
CEO
Convertir objetivos en planes,
repartir tareas, revisar
resultados de los jefes
CMO, CTO, CFO,
Chief of Staff
Potente
Chief of
Staff
Archivo
central
Ordenar el archivo, redactar
actas y el briefing diario,
responder búsquedas
— Rápido
CMO Marketing Estrategia, textos, calendario
de contenidos, análisis de
competencia
Especialistas (fase
4)
Rápido
CTO Tecnología Especificaciones técnicas,
código de ejemplo, revisión de
arquitectura
Especialistas (fase
4)
Rápido
CFO Finanzas Presupuestos, control del gasto
de IA, análisis de facturas
Especialistas (fase
4)
Rápido
Plantilla inicial de agentes
Varios agentes por sala. Una sala admite de 0 a N agentes y un agente tiene una sala base,
pero puede trabajar en cualquier sala a la que tenga acceso. Se pueden contratar, clonar,
trasladar o despedir agentes desde la oficina.
Supervisores. Cualquier agente puede ser supervisor de otros. La supervisión se
configura por relación y por tipo de acción:
Revisión de resultados: el trabajo del supervisado pasa a in_review  y el supervisor lo
acepta o lo devuelve con comentarios.
Aprobación previa: ciertas herramientas del supervisado requieren el visto bueno del
supervisor (p. ej. que el Redactor publique un texto).
Escalado: si el supervisor no puede decidir, o la acción es sensible, sube al dueño.
Supervisión transversal: el Auditor no manda a nadie, pero revisa trazas, marca
anomalías y puede pausar un agente si detecta un riesgo.
Un jefe directo y un supervisor no tienen por qué coincidir: un agente puede reportar al
CTO y estar supervisado además por el Auditor.
## 5. Oficina isométrica
La oficina es una escena 3D low-poly con cámara ortográfica isométrica (45° en
horizontal, ~35° en vertical): se percibe como un mapa 2D con perspectiva 3D, sobre una
rejilla de casillas donde se colocan salas, muebles y agentes.
Agente Departamento Sala base Jefe Supervisa a
CEO Dirección Despacho CEO Dueño CMO, CTO, CFO, Chief of
Staff
Chief of Staff Dirección Archivo
central
CEO —
CMO Marketing Marketing CEO Redactor
Redactor Marketing Marketing CMO —
CTO Tecnología Tecnología CEO Desarrollador
Desarrollador Tecnología Tecnología CTO —
CFO Finanzas Finanzas CEO —
Auditor Control Sala de control Dueño Todos (solo lectura)
### 5.1 Salas modulares
Ninguna sala es de una sola cosa. Una sala es un espacio vacío con tamaño y posición en la
rejilla al que se le instalan módulos; cada módulo aporta muebles en el mapa, una pestaña
en el panel lateral y, si procede, herramientas para los agentes de esa sala.
Los módulos se registran como plugins (sección 8): añadir uno nuevo no obliga a tocar el
resto del código.
Módulo Qué aporta en la interfaz Qué aporta a los agentes Prioridad
Archivador Ficheros de la sala read_file , write_file ,
search_files
M
Tablón Kanban de tareas de la sala create_task ,
update_task
M
Equipo Lista de agentes de la sala — M
Base de
conocimiento
Documentos de apoyo de la
sala (RAG)
search_knowledge  con
ámbito de sala
M
Dashboard
financiero
Ingresos, gastos, gasto de
IA, presupuesto frente a
real, previsión
read_finance ,
create_budget
M
Zona de
descanso
Sofás, máquina de café;
agentes inactivos
Consolidación de memoria
al descansar
M
Mesa de
reuniones
Convocar reunión, ver actas call_meeting D
Panel de
auditoría
Registro en vivo, anomalías,
trazas
read_audit  (solo Auditor) M
Pizarra Notas libres compartidas de
la sala
write_whiteboard D
Calendario Fechas de entrega y eventos read_calendar ,
add_event
D
Terminal Ejecución de código en un
entorno aislado
run_code  (con aprobación) F
Buzón Correo entrante y salientes
de la sala
send_email  (con
aprobación)
F
### 5.2 Plantilla inicial de la oficina
### 5.3 Movimiento de los agentes
Los agentes son personajes que caminan por la oficina; su posición refleja lo que están
haciendo.
Rejilla y rutas: la oficina es una rejilla de casillas; las rutas se calculan con A* evitando
muebles y paredes, y se animan a velocidad constante.
Rutina por estado: trabajando → su puesto en la sala de la tarea; leyendo ficheros → el
archivador; reunión → sala de juntas; esperando aprobación → su puesto con aviso;
inactivo más de 2 minutos → sala de descanso.
Visitas entre agentes: al delegar o preguntar a su jefe, el agente camina hasta el
puesto del otro y aparece un bocadillo.
Sala de descanso con función real: al llegar, el agente resume y consolida su memoria
de las últimas tareas, y sus contadores de pasos se reinician. Es la forma visual de ver
la "higiene" de memoria.
Modo rendimiento: con muchos agentes, las animaciones se simplifican y los
recorridos largos se teletransportan con un fundido.
Repetición: desde la ficha o la auditoría se puede reproducir el recorrido de un agente
durante una tarea.
Sala Módulos instalados Agentes
Despacho CEO Tablón de objetivos, base de conocimiento de
dirección, bandeja del dueño
CEO
Marketing Archivador, tablón, conocimiento de marca,
pizarra
CMO, Redactor
Tecnología Archivador, tablón, conocimiento técnico,
terminal (F)
CTO, Desarrollador
Finanzas Dashboard financiero, archivador, tablón,
conocimiento financiero
CFO
Sala de juntas Mesa de reuniones, pizarra — (punto de reunión)
Archivo central Archivador global, buscador, conocimiento de
empresa
Chief of Staff
Sala de control Panel de auditoría, costes en vivo Auditor
Sala de
descanso
Zona de descanso — (punto de
descanso)
### 5.4 Estados visibles
### 5.5 Interacciones
Arrastrar para desplazar, rueda o pellizco para zoom (3 niveles), girar la vista en pasos
de 90°.
Clic en sala → panel lateral con una pestaña por módulo instalado.
Clic en un mueble de módulo (p. ej. la pantalla del dashboard) → abre ese módulo
directamente.
Clic en agente → su ficha; doble clic → chat.
Modo edición: crear, redimensionar y borrar salas, instalar o quitar módulos, mover
muebles (D).
Arrastrar ficheros desde el ordenador a una sala → archivador de la sala; con Mayús →
base de conocimiento.
Filtros de vista: resaltar un departamento, ver solo agentes con problemas, mapa de
calor de actividad.
Atajo /  abre el buscador global.
### 5.6 Ficha del agente
Cada agente tiene una ficha completa, organizada en pestañas:
Estado Icono Significado
idle zZ Sin tareas (va a descansar)
walking pasos Desplazándose
thinking … animado Esperando respuesta del modelo
working engranaje Ejecutando una herramienta
reviewing lupa Revisando trabajo de un supervisado
meeting bocadillos En reunión
resting taza Consolidando memoria en la sala de descanso
waiting_approval ! amarillo Necesita una decisión
flagged escudo naranja El Auditor ha marcado una anomalía
error ✕  rojo Fallo; clic para ver el detalle
paused ⏸ Pausado por el dueño, el Auditor o el presupuesto
Barra superior fija: nombre de la empresa, gasto del día frente al límite, aprobaciones
pendientes, anomalías abiertas y botón de pausa general.
Recursos gráficos: packs low-poly con licencia CC0 (p. ej. Kenney) en glTF, con
animaciones de andar, sentarse y reposo; un color de acento por departamento.
## 6. Requisitos funcionales
Hay 161 requisitos funcionales en 16 módulos. Cada uno tiene un identificador para
enlazarlo desde issues y commits (p. ej. Closes RF-CON-04 ). Prioridad MoSCoW: M =
entra en el TFG, D = deseable si sobra tiempo, F = trabajo futuro.
Pestaña Contenido
Perfil Nombre, avatar, rol, departamento, sala base, jefe,
supervisados, modelo, prompt de sistema (con
historial de versiones)
Capacidades Herramientas habilitadas, permisos por sala y por
base de conocimiento, límites
Conocimiento Su base de conocimiento personal y las que hereda
(empresa, departamento, sala)
Trabajo Tarea actual, cola de tareas, tareas terminadas con
resultado
Rendimiento Tareas completadas, % aceptadas por su
supervisor a la primera, tiempo medio, pasos
medios
Coste Gasto por día y por tarea, tokens, frente a su
presupuesto
Memoria Resúmenes guardados; se pueden editar o borrar
Auditoría Trazas de sus tareas, aprobaciones, anomalías
marcadas
Chat Conversación directa
### 6.1 Empresa y configuración (EMP)
### 6.2 Oficina y mapa (OFI)
ID Requisito Prioridad
RF-EMP-01 Crear la empresa con nombre, misión, sector,
idioma y zona horaria
M
RF-EMP-02 Crear la empresa desde una plantilla (8 salas, 8
agentes) o vacía
M
RF-EMP-03 Editar misión y valores; se inyectan en el contexto
de todos los agentes
M
RF-EMP-04 Definir presupuesto diario y mensual de IA de la
empresa
M
RF-EMP-05 Pausar y reanudar toda la empresa con un botón M
RF-EMP-06 Exportar la empresa completa (configuración,
ficheros, historial) a un ZIP
D
RF-EMP-07 Importar una empresa desde un ZIP exportado D
RF-EMP-08 Guardar la configuración actual como plantilla
reutilizable
D
RF-EMP-09 Varias empresas por dueño, con selector F
RF-EMP-10 Invitar a otros humanos con rol (observador,
gestor)
F
ID Requisito Prioridad
RF-OFI-01 Renderizar la oficina isométrica con salas, muebles
y agentes
M
RF-OFI-02 Desplazar, hacer zoom (3 niveles) y girar la cámara
90°
M
RF-OFI-03 Resaltar sala al pasar el ratón y mostrar su nombre M
RF-OFI-04 Clic en sala abre el panel lateral con una pestaña
por módulo
M
RF-OFI-05 Clic en un mueble de módulo abre ese módulo M
### 6.3 Salas y módulos (SAL)
ID Requisito Prioridad
RF-OFI-06 Mostrar el estado de cada agente con icono
flotante en tiempo real
M
RF-OFI-07 Barra superior con gasto, aprobaciones, anomalías
y pausa
M
RF-OFI-08 Filtro: resaltar un departamento D
RF-OFI-09 Filtro: mostrar solo agentes con error, anomalía o
esperando
D
RF-OFI-10 Mapa de calor de actividad por sala en un periodo D
RF-OFI-11 Minimapa 2D cenital para orientarse D
RF-OFI-12 Ciclo día/noche según la hora real F
RF-OFI-13 Vista plana 2D alternativa para equipos sin
aceleración gráfica
D
RF-OFI-14 Captura de pantalla de la oficina desde la interfaz F
ID Requisito Prioridad
RF-SAL-01 Las salas se cargan desde la configuración con
tamaño, posición y módulos
M
RF-SAL-02 Instalar y desinstalar módulos en una sala M
RF-SAL-03 Cada módulo declara sus muebles, su pestaña de
interfaz y sus herramientas
M
RF-SAL-04 Una sala puede tener varios módulos y servir a
varios departamentos
M
RF-SAL-05 Controlar qué agentes pueden entrar y usar cada
sala
M
RF-SAL-06 Crear, renombrar y borrar salas desde la interfaz D
RF-SAL-07 Modo edición: redimensionar salas y mover
muebles en la rejilla
D
RF-SAL-08 Catálogo de módulos con descripción y vista previa D
### 6.4 Agentes (AGE)
ID Requisito Prioridad
RF-SAL-09 Configuración específica por módulo (p. ej.
moneda del dashboard)
M
RF-SAL-10 Módulos de terceros cargados como plugins F
ID Requisito Prioridad
RF-AGE-01 Crear un agente con nombre, rol, avatar, sala base,
jefe y modelo
M
RF-AGE-02 Editar el prompt de sistema con plantilla de 5
apartados
M
RF-AGE-03 Historial de versiones del prompt con comparación
y restauración
M
RF-AGE-04 Habilitar y deshabilitar herramientas por agente M
RF-AGE-05 Presupuesto diario por agente M
RF-AGE-06 Pausar, reanudar y reiniciar un agente M
RF-AGE-07 Chat directo con historial persistente y respuesta
en streaming
M
RF-AGE-08 Trasladar un agente a otra sala o departamento M
RF-AGE-09 Clonar un agente con toda su configuración D
RF-AGE-10 Despedir (archivar) un agente conservando su
historial
M
RF-AGE-11 Elegir modelo y temperatura por agente M
RF-AGE-12 Personalidad y tono configurables D
RF-AGE-13 Catálogo de roles predefinidos (contable, SEO,
QA…)
D
RF-AGE-14 Varios agentes por sala sin límite fijo M
### 6.5 Ficha del agente (FIC)
### 6.6 Jerarquía y supervisión (SUP)
ID Requisito Prioridad
RF-FIC-01 Pestaña Perfil con todos los datos del agente M
RF-FIC-02 Pestaña Capacidades con herramientas y permisos M
RF-FIC-03 Pestaña Conocimiento con bases propias y
heredadas
M
RF-FIC-04 Pestaña Trabajo con tarea actual, cola e historial M
RF-FIC-05 Pestaña Rendimiento con métricas y gráficas M
RF-FIC-06 Pestaña Coste con gasto por día y por tarea M
RF-FIC-07 Pestaña Memoria editable M
RF-FIC-08 Pestaña Auditoría con trazas y anomalías del
agente
M
RF-FIC-09 Comparar dos agentes lado a lado D
RF-FIC-10 Exportar la ficha a PDF D
ID Requisito Prioridad
RF-SUP-01 Definir jefe directo de cada agente M
RF-SUP-02 Ver el organigrama generado automáticamente M
RF-SUP-03 Asignar uno o varios supervisores a un agente M
RF-SUP-04 Supervisión de tipo revisión de resultados M
RF-SUP-05 Supervisión de tipo aprobación previa por
herramienta
M
RF-SUP-06 Escalado automático al dueño si el supervisor no
decide en X minutos
D
RF-SUP-07 El supervisor devuelve trabajo con comentarios y
el agente lo rehace
M
RF-SUP-08 Límite de devoluciones por tarea (3) antes de
escalar
M
### 6.7 Movimiento y rutinas (MOV)
### 6.8 Sala de descanso (DES)
ID Requisito Prioridad
RF-SUP-09 Supervisor transversal de solo lectura (Auditor) M
RF-SUP-10 Editar el organigrama arrastrando en una vista de
árbol
D
ID Requisito Prioridad
RF-MOV-01 Los agentes caminan por la rejilla con rutas A* M
RF-MOV-02 El destino depende del estado según la rutina M
RF-MOV-03 Animaciones de andar, sentarse y reposo M
RF-MOV-04 Visitas entre agentes al delegar o preguntar D
RF-MOV-05 Bocadillos con un resumen de lo que hablan D
RF-MOV-06 Rutina configurable por agente D
RF-MOV-07 Seguir a un agente con la cámara M
RF-MOV-08 Repetir el recorrido de un agente durante una tarea D
RF-MOV-09 Modo rendimiento con animación simplificada D
RF-MOV-10 Las posiciones se sincronizan entre pestañas
abiertas
M
ID Requisito Prioridad
RF-DES-01 Un agente inactivo más de 2 min va a la sala de
descanso
M
RF-DES-02 Al descansar, el agente consolida su memoria
reciente
M
RF-DES-03 Ver en la sala quién descansa y desde cuándo M
RF-DES-04 Descanso forzado al alcanzar el presupuesto o
pasos máximos
D
### 6.9 Archivador (ARC)
### 6.10 Conocimiento y RAG (CON)
ID Requisito Prioridad
RF-DES-05 Conversaciones informales entre agentes que
descansan (resumen visible)
F
ID Requisito Prioridad
RF-ARC-01 Subir ficheros (PDF, DOCX, TXT, MD, CSV, XLSX,
imágenes) a una sala
M
RF-ARC-02 Listar, ordenar y filtrar por tipo, autor y fecha M
RF-ARC-03 Vista previa en el navegador M
RF-ARC-04 Descargar y mover a papelera; restaurar desde
papelera
M
RF-ARC-05 Carpetas dentro del archivador D
RF-ARC-06 Versionado de ficheros con historial D
RF-ARC-07 Etiquetas en ficheros D
RF-ARC-08 Indicar qué agente o tarea creó cada fichero M
RF-ARC-09 Mover y copiar ficheros entre salas M
RF-ARC-10 Buscador global por nombre y contenido M
ID Requisito Prioridad
RF-CON-01 Bases de conocimiento con ámbito empresa,
departamento, sala, módulo o agente
M
RF-CON-02 Cada agente tiene una base de conocimiento
personal
M
RF-CON-03 El agente hereda las bases de su empresa,
departamento y sala
M
RF-CON-04 Añadir documentos a una base desde el archivador
o subiéndolos
M
### 6.11 Tareas y objetivos (TAR)
ID Requisito Prioridad
RF-CON-05 Los módulos publican su conocimiento (p. ej. el
dashboard financiero publica cifras y
presupuestos)
M
RF-CON-06 Los resultados de tareas pueden añadirse a una
base automáticamente
M
RF-CON-07 Recuperación con citas: documento, página y
fragmento
M
RF-CON-08 Ver qué fragmentos se usaron en cada respuesta
(en la traza)
M
RF-CON-09 Reindexar una base y ver su estado de indexado M
RF-CON-10 Permisos de lectura y escritura por base y por
agente
M
RF-CON-11 Búsqueda híbrida (vectorial + palabras clave) D
RF-CON-12 Reordenado de resultados (reranking) D
RF-CON-13 Probar una consulta contra una base desde la
interfaz
M
RF-CON-14 Caducidad de documentos y aviso de
conocimiento obsoleto
F
RF-CON-15 Glosario de la empresa que se inyecta siempre D
ID Requisito Prioridad
RF-TAR-01 Dar un objetivo al CEO con descripción y fecha M
RF-TAR-02 El CEO propone un plan y el dueño lo aprueba,
edita o rechaza
M
RF-TAR-03 El plan se descompone en tareas por
departamento
M
RF-TAR-04 Tablón por sala con Pendiente, En curso, En
revisión, Bloqueada, Hecha
M
RF-TAR-05 Crear tareas a mano y asignarlas a un agente M
### 6.12 Aprobaciones (APR)
ID Requisito Prioridad
RF-TAR-06 Prioridad y fecha límite por tarea M
RF-TAR-07 Dependencias entre tareas D
RF-TAR-08 El resultado se guarda como fichero en la sala M
RF-TAR-09 Reintentar una tarea fallida M
RF-TAR-10 Cancelar una tarea en curso M
RF-TAR-11 Árbol de tareas de un objetivo M
RF-TAR-12 Tareas recurrentes (p. ej. informe semanal del
CFO)
D
ID Requisito Prioridad
RF-APR-01 Bandeja con acciones pendientes del dueño M
RF-APR-02 Aprobar o rechazar con comentario M
RF-APR-03 Ver la traza que llevó a pedir la aprobación M
RF-APR-04 Reglas de qué acciones requieren aprobación y de
quién
D
RF-APR-05 Aprobación en bloque de acciones similares F
RF-APR-06 Caducidad de aprobaciones no respondidas D
### 6.13 Reuniones (REU)
### 6.14 Dashboard financiero (FIN)
### 6.15 Auditoría, registro y notificaciones (AUD)
ID Requisito Prioridad
RF-REU-01 El CEO o el dueño convocan una reunión con tema
y participantes
D
RF-REU-02 Los agentes caminan a la sala de juntas D
RF-REU-03 Turnos de palabra con límite de rondas D
RF-REU-04 Acta automática en el Archivo central D
RF-REU-05 Decisiones del acta convertidas en tareas F
ID Requisito Prioridad
RF-FIN-01 Panel con gasto de IA por día, agente y
departamento
M
RF-FIN-02 Importar ingresos y gastos de la empresa desde
CSV
M
RF-FIN-03 Presupuestos por partida y comparación
presupuesto frente a real
M
RF-FIN-04 El CFO genera informes y presupuestos que se
guardan en Finanzas
M
RF-FIN-05 Previsión simple de gasto a fin de mes D
RF-FIN-06 Alertas al superar el 80 % y el 100 % del
presupuesto
M
RF-FIN-07 Exportar el dashboard a PDF o CSV D
ID Requisito Prioridad
RF-AUD-01 Registro inmutable de toda acción (quién, qué,
cuándo, coste)
M
RF-AUD-02 Traza paso a paso de cada tarea: contexto,
respuesta, herramientas, fragmentos RAG
M
### 6.16 Búsqueda, integraciones y otros (OTR)
ID Requisito Prioridad
RF-AUD-03 Filtro por agente, sala, tipo de acción y fecha M
RF-AUD-04 Cadena de hashes para detectar manipulación del
registro
M
RF-AUD-05 Verificar la integridad del registro desde la interfaz M
RF-AUD-06 El Auditor detecta anomalías: gasto inusual, bucles,
permisos denegados repetidos, respuestas sin
citas
M
RF-AUD-07 Las anomalías generan un aviso y pueden pausar al
agente
M
RF-AUD-08 Informe de auditoría semanal generado por el
Auditor
D
RF-AUD-09 Exportar registros a CSV y JSON M
RF-AUD-10 Reproducir una tarea paso a paso (modo "vídeo") D
RF-AUD-11 Notificaciones en la app para aprobaciones,
anomalías y tareas terminadas
M
RF-AUD-12 Notificaciones por correo o Telegram F
RF-AUD-13 Política de retención configurable D
ID Requisito Prioridad
RF-OTR-01 Buscador global: ficheros, tareas, agentes,
conocimiento
M
RF-OTR-02 Interfaz en español e inglés D
RF-OTR-03 Tema claro y oscuro D
RF-OTR-04 Atajos de teclado documentados D
RF-OTR-05 Tutorial guiado en el primer uso D
RF-OTR-06 Proveedor de LLM intercambiable (Claude,
OpenAI, Ollama)
M
RF-OTR-07 Modo simulado con LLM falso para pruebas M
## 7. Requisitos no funcionales
Hay 66 requisitos no funcionales en 9 áreas, todos medibles para poder comprobarlos en
la evaluación del TFG.
### 7.1 Rendimiento (REN)
### 7.2 Tiempo real (TRE)
ID Requisito Prioridad
RF-OTR-08 Conectores externos vía MCP (correo, Drive,
GitHub, calendario)
F
RF-OTR-09 API pública documentada para automatizar la
empresa
F
RF-OTR-10 Webhooks salientes al completar objetivos F
ID Requisito Prioridad
RNF-REN-01 La oficina va a ≥ 50 fps con 20 agentes en un
portátil con gráfica integrada
M
RNF-REN-02 Con 100 agentes en modo rendimiento, ≥ 30 fps D
RNF-REN-03 Carga inicial de la app < 3 s en local M
RNF-REN-04 Respuesta de la API < 200 ms (p95) en operaciones
sin IA
M
RNF-REN-05 Búsqueda en conocimiento < 1 s (p95) con 10.000
fragmentos
M
RNF-REN-06 Indexado de un PDF de 50 páginas < 60 s M
RNF-REN-07 Cálculo de ruta A* < 5 ms en una rejilla de 100 × 100 M
RNF-REN-08 Primer token del chat visible < 2 s tras enviar D
ID Requisito Prioridad
RNF-TRE-01 Un cambio de estado llega a la interfaz en < 500 ms M
RNF-TRE-02 Movimiento fluido: posición interpolada en el
cliente a 60 fps
M
### 7.3 Escalabilidad y modularidad (ESC)
### 7.4 Coste y control de IA (COS)
ID Requisito Prioridad
RNF-TRE-03 Reconexión automática del WebSocket con
recuperación de eventos perdidos
M
RNF-TRE-04 Varias pestañas ven el mismo estado M
ID Requisito Prioridad
RNF-ESC-01 Cada dominio (agentes, salas, conocimiento,
auditoría…) es un módulo con interfaz pública
propia
M
RNF-ESC-02 Un módulo no importa el código interno de otro;
solo su interfaz o eventos
M
RNF-ESC-03 Módulos de sala y herramientas se registran como
plugins sin tocar el núcleo
M
RNF-ESC-04 Añadir un nuevo módulo de sala requiere < 5
ficheros nuevos y 0 cambios en otros módulos
M
RNF-ESC-05 Los workers escalan en horizontal: N procesos
consumen la misma cola
M
RNF-ESC-06 Soporta 50 agentes y 20 tareas concurrentes en un
servidor de 4 vCPU y 8 GB
D
RNF-ESC-07 El almacén vectorial está tras una interfaz para
poder cambiar pgvector por otro
M
RNF-ESC-08 El proveedor de LLM está tras una interfaz
LLMClient
M
RNF-ESC-09 Configuración por entorno (dev, test, prod) sin
cambiar código
M
ID Requisito Prioridad
RNF-COS-01 Límite diario global y por agente; al alcanzarlo el
agente pasa a paused
M
### 7.5 Seguridad (SEG)
ID Requisito Prioridad
RNF-COS-02 Máximo de 15 pasos por tarea M
RNF-COS-03 Profundidad de delegación ≤ 3 niveles M
RNF-COS-04 Máximo de 3 devoluciones de un supervisor por
tarea
M
RNF-COS-05 Caché de respuestas de embeddings: el mismo
texto no se indexa dos veces
M
RNF-COS-06 Caché de prompt para el contexto fijo de cada
agente
D
RNF-COS-07 Coste de un objetivo típico de la demo < 0,50 € D
RNF-COS-08 El modo simulado no realiza ninguna llamada
externa
M
ID Requisito Prioridad
RNF-SEG-01 Claves de API solo en .env  del servidor; nunca en
el cliente ni en Git
M
RNF-SEG-02 Contraseñas con argon2; sesión con cookie
httpOnly, Secure y SameSite
M
RNF-SEG-03 Protección CSRF y CORS restringido al origen de la
app
M
RNF-SEG-04 Permisos mínimos: cada herramienta y cada base
de conocimiento se habilitan explícitamente
M
RNF-SEG-05 El contenido de ficheros y webs se trata como
datos, nunca como instrucciones (defensa ante
prompt injection)
M
RNF-SEG-06 Validación de tipo y tamaño de fichero (máx. 50
MB)
M
RNF-SEG-07 La ejecución de código (F) se hace en un
contenedor aislado sin red
F
RNF-SEG-08 Limitación de peticiones por usuario en la API D
### 7.6 Auditoría y trazabilidad (TRA)
### 7.7 Fiabilidad (FIA)
ID Requisito Prioridad
RNF-SEG-09 Escaneo de secretos y dependencias vulnerables
en CI
M
RNF-SEG-10 Cumplimiento de OWASP Top 10 revisado con una
lista de comprobación
D
ID Requisito Prioridad
RNF-TRA-01 El 100 % de las acciones de agentes generan
evento de auditoría
M
RNF-TRA-02 Los eventos son de solo inserción; ningún endpoint
los modifica o borra
M
RNF-TRA-03 Cada evento incluye el hash del anterior (cadena
verificable)
M
RNF-TRA-04 Cada traza guarda el modelo, la versión del prompt
y los fragmentos RAG usados
M
RNF-TRA-05 Retención mínima de 90 días D
RNF-TRA-06 Relojes en UTC con precisión de milisegundos M
ID Requisito Prioridad
RNF-FIA-01 Las tareas sobreviven a un reinicio del servidor M
RNF-FIA-02 Reintento con espera exponencial ante errores del
proveedor de IA (máx. 3)
M
RNF-FIA-03 Si el proveedor de IA cae, la oficina sigue usable y
los agentes pasan a paused
M
RNF-FIA-04 Copia de seguridad diaria de la base de datos y
ficheros
D
RNF-FIA-05 Health checks de todos los servicios M
### 7.8 Usabilidad y accesibilidad (USA)
ID Requisito Prioridad
RNF-USA-01 Toda acción de la oficina tiene equivalente en el
panel lateral, navegable con teclado
M
RNF-USA-02 Contraste WCAG 2.1 AA en paneles M
RNF-USA-03 Los estados no se comunican solo por color (icono
+ texto)
M
RNF-USA-04 Puntuación SUS ≥ 70 en la evaluación con usuarios M
RNF-USA-05 Un usuario nuevo da su primer objetivo en < 5 min
sin ayuda
M
RNF-USA-06 Funciona en Chrome, Firefox y Edge actuales M
RNF-USA-07 Diseño adaptable a 1280 px de ancho o más M
### 7.9 Mantenibilidad y calidad (MAN)
## 8. Arquitectura técnica
El trabajo de los agentes corre en un worker separado de la API, así una tarea larga nunca
bloquea la interfaz y las tareas sobreviven a un reinicio.
ID Requisito Prioridad
RNF-MAN-01 Cobertura de tests ≥ 70 % en backend y ≥ 50 % en
frontend
M
RNF-MAN-02 CI en verde obligatorio para fusionar a main M
RNF-MAN-03 Lint y tipado estricto (ruff, mypy, eslint, tsc) sin
errores
M
RNF-MAN-04 Cada decisión de arquitectura registrada como
ADR
M
RNF-MAN-05 API documentada con OpenAPI y ejemplos M
RNF-MAN-06 Instalación completa con un comando ( docker
compose up )
M
RNF-MAN-07 Tests de extremo a extremo de los 3 flujos
principales (Playwright)
D
RNF-MAN-08 Registros estructurados en JSON con identificador
de petición
M
RNF-MAN-09 Licencias de dependencias y recursos
documentadas
M
La API publica tareas en Redis; el worker las ejecuta y emite eventos por Redis, que la API
reenvía al navegador por WebSocket.
arquitectura · frontend, API, worker y datos
Capa Tecnología Motivo
Escena
isométrica
React Three Fiber + drei, cámara
ortográfica
3D real con aspecto isométrico;
luces, sombras y giro sin esfuerzo
Interfaz React 18, TypeScript, Vite, Tailwind
CSS
Estándar, rápido de desarrollar
Estado del
cliente
Zustand + TanStack Query Estado de la oficina y caché de la
API
API Python 3.12, FastAPI, Pydantic v2 Tipado, OpenAPI automático,
async
ORM y
migraciones
SQLAlchemy 2 + Alembic Maduro y bien documentado
Cola y eventos Redis (cola con arq o RQ +
pub/sub)
Sencillo y persistente
Base de datos PostgreSQL 16 + pgvector Datos y vectores en un solo sitio
### 8.1 Monolito modular
El backend es un único servicio dividido en módulos de dominio. Cada módulo tiene su
propia carpeta, modelos, servicio, router y tests, y solo se comunica con los demás a
través de su interfaz pública ( service.py ) o del bus de eventos interno. Así se puede
desarrollar y probar por partes, y cualquier módulo podría extraerse a un servicio aparte
en el futuro.
Capa Tecnología Motivo
Ficheros MinIO en local, S3 en producción Misma API en ambos entornos
Extracción de
texto
pypdf, python-docx Indexar el archivador
LLM SDK oficial de Anthropic tras una
interfaz propia LLMClient
Permite cambiar de proveedor u
Ollama local
Despliegue Docker Compose Un comando para levantar todo
Módulo Responsabilidad Publica eventos
core Configuración, base de datos, autenticación,
bus de eventos
—
company Empresa, plantillas, presupuesto global company.*
office Salas, rejilla, muebles, posiciones, rutas A* room.* , agent.moved
modules Registro y ciclo de vida de módulos de sala
(plugins)
module.*
agents Agentes, fichas, versiones de prompt, jerarquía
y supervisión
agent.*
runtime Bucle de ejecución, herramientas, memoria,
rutinas
task.step ,
agent.status
tasks Objetivos, planes, tareas, tablones task.* , goal.*
knowledge Bases de conocimiento, indexado, recuperación
RAG
knowledge.*
files Archivadores y almacenamiento file.*
approvals Aprobaciones de dueño y supervisores approval.*
### 8.2 Plugins de módulos de sala
Cada módulo de sala (archivador, dashboard financiero, zona de descanso…) es un plugin
que implementa una interfaz común:
class RoomModule(Protocol):
    key: str                      # "finance_dashboard"
    name: str                     # "Dashboard financiero"
    furniture: list[FurnitureSpec]   # muebles que coloca en la sala
    ui_panel: str                 # nombre del panel React que lo pinta
    def tools(self) -> list[Tool]: ...          # herramientas para los 
agentes de la sala
    def knowledge_sources(self) -> list[KnowledgeSource]: ...  # lo que 
publica al RAG
    def on_install(self, room: Room) -> None: ...
    def on_event(self, event: Event) -> None: ...
En el frontend, cada plugin tiene su componente en frontend/src/modules/<key>/  y se
registra en un mapa key → componente . Añadir un módulo nuevo = una carpeta en el
backend + una en el frontend, sin tocar el resto (RNF-ESC-04).
### 8.3 Camino de escalado
## 1. TFG: un servidor, Docker Compose, un worker.
2. Más carga: varios workers sobre la misma cola; API detrás de un balanceador; Redis
para la difusión entre instancias de WebSocket.
3. Producto: separar runtime  y knowledge  como servicios propios; almacenamiento S3;
base de datos gestionada.
## 9. Modelo de datos
PostgreSQL 16 con la extensión pgvector. Todas las tablas usan id UUID  como clave
primaria y created_at  / updated_at  en UTC.
Módulo Responsabilidad Publica eventos
audit Registro encadenado, trazas, detector de
anomalías
audit.anomaly
finance Costes, presupuestos, dashboard financiero cost.*
realtime WebSocket: reenvía eventos del bus al
navegador
—
Tabla Campos principales Relaciones
owners email, password_hash, name 1 → N companies
companies name, mission, values, locale,
timezone, daily_budget_eur,
monthly_budget_eur, status
N → 1 owner
departments name, color, head_agent_id N → 1 company
rooms name, slug, grid_x, grid_y, width,
height, color
N → 1 company
room_modules room_id, module_key, config
(jsonb), enabled
N → 1 room
furniture room_module_id, model_key,
grid_x, grid_y, rotation, interactive
N → 1 room_module
room_access room_id, agent_id, can_enter,
can_use_tools
N ↔  N rooms/agents
agents name, role, avatar, department_id,
home_room_id, manager_id,
model, temperature, tools (jsonb),
daily_budget_eur, status,
current_room_id, pos_x, pos_y,
archived_at
N → 1 department;
manager_id → agents
agent_prompt_versions agent_id, version, system_prompt,
author, note
N → 1 agent
supervisions supervisor_id, supervised_id, kind
( review , pre_approval ,
observer ), tools (text[]),
escalate_after_min
N ↔  N agents
routines agent_id, rules (jsonb: estado →
destino)
1 → 1 agent
agent_memories agent_id, summary,
source_task_ids, created_at
N → 1 agent
knowledge_bases name, scope ( company ,
department , room , module ,
agent ), scope_id, description
N → 1 company
Tabla Campos principales Relaciones
kb_documents knowledge_base_id, file_id o
source_ref, status ( pending ,
indexed , failed ), indexed_at
N → 1 knowledge_base
kb_chunks kb_document_id, chunk_index,
content, page, metadata (jsonb),
embedding vector(1024), tsv
(tsvector)
N → 1 kb_document
kb_permissions knowledge_base_id, agent_id,
can_read, can_write
N ↔  N
goals title, description, due_at, status,
plan (jsonb), approved_at
N → 1 company
tasks title, instructions, status, priority,
due_at, goal_id, parent_task_id,
room_id, assigned_agent_id,
requested_by_agent_id,
result_file_id, steps_used,
rejections, recurrence
árbol vía parent_task_id
task_dependencies task_id, depends_on_task_id N ↔  N tasks
files room_id, folder, name, mime_type,
size_bytes, storage_key, version,
created_by_agent_id,
created_by_task_id, deleted_at
N → 1 room
messages agent_id, role ( owner , agent ,
tool ), content, task_id
N → 1 agent
approvals requester_agent_id, approver
( owner  o agent_id), task_id,
action_type, payload (jsonb),
status, comment, expires_at,
decided_at
N → 1 agent
meetings topic, participants (uuid[]),
max_rounds, transcript,
minutes_file_id
N → 1 company
finance_entries date, category, amount_eur, kind
( income , expense ), source
N → 1 company
budgets category, period, amount_eur,
created_by_agent_id
N → 1 company
Estados de una tarea: pending  → in_progress  → in_review  → done ; desde cualquiera
puede pasar a blocked  (espera aprobación) o failed .
Índices clave: file_chunks.embedding  (HNSW), tasks(assigned_agent_id, status) ,
events(company_id, created_at) .
Las migraciones se gestionan con Alembic; cada cambio de esquema va en su propio PR.
## 10. API REST y eventos en tiempo real
API REST bajo /api/v1 , documentada automáticamente con OpenAPI en /docs .
Respuestas en JSON; errores con { "error": { "code", "message" } } .
Tabla Campos principales Relaciones
traces task_id, step, agent_id, model,
prompt_version, input_tokens,
output_tokens, cost_eur, context
(jsonb), output, tool_calls (jsonb),
rag_chunk_ids (uuid[]),
latency_ms
N → 1 task
audit_events seq (bigserial), actor ( owner ,
agent_id, system ), type, target,
data (jsonb), cost_eur, prev_hash,
hash, created_at
solo inserción
anomalies agent_id, rule, severity, evidence
(jsonb), status ( open , dismissed ,
resolved )
N → 1 agent
notifications kind, title, link, read_at N → 1 owner
Método Ruta Uso
POST /auth/login  · /auth/logout Sesión del dueño
GET /company Empresa, salas y agentes (carga inicial
de la oficina)
PATCH /company Editar nombre, misión, presupuesto
POST /company/pause  ·
/company/resume
Pausa general
GET /
PATCH
/agents/{id} Ficha del agente
WebSocket en /ws . El servidor envía mensajes { "type", "data", "ts" } :
Método Ruta Uso
POST /agents/{id}/pause  · /resume Pausar un agente
GET / POST /agents/{id}/messages Historial y envío de chat
GET /rooms/{id}/files Archivador de la sala
POST /rooms/{id}/files Subir fichero (multipart)
GET /
DELETE
/files/{id} Descargar o mover a papelera
POST /search Búsqueda global con respuesta citada
GET / POST /goals Listar y crear objetivos
POST /goals/{id}/approve-plan Aprobar el plan del CEO
GET /rooms/{id}/tasks Tablón de la sala
PATCH /tasks/{id} Cambiar estado o reasignar
GET /approvals?status=pending Bandeja de aprobaciones
POST /approvals/{id}/decision { "approve": true, "comment": "…"
}
GET /events Registro filtrable
GET /costs?group_by=agent&from=… Costes
Endpoints adicionales (salas modulares, conocimiento, supervisión y auditoría):
Tipo Cuándo Efecto en la interfaz
agent.status Cambia el estado de un agente Actualiza el icono flotante
agent.message El agente escribe (en
streaming)
Muestra el texto en el chat
task.updated Una tarea cambia de estado Mueve la tarjeta en el tablón
file.created Se archiva un fichero Animación en el archivador de la
sala
approval.created Hay una nueva aprobación Contador y aviso en la barra
superior
cost.updated Cambia el gasto del día Actualiza el indicador de gasto
company.paused Pausa general Atenúa la oficina
Método Ruta Uso
GET /modules/catalog Módulos de sala disponibles
POST / DELETE /rooms/{id}/modules  ·
/rooms/{id}/modules/{key}
Instalar o quitar un módulo
PATCH /rooms/{id}/modules/{key} Configurar un módulo
POST / PATCH /
DELETE
/rooms  · /rooms/{id} Crear, editar o borrar salas
GET /agents/{id}/profile Ficha completa (todas las
pestañas)
GET / POST /agents/{id}/prompt-versions Versiones del prompt;
restaurar una
GET / POST /
DELETE
/supervisions Relaciones de supervisión
GET /org-chart Organigrama calculado
GET / POST /knowledge-bases Bases de conocimiento por
ámbito
POST /knowledge-bases/{id}/documents Añadir documento o fichero
Eventos WebSocket adicionales
Método Ruta Uso
POST /knowledge-bases/{id}/query Probar una consulta (devuelve
fragmentos y puntuación)
POST /knowledge-bases/{id}/reindex Reindexar
GET /tasks/{id}/trace Traza paso a paso de una tarea
GET /audit/events Registro filtrable ( agent ,
type , from , to )
GET /audit/verify Comprobar la cadena de
hashes
GET / PATCH /audit/anomalies  ·
/audit/anomalies/{id}
Ver y cerrar anomalías
GET /finance/dashboard?period=month Datos del dashboard
financiero
POST /finance/entries/import Importar CSV de ingresos y
gastos
GET / POST /finance/budgets Presupuestos
GET /agents/{id}/path?task={task_id} Recorrido del agente para
repetirlo
Tipo Cuándo Efecto en la interfaz
agent.moved El agente empieza un recorrido
(ruta completa)
El cliente anima el trayecto
casilla a casilla
agent.arrived Llega a su destino Cambia la animación
(sentarse, reposo)
agent.resting Empieza a consolidar memoria Icono de taza en la sala de
descanso
supervision.review Un trabajo entra en revisión Tarjeta en el tablón del
supervisor
knowledge.indexed Termina un indexado Estado del documento en la
base
audit.anomaly El Auditor marca una anomalía Escudo naranja sobre el
agente y aviso
## 11. Motor de agentes
Cada agente es un bucle de uso de herramientas sobre la API de Claude, ejecutado por un
worker que toma tareas de una cola persistente.
Bucle de una tarea
## 1. El worker toma la tarea y pone al agente en thinking .
2. Construye el contexto: prompt de rol + misión de la empresa + instrucciones de la
tarea + resumen de su memoria + fragmentos recuperados de sus bases de
conocimiento (11.1).
## 3. Llama al modelo con las herramientas permitidas para ese agente.
4. Si el modelo pide una herramienta: se comprueba el permiso, se ejecuta ( working ), se
registra el evento y se vuelve al paso 3.
5. Si la herramienta es sensible, se crea una aprobación y la tarea pasa a blocked  hasta
tu decisión.
6. Al terminar, el resultado se guarda como fichero en la sala y la tarea pasa a in_review ;
el jefe del agente la revisa y la pasa a done  o la devuelve con comentarios.
Herramientas del MVP
Tipo Cuándo Efecto en la interfaz
module.updated Cambian los datos de un módulo
(p. ej. dashboard)
Refresca el panel del módulo
Herramienta Qué hace ¿Requiere aprobación?
search_files Busca en el archivador (propia sala o todas,
según permiso)
No
read_file Lee un fichero No
write_file Crea o actualiza un fichero en su sala No
delegate_task Crea una tarea para un subordinado directo No
ask_manager Pregunta a su jefe y espera respuesta No
web_search Busca en internet No (límite de 10 por
tarea)
request_approval Pide al dueño una decisión —
delete_file Mueve un fichero a la papelera Sí
Delegación: solo hacia subordinados directos. El CEO crea tareas para los jefes; los jefes,
para sus especialistas (cuando existan).
Memoria: tras cada tarea el agente escribe un resumen corto en su memoria; se
conservan los 20 últimos y los más antiguos se condensan.
Límites (ver RNF-05 y RNF-06): 15 pasos por tarea, 3 niveles de delegación, presupuesto
diario por agente y detección de bucles (la misma tarea delegada dos veces con el mismo
texto se bloquea).
Modelos: un modelo potente para el CEO y la revisión de planes; uno rápido y barato para
el resto. Configurable por agente en su ficha.
### 11.1 Conocimiento por capas (RAG)
Cada agente tiene su propia base de conocimiento y hereda las de su sala, su
departamento y la empresa; antes de cada llamada al modelo, el recuperador elige los
fragmentos más útiles de esas capas y se los entrega con su fuente.
Ejemplo: el CFO elabora un presupuesto.
1. Capa personal: sus notas de presupuestos anteriores y lo que aprendió en revisiones
del CEO.
Herramienta Qué hace ¿Requiere aprobación?
spend_budget Gasto extra por encima de su presupuesto Sí
conocimiento por capas · 4 ámbitos hacia un recuperador
2. Capa de sala: el módulo Dashboard financiero publica cada noche un resumen de
ingresos, gastos y gasto de IA, y los presupuestos vigentes; quedan indexados como
documentos de la sala Finanzas.
3. Capa de departamento: políticas de gasto y plantillas de presupuesto de Finanzas.
## 4. Capa de empresa: misión, prioridades del año y glosario.
El CFO recibe, por ejemplo, 8 fragmentos con su fuente; su presupuesto cita de dónde
sale cada cifra y, al aprobarse, se añade a la capa de sala para la próxima vez.
Reglas del recuperador
Solo consulta bases que el agente tiene permiso para leer ( kb_permissions ).
Búsqueda híbrida: vectorial (pgvector) + palabras clave (tsvector), fusionadas por
rango recíproco.
Bonificación por especificidad: a igual relevancia, gana la capa más propia (personal >
sala > departamento > empresa).
Límite de contexto: máximo 8 fragmentos y 3.000 tokens, configurable por agente.
Los fragmentos se marcan como datos citables, nunca como instrucciones.
Cada traza guarda qué fragmentos se usaron (RF-CON-08), visible en la ficha y en
auditoría.
Herramienta search_knowledge(query, scope?)  para que el agente busque más por
su cuenta.
Troceado: fragmentos de ~500 tokens con 50 de solapamiento, respetando títulos y
páginas; tablas de CSV/XLSX se convierten en texto por filas con cabecera.
### 11.2 Supervisión dentro del bucle
Al terminar una tarea de un supervisado con supervisión review , se crea una revisión
para el supervisor; este camina hasta el puesto, lee el resultado y lo acepta o lo
devuelve con comentarios (máx. 3 veces).
Con supervisión pre_approval , las herramientas listadas se convierten en peticiones
de aprobación al supervisor en lugar de ejecutarse.
Si el supervisor no decide en escalate_after_min , la petición sube al dueño.
### 11.3 Auditor y detección de anomalías
El Auditor combina reglas deterministas (baratas y fiables) con una revisión por IA
periódica:
Una vez al día, el Auditor lee una muestra de trazas y escribe un informe en la Sala de
control.
### 11.4 Rutinas y movimiento
El runtime  emite eventos de estado; el módulo office  traduce cada estado a un destino
según la rutina del agente, calcula la ruta A* en la rejilla y publica agent.moved  con la ruta
completa. El cliente anima el recorrido; el servidor solo guarda la casilla final. Al llegar a la
sala de descanso se lanza la consolidación de memoria.
### 11.5 Modo simulado
Con LLM_PROVIDER=fake , un cliente falso devuelve respuestas guionizadas desde
ficheros YAML (incluidas llamadas a herramientas). Sirve para desarrollar la oficina,
ejecutar los tests y grabar demos sin gastar nada.
## 12. Estructura del repositorio
Un único repositorio (monorepo) llamado agenthq , con frontend y backend separados y
un docker-compose.yml  que levanta todo.
agenthq/
├ ── README.md
├ ── LICENSE
├ ── .env.example
├ ── docker-compose.yml            # db, redis, minio, api, worker, web
├ ── docs/
Regla Se dispara cuando Acción
Gasto
inusual
El gasto de un agente en 1 h supera 3 veces su
media
Aviso; pausa si supera el
límite
Bucle La misma herramienta con los mismos
argumentos 3 veces seguidas
Pausa del agente
Permisos 3 intentos denegados en una tarea Aviso
Sin citas Una respuesta con cifras no cita ningún
fragmento
Aviso de baja confianza
Rechazos Un agente acumula 3 devoluciones de su
supervisor en un día
Aviso para revisar su
prompt
Integridad La verificación de la cadena de hashes falla Alerta crítica
│   ├ ── especificacion.md         # este documento
│   ├ ── decisiones/               # ADR: 0001-monolito-modular.md, 0002-
isometrico.md…
│   ├ ── memoria-tfg/              # capítulos de la memoria
│   ├ ── evaluacion/               # guion de pruebas con usuarios, resultados 
SUS
│   └── img/                      # capturas y GIF de demo
├ ── backend/
│   ├ ── pyproject.toml
│   ├ ── alembic/
│   ├ ── app/
│   │   ├ ── main.py               # monta los routers de cada módulo
│   │   ├ ── core/                 # config, db, auth, bus de eventos, 
registro de plugins
│   │   ├ ── domains/              # un módulo por dominio, misma forma en 
todos:
│   │   │   ├ ── company/          #   models.py · schemas.py · service.py · 
router.py · events.py
│   │   │   ├ ── office/           #   + pathfinding.py (A*), routines.py
│   │   │   ├ ── agents/           #   + supervision.py, profile.py
│   │   │   ├ ── runtime/          #   loop.py, memory.py, llm/ (claude.py, 
fake.py)
│   │   │   ├ ── tasks/
│   │   │   ├ ── knowledge/        #   chunking.py, embeddings.py, 
retriever.py
│   │   │   ├ ── files/
│   │   │   ├ ── approvals/
│   │   │   ├ ── audit/            #   chain.py (hashes), anomalies.py
│   │   │   ├ ── finance/
│   │   │   └── realtime/
│   │   ├ ── room_modules/         # plugins de sala, uno por carpeta
│   │   │   ├ ── filing_cabinet/
│   │   │   ├ ── task_board/
│   │   │   ├ ── finance_dashboard/
│   │   │   ├ ── break_area/
│   │   │   ├ ── meeting_table/
│   │   │   └── audit_panel/
│   │   ├ ── tools/                # herramientas de agentes, una por fichero
│   │   └── prompts/              # prompts de rol en .md
│   ├ ── seeds/                    # plantillas de empresa (YAML) y guiones 
del LLM falso
│   └── tests/                    # unit/ · integration/ · por dominio
├ ── frontend/
│   ├ ── package.json
│   ├ ── src/
│   │   ├ ── app/                  # rutas, layout, proveedores
│   │   ├ ── office/               # escena: OfficeScene, Room, Furniture, 
AgentAvatar, CameraRig, pathAnimator
│   │   ├ ── modules/              # panel de cada plugin de sala, misma clave 
que en backend
│   │   ├ ── features/             # agent-profile, org-chart, knowledge, 
audit, approvals, tasks
│   │   ├ ── shared/               # componentes UI, hooks, utilidades
│   │   ├ ── store/                # Zustand
│   │   ├ ── api/                  # cliente REST y WebSocket generado desde 
OpenAPI
│   │   └── i18n/
│   ├ ── public/models/            # glTF CC0
│   └── tests/                    # vitest + e2e (Playwright)
└── .github/
    ├ ── workflows/ci.yml
    ├ ── ISSUE_TEMPLATE/
    └── PULL_REQUEST_TEMPLATE.md
## 13. Hoja de ruta e issues
Cinco fases; cada una es un milestone de GitHub y termina con algo enseñable. Las
casillas de abajo son los issues que hay que abrir.
Fase 0 · Cimientos (semanas 1–2) — hecho cuando docker compose up  levanta todo y el
CI pasa en verde.
hoja de ruta · 5 fases, MVP en la fase 3
Crear repo agenthq  con README, licencia, .gitignore  y .env.example
Fase 1 · Oficina viva (semanas 3–6) — hecho cuando se ven las 8 salas con sus módulos y
los agentes caminan entre ellas con el LLM falso.
Fase 2 · Conocimiento y agentes (semanas 7–10) — hecho cuando el CFO responde una
pregunta citando un documento de su base de conocimiento.
Fase 3 · Empresa en marcha (semanas 11–16) — hecho cuando das un objetivo, apruebas
el plan, los jefes revisan el trabajo de su equipo y todo queda auditado.
Subir esta especificación a docs/especificacion.md  y escribir ADR 0001 (monolito
modular)
docker-compose.yml  con PostgreSQL + pgvector, Redis, MinIO, API, worker y web
Esqueleto core/  (config, db, auth, bus de eventos, registro de plugins)
Esqueleto de frontend (Vite + React + Tailwind + R3F)
Primera migración con las tablas base y login del dueño (RNF-SEG-02)
LLMClient  con proveedor falso (RF-OTR-07)
Workflow de CI (sección 14)
Plantilla de empresa en YAML (RF-EMP-02)
Dominios company , office , agents  con sus endpoints
Escena isométrica, cámara, zoom y giro (RF-OFI-01, RF-OFI-02)
Sistema de plugins de sala y módulos Archivador, Tablero, Zona de descanso (RF-SAL-
01 a 04)
Panel lateral con pestaña por módulo (RF-OFI-04, RF-OFI-05)
Rejilla, A* y animación de recorridos (RF-MOV-01 a 03, RF-MOV-07)
Rutinas por estado y WebSocket agent.status  / agent.moved  (RF-MOV-02, RNF-
TRE-01)
Release v0.1.0 con GIF en el README
Archivador completo (RF-ARC-01 a 04, 08 a 10)
Dominio knowledge : bases por ámbito, troceado, embeddings, permisos (RF-CON-01 a
04, 09, 10)
Recuperador por capas con citas (RF-CON-07, sección 11.1)
Chat por agente con streaming con el LLM real (RF-AGE-07)
Ficha del agente: Perfil, Capacidades, Conocimiento, Memoria (RF-FIC-01 a 03, 07)
Versiones de prompt (RF-AGE-03)
Sala de descanso con consolidación de memoria (RF-DES-01 a 03)
Release v0.2.0
Worker, cola persistente y bucle de herramientas (sección 11, RNF-FIA-01)
Después · Memoria y defensa (semanas 17–20): redactar la memoria a partir de docs/ ,
preparar la presentación y congelar main .
Fase 4 · Ampliación — después del TFG: los requisitos D y F (reuniones, editor de oficina,
conectores MCP, varias empresas, plugins de terceros).
## 14. Flujo de trabajo en GitHub
El proyecto se sube poco a poco: cada fase es un milestone, cada funcionalidad un issue y
cada issue un Pull Request pequeño.
Ramas
main : siempre funciona; solo se fusiona por PR con CI en verde.
feat/<id>-<nombre> , fix/<id>-<nombre> , docs/<nombre>  para el trabajo diario (p.
ej. feat/RF-ARC-01-subida-ficheros ).
Commits con Conventional Commits:
feat(archivador): subida de ficheros por sala (RF-ARC-01)
fix(oficina): el zoom no respetaba el límite mínimo
docs: añade GIF de la fase 1 al README
Issues: plantillas para funcionalidad y bug; etiquetas frontend , backend , agents , docs ,
good first issue ; cada issue enlaza su requisito (RF-…).
Project board de GitHub con columnas Backlog, En curso, En revisión y Hecho.
CI ( .github/workflows/ci.yml ) en cada PR:
## 1. Backend: ruff  (lint), mypy  (tipos) y pytest  con cobertura.
## 2. Frontend: eslint , tsc --noEmit , vitest  y vite build .
3. Escaneo de secretos (p. ej. gitleaks) para no subir claves por error.
Objetivos, planes, tareas y tablones (RF-TAR-01 a 06, 08 a 11)
Supervisión review  y pre_approval  (RF-SUP-01 a 05, 07 a 09)
Bandeja de aprobaciones (RF-APR-01 a 03)
Trazas, registro encadenado y verificación (RF-AUD-01 a 05, 09)
Auditor con reglas de anomalías (RF-AUD-06, RF-AUD-07)
Módulo Dashboard financiero y conocimiento que publica (RF-FIN-01 a 04, 06, RF-
CON-05)
Ficha: Trabajo, Rendimiento, Coste, Auditoría (RF-FIC-04 a 06, 08)
Límites de coste y pausa (RNF-COS-01 a 04)
Evaluación con usuarios y release v1.0.0 con vídeo de demo
Releases: una etiqueta por fase ( v0.1.0 , v0.2.0 …) con notas generadas desde los PR y
un GIF de demo.
README: GIF de la oficina arriba, qué es en dos frases, instalación con docker compose
up , capturas, estado del roadmap con casillas y enlace a esta especificación en docs/ .
Secretos: .env  en .gitignore  desde el primer commit; .env.example  con los nombres
de las variables y valores vacíos.
## 15. Riesgos y preguntas abiertas
Preguntas abiertas
Riesgo Impacto Mitigación
Alcance enorme para una persona y
un curso
Alto MoSCoW estricto: solo los requisitos M
entran en el TFG; cada fase termina con
algo enseñable
La parte 3D consume demasiado
tiempo
Alto Recursos CC0 ya hechos; empezar por
cajas de colores y mejorar el aspecto al
final; vista plana de respaldo
Coste de IA durante el desarrollo Medio Modo simulado para todo el desarrollo y
los tests; modelo barato; límites diarios
Bucles de delegación o revisión Alto Profundidad ≤ 3, máx. 3 devoluciones,
regla de bucle del Auditor
El CEO malinterpreta el objetivo Medio El plan se aprueba antes de ejecutarse
(RF-TAR-02)
Respuestas inventadas sin base Medio RAG con citas obligatorias en cifras;
regla "sin citas" del Auditor
Prompt injection desde ficheros o
webs
Alto Contenido externo como datos, permisos
mínimos, aprobación en acciones
sensibles
Sincronizar movimiento y estado en
tiempo real
Medio El servidor solo envía rutas y destinos; la
animación vive en el cliente
Coincidir con exámenes y otras
asignaturas
Medio Colchón de 4 semanas al final; fases que
se pueden recortar sin romper el resto
Licencias de recursos y
dependencias
Bajo Solo CC0/MIT/Apache y registro en
docs/creditos.md
¿Tutor del TFG asignado y requisitos formales de la memoria (formato, extensión, fecha
de depósito)?
¿Nombre definitivo del proyecto y dominio?
¿Proveedor de embeddings: API externa o modelo local?
¿Presupuesto mensual máximo de IA durante el desarrollo?
¿Licencia MIT o una más restrictiva si se quiere vender?
