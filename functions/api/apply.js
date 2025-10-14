// functions/api/apply.js
// ------------------------------------------------------------
// Cloudflare Pages Functions – 신청 접수 API
//   GET     /api/apply    : 상태 핑(오픈 시간 확인)
//   POST    /api/apply    : 신청 접수
//   OPTIONS /api/apply    : CORS 프리플라이트
//
// Settings > Variables (Environment)
//   - OPEN_AT_KST           e.g. "2025-10-12 17:00:00"
//   - RATE_LIMIT_SECONDS    (선택, 기본 60)
//   - SHEETS_WEBHOOK_URL    (선택, Apps Script /exec URL)
//   - SHEETS_SHARED_SECRET  (선택, Apps Script와 동일)
//
// Settings > Bindings (선택)
//   - KV namespace: Variable name = APPLIES_KV
// ------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",           // 필요 시 도메인으로 제한
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "600",
};

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });

// CORS 프리플라이트
export const onRequestOptions = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

// GET: 상태 핑
export const onRequestGet = async ({ env }) => {
  const OPEN_AT_KST = env.OPEN_AT_KST || "2025-10-12 17:00:00";
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const openAt = new Date(OPEN_AT_KST.replace(" ", "T"));
  return json({
    ok: true,
    nowKST: nowKST.toISOString(),
    openAt: openAt.toISOString(),
    beforeOpen: nowKST < openAt,
    kvBound: !!env.APPLIES_KV,
  });
};

// POST: 신청 접수
export const onRequestPost = async ({ request, env }) => {
  try {
    const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
    const body = await request.json();

    // 1) 필수값 검증
    const required = [
      "branch","childBirth","childName","gender","parentName",
      "relation","parentPhone","addrBase","addrDetail"
    ];
    for (const k of required) {
      if (!body[k] || String(body[k]).trim() === "") {
        return json({ ok: false, message: `${k} is required` }, 400);
      }
    }

    // 2) 접수 시간 가드 (KST)
    const OPEN_AT_KST = env.OPEN_AT_KST || "2025-10-12 17:00:00";
    const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const openAt = new Date(OPEN_AT_KST.replace(" ", "T"));
    if (nowKST < openAt) {
      return json({ ok: false, message: "접수 시작 전입니다." }, 403);
    }

    // 3) 간단 레이트리밋 (KV 사용 시)
    if (env.APPLIES_KV) {
      const ttlSec = Math.max(60, parseInt(env.RATE_LIMIT_SECONDS || "60", 10));
      const rlKey = `rl:${ip}`;
      if (await env.APPLIES_KV.get(rlKey)) {
        return json({ ok: false, message: "잠시 후 다시 시도해주세요." }, 429);
      }
      await env.APPLIES_KV.put(rlKey, "1", { expirationTtl: ttlSec });
    }

    // 4) 저장 레코드
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const record = { id, ts: new Date().toISOString(), ip, ...body };

    // 5) (옵션) KV에 개별 저장 + 텍스트 로그 누적
    if (env.APPLIES_KV) {
      await env.APPLIES_KV.put(`apply:${id}`, JSON.stringify(record));
      const line = `[${record.ts}] ${ip} | ${record.branch} | ${record.childName} | ${record.addrBase} ${record.addrDetail}\n`;
      const prev = (await env.APPLIES_KV.get("log")) || "";
      await env.APPLIES_KV.put("log", prev + line);
    }

    // 6) (옵션) 구글시트 웹훅
    if (env.SHEETS_WEBHOOK_URL) {
      const res = await fetch(env.SHEETS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...record, token: env.SHEETS_SHARED_SECRET || "" }),
      });
      // 실패하더라도 메인 저장은 성공 처리(필요시 처리 변경 가능)
      if (!res.ok) {
        // const t = await res.text();
        // return json({ ok:false, message:'Sheets push failed' }, 502);
      }
    }

    return json({ ok: true, id });
  } catch (e) {
    return json({ ok: false, message: e.message || "server error" }, 500);
  }
};

