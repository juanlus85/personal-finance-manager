# Checklist de flujos interactivos

La lógica de los procedimientos financieros está cubierta por pruebas automáticas: cálculos, tendencias, exclusión de vencimientos, importación y exportación, CRUD, eliminación de movimientos y tipos de cambio, además de aislamiento por usuario. La interfaz se verificó visualmente en escritorio y móvil para todas las rutas principales.

| Flujo crítico | Cobertura automática | Revisión visual | Validación con credenciales reales |
|---|---|---|---|
| Login Google y restricción por correo | Sí, prueba de allowlist | Pantalla de acceso revisada | Pendiente de las credenciales de Google de producción. |
| Alta y edición de movimientos/tarjeta | Sí, procedimiento CRUD | Formularios y listado revisados | Pendiente en entorno autenticado. |
| Eliminación de movimiento | Sí, procedimiento con filtro de usuario | Confirmación explícita implementada | Pendiente en entorno autenticado. |
| Préstamos, cuotas y financiaciones | Sí, cálculos y CRUD | Pantalla y formularios revisados | Pendiente en entorno autenticado. |
| Cuentas, saldos y deudas | Sí, CRUD y aislamiento | Pantalla y formularios revisados | Pendiente en entorno autenticado. |
| Conversión USD → EUR | Sí, cálculo y CRUD | Configuración revisada | Pendiente en entorno autenticado. |
| Exportación e importación JSON | Sí, exportación y restauración validada | Controles revisados | Pendiente de seleccionar una copia real. |

La última columna se completa durante la lista de aceptación de producción indicada en `docs/deploy-plesk.md`. No se simulan operaciones financieras ni se usa una cuenta Google diferente para completar esas comprobaciones.

La vista previa fue abierta el **28 de julio de 2026** en el navegador personal autenticado y mostró correctamente el panel privado de `juanlu85@gmail.com`. Esta comprobación confirma que el acceso de desarrollo y la sesión privada llevan al dashboard esperado; la prueba de Google OAuth real en `finanzas.blancoguzman.es` continuará pendiente hasta configurar las credenciales de producción.

En esa misma sesión se abrió el formulario autenticado de **Gasto de tarjeta**. Se verificó la presencia de los controles de concepto, importe, moneda, fecha, categoría, cuenta asociada, notas, cancelar y guardar. No se guardó ningún movimiento de demostración para no alterar las finanzas personales reales.

El cierre mediante **Cancelar** devolvió correctamente al listado mensual sin crear registros, lo que confirma el flujo no destructivo de revisión de formularios.

También se revisó la vista autenticada de **Préstamos y financiaciones**: presenta los contadores de obligaciones, las acciones de alta y el aviso de exclusión automática después del vencimiento. No se creó ningún préstamo ni financiación de prueba para preservar los datos reales del usuario.

La vista autenticada de **Cuentas y deudas** mostró la separación explícita entre liquidez y deudas informativas. El formulario de nueva cuenta incluye nombre, entidad, tipo de ubicación, EUR/USD, inclusión en liquidez, estado activo e indicaciones de conservación de histórico. No se guardaron cuentas, saldos ni deudas de demostración.

El formulario de cuenta se cerró mediante **Cancelar** y la pantalla volvió al estado inicial sin añadir registros.

En **Configuración** se verificaron los controles de portabilidad, privacidad y conversión USD → EUR. El formulario de tipo de cambio ofrece valor, fecha de aplicación y nota, preservando el tipo registrado para los informes históricos. No se guardó una tasa ficticia de conversión.

El formulario de conversión se cerró mediante **Cancelar** y la configuración permaneció sin cambios.
