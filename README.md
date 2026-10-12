# Gastos

PWA móvil para llevar los gastos compartidos de Juanjo y Ana.

## Arrancar

```bash
npm install
npm run dev
```

Después abre la URL local que muestra Vite. Para generar una versión de producción:

```bash
npm run build
npm run preview
```

## MVP

- Gastos con concepto, importe en euros, fecha, pagador y reparto.
- Reparto mitad y mitad o íntegro para la otra persona.
- Balance actual y balance desde la última liquidación.
- Liquidaciones parciales o completas sin borrar el historial.
- Defaults de pagador y fecha durante tres horas.
- Datos locales en el navegador, guardados en céntimos.
- Exportación e importación JSON.
- Respaldo interno automático cada cinco días mientras la app está en uso.
- PWA instalable desde el navegador.

El navegador no puede sobrescribir automáticamente un archivo descargado en el dispositivo. Por eso el respaldo de cinco días se guarda dentro del almacenamiento local de la app y la copia externa JSON se descarga con el botón de copias.
