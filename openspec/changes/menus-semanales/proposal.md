# Propuesta: catalogo de recetas y menu semanal

Estado: borrador para revisar. No implica implementar todavia la funcionalidad.

## 1. Objetivo

Reducir la tarea del domingo a abrir `Menus`, generar una propuesta para la semana siguiente y ajustar unos pocos platos. El menu se construye con recetas habituales elegidas por el usuario, no con recetas inventadas.

La funcionalidad es independiente de los gastos: no genera movimientos, no modifica balances y no exige asociar recetas a compras.

## 2. Alcance y prioridades

### Primera entrega

- Nueva seccion `Menus`, con dos vistas internas: `Semana` y `Recetas`.
- Catalogo propio de recetas aptas para comida, cena o ambas.
- Semana de lunes a domingo, con comida y cena cada dia: 14 huecos.
- Generacion con un boton, sustitucion individual y seleccion manual.
- Bloqueo de platos que deben conservarse al regenerar.
- Huecos marcados como `Fuera de casa` o `Sin planificar`.
- Conservacion de semanas anteriores y almacenamiento local sin conexion.
- Inclusion de recetas y menus en las copias de seguridad.

### Segunda entrega: variedad

- Etiquetas compartidas entre recetas, como `sopa`, `pasta`, `arroz` o `legumbres`.
- Preferencia configurable para separar recetas similares entre dias consecutivos.
- Limite semanal opcional por etiqueta.
- Preferencia por recetas que lleven mas tiempo sin aparecer.
- Avisos comprensibles cuando las preferencias no se puedan satisfacer.

### Fuera de alcance inicial

- Lista de la compra, cantidades por comensal y gestion de despensa.
- Calorias, objetivos nutricionales o recomendaciones medicas.
- Importacion automatica de recetas, generacion mediante IA y servicios externos.
- Sincronizacion entre dispositivos, cuentas y colaboracion en tiempo real.
- Desayunos, meriendas y generacion automatica programada cada domingo.

## 3. Experiencia propuesta

### Semana

La cabecera muestra el intervalo de fechas, la navegacion entre semanas y `Generar menu`. Al abrir esta seccion por primera vez, se muestra la proxima semana de lunes a domingo; el domingo apunta al lunes siguiente. Las fechas se interpretan segun el calendario local del dispositivo.

Cada dia contiene dos filas, `Comida` y `Cena`. En movil se muestran los dias en una lista vertical; en pantallas amplias puede utilizarse una tabla semanal. Cada hueco permite elegir receta, pedir otra alternativa o bloquear la seleccion actual.

`Generar menu` completa una semana vacia. Si ya hay selecciones, la accion pasa a `Regenerar pendientes`: solo cambia huecos sin bloquear y pide confirmacion antes de sustituir contenido existente. Se ofrece deshacer la ultima generacion de la semana mientras siga abierta la vista.

`Fuera de casa` y `Sin planificar` son decisiones explicitas: el generador las conserva hasta que el usuario vuelva a habilitar esos huecos. Un hueco vacio por falta de recetas se distingue de `Sin planificar`.

### Recetas

Listado con busqueda por nombre y filtros por comida/cena. El alta rapida solo exige nombre y momento permitido. Desde cada receta se puede editar, consultar o archivar.

Campos propuestos:

| Campo | Obligatorio | Uso |
| --- | --- | --- |
| Nombre | Si | Identificar el plato, por ejemplo, crema de calabacin |
| Apta para | Si | Comida, cena o ambas |
| Etiquetas de variedad | No | Detectar similitud en la segunda entrega |
| Tiempo aproximado | No | Referencia personal; no condiciona la primera generacion |
| Notas o enlace | No | Recordar la preparacion sin exigir una receta completa |
| Activa/archivada | Si | Excluir del generador conservando el historial |

Las etiquetas no son categorias de gastos ni valoraciones nutricionales. `Sopa` describe similitud culinaria y puede compartirse entre una sopa de fideos y una crema de verduras si el usuario las considera parecidas.

## 4. Requisitos funcionales

| ID | Entrega | Requisito verificable |
| --- | --- | --- |
| REQ-001 | 1 | Acceder a `Menus` y volver a las vistas de gastos sin alterar movimientos, preferencias ni balances. |
| REQ-002 | 1 | Crear y editar recetas con nombre no vacio y al menos un momento permitido; buscar por nombre y filtrar por momento. |
| REQ-003 | 1 | Archivar y reactivar recetas; las archivadas no participan en nuevas asignaciones automaticas. |
| REQ-004 | 1 | Abrir, consultar y conservar un menu por semana, identificado por la fecha local de su lunes, sin sobrescribir otras semanas. |
| REQ-005 | 1 | Generar los 14 huecos utilizando exclusivamente recetas activas compatibles con comida o cena. |
| REQ-006 | 1 | No asignar automaticamente la misma receta mas de una vez en la semana, incluyendo las selecciones ya conservadas. |
| REQ-007 | 1 | Elegir manualmente una receta activa compatible o sustituir un solo hueco por otra alternativa, sin cambiar el resto. |
| REQ-008 | 1 | Bloquear y desbloquear selecciones; regenerar conserva bloqueos y decisiones de no cocinar. |
| REQ-009 | 1 | Confirmar la sustitucion de selecciones existentes y permitir deshacer la ultima generacion sin alterar otras semanas. |
| REQ-010 | 1 | Cuando no sea posible completar el menu, guardar la parte valida, dejar huecos pendientes y explicar la causa sin infringir silenciosamente las reglas obligatorias. |
| REQ-011 | 1 | Guardar automaticamente recetas y semanas, recuperarlas al reabrir la app y permitir su uso sin conexion una vez disponible la PWA. |
| REQ-012 | 1 | Incluir los nuevos datos en exportacion, importacion y respaldo automatico; importar copias antiguas sin borrar recetas ni menus existentes por ausencia de esos campos. |
| REQ-013 | 1 | Conservar nombre y momento planificados en semanas guardadas aunque la receta se renombre, cambie de momento o se archive. |
| REQ-014 | 2 | Crear, asignar y reutilizar etiquetas de variedad; normalizar espacios y mayusculas para no duplicar una misma etiqueta. |
| REQ-015 | 2 | Activar o desactivar la preferencia por evitar etiquetas compartidas en dias consecutivos y configurar un maximo semanal opcional por etiqueta. |
| REQ-016 | 2 | Priorizar propuestas sin conflictos de variedad y avisar de los conflictos restantes, indicando dias, recetas y etiquetas afectados. |
| REQ-017 | 2 | Considerar el domingo anterior al generar el lunes, si hay menu guardado; validar tambien el lunes siguiente si ya tiene selecciones conservadas. |
| REQ-018 | 2 | Favorecer, entre alternativas equivalentes, recetas menos recientes en semanas guardadas anteriores a la semana objetivo. |

## 5. Reglas de generacion

### Obligaciones de la primera entrega

El generador respeta la compatibilidad comida/cena, las recetas activas, los bloqueos y las exclusiones de huecos. Una receta apta para ambos momentos sigue siendo una sola receta a efectos de repeticion semanal.

La asignacion considera la semana completa: no debe gastar todas las recetas aptas para cena en comidas si existe una distribucion completa compatible. Tener 14 recetas no garantiza poder cubrir 14 huecos si sus momentos permitidos no encajan.

Si falta catalogo, no se inventan platos ni se permiten repeticiones automaticamente. Se explica, por ejemplo, `Faltan 3 cenas con recetas distintas`, y se permite anadir recetas, excluir huecos o introducir repeticiones manualmente. Las repeticiones manuales se aceptan con aviso; si estan bloqueadas, se conservan al regenerar y el resto del menu no anade nuevas apariciones de esas recetas.

La aleatoriedad aporta alternativas, pero no garantiza una semana distinta en cada pulsacion. Si solo existe una opcion valida para un hueco, se mantiene y se indica que no hay otra alternativa.

### Preferencias de variedad de la segunda entrega

Propuesta inicial: la separacion de etiquetas se aplica a cualquier comida o cena entre dos dias consecutivos. Si el lunes hay sopa en la comida, se intenta evitar otra sopa tanto en la comida como en la cena del martes. Tambien se intenta evitar repetir una etiqueta entre comida y cena del mismo dia.

Las obligaciones anteriores tienen prioridad sobre la variedad. Las preferencias de etiquetas se tratan como objetivos, no como prohibiciones: si no son compatibles con un menu completo, se muestra la propuesta con menos conflictos encontrada y sus avisos. Nunca se presenta como garantia nutricional ni como solucion optima garantizada.

El maximo semanal de una etiqueta cuenta apariciones por hueco. Una receta con varias etiquetas suma una aparicion a cada una. Los huecos sin receta no cuentan. Los cambios manuales recalculan los avisos, pero no reordenan otros platos.

## 6. Entidades principales

- **Receta:** identificador estable, nombre, momentos permitidos, estado, tiempo opcional, notas y etiquetas.
- **Menu semanal:** lunes de referencia y sus 14 huecos. Se guarda como decision del usuario, no se recalcula al abrirlo.
- **Hueco:** fecha, momento, estado, receta opcional, nombre conservado y bloqueo. Estados: pendiente, receta, fuera de casa o sin planificar.
- **Preferencias de variedad:** separacion entre dias, limites por etiqueta y uso de historial.

El historial indica lo planificado, no confirma que se haya cocinado. No se incluye seguimiento de consumo real en este alcance.

## 7. Escenarios de aceptacion

### P1. Preparar la semana del domingo

Dado un catalogo con una distribucion compatible de 14 recetas activas distintas, cuando el usuario pulsa `Generar menu` el domingo, entonces obtiene comida y cena para el lunes siguiente hasta el domingo, sin repeticiones y sin modificar los gastos. Cubre REQ-001, REQ-004, REQ-005 y REQ-006.

### P1. Ajustar sin perder decisiones

Dado un menu con dos recetas bloqueadas y una cena fuera de casa, cuando el usuario regenera y confirma, entonces esos tres huecos permanecen iguales. Cuando deshace, se recupera el menu anterior completo. Cubre REQ-007, REQ-008 y REQ-009.

### P1. Catalogo insuficiente o incompatible

Dadas 20 recetas aptas solo para comida, cuando se genera la semana, entonces ninguna aparece en una cena y se informa de las siete cenas pendientes. Dado un catalogo vacio, se ofrece crear recetas sin generar contenido ficticio. Cubre REQ-002, REQ-005 y REQ-010.

### P1. Recuperacion y archivo

Dado un menu guardado, cuando se renombra o archiva una receta y se reabre la app sin conexion, entonces se conserva el nombre planificado y la receta archivada no aparece en nuevas asignaciones. Cubre REQ-003, REQ-011 y REQ-013.

### P1. Copias compatibles

Dadas recetas y semanas guardadas, cuando se exportan y restauran en una instalacion vacia, entonces se recuperan junto con los gastos. Cuando se importa una copia antigua sin datos de menus en una instalacion que ya los tiene, estos no se borran. Cubre REQ-012.

### P2. Evitar platos similares

Dadas dos recetas con etiqueta `sopa` y suficientes alternativas sin conflictos, cuando se genera con separacion activada, entonces no se colocan en el mismo dia ni en dias consecutivos. Si el domingo anterior tiene sopa, la comprobacion incluye el lunes nuevo. Cubre REQ-014, REQ-015, REQ-016 y REQ-017.

### P2. Conflictos inevitables y rotacion

Dado un catalogo que obliga a repetir etiquetas, cuando se genera, entonces se mantienen las obligaciones y se detallan los conflictos de variedad. Entre candidatos igualmente validos, se favorecen los menos recientes sin consultar semanas futuras. Cubre REQ-016 y REQ-018.

## 8. Criterios de exito

- Con el catalogo preparado y compatible, obtener una propuesta completa de 14 huecos con una sola accion.
- Poder sustituir un plato o bloquearlo desde su hueco sin abrir el catalogo ni perder el resto del menu.
- Generar una propuesta en menos de 2 segundos con un catalogo de hasta 200 recetas en el dispositivo movil de referencia acordado para las pruebas.
- Conservar el 100 % de recetas, semanas y bloqueos tras cerrar y reabrir la app o exportar y restaurar una copia nueva.
- No modificar ningun movimiento ni balance como consecuencia de generar o editar menus.
- En la segunda entrega, mostrar todos los conflictos de las preferencias activadas, incluidos los introducidos manualmente.

## 9. Supuestos y decisiones a revisar

Son propuestas por defecto, no requisitos confirmados por el usuario:

- Un unico menu compartido por dispositivo, sin distinguir platos para Juanjo y Ana.
- Se planifican siete dias completos, aunque se pueden excluir comidas o cenas concretas.
- No repetir recetas durante una semana es la regla automatica inicial; las sobras y el batch cooking quedan para una ampliacion.
- Las recetas se archivan en lugar de borrarse definitivamente.
- La similitud se declara mediante etiquetas elegidas por el usuario, sin inferirla del nombre del plato.
- La separacion entre platos similares y los limites por etiqueta son preferencias flexibilizables con aviso.

Recomendacion: validar primero el uso semanal con catalogo, generacion y bloqueos. Anadir despues las reglas de variedad usando menus reales como ejemplos de lo que se quiere evitar.