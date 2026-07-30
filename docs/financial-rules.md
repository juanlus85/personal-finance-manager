# Reglas financieras del producto

La aplicación trata el **EUR** como moneda de referencia. Cada importe conserva siempre su moneda de origen y, cuando sea necesario mostrar un total consolidado, conserva también el tipo de cambio aplicado a EUR. Para los ingresos de alquiler en USD procedentes de Ecuador, el usuario podrá registrar el tipo de cambio de cada movimiento o emplear un tipo mensual configurado manualmente. De esta forma, los informes históricos no cambian si se actualiza un tipo de cambio posterior.

| Concepto | Inclusión en balance confirmado | Inclusión en balance con posibles | Tratamiento especial |
|---|---:|---:|---|
| Ingreso fijo o extraordinario confirmado | Sí | Sí | Se registra en la moneda original y se convierte a EUR cuando corresponde. |
| Ingreso posible | No | Sí | Debe mostrarse de forma visualmente diferenciada y con estado incierto. |
| Recibo habitual activo | Sí | Sí | Se materializa en cada mes comprendido dentro de su vigencia. |
| Recibo extraordinario | Sí | Sí | Solo afecta al mes de su fecha efectiva. |
| Gasto de tarjeta | Sí | Sí | Se imputa al mes seleccionado, facilitando su actualización. |
| Préstamo o financiación vigente | Sí | Sí | Se incluye mientras la fecha de inicio y de finalización intersecten el mes consultado. |
| Préstamo o financiación vencido | No | No | Se excluye automáticamente de los nuevos resúmenes mensuales. |
| Deuda a favor o en contra | No | No | Se presenta como información patrimonial separada. |
| Saldo de cuenta o efectivo | No | No | Forma parte de la posición de liquidez, no del flujo mensual. |

Un préstamo o financiación se considerará vigente en un mes cuando su período de vigencia interseque dicho mes. Por defecto, el mes que contiene la fecha de finalización se incluirá en el resumen; el elemento dejará de aparecer en los meses posteriores. El producto conservará el historial completo, aunque una obligación ya no se incluya en los cálculos corrientes.

El **balance confirmado** se calcula como ingresos fijos y extraordinarios confirmados menos los gastos activos del período. El **balance incluyendo ingresos posibles** añade exclusivamente los ingresos con estado posible al resultado confirmado. Las deudas y los saldos de cuentas se visualizan en módulos independientes y no alteran ninguno de esos dos resultados.

Los importes se almacenarán mediante decimales exactos, nunca como valores de punto flotante. Las fechas de negocio se interpretarán en la zona horaria de España y los selectores de períodos incluirán dinámicamente los años que contengan datos, el año actual y el siguiente.

## Liquidación del mes y disponibilidad real

La pantalla **Liquidar mes** conserva los conceptos planificados y añade un estado independiente para cada instancia mensual: `pendiente` o `liquidado`. Al cobrar un ingreso o pagar un gasto, se selecciona la cuenta o efectivo en la misma moneda y se registra la fecha efectiva. El concepto deja de aparecer entre las tareas pendientes, queda disponible en el historial del mes y puede deshacerse si fue marcado por error.

| Estado | Efecto en la planificación | Efecto en el saldo disponible |
|---|---|---|
| Pendiente | Continúa visible como cobro o pago pendiente del mes. | No altera el saldo registrado. |
| Liquidado: ingreso | Se mueve al historial de cobros del mes. | Se suma a la cuenta o efectivo seleccionado. |
| Liquidado: gasto | Se mueve al historial de pagos del mes. | Se resta de la cuenta o efectivo seleccionado. |
| Deshacer | El concepto vuelve a pendientes. | Se revierte el efecto de disponibilidad. |

El **disponible en cuentas** se calcula desde el último saldo manual registrado de cada cuenta y aplica después los cobros y pagos liquidados. Si una cuenta aún no tiene saldo inicial, se muestra como pendiente de configurar para evitar inventar una disponibilidad. Cada liquidación pertenece únicamente al mes elegido; al abrir el mes siguiente, los ingresos fijos y recibos habituales vuelven a aparecer como nuevos conceptos pendientes.
