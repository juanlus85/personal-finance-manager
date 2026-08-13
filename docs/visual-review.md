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

## Previsiones y escenarios financieros

La revisión de escritorio confirma que la pantalla de **Ingresos y gastos** presenta accesos diferenciados para **BBVA**, **Amex**, **Carrefour** y **El Corte Inglés**, junto con los controles de **Ingreso** y **Gasto** posibles. El resumen mensual ahora presenta bloques separados para ingresos confirmados, gastos previstos, ingresos posibles y gastos posibles. La ruta directa `/resumen` muestra correctamente el balance mensual tras añadir su alias. La pantalla de liquidación conserva los paneles de disponible, pendientes y acciones de cobro o pago sin problemas visuales actuales.

La verificación a **375 × 812 px** confirma que los controles de previsión de tarjetas se adaptan de forma apilada, los selectores de periodo se mantienen utilizables y las tarjetas de escenario y liquidación conservan legibilidad sin desbordamiento horizontal visible.

## Movimientos corrientes

La nueva sección se comprobó en escritorio y en **375 × 812 px**. En escritorio, el formulario rápido, los indicadores de ingresos y gastos registrados y el historial se distribuyen en una composición de dos columnas legible. En móvil, el contenido se reordena en una sola columna, empieza desde la parte superior y mantiene visibles los campos de fecha, cuenta, concepto, importe y notas sin desbordamiento horizontal.

## Rutas publicadas

La navegación interna se comprobó con el fragmento `#/corrientes` en escritorio y móvil. Esta variante evita que el alojamiento publicado tenga que resolver rutas internas de la SPA en el servidor. La vista previa volvió a renderizar correctamente tras reparar una copia local corrupta de la dependencia de iconos y regenerar la caché de Vite.

La configuración de Vite ahora resuelve `lucide-react` desde la dependencia directa y versionada del proyecto. Tras reiniciar el entorno, tanto la vista general como `#/corrientes` cargaron de forma estable en la vista previa.
