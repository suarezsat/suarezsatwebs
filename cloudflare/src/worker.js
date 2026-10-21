import { mediaStore } from './storage.js';
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']);
const MAX_FILE = 20 * 1024 * 1024;
const MAX_STORAGE = 800 * 1024 * 1024;
const encoder = new TextEncoder();
const security = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

export function madridDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = type => parts.find(part => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export async function digest(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(v => v.toString(16).padStart(2, '0')).join('');
}
function constantEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { ...security, 'Cache-Control': 'no-store', ...headers } });
}
function failure(message, status = 400) { return json({ error: message }, status); }
function cookie(token, age, request) {
  return `ss_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
async function session(request, env) {
  const token = request.headers.get('Cookie')?.match(/(?:^|;\s*)ss_session=([^;]+)/)?.[1];
  if (!token || token.length > 200) return null;
  const hash = await digest(token);
  return await env.DB.prepare('SELECT token_hash FROM sessions WHERE token_hash = ? AND expires_at > ?').bind(hash, Date.now()).first();
}
async function readJson(request, max = 100000) {
  const reader = request.body?.getReader();
  const chunks = []; let total = 0;
  if (reader) while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel(); throw new Error('El texto es demasiado largo.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const raw = new TextDecoder().decode(bytes);
  try { return JSON.parse(raw); } catch { throw new Error('Los datos no tienen un formato válido.'); }
}
async function listEntries(request, env) {
  const url = new URL(request.url);
  let before = ['', ''];
  const cursor = url.searchParams.get('cursor');
  if (cursor) {
    try { before = JSON.parse(atob(cursor)); } catch { return failure('Página no válida.'); }
    if (!Array.isArray(before) || before.length !== 2 || before.some(v => typeof v !== 'string')) return failure('Página no válida.');
  }
  const { results } = await env.DB.prepare('SELECT * FROM entries WHERE (? = \'\' OR published_at < ? OR (published_at = ? AND id < ?)) ORDER BY published_at DESC, id DESC LIMIT 31')
    .bind(before[0], before[0], before[0], before[1]).all();
  const entries = results.slice(0, 30);
  if (entries.length) {
    const { results: attachments } = await env.DB.prepare(`SELECT id,entry_id,type,size,caption FROM media WHERE entry_id IN (${entries.map(() => '?').join(',')}) ORDER BY created_at,id`).bind(...entries.map(e => e.id)).all();
    entries.forEach(e => { e.media = attachments.filter(m => m.entry_id === e.id).map(m => ({ id: m.id, type: m.type, size: m.size, caption: m.caption, url: `${url.origin}/media/${m.id}` })); });
  }
  const last = entries.at(-1);
  return json({ entries, nextCursor: results.length > 30 ? btoa(JSON.stringify([last.published_at, last.id])) : null, timeZone: 'Europe/Madrid' });
}
async function getMedia(request, env, id) {
  const row = await env.DB.prepare('SELECT * FROM media WHERE id = ? AND entry_id IS NOT NULL').bind(id).first();
  if (!row) return failure('Archivo no encontrado.', 404);
  const headers = new Headers({ ...security, 'Content-Type': row.type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=300' });
  if (request.method === 'HEAD') {
    headers.set('Content-Length', String(row.size));
    return new Response(null, { headers });
  }
  const range = request.headers.get('Range');
  let offset = 0, length = row.size, partial = false;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { ...security, 'Content-Range': `bytes */${row.size}` } });
    if (match[1]) {
      offset = Number(match[1]);
      length = (match[2] ? Math.min(Number(match[2]), row.size - 1) : row.size - 1) - offset + 1;
    } else {
      length = Math.min(Number(match[2]), row.size);
      offset = row.size - length;
    }
    if (offset >= row.size || length <= 0) return new Response(null, { status: 416, headers: { ...security, 'Content-Range': `bytes */${row.size}` } });
    partial = true;
  }
  const object = await env.MEDIA.get(row.object_key, partial ? { range: { offset, length } } : undefined);
  if (!object) return json({ error: 'El archivo se está propagando. Vuelve a intentarlo en un minuto.' }, 503, { 'Retry-After': '60' });
  headers.set('Content-Length', String(length));
  headers.set('ETag', object.httpEtag);
  if (partial) headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${row.size}`);
  return new Response(object.body, { status: partial ? 206 : 200, headers });
}
async function route(request, env) {
  const url = new URL(request.url), path = url.pathname;
  if (path === '/api/entries' && request.method === 'GET') return listEntries(request, env);
  if (path.startsWith('/media/') && ['GET', 'HEAD'].includes(request.method)) return getMedia(request, env, path.slice(7));
  if (path.startsWith('/api/')) {
    if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('Origin') !== url.origin) return failure('Origen no permitido.', 403);
    if (path === '/api/login' && request.method === 'POST') {
      if (!env.ADMIN_PASSWORD_HASH) return failure('Falta configurar el acceso del equipo.', 503);
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      const now = Date.now();
      const attempts = await env.DB.prepare('INSERT INTO login_attempts(ip,count,expires_at) VALUES (?,1,?) ON CONFLICT(ip) DO UPDATE SET count=CASE WHEN expires_at < ? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at < ? THEN excluded.expires_at ELSE expires_at END RETURNING count').bind(ip, now + 900000, now, now).first();
      if (attempts.count > 10) return json({ error: 'Demasiados intentos. Espera 15 minutos antes de volver a entrar.' }, 429, { 'Retry-After': '900' });
      const data = await readJson(request, 2000);
      if (typeof data.password !== 'string' || !constantEqual(await digest(data.password), env.ADMIN_PASSWORD_HASH)) return failure('La clave no es correcta.', 401);
      const token = crypto.randomUUID() + crypto.randomUUID();
      await env.DB.prepare('INSERT INTO sessions VALUES (?,?)').bind(await digest(token), now + 28800000).run();
      await env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run();
      return json({ ok: true }, 200, { 'Set-Cookie': cookie(token, 28800, request) });
    }
    if (path === '/api/session' && request.method === 'GET') {
      const auth = await session(request, env);
      const usage = auth ? await env.DB.prepare('SELECT COALESCE(SUM(size),0) AS bytes FROM media').first() : { bytes: 0 };
      return json({ ok: Boolean(auth), day: madridDay(), mediaEnabled: Boolean(env.MEDIA), maxFileSize: MAX_FILE, storageUsed: usage.bytes, storageLimit: MAX_STORAGE });
    }
    const auth = await session(request, env);
    if (!auth) return failure('Entra con la clave del equipo.', 401);
    if (path === '/api/logout' && request.method === 'POST') {
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(auth.token_hash).run();
      return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0, request) });
    }
    if (path === '/api/admin/media' && request.method === 'POST') {
      if (!env.MEDIA) return failure('El almacenamiento todavía no está disponible.', 503);
      const type = request.headers.get('Content-Type')?.split(';')[0];
      const size = Number(request.headers.get('Content-Length'));
      if (!TYPES.has(type)) return failure('Formato admitido: JPG, PNG, WebP, GIF, MP4 o WebM.', 415);
      if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_FILE || !request.body) return failure('Cada archivo debe ocupar entre 1 byte y 20 MB en el plan gratuito.', 413);
      const id = crypto.randomUUID(), key = `uploads/${id}`;
      const reserved = await env.DB.prepare('INSERT INTO media(id,object_key,type,size,created_at,ready) SELECT ?,?,?,?,?,0 WHERE (SELECT COALESCE(SUM(size),0) FROM media) + ? <= ?').bind(id, key, type, size, new Date().toISOString(), size, MAX_STORAGE).run();
      if (!reserved.meta.changes) return failure('El espacio gratuito está lleno. Retira archivos antiguos antes de subir más; no se activará ningún plan de pago.', 413);
      const limited = new FixedLengthStream(size);
      const transfer = request.body.pipeTo(limited.writable);
      try {
        await Promise.all([transfer, env.MEDIA.put(key, limited.readable, { httpMetadata: { contentType: type } })]);
        await env.DB.prepare('UPDATE media SET ready = 1 WHERE id = ?').bind(id).run();
      } catch (error) {
        await env.MEDIA.delete(key);
        await env.DB.prepare('DELETE FROM media WHERE id = ? AND entry_id IS NULL').bind(id).run();
        throw error;
      }
      return json({ id, type, size }, 201);
    }
    if (path === '/api/admin/entries' && request.method === 'POST') {
      const data = await readJson(request);
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      const body = typeof data.body === 'string' ? data.body.trim() : '';
      const media = data.media ?? [];
      if (title.length > 160 || body.length > 10000 || !Array.isArray(media) || media.length > 12) return failure('Máximo: 160 caracteres de título, 10.000 de texto y 12 archivos.');
      if (!title && !body && !media.length) return failure('Escribe un texto o añade al menos una foto o un vídeo.');
      const ids = media.map(m => m?.id);
      if (new Set(ids).size !== ids.length) return failure('Hay archivos repetidos.');
      for (const item of media) {
        if (typeof item?.id !== 'string' || typeof item.caption !== 'string' || item.caption.length > 500) return failure('Revisa los archivos y sus descripciones.');
        if (!await env.DB.prepare('SELECT id FROM media WHERE id = ? AND entry_id IS NULL AND ready = 1').bind(item.id).first()) return failure('Uno de los archivos no está disponible. Súbelo de nuevo.');
      }
      const id = crypto.randomUUID(), now = new Date(), day = madridDay(now);
      await env.DB.batch([
        env.DB.prepare('INSERT INTO entries VALUES (?,?,?,?,?)').bind(id, title, body, now.toISOString(), day),
        ...media.map(m => env.DB.prepare('UPDATE media SET entry_id = ?,caption = ? WHERE id = ? AND entry_id IS NULL').bind(id, m.caption.trim(), m.id)),
      ]);
      return json({ id, day }, 201);
    }
    if (path.startsWith('/api/admin/entries/') && request.method === 'DELETE') {
      const id = path.slice('/api/admin/entries/'.length);
      const { results } = await env.DB.prepare('SELECT object_key FROM media WHERE entry_id = ?').bind(id).all();
      // Delete the row first so media immediately stops being publicly accessible.
      await env.DB.prepare('DELETE FROM entries WHERE id = ?').bind(id).run();
      if (results.length && env.MEDIA) await env.MEDIA.delete(results.map(r => r.object_key));
      return json({ ok: true });
    }
    if (path.startsWith('/api/admin/media/') && request.method === 'DELETE') {
      const id = path.slice('/api/admin/media/'.length);
      const row = await env.DB.prepare('SELECT object_key FROM media WHERE id = ? AND entry_id IS NULL').bind(id).first();
      if (row) {
        if (env.MEDIA) await env.MEDIA.delete(row.object_key);
        await env.DB.prepare('DELETE FROM media WHERE id = ? AND entry_id IS NULL').bind(id).run();
      }
      return json({ ok: true });
    }
    return failure('Ruta no encontrada.', 404);
  }
  if (path === '/') return Response.redirect(`${url.origin}/admin/`, 302);
  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  Object.entries(security).forEach(([k, v]) => headers.set(k, v));
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, headers });
}
export default {
  async fetch(request, env) {
    env = { ...env, MEDIA: mediaStore(env) };
    let response;
    try { response = await route(request, env); }
    catch (error) {
      console.error(error);
      response = failure(error.message?.startsWith('D1_') ? 'No se ha podido guardar. Inténtalo de nuevo.' : (error.message || 'No se ha podido completar la operación.'), 400);
    }
    const url = new URL(request.url);
    // Public read API only. Administration always stays on the Worker's own origin.
    if (url.pathname === '/api/entries' && request.method === 'GET') {
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(response.body, { status: response.status, headers });
    }
    return response;
  },
  async scheduled(_event, env) {
    env = { ...env, MEDIA: mediaStore(env) };
    const cutoff = new Date(Date.now() - 86400000).toISOString();
    const { results } = await env.DB.prepare('SELECT id,object_key FROM media WHERE entry_id IS NULL AND created_at < ? LIMIT 20').bind(cutoff).all();
    if (results.length && env.MEDIA) await env.MEDIA.delete(results.map(r => r.object_key));
    if (results.length) await env.DB.batch(results.map(r => env.DB.prepare('DELETE FROM media WHERE id = ? AND entry_id IS NULL').bind(r.id)));
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()),
      env.DB.prepare('DELETE FROM login_attempts WHERE expires_at < ?').bind(Date.now()),
    ]);
  },
};
