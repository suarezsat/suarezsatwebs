import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { madridDay } from '../src/worker.js';
const base = process.env.TEST_BASE || 'http://localhost:8787';
const password = process.env.TEST_PASSWORD || 'local-test-only';
let cookie = '', entryId = '', mediaId = '';
async function call(path, method = 'GET', body) {
  return fetch(base + path, { method, headers: { Origin: base, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
}
try {
  assert.equal((await call('/api/admin/entries','POST',{ body:'Unauthorized' })).status, 401);
  let response = await call('/api/login','POST',{password}); assert.equal(response.status,200,await response.clone().text());
  cookie = response.headers.get('set-cookie').split(';')[0];
  assert.match(response.headers.get('set-cookie'),/HttpOnly/);
  assert.match(response.headers.get('set-cookie'),/SameSite=Strict/);
  const image = readFileSync(new URL('../../assets/media/brand/suarezsat-dark-white.png',import.meta.url));
  response = await fetch(base+'/api/admin/media',{method:'POST',headers:{Origin:base,Cookie:cookie,'Content-Type':'image/png'},body:image});
  assert.equal(response.status,201,await response.clone().text()); mediaId = (await response.json()).id;
  assert.equal((await call('/media/'+mediaId)).status,404,'Pending upload must not be publicly readable');
  response = await call('/api/admin/entries','POST',{title:'Prueba de integración',body:'Texto de prueba <script>sin ejecutar</script>\nSegunda línea.',media:[{id:mediaId,caption:'Logo del equipo'}]});
  assert.equal(response.status,201,await response.clone().text()); const created = await response.json(); entryId=created.id; assert.equal(created.day,madridDay());
  response=await call('/api/entries'); const data=await response.json();
  const entry=data.entries.find(e=>e.id===entryId); assert.equal(entry.media[0].caption,'Logo del equipo'); assert.match(entry.body,/<script>/);
  assert.equal(response.headers.get('access-control-allow-origin'),'*');
  response=await fetch(base+'/media/'+mediaId,{headers:{Range:'bytes=0-15'}}); assert.equal(response.status,206); assert.equal((await response.arrayBuffer()).byteLength,16);
  assert.match(response.headers.get('content-range'),/^bytes 0-15\//);
  response=await fetch(base+'/media/'+mediaId,{headers:{Range:'bytes=999999999-'}}); assert.equal(response.status,416);
  assert.equal((await call('/api/admin/entries','POST',{media:[{id:mediaId,caption:'Repeated'}]})).status,400);
  await call('/api/admin/entries/'+entryId,'DELETE'); entryId='';
  assert.equal((await call('/media/'+mediaId)).status,404,'Withdrawn media must not be public');
  await call('/api/logout','POST',{});
  assert.equal((await call('/api/admin/entries','POST',{body:'After logout'})).status,401);
  console.log('PASS: authentication, uploads, private pending media, publication, Spanish day, captions, CORS, video ranges, withdrawal and logout.');
} finally {
  if(entryId) await call('/api/admin/entries/'+entryId,'DELETE');
  if(mediaId) await call('/api/admin/media/'+mediaId,'DELETE');
}
