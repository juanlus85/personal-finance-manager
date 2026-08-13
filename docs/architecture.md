# Arquitectura de producción y desarrollo

La aplicación parte de un cliente React con TypeScript y Tailwind, un servidor Node.js con Express y tRPC, y una base de datos MySQL gestionada mediante Drizzle. Esta estructura permite validar las pantallas y la lógica en el entorno de desarrollo y, posteriormente, desplegar el mismo código en el VPS mediante un repositorio privado de GitHub.

| Área | Decisión | Motivo |
|---|---|---|
| Interfaz | React, TypeScript y Tailwind | Panel responsive, tipado y componentes reutilizables. |
| Servidor | Node.js, Express y tRPC | API interna tipada y apta para autoalojamiento. |
| Base de datos | MySQL con Drizzle | Compatible con el entorno VPS previsto y portable mediante migraciones SQL. |
| Sesión | Cookie HTTP-only, segura y de duración limitada | Protege la sesión y evita exponer tokens OAuth al navegador. |
| Inicio de sesión | Google OpenID Connect con flujo de código | Se valida el token en servidor y se acepta únicamente el correo autorizado. |
| Monedas | EUR como referencia; USD con tasa de cambio registrada | Conserva trazabilidad histórica para el alquiler de Ecuador. |
| Datos | Exportación CSV y migraciones SQL | Facilita la portabilidad y las copias de seguridad. |

En producción, el servidor exigirá `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `SESSION_SECRET`, `DATABASE_URL` y `ALLOWED_EMAIL`. La única dirección permitida será `juanlu85@gmail.com`. El flujo de acceso verificará el estado anti-CSRF, el emisor, la audiencia, la caducidad y la firma del token de identidad, además de que el correo esté verificado y coincida exactamente con la lista de acceso.

El destino de producción será `https://finanzas.blancoguzman.es`. La URL de retorno que se registrará en Google Cloud será `https://finanzas.blancoguzman.es/auth/google/callback`. Para el desarrollo local se documentará una URL de retorno separada; las credenciales nunca se incluirán en el repositorio ni en archivos versionados.

La interfaz se organizará en un panel principal, resumen mensual, ingresos, gastos, préstamos y financiaciones, cuentas y deudas, informes y ajustes. El diseño utilizará una paleta sobria con tonos piedra, tinta, verde profundo y acentos dorados suaves; priorizará jerarquía visual, espacio en blanco, tipografía legible y compatibilidad móvil.

## Integridad de dependencias del cliente

La aplicación fija `lucide-react` como dependencia directa y elimina el renderizador Markdown no utilizado que introducía una segunda versión transitiva de iconos. La configuración de Vite resuelve los iconos desde la dependencia directa del proyecto. El lockfile y el árbol instalado se verifican para asegurar que no exista una resolución activa de la versión transitiva retirada.

La reinstalación completamente limpia depende de que el almacén local de paquetes disponga de todos los tarballs. En este entorno, algunos paquetes ajenos al proyecto no estaban disponibles o no podían escribirse en dicho almacén. Como comprobación equivalente, se regeneró la dependencia directa desde el lockfile, se verificó el árbol resuelto y se ejecutaron comprobación de tipos, compilación, pruebas y vista previa de la aplicación.

## Referencias de autenticación

La implementación de producción sigue el flujo de autorización de servidor de Google OpenID Connect: genera un estado anti-CSRF y un `nonce`, solicita únicamente los ámbitos `openid`, `email` y `profile`, intercambia el código en el servidor y valida el token de identidad mediante las claves públicas de Google. La decisión final de acceso exige que el correo verificado coincida con la lista permitida.

| Recurso | Uso en la aplicación |
|---|---|
| [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect) | Validación de emisor, audiencia, `nonce`, correo y estado de verificación del correo. |
| [Google OAuth 2.0 para aplicaciones de servidor](https://developers.google.com/identity/protocols/oauth2/web-server) | Configuración del cliente, URI de redirección, intercambio seguro del código y protección del flujo de autorización. |
