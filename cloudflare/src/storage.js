// The diary uses Workers KV on the Free plan. Each object stays below KV's
// 25 MiB value limit. No R2/Stream/Images subscription is involved.
export function mediaStore(env) {
  if (!env.MEDIA_KV) return null;
  return {
    async put(key, body) { await env.MEDIA_KV.put(key, body); },
    async get(key, options) {
      if (options?.range) {
        const buffer = await env.MEDIA_KV.get(key, 'arrayBuffer');
        if (!buffer) return null;
        const { offset, length } = options.range;
        return { body: new Response(buffer.slice(offset, offset + length)).body, httpEtag: `"${key.split('/').at(-1)}"` };
      }
      const stream = await env.MEDIA_KV.get(key, 'stream');
      return stream ? { body: stream, httpEtag: `"${key.split('/').at(-1)}"` } : null;
    },
    async delete(keys) {
      // Keep each invocation within the Free plan's subrequest limit.
      for (const key of Array.isArray(keys) ? keys : [keys]) await env.MEDIA_KV.delete(key);
    },
  };
}
