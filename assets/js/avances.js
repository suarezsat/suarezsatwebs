(() => {
  const $ = id => document.getElementById(id);
  const feed = $('diary-feed'), status = $('diary-status'), more = $('diary-more'), retry = $('diary-retry'), filter = $('diary-month'), count = $('diary-count');
  const config = window.SUAREZSAT_DIARY;
  const days = new Map(), seen = new Set(), months = new Set();
  const dateFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'full', timeZone: 'Europe/Madrid' });
  const timeFormat = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  const monthFormat = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' });
  let cursor = null, loaded = false, loading = false;
  if (!feed) return;
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function render(entry) {
    if (seen.has(entry.id) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.day)) return;
    seen.add(entry.id);
    let day = days.get(entry.day);
    if (!day) {
      const section = element('section', 'diary-day'); section.dataset.month = entry.day.slice(0, 7);
      const time = element('time', 'diary-date', dateFormat.format(new Date(`${entry.day}T12:00:00Z`))); time.dateTime = entry.day;
      const heading = element('h2'); heading.id = `dia-${entry.day}`; heading.append(time); section.setAttribute('aria-labelledby', heading.id);
      day = element('div', 'diary-day-entries'); section.append(heading, day); feed.append(section); days.set(entry.day, day);
      if (!months.has(section.dataset.month)) {
        months.add(section.dataset.month);
        const option = element('option', '', monthFormat.format(new Date(`${entry.day}T12:00:00Z`))); option.value = section.dataset.month; filter.append(option);
      }
    }
    const article = element('article', 'diary-entry'); article.id = `avance-${entry.id}`;
    const meta = element('div', 'diary-entry-meta');
    const time = element('time', '', timeFormat.format(new Date(entry.published_at))); time.dateTime = entry.published_at;
    meta.append(element('span', 'diary-label', 'BITÁCORA DEL EQUIPO'), time); article.append(meta);
    if (entry.title) article.append(element('h3', '', entry.title));
    if (entry.body) article.append(element('p', 'diary-body', entry.body));
    if (entry.media?.length) {
      const gallery = element('div', 'diary-media-grid');
      entry.media.forEach(file => {
        const mediaUrl = new URL(file.url, config.apiBase);
        if (mediaUrl.origin !== new URL(config.apiBase).origin || !mediaUrl.pathname.startsWith('/media/')) return;
        const figure = element('figure', 'diary-media');
        let media;
        if (file.type.startsWith('image/')) {
          media = element('img'); media.alt = file.caption || entry.title || 'Foto del proyecto SuarezSat'; media.loading = 'lazy'; media.decoding = 'async'; media.src = mediaUrl.href;
          const link = element('a'); link.href = mediaUrl.href; link.target = '_blank'; link.rel = 'noopener'; link.setAttribute('aria-label', `Ampliar: ${media.alt}`); link.append(media); figure.append(link);
        } else if (file.type.startsWith('video/')) {
          media = element('video'); media.controls = true; media.preload = 'none'; media.playsInline = true;
          media.setAttribute('aria-label', file.caption || entry.title || 'Vídeo de SuarezSat'); media.src = mediaUrl.href;
          media.append(element('p', '', 'Tu navegador no puede reproducir este vídeo.')); figure.append(media);
          const download = element('a', 'diary-video-link', 'Abrir vídeo ↗'); download.href = mediaUrl.href; download.target = '_blank'; download.rel = 'noopener'; figure.append(download);
        } else return;
        let retries = 0;
        media.addEventListener('error', () => {
          if (retries++ < 2) setTimeout(() => { media.src = `${mediaUrl.href}?retry=${retries}`; }, 60000);
        });
        if (file.caption) figure.append(element('figcaption', '', file.caption)); gallery.append(figure);
      });
      article.append(gallery);
    }
    day.append(article);
  }
  function applyFilter() { feed.querySelectorAll('.diary-day').forEach(section => { section.hidden = Boolean(filter.value && section.dataset.month !== filter.value); }); }
  async function load() {
    if (loading) return;
    loading = true; more.disabled = true; retry.hidden = true;
    status.textContent = loaded ? 'Cargando más días…' : 'Abriendo la bitácora…';
    try {
      if (!config?.apiBase) throw new Error('API pendiente.');
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
      let response;
      try { response = await fetch(`${config.apiBase}/api/entries${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal: controller.signal, cache: 'no-store' }); }
      finally { clearTimeout(timeout); }
      if (!response.ok) throw new Error('No se ha podido cargar el diario.');
      const data = await response.json(); data.entries.forEach(render); cursor = data.nextCursor; loaded = true; more.hidden = !cursor;
      count.textContent = `${seen.size} ${seen.size === 1 ? 'avance' : 'avances'} · ${days.size} ${days.size === 1 ? 'día' : 'días'}${cursor ? ' cargados' : ''}`;
      status.textContent = seen.size ? 'Al día con nuestra misión. Las publicaciones más recientes aparecen primero.' : 'La bitácora está lista. Pronto compartiremos aquí nuestros primeros avances.'; applyFilter();
    } catch {
      status.textContent = 'No hemos podido cargar los avances. Puedes volver a intentarlo en unos instantes.'; retry.hidden = false;
    } finally { loading = false; more.disabled = false; }
  }
  filter.addEventListener('change', applyFilter); more.addEventListener('click', load); retry.addEventListener('click', load);
  // Check the newest page once a minute, including when older days were loaded.
  setInterval(async () => {
    if (document.hidden || loading || !config?.apiBase) return;
    try {
      const response = await fetch(`${config.apiBase}/api/entries`, { cache: 'no-store' });
      const data = await response.json();
      if (response.ok && data.entries.map(e => e.id).join(',') !== [...seen].slice(0, 30).join(',')) {
        feed.replaceChildren(); days.clear(); seen.clear(); months.clear(); filter.replaceChildren(element('option', '', 'Todos los meses')); filter.firstElementChild.value = ''; cursor = null; loaded = false; await load();
      }
    } catch { /* Keep the current diary visible when offline. */ }
  }, 60000);
  load();
})();
