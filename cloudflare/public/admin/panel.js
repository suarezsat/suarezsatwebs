(() => {
  const $ = id => document.getElementById(id);
  const dateFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeZone: 'Europe/Madrid' });
  const dateTimeFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Madrid' });
  let selected = [], pending = [], previewUrls = [], cursor = null, busy = false;
  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 && path !== '/api/login') showLogin();
      throw new Error(data.error || 'No se ha podido completar la operación.');
    }
    return data;
  }
  function showLogin() { $('login-section').hidden = false; $('editor-section').hidden = true; }
  async function openEditor() {
    const info = await api('/api/session');
    if (!info.ok) { showLogin(); return; }
    $('today').textContent = dateFormat.format(new Date(`${info.day}T12:00:00Z`));
    $('files').disabled = !info.mediaEnabled;
    $('upload-help').textContent = info.mediaEnabled
      ? 'Plan gratuito: hasta 12 archivos por publicación y 20 MB por archivo. JPG, PNG, WebP, GIF, MP4 o WebM. Para vídeos, recomendamos MP4 con códec H.264.'
      : 'El almacenamiento todavía no está disponible. Puedes publicar texto.';
    $('storage-info').textContent = `Espacio utilizado: ${(info.storageUsed / 1024 / 1024).toFixed(1)} de ${Math.round(info.storageLimit / 1024 / 1024)} MB. Al llenarse, se detendrán las nuevas subidas. No se activa ningún plan de pago.`;
    $('login-section').hidden = true; $('editor-section').hidden = false;
    await loadEntries(true);
  }
  $('login-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.submitter; button.disabled = true;
    try {
      await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('password').value }) });
      $('password').value = ''; $('status').textContent = ''; await openEditor();
    } catch (error) { $('status').textContent = error.message; }
    finally { button.disabled = false; }
  });
  $('logout').addEventListener('click', async () => {
    try { await api('/api/logout', { method: 'POST', body: '{}' }); showLogin(); }
    catch (error) { $('status').textContent = error.message; }
  });
  function clearPreviews() {
    previewUrls.forEach(url => URL.revokeObjectURL(url)); previewUrls = []; $('previews').replaceChildren();
  }
  $('files').addEventListener('change', () => {
    clearPreviews(); selected = [...$('files').files]; pending = [];
    if (selected.length > 12 || selected.some(file => file.size > 20 * 1024 * 1024 || !file.size)) {
      $('publish-status').textContent = 'Elige hasta 12 archivos de un máximo de 20 MB cada uno.';
      selected = []; $('files').value = ''; return;
    }
    $('publish-status').textContent = '';
    selected.forEach((file, index) => {
      const card = document.createElement('div'); card.className = 'preview';
      const media = document.createElement(file.type.startsWith('video/') ? 'video' : 'img');
      const url = URL.createObjectURL(file); previewUrls.push(url); media.src = url;
      if (media.tagName === 'VIDEO') { media.controls = true; media.preload = 'metadata'; } else media.alt = file.name;
      const name = document.createElement('p'); name.textContent = file.name;
      const label = document.createElement('label'); label.textContent = 'Descripción / pie de foto'; label.htmlFor = `caption-${index}`;
      const caption = document.createElement('input'); caption.id = label.htmlFor; caption.maxLength = 500; caption.placeholder = 'Qué se ve en este archivo';
      card.append(media, name, label, caption); $('previews').append(card);
    });
  });
  function upload(file, index) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest(); xhr.open('POST', '/api/admin/media'); xhr.setRequestHeader('Content-Type', file.type);
      xhr.upload.addEventListener('progress', event => {
        if (event.lengthComputable) $('upload-progress').value = ((index + event.loaded / event.total) / selected.length) * 100;
      });
      xhr.onload = () => {
        let data; try { data = JSON.parse(xhr.responseText); } catch { reject(new Error('No se ha podido subir el archivo.')); return; }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || 'Error al subir el archivo.'));
      };
      xhr.onerror = () => reject(new Error('Se ha interrumpido la conexión. Vuelve a intentarlo.'));
      xhr.timeout = 600000; xhr.ontimeout = () => reject(new Error('La subida ha tardado demasiado. Vuelve a intentarlo.'));
      xhr.send(file);
    });
  }
  $('entry-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    if (!$('title').value.trim() && !$('body').value.trim() && !selected.length) {
      $('publish-status').textContent = 'Añade un texto, una foto o un vídeo antes de publicar.'; return;
    }
    busy = true; $('publish').disabled = true; $('files').disabled = true; $('logout').disabled = true;
    $('upload-progress').hidden = !selected.length;
    let published = false;
    try {
      for (let i = 0; i < selected.length; i++) {
        $('publish-status').textContent = `Subiendo archivo ${i + 1} de ${selected.length}…`;
        if (!pending[i]) pending[i] = await upload(selected[i], i);
      }
      $('publish-status').textContent = 'Publicando…';
      const result = await api('/api/admin/entries', { method: 'POST', body: JSON.stringify({
        title: $('title').value, body: $('body').value,
        media: pending.map((file, i) => ({ id: file.id, caption: $(`caption-${i}`).value })),
      }) });
      published = true;
      $('entry-form').reset(); selected = []; pending = []; clearPreviews();
      $('today').textContent = dateFormat.format(new Date(`${result.day}T12:00:00Z`));
      $('publish-status').textContent = `Publicado para el ${$('today').textContent}. Los archivos pueden tardar hasta un minuto en estar disponibles en todas partes.`;
      await loadEntries(true);
    } catch (error) {
      $('publish-status').textContent = published ? 'Publicado correctamente. Recarga el panel para ver la lista actualizada.' : `${error.message} Tu texto sigue aquí para que puedas reintentar.`;
    } finally {
      busy = false; $('publish').disabled = false; $('files').disabled = false; $('logout').disabled = false; $('upload-progress').hidden = true;
    }
  });
  window.addEventListener('beforeunload', event => { if (busy) { event.preventDefault(); event.returnValue = ''; } });
  async function loadEntries(reset = false) {
    const data = await api(`/api/entries${!reset && cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (reset) $('entries').replaceChildren();
    data.entries.forEach(entry => {
      const article = document.createElement('article'); article.className = 'entry';
      const time = document.createElement('time'); time.dateTime = entry.published_at; time.textContent = dateTimeFormat.format(new Date(entry.published_at));
      const title = document.createElement('h3'); title.textContent = entry.title || 'Avance del equipo';
      const body = document.createElement('p'); body.textContent = entry.body;
      const count = document.createElement('p'); count.textContent = `${entry.media.length} archivos adjuntos`;
      const remove = document.createElement('button'); remove.className = 'secondary'; remove.type = 'button'; remove.textContent = 'Retirar publicación';
      remove.addEventListener('click', async () => {
        if (!confirm('¿Retirar esta publicación y sus archivos del diario público?')) return;
        remove.disabled = true;
        try { await api(`/api/admin/entries/${entry.id}`, { method: 'DELETE' }); await loadEntries(true); }
        catch (error) { $('status').textContent = error.message; remove.disabled = false; }
      });
      article.append(time, title, body, count, remove); $('entries').append(article);
    });
    if (reset && !data.entries.length) { const empty = document.createElement('p'); empty.textContent = 'Todavía no habéis publicado ningún avance.'; $('entries').append(empty); }
    cursor = data.nextCursor; $('more').hidden = !cursor;
    if (reset) api('/api/session').then(info => {
      if (info.ok) $('storage-info').textContent = `Espacio utilizado: ${(info.storageUsed / 1024 / 1024).toFixed(1)} de ${Math.round(info.storageLimit / 1024 / 1024)} MB. Al llenarse, se detendrán las nuevas subidas. No se activa ningún plan de pago.`;
    }).catch(() => {});
  }
  $('more').addEventListener('click', async () => {
    $('more').disabled = true;
    try { await loadEntries(); } catch (error) { $('status').textContent = error.message; }
    finally { $('more').disabled = false; }
  });
  openEditor().catch(error => { showLogin(); if (!error.message.includes('Entra con')) $('status').textContent = error.message; });
})();
