# Despliegue en `finanzas.blancoguzman.es` con Plesk

Esta guía instala la misma aplicación probada en desarrollo en un VPS con **Plesk, MySQL, acceso SSH y Node.js 23.11.1**. El flujo está pensado para que las actualizaciones posteriores se resuelvan mediante `git pull` y una reconstrucción controlada.

> **No copies el archivo `.env.example` como está.** Crea un archivo `.env` en el servidor con secretos nuevos y reales; nunca lo añadas al repositorio.

## 1. DNS, dominio y certificado

| Elemento | Configuración requerida |
|---|---|
| DNS | Crear un registro `A` para `finanzas.blancoguzman.es` apuntando a la IP pública del VPS. |
| Plesk | Añadir el subdominio `finanzas.blancoguzman.es`. |
| TLS | Emitir y activar un certificado Let’s Encrypt para el subdominio antes de probar Google OAuth. |
| Aplicación Node.js | Configurar el modo `production` y el archivo de inicio `dist/index.js`. |

La aplicación debe estar disponible mediante HTTPS antes de registrar el inicio de sesión de Google, porque las URIs de retorno de producción requieren HTTPS.

## 2. Base de datos MySQL

Desde Plesk o la consola MySQL, crea una base dedicada y un usuario con privilegios únicamente sobre ella. Sustituye los valores de ejemplo por credenciales propias:

```sql
CREATE DATABASE finanzas_personales CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'finance_app'@'localhost' IDENTIFIED BY 'UNA_CONTRASENA_LARGA_Y_UNICA';
GRANT ALL PRIVILEGES ON finanzas_personales.* TO 'finance_app'@'localhost';
FLUSH PRIVILEGES;
```

## 3. Cliente Google OAuth

En [Google Cloud Console](https://console.cloud.google.com/apis/credentials), crea un cliente OAuth de tipo **Aplicación web**. Añade exactamente los siguientes valores:

| Campo de Google | Valor |
|---|---|
| Origen JavaScript autorizado | `https://finanzas.blancoguzman.es` |
| URI de redirección autorizada | `https://finanzas.blancoguzman.es/auth/google/callback` |
| Usuario permitido por la aplicación | `juanlu85@gmail.com` |

Guarda el identificador y el secreto del cliente solo en el archivo `.env` del VPS. Aunque Google permita iniciar el flujo desde otra cuenta, el servidor verificará el correo confirmado y rechazará cualquier dirección distinta de `juanlu85@gmail.com`.

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

- `https://finanzas.blancoguzman.es` redirige al inicio de sesión de Google y usa HTTPS válido.
- `juanlu85@gmail.com` accede correctamente y una cuenta Google diferente obtiene un rechazo de autorización.
- Se puede crear un ingreso, un gasto de tarjeta, un recibo habitual, un préstamo, una financiación, una cuenta, una deuda y un tipo de cambio USD → EUR.
- El resumen mensual diferencia el balance confirmado del balance con ingresos posibles.
- Un préstamo o financiación terminado deja de aparecer en los meses posteriores a su vencimiento.
- Los gráficos, la exportación JSON y la importación de una copia de prueba funcionan como se espera.
