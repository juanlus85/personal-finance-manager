# Ciclo de vida de los datos financieros

## Copias de seguridad con estado operativo

La exportación JSON guarda tanto la planificación como el estado operativo de cada mes. Para cada concepto ya liquidado conserva el tipo de concepto, el importe previsto, el importe real confirmado, la diferencia entre ambos, la fecha de cobro o pago y la cuenta afectada. Durante la importación, las cuentas y conceptos reciben identificadores nuevos cuando es necesario; la restauración vuelve a enlazar las liquidaciones con esos nuevos identificadores para que un cobro o pago no vuelva a aparecer como pendiente.

> Una restauración debe recuperar el **estado actual** de los saldos y de la liquidación mensual, no solo las partidas planificadas. Para trasladar la aplicación a otra instalación, importa el JSON en una base inicialmente vacía o previamente revisada para evitar duplicar conceptos existentes.

La aplicación conserva el historial financiero siempre que sea razonable. La eliminación física solo se reserva para elementos corregibles que no representan una obligación o una posición patrimonial a largo plazo.

| Entidad | Acción habitual para dejar de usarla | Conservación de histórico | Efecto en nuevos balances |
|---|---|---|---|
| Préstamo | Cambiar el estado a `archived` o alcanzar la fecha de finalización. | Se conserva la ficha, las características y las cuotas. | No se incluye tras el vencimiento ni cuando está archivado. |
| Financiación | Cambiar el estado a `archived` o alcanzar la fecha de finalización. | Se conserva el concepto y su período. | No se incluye tras el vencimiento ni cuando está archivada. |
| Cuenta | Cambiar `isActive` a falso. | Se conservan saldos y movimientos históricos. | No se ofrece en nuevos registros; su último saldo sigue consultable. |
| Recibo o ingreso habitual | Cambiar `isActive` a falso o indicar una fecha de fin. | Se conserva para periodos ya cerrados. | Deja de materializarse en meses posteriores. |
| Deuda | Cambiar el estado a `settled` o `cancelled`. | Se conserva como referencia informativa. | No afecta al balance mensual en ningún estado. |
| Movimiento puntual | Eliminarlo si se trata de un error de registro. | No se conserva una copia del movimiento eliminado. | El resumen se recalcula de inmediato. |
| Tipo de cambio | Editarlo o eliminarlo solo si es erróneo. | La eliminación requiere confirmación explícita. | Los importes USD sin un cambio aplicable dejan de consolidarse en EUR. |

Todos los procedimientos que modifican, archivan o eliminan registros verifican el identificador del usuario autenticado en la consulta de base de datos. Por diseño, una operación no puede afectar una entidad perteneciente a otro usuario.
