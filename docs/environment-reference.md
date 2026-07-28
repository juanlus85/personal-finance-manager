# Variables de entorno para producción

El archivo `.env` se crea directamente en el VPS y debe tener permisos restrictivos (`chmod 600 .env`). No se versiona ni se comparte.

| Variable | Uso | Valor de referencia |
|---|---|---|
| `NODE_ENV` | Activa el servidor de producción y la autenticación Google. | `production` |
| `PORT` | Puerto proporcionado por Plesk al proceso Node.js. | El que indique Plesk. |
| `DATABASE_URL` | Conexión MySQL de la aplicación. | `mysql://finance_app:...@127.0.0.1:3306/finanzas_personales` |
| `JWT_SECRET` | Firma de cookies y estado OAuth; mínimo 32 caracteres aleatorios. | Secreto único generado en el VPS. |
| `VITE_AUTH_PROVIDER` | Hace que el cliente inicie el flujo Google. Debe estar definido antes de compilar. | `google` |
| `GOOGLE_CLIENT_ID` | Identificador público del cliente OAuth creado en Google Cloud. | Valor de Google Cloud. |
| `GOOGLE_CLIENT_SECRET` | Secreto privado del cliente OAuth. | Valor de Google Cloud. |
| `GOOGLE_REDIRECT_URI` | URI de retorno registrada en Google. | `https://finanzas.blancoguzman.es/auth/google/callback` |
| `ALLOWED_EMAIL` | Único correo aceptado por el servidor. | `juanlu85@gmail.com` |
| `VITE_APP_VERSION` | Versión visible del despliegue. | `v0.1.0` o la versión publicada. |
| `VITE_BUILD_DATE` | Fecha y hora visible de la compilación. | ISO 8601 con zona `+02:00`. |

Después de cambiar cualquier variable `VITE_*`, ejecuta `pnpm build` de nuevo para que quede incluida en los activos del cliente. Las credenciales de Google y la cadena MySQL solo se leen en el servidor.
