# Avances de SuarezSat · Plan gratuito

- Web pública: https://suarezsat.es/avances.html
- Panel del equipo: https://suarezsat-avances.suarezsatinfo.workers.dev/admin/
- Repositorio que publica el dominio: `suarezsat/suarezsatwebs`, rama `main`, raíz.
- Cuenta de Cloudflare: `suarezsatinfo@gmail.com`.

## Publicar

Entra al panel con la clave privada del equipo. Escribe un título o una nota, añade fotos o vídeos con sus descripciones y pulsa **Publicar en Avances**.

Las publicaciones se asignan al día actual en `Europe/Madrid`, incluidos los cambios de horario. Se admiten varias entradas al día, notas sin archivos y publicaciones mixtas. Las entradas nuevas aparecen primero. La web comprueba novedades cada minuto. Los archivos pueden tardar hasta un minuto en propagarse.

Se admiten **hasta 12 archivos por publicación y 20 MB por archivo**: JPG, PNG, WebP, GIF, MP4 y WebM. Recomendamos MP4/H.264 para vídeos. No se realiza transcodificación. Para vídeos largos, comprímelos o divídelos en clips.

Los comentarios de texto y pies de foto los escribe el equipo. No hay comentarios abiertos a visitantes. El panel permite retirar una publicación y sus archivos; no hay papelera. Las subidas abandonadas se limpian tras 24 horas.

## Coste y límites

Se usan **Workers Free, Workers KV y D1**, sin R2, Stream, Images ni suscripciones de pago. El espacio de los archivos está limitado a **800 MB**, por debajo del límite gratuito de KV. Al llenarse se rechazan nuevas subidas; se pueden retirar publicaciones antiguas para liberar espacio. El panel muestra el espacio utilizado.

El plan gratuito tiene cuotas diarias de peticiones, lecturas y escrituras. Si se alcanzan, el servicio puede dejar de funcionar temporalmente hasta su restablecimiento. No se activa ni contrata un plan de pago automáticamente.

- [Cuotas gratuitas de KV](https://developers.cloudflare.com/kv/platform/pricing/)
- [Límites de KV](https://developers.cloudflare.com/kv/platform/limits/)
- [Workers](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1](https://developers.cloudflare.com/d1/platform/pricing/)

No cambiar la cuenta a un plan de pago sin autorización del titular. No es necesario introducir una tarjeta para esta implementación.

## Servicios y acceso

- Worker `suarezsat-avances`: panel y API.
- Namespace KV `suarezsat-avances-media`: archivos, por debajo de los 25 MiB por valor.
- D1 `suarezsat-avances`: entradas, fechas, pies de foto, reservas de espacio y sesiones.
- GitHub Pages: sitio público actual; el dominio no se ha trasladado.

No publiques contraseñas, tokens ni `.dev.vars`. El secreto `ADMIN_PASSWORD_HASH` contiene el hash SHA-256 de una clave aleatoria larga. Las sesiones usan cookies HttpOnly y caducan a las ocho horas. La administración valida el origen de las peticiones. Solo se sirven archivos de entradas publicadas. La reserva de espacio es atómica para impedir superar el límite con subidas simultáneas.

Para cambiar la clave del equipo, configura un hash nuevo con `wrangler secret put ADMIN_PASSWORD_HASH` y vacía la tabla `sessions` para revocar los accesos anteriores. No reutilices la antigua contraseña del área de patrocinadores.

## Desarrollo y despliegue

```sh
npm ci
npx wrangler whoami
npx wrangler d1 migrations apply DB --local
npx wrangler dev
npm test
node test/integration.mjs
```

Crea `.dev.vars` con un `ADMIN_PASSWORD_HASH` exclusivo de prueba. La integración utiliza `local-test-only` por defecto; nunca debe ser la clave de producción. Para otros entornos define `TEST_BASE` y `TEST_PASSWORD`. La integración publica y retira una entrada: úsala preferiblemente en local.

```sh
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

`assets/js/avances-config.js` contiene solo la URL pública del Worker. Las credenciales no se incluyen en el sitio ni en el repositorio. No hace falta configurar un bucket ni activar otros servicios.
