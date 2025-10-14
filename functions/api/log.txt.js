// functions/api/log.txt.js
export const onRequestGet = async ({ env, request }) => {
  if (!env.APPLIES_KV) {
    return new Response('KV not configured', { status: 500 });
  }

  // 간단 보호(옵션): ?token=ADMIN_SECRET
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  if ((env.ADMIN_SECRET || '') && token !== env.ADMIN_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }

  // 1) 목록 가져오기
  const { keys } = await env.APPLIES_KV.list({ prefix: 'apply:', limit: 1000 });
  // 최신순으로 정렬
  keys.sort((a,b)=> b.name.localeCompare(a.name));

  // 2) 값 읽어서 한 줄 JSONL 형태로 합치기 (txt로 바로 열어도 보기 쉬움)
  const lines = [];
  for (const k of keys) {
    const v = await env.APPLIES_KV.get(k.name);
    if (v) lines.push(v); // 이미 JSON string
  }
  const txt = lines.join('\n');

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g,'-');

  return new Response(txt, {
    headers: {
      'Content-Type': 'text/plain; charset=UTF-8',
      'Content-Disposition': `attachment; filename="apply-log-${stamp}.txt"`
    }
  });
};
