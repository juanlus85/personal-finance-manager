# Correcciones verificadas

## Liquidar mes: acciones de cobro y pago

**Incidencia.** Los botones **Cobrar**, **Pagar** y **Confirmar y cobrar** actualizaban la línea seleccionada, pero el diálogo de liquidación no estaba montado en la pantalla, por lo que no aparecía ninguna acción visible.

**Corrección.** La pantalla ahora renderiza `SettlementDialog` con la línea seleccionada, el mes activo y un cierre que restablece la selección. El diálogo muestra la cuenta compatible, la fecha de operación y los botones de confirmar o cancelar.

**Verificación interactiva.** El 30 de julio de 2026 se comprobó con la sesión autenticada que **Cobrar** abre el diálogo de cobro para *Universidad de Sevilla* y que **Pagar** abre el diálogo de pago para *Comunidad Valparaiso Hills*. Ambos diálogos se cerraron mediante **Cancelar** sin registrar movimientos financieros.

## Liquidar mes: saldo inmediato de la cuenta

**Incidencia.** Un pago podía quedar liquidado sin modificar el disponible de su cuenta cuando la fecha almacenada de la liquidación era anterior al último saldo registrado de esa cuenta. Esto afectó al pago de Carrefour registrado contra BBVA.

**Corrección.** Al confirmar una liquidación, la aplicación actualiza de forma transaccional el último saldo de la cuenta seleccionada usando el **importe real**: suma en los cobros y resta en los pagos. La fecha de confirmación se registra como fecha real y ya no se limita al mes previsto; por tanto, un pago o cobro anticipado se refleja inmediatamente en el disponible. Al deshacer la liquidación, el ajuste se invierte.

**Verificación.** Se añadió una prueba de regresión para un pago de 833,00 € desde un saldo de 6.301,44 €, que genera un saldo de 5.468,44 €. La batería de pruebas pasó correctamente y el panel mostró BBVA y la liquidez consolidada con el ajuste aplicado.
