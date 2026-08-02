# Variables de entorno para producción

El archivo `.env` se crea directamente en el VPS y debe tener permisos restrictivos (`chmod 600 .env`). No se versiona ni se comparte.

| Variable | Uso | Valor de referencia |
|---|---|---|
| `NODE_ENV` | Activa el servidor de producción y las cookies seguras de sesión. | `production` |
| `PORT` | Puerto proporcionado por Plesk al proceso Node.js. | El que indique Plesk. |
| `DATABASE_URL` | Conexión MySQL de la aplicación. | `mysql://finance_app:...@127.0.0.1:3306/finanzas_personales` |
| `JWT_SECRET` | Firma de las cookies de sesión; mínimo 32 caracteres aleatorios. | Secreto único generado en el VPS. |
| `VITE_AUTH_PROVIDER` | Hace que el cliente muestre el formulario local. Debe estar definido antes de compilar. | `local` |
| `LOCAL_AUTH_USERNAME` | Nombre del único usuario autorizado. | El usuario privado definido por el propietario. |
| `LOCAL_AUTH_PASSWORD` | Contraseña del único usuario autorizado. | Contraseña privada, no versionada. |
| `VITE_APP_VERSION` | Versión visible del despliegue. | `v0.1.0` o la versión publicada. |
| `VITE_BUILD_DATE` | Fecha y hora visible de la compilación. | ISO 8601 con zona `+02:00`. |

Después de cambiar cualquier variable `VITE_*`, ejecuta `pnpm build` de nuevo para que quede incluida en los activos del cliente. La contraseña local y la cadena MySQL solo se leen en el servidor.
