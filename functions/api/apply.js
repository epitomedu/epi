// functions/api/apply.js
// -------------------------------------------------------------------
// ✅ Cloudflare Pages Functions – 신청 접수 API (POST /api/apply)
//
// ■ 필요한 설정(Cloudflare Pages → Settings):
//   - Environment Variables
//     - OPEN_AT_KST            (예: "2025-10-12 17:00:00")
//     - SHEETS_WEBHOOK_URL     (Apps Script Web App URL: .../exec)
//     - SHEETS_SHARED_SECRET   (Apps Script와 동일한 시크릿)
//     - ENABLE_DUPCHECK        ("1" 이면 중복접수 방지 활성화)
//   - KV Bindings (선택)
//     - Variable name: APPLIES_KV (Rate limit/중복검사용)
// -------------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // 필요한 도메인으로 제한 가능
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "600",
  "Content-Type": "application/json; charset=UTF-8",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

// 프리플라이트(CORS) 응답
export const onRequestOptions = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// (테스트용) GET 핑
export const onRequestGet = async ({ env }) => {
  const OPEN_AT_KST = env.OPEN_AT_KST || "2025-10-12 17:00:00";
  const now = new Date();
  const nowKST = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const openAt = new Date(OPEN_AT_KST.replace(" ", "T"));
  const beforeOpen = nowKST < openAt;

  return json({
    ok: true,
    nowKST: nowKST.toISOString(),
    openAt: openAt.toISOString(),
    beforeOpen,
  });
};

// functions/api/apply.js
export const onRequestPost = async ({ request, env }) => {
  try {
    const ip  = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
    const body = await request.json();

    // 1) 필수값 검증
    const required = ['branch','childBirth','childName','gender','parentName','relation','parentPhone','addrBase','addrDetail'];
    for (const k of required) {
      if (!body[k] || String(body[k]).trim()==='') {
        return json({ ok:false, message:`${k} is required` }, 400);
      }
    }

    // 2) 시간 가드(KST)
    const OPEN_AT_KST = env.OPEN_AT_KST || '2025-10-12 17:00:00';
    const nowKST = new Date(Date.now() + 9*60*60*1000);
    const openAt = new Date(OPEN_AT_KST.replace(' ','T'));
    if (nowKST < openAt) {
      return json({ ok:false, message:'접수 시작 전입니다.' }, 403);
    }

    // 3) 속도 제한(선택)
    if (env.APPLIES_KV) {
      const rlKey = `rl:${ip}`;
      const hit = await env.APPLIES_KV.get(rlKey);
      if (hit) return json({ ok:false, message:'잠시 후 다시 시도해주세요.' }, 429);
      await env.APPLIES_KV.put(rlKey, '1', { expirationTtl: 10 });
    }

    // 4) 저장 레코드
    const id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const record = {
      id,
      ts: new Date().toISOString(),
      ip,
      ...body
    };

    // 5) KV에 건별 저장 (apply:<id> => JSON)
    if (!env.APPLIES_KV) return json({ ok:false, message:'KV not bound' }, 500);
    await env.APPLIES_KV.put(`apply:${id}`, JSON.stringify(record));

    // (옵션) 제출자에게 번호 전달
    return json({ ok:true, id });
  } catch (e) {
    return json({ ok:false, message: e.message || 'server error' }, 500);
  }
};

function json(data, status=200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type':'application/json; charset=UTF-8' }
  });
}

