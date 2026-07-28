# Revisión visual de escritorio

Fecha de verificación: **28 de julio de 2026**. Se revisaron las rutas `/`, `/mensual`, `/movimientos`, `/prestamos`, `/cuentas`, `/informes` y `/configuracion` a 1280 px de ancho.

| Área revisada | Resultado | Observación |
|---|---|---|
| Navegación | Correcta | La barra lateral mantiene el estado activo y conduce a todas las secciones principales. |
| Jerarquía visual | Correcta | La tipografía editorial, las cantidades monoespaciadas y las tarjetas de estado diferencian con claridad los balances. |
| Balance mensual | Correcto | Se distinguen de forma visible el balance confirmado y el escenario con ingresos posibles. |
| Vacíos iniciales | Correcto | Las pantallas muestran acciones directas para crear el primer dato sin recurrir a datos ficticios. |
| Informes | Correcto | Los gráficos y la tabla histórica se renderizan también cuando todavía no existen movimientos. |
| Accesibilidad visual | Correcta | Los controles principales conservan contraste y las etiquetas de estado usan texto además de color. |

La identidad visual queda definida como **“libro mayor privado y sereno”**: fondo crema cálido, navegación verde profundo, tipografía editorial para títulos, valores financieros monoespaciados y acentos discretos para diferenciar ingresos, gastos, escenarios posibles y liquidez. Las futuras extensiones deben conservar esta jerarquía y no introducir datos de demostración que puedan confundirse con datos reales del usuario.

## Revisión móvil

Las rutas de visión general, movimientos, informes y configuración se verificaron a **375 × 812 px**. El contenido comienza desde la parte superior en cada pantalla, las tarjetas se reordenan en una sola columna, los controles de mes conservan una zona táctil legible y no se observó desbordamiento horizontal. Los informes largos mantienen la información esencial sin ocultar las etiquetas de gráficos ni los valores de las tarjetas.
