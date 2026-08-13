# Checklist de flujos interactivos

La lógica de los procedimientos financieros está cubierta por pruebas automáticas: cálculos, tendencias, exclusión de vencimientos, importación y exportación, CRUD, eliminación de movimientos y tipos de cambio, además de aislamiento por usuario. La interfaz se verificó visualmente en escritorio y móvil para todas las rutas principales.

| Flujo crítico | Cobertura automática | Revisión visual | Validación con credenciales reales |
|---|---|---|---|
| Acceso local de usuario único | Sí, credenciales válidas, inválidas, límite de intentos y cierre de sesión | Pantalla de acceso revisada | Validado en el dominio publicado. |
| Alta y edición de movimientos/tarjeta | Sí, procedimiento CRUD | Formularios y listado revisados | Pendiente en entorno autenticado. |
| Eliminación de movimiento | Sí, procedimiento con filtro de usuario | Confirmación explícita implementada | Pendiente en entorno autenticado. |
| Préstamos, cuotas y financiaciones | Sí, cálculos y CRUD | Pantalla y formularios revisados | Pendiente en entorno autenticado. |
| Cuentas, saldos y deudas | Sí, CRUD y aislamiento | Pantalla y formularios revisados | Pendiente en entorno autenticado. |
| Conversión USD → EUR | Sí, cálculo y CRUD | Configuración revisada | Pendiente en entorno autenticado. |
| Exportación e importación JSON | Sí, exportación y restauración validada | Controles revisados | Pendiente de seleccionar una copia real. |

La última columna se completa durante la lista de aceptación de producción indicada en `docs/deploy-plesk.md`. No se simulan operaciones financieras salvo cuando el propietario autoriza expresamente una prueba temporal y su reversión.

La vista previa fue abierta el **28 de julio de 2026** en el navegador personal autenticado y mostró correctamente el panel privado de `juanlu85@gmail.com`. Esta comprobación confirma que el acceso de desarrollo y la sesión privada llevan al dashboard esperado; la prueba de Google OAuth real en `finanzas.blancoguzman.es` continuará pendiente hasta configurar las credenciales de producción.

En esa misma sesión se abrió el formulario autenticado de **Gasto de tarjeta**. Se verificó la presencia de los controles de concepto, importe, moneda, fecha, categoría, cuenta asociada, notas, cancelar y guardar. No se guardó ningún movimiento de demostración para no alterar las finanzas personales reales.

El cierre mediante **Cancelar** devolvió correctamente al listado mensual sin crear registros, lo que confirma el flujo no destructivo de revisión de formularios.

También se revisó la vista autenticada de **Préstamos y financiaciones**: presenta los contadores de obligaciones, las acciones de alta y el aviso de exclusión automática después del vencimiento. No se creó ningún préstamo ni financiación de prueba para preservar los datos reales del usuario.

La vista autenticada de **Cuentas y deudas** mostró la separación explícita entre liquidez y deudas informativas. El formulario de nueva cuenta incluye nombre, entidad, tipo de ubicación, EUR/USD, inclusión en liquidez, estado activo e indicaciones de conservación de histórico. No se guardaron cuentas, saldos ni deudas de demostración.

El formulario de cuenta se cerró mediante **Cancelar** y la pantalla volvió al estado inicial sin añadir registros.

En **Configuración** se verificaron los controles de portabilidad, privacidad y conversión USD → EUR. El formulario de tipo de cambio ofrece valor, fecha de aplicación y nota, preservando el tipo registrado para los informes históricos. No se guardó una tasa ficticia de conversión.

El formulario de conversión se cerró mediante **Cancelar** y la configuración permaneció sin cambios.

Durante la prueba autorizada se creó el tipo temporal **1 USD = 0,9150 EUR**, con la etiqueta `Prueba temporal E2E — eliminar`. La lista lo mostró correctamente, actualizó el estado de consolidación y confirmó el guardado. Se eliminará al cerrar la prueba.

La edición del mismo registro cambió correctamente el valor a **1 USD = 0,9170 EUR** y la lista mostró la notificación de actualización. A continuación se eliminará de forma controlada.

La pantalla **Liquidar mes** se verificó visualmente en escritorio y móvil. Muestra con claridad el disponible en cuentas, importes pendientes de cobro y pago, acciones por concepto y el historial de conceptos liquidados; en móvil se reorganiza en una sola columna sin desbordamiento horizontal.

El **13 de agosto de 2026**, con autorización expresa, se creó un gasto temporal de **0,01 €** vinculado a BBVA, se liquidó desde **Liquidar mes** y se comprobó que el disponible pasó de **5.045,31 €** a **5.045,30 €**, mientras que los pendientes de pago bajaron de **60,01 €** a **60,00 €** y el contador de liquidados aumentó de 45 a 46. La liquidación y el concepto temporal se retiraron después; una comprobación de base de datos confirmó que no quedan registros temporales y que BBVA volvió a **2.002,94 €**.

En una segunda ejecución autorizada se creó el concepto temporal **“PRUEBA UI REVERSIÓN — ELIMINAR”**, se pagó desde el diálogo de **Liquidar mes** contra BBVA y se volvió a observar el ajuste del disponible de **5.045,31 €** a **5.045,30 €**. La extensión del navegador dejó de responder al pulsar el botón de reversión del último elemento, por lo que, con la misma autorización, se retiraron únicamente la liquidación temporal y su concepto mediante una operación de limpieza precisa. La comprobación posterior confirmó **0** transacciones temporales, **0** liquidaciones temporales y el saldo de BBVA restaurado a **2.002,94 €**. La prueba específica de reversión visual completa permanece pendiente.

El **13 de agosto de 2026**, con autorización expresa, se registró un gasto temporal de **0,01 €** contra BBVA mediante **Movimientos Corrientes**. BBVA pasó de **2.002,94 €** a **2.002,93 €** y la liquidez incluida de **5.045,31 €** a **5.045,30 €**, confirmando la actualización inmediata. La reversión devolvió BBVA a **2.002,94 €** y el movimiento temporal ya no existe en la tabla de transacciones, por lo que la prueba no dejó alteraciones financieras.
