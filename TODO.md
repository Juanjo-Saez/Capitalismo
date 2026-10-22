# Próximos pasos: análisis de gastos

La mejora de mantener la fecha seleccionada durante tres horas ya está implementada. El siguiente objetivo es preparar una vista de análisis que permita entender en qué se va el dinero, qué gastos se repiten y cuáles son excepcionales.

## 1. Preparar los datos

- [ ] Añadir una categoría obligatoria al gasto, con una primera lista editable de categorías: alimentación, vivienda, transporte, ocio, salud, compras, viajes, suscripciones y otros.
- [ ] Permitir crear, renombrar, ocultar y reordenar categorías desde ajustes, sin borrar el histórico asociado.
- [ ] Añadir el tipo de gasto: `único`, `recurrente mensual` o `recurrente con otra frecuencia`.
- [ ] Para los recurrentes, guardar la frecuencia, la fecha de inicio y, opcionalmente, la fecha de fin o el estado activo/inactivo.
- [ ] Diferenciar entre un gasto registrado y una regla de gasto recurrente: la regla servirá para proyecciones y los movimientos reales seguirán siendo editables individualmente.
- [ ] Mantener el modelo de datos en céntimos y conservar compatibilidad con copias JSON antiguas: los gastos importados sin categoría deben quedar en `otros` y como `únicos`.
- [ ] Revisar el formulario de alta y edición para que categoría y tipo puedan registrarse sin hacer más lenta la anotación rápida de un gasto.

## 2. Filtros y consulta del historial

- [ ] Crear una vista `Análisis` separada de `Resumen`, `Movimientos` y `Copias y ajustes`.
- [ ] Filtrar por periodo: este mes, mes anterior, últimos 3 meses, este año y rango personalizado.
- [ ] Filtrar por categoría y permitir seleccionar varias categorías.
- [ ] Filtrar por tipo: gastos únicos, recurrentes y todos.
- [ ] Filtrar por pagador y por modalidad de reparto.
- [ ] Añadir una búsqueda por concepto y nota.
- [ ] Mostrar el número de resultados, el importe total y una acción clara para limpiar filtros.
- [ ] Mantener los filtros al cambiar entre las tarjetas, las gráficas y el listado de resultados.

## 3. Métricas útiles

- [ ] Calcular gasto total del periodo filtrado y variación frente al periodo anterior equivalente.
- [ ] Separar gasto real registrado de gasto recurrente previsto.
- [ ] Mostrar gasto medio mensual, gasto medio por movimiento y número de movimientos.
- [ ] Identificar las categorías con mayor gasto y su porcentaje del total.
- [ ] Mostrar cuánto corresponde a gastos únicos frente a recurrentes.
- [ ] Mostrar el coste mensual comprometido por las reglas recurrentes activas.
- [ ] Detectar meses o categorías con aumentos relevantes y explicar siempre qué datos los producen.
- [ ] Mantener el balance entre Juanjo y Ana separado de las métricas de consumo para no mezclar deuda con gasto.

## 4. Gráficas y presentación

- [ ] Añadir gráfica de evolución mensual del gasto total.
- [ ] Añadir distribución por categorías, con totales y porcentajes accesibles sin depender solo del color.
- [ ] Añadir comparación de gasto único frente a recurrente.
- [ ] Añadir una vista de detalle al pulsar una categoría, mes o segmento de una gráfica.
- [ ] Incluir estados vacíos, periodos sin datos y mensajes para filtros que no devuelvan resultados.
- [ ] Asegurar que las gráficas funcionan en móvil, tienen leyendas legibles y no ocultan los importes exactos.
- [ ] Evaluar una librería de gráficas ligera antes de implementarlas a mano.

## 5. Recurrentes y proyección

- [ ] Permitir pausar, reactivar y finalizar una regla recurrente sin eliminar su histórico.
- [ ] Evitar crear duplicados al generar o importar movimientos recurrentes.
- [ ] Mostrar próximos cargos previstos y el total comprometido de los próximos meses.
- [ ] Permitir convertir un gasto existente en recurrente y crear un gasto recurrente desde cero.
- [ ] Definir cómo se comportan los cambios de importe, categoría o fecha de una regla a partir del siguiente periodo.
- [ ] Dejar claro qué cifras son reales y cuáles son estimadas.

## 6. Calidad y migración

- [ ] Versionar el formato de las copias JSON antes de añadir campos nuevos.
- [ ] Migrar automáticamente los datos existentes sin perder gastos, liquidaciones, preferencias ni notas.
- [ ] Probar importación de una copia antigua y exportación de una copia nueva.
- [ ] Probar filtros con datos vacíos, fechas en distintos años, categorías ocultas y reglas pausadas.
- [ ] Comprobar que editar o eliminar un gasto actualiza inmediatamente las métricas y las gráficas.
- [ ] Mantener el análisis local y sin enviar los datos a ningún servidor.
