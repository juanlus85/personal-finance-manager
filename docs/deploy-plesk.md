# Despliegue en `finanzas.blancoguzman.es` con Plesk

Esta guía instala la misma aplicación probada en desarrollo en un VPS con **Plesk, MySQL, acceso SSH y Node.js 23.11.1**. El flujo está pensado para que las actualizaciones posteriores se resuelvan mediante `git pull` y una reconstrucción controlada.

> **No copies el archivo `.env.example` como está.** Crea un archivo `.env` en el servidor con secretos nuevos y reales; nunca lo añadas al repositorio.

## 1. DNS, dominio y certificado

| Elemento | Configuración requerida |
|---|---|
| DNS | Crear un registro `A` para `finanzas.blancoguzman.es` apuntando a la IP pública del VPS. |
| Plesk | Añadir el subdominio `finanzas.blancoguzman.es`. |
| TLS | Emitir y activar un certificado Let’s Encrypt para el subdominio antes de acceder con la cuenta local. |
| Aplicación Node.js | Configurar el modo `production` y el archivo de inicio `dist/index.js`. |

La aplicación debe estar disponible mediante HTTPS para que las cookies de sesión privadas se transmitan de forma segura.

## 2. Base de datos MySQL

Desde Plesk o la consola MySQL, crea una base dedicada y un usuario con privilegios únicamente sobre ella. Sustituye los valores de ejemplo por credenciales propias:

```sql
CREATE DATABASE finanzas_personales CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'finance_app'@'localhost' IDENTIFIED BY 'UNA_CONTRASENA_LARGA_Y_UNICA';
GRANT ALL PRIVILEGES ON finanzas_personales.* TO 'finance_app'@'localhost';
FLUSH PRIVILEGES;
```

## 3. Acceso local único

No es necesario crear ni mantener un cliente de Google OAuth. En el archivo `.env` del VPS define `LOCAL_AUTH_USERNAME` y `LOCAL_AUTH_PASSWORD` junto con un `JWT_SECRET` aleatorio de al menos 32 caracteres. La contraseña se lee únicamente en el servidor, se compara de forma segura y nunca se incluye en el repositorio ni en los activos del navegador.

## 4. Primera instalación por SSH

Ejecuta los comandos desde el directorio de aplicaciones que gestione Plesk. El nombre del repositorio se usará cuando se cree el repositorio privado de GitHub.

```bash
cd /var/www/vhosts/blancoguzman.es
git clone git@github.com:TU_USUARIO/personal-finance-manager.git finanzas
cd finanzas
corepack enable
pnpm install --frozen-lockfile
umask 077
nano .env
```

En el archivo `.env` nuevo, configura los valores descritos en `docs/environment-reference.md`. No copies secretos en el historial de terminal ni los incluyas en archivos versionados.

Después, genera el esquema y compila el proyecto:

```bash
pnpm db:push
pnpm build
```

En la extensión **Node.js** de Plesk, selecciona Node.js 23.11.1, establece `NODE_ENV=production`, define `Application startup file` como `dist/index.js`, confirma el directorio raíz de la aplicación y pulsa **Restart App**. Plesk proporciona el puerto mediante `PORT`; la aplicación lo utiliza automáticamente.

## 5. Configuración de actualizaciones con `git pull`

Antes de actualizar, realiza una copia de seguridad de MySQL y descarga una exportación JSON desde **Configuración → Portabilidad de datos**.

```bash
cd /var/www/vhosts/blancoguzman.es/finanzas
git pull --ff-only
corepack enable
pnpm install --frozen-lockfile
pnpm db:push
pnpm build
```

Actualiza `VITE_APP_VERSION` y `VITE_BUILD_DATE` en `.env` antes de cada reconstrucción; después reinicia la aplicación desde Plesk. El panel mostrará la versión y la fecha configuradas para facilitar la verificación posterior.

## 6. Copias de seguridad y recuperación

La aplicación ofrece una copia JSON que conserva categorías, cuentas, saldos, tipos de cambio, préstamos, cuotas, financiaciones, movimientos, recibos y deudas. También mantiene el histórico mediante archivado o liquidación de entidades, en lugar de borrados destructivos para obligaciones financieras.

Realiza además una copia MySQL periódica:

```bash
mysqldump -u finance_app -p finanzas_personales > finanzas_personales_$(date +%F).sql
```

Para restaurar una copia funcional, usa primero el respaldo SQL completo. Para recuperar datos de usuario dentro de una instalación ya existente, usa **Configuración → Restaurar una copia** y selecciona un JSON generado por esta aplicación.

## 7. Lista de aceptación en producción

Antes de considerar el despliegue terminado, comprueba lo siguiente:

- `https://finanzas.blancoguzman.es` muestra el formulario de acceso local y usa HTTPS válido.
- El usuario local autorizado accede correctamente y una contraseña incorrecta recibe un rechazo sin crear sesión.
- Se puede crear un ingreso, un gasto de tarjeta, un recibo habitual, un préstamo, una financiación, una cuenta, una deuda y un tipo de cambio USD → EUR.
- El resumen mensual diferencia el balance confirmado del balance con ingresos posibles.
- Un préstamo o financiación terminado deja de aparecer en los meses posteriores a su vencimiento.
- Los gráficos, la exportación JSON y la importación de una copia de prueba funcionan como se espera.

## 8. Rutas internas y verificación de dependencias

El dominio temporal de Manus Space puede interceptar rutas sin fragmento —por ejemplo, `/corrientes`— antes de que la aplicación Node.js reciba la petición. Por ello, durante las pruebas publicadas se utiliza la navegación con fragmentos, como `/#/corrientes` y `/#/mensual`. Esta es una limitación conocida del alojamiento temporal, no una sustitución de la regla de respaldo SPA que debe configurarse en el VPS.

En Plesk, comprueba que el proxy dirige las rutas internas no estáticas a `dist/index.js` o a `index.html` según la configuración de Node.js elegida; solo después valida que `https://finanzas.blancoguzman.es/corrientes` no devuelve 404. El proyecto mantiene además rutas con `#/` como alternativa compatible.

Las dependencias se han validado con el lockfile, el árbol instalado, la compilación, las pruebas y la vista previa. Antes de la instalación definitiva en el VPS, ejecuta `pnpm install --frozen-lockfile` en un directorio limpio para confirmar que la resolución de iconos se reproduce desde cero.
