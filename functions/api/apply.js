// functions/api/apply.js
// ------------------------------------------------------------
// Cloudflare Pages Functions – 신청 접수 API
//  - GET  /api/apply    : 상태 핑(오픈 시간 확인용)
//  - POST /api/apply    : 신청 접수
//  - OPTIONS            : CORS 프리플라이트
//
// Settings > Variables (Environment):
//   - OPEN_AT_KST            e.g. "2025-10-12 17:00:00"
//   - SHEETS_WEBHOOK_URL     (선택) Apps Script 배포 URL(/exec)
//   - SHEETS_SHARED_SECRET   (선택) Apps Script와 동일한 시크릿
//   - ENABLE_DUPCHECK        (선택) "1" 이면 중복접수 방지 활성화
//
// Settings > Bindings (선택):
//   - KV namespace: Variable name = APPLIES_KV
//     (rate-limit, 중복체크, 로그에 사용)
// ------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",     // 필요시 도메인으로 제한
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "600",
};

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      ...CORS_HEADERS,
      ...extra,
    },
  });

// CORS 프리플라이트
export const onRequestOptions = async () => new Response(null, { status: 204, headers: CORS_HEADERS });

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
      "branch",
      "childBirth",
      "childName",
      "gender",
      "parentName",
      "relation",
      "parentPhone",
      "addrBase",
      "addrDetail",
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

    // 3) Rate-limit (옵션, 10초)
    if (env.APPLIES_KV) {
      const rlKey = `rl:${ip}`;
      const hit = await env.APPLIES_KV.get(rlKey);
      if (hit) return json({ ok: false, message: "잠시 후 다시 시도해주세요." }, 429);
      // 환경변수로 조절 가능(없으면 60초 기본)
      const windowSec = Math.max(60, parseInt(env.RATE_LIMIT_SECONDS || '60', 10));
      await env.APPLIES_KV.put(key, '1', { expirationTtl: windowSec });

    }

    // 4) 중복 접수 방지 (옵션: 전화번호+생일 기준)
    if (env.APPLIES_KV && (env.ENABLE_DUPCHECK === "1")) {
      const dupKey = `dup:${(body.parentPhone || "").replace(/\D/g, "")}:${body.childBirth}`;
      const dup = await env.APPLIES_KV.get(dupKey);
      if (dup) return json({ ok: false, message: "이미 접수된 정보가 있습니다." }, 409);
      await env.APPLIES_KV.put(dupKey, "1", { expirationTtl: 60 * 60 * 24 }); // 24h
    }

    // 5) 레코드 생성
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const record = { id, ts: new Date().toISOString(), ip, ...body };

    // 6) KV 저장 & 텍스트 로그(옵션)
    if (env.APPLIES_KV) {
      await env.APPLIES_KV.put(`apply:${id}`, JSON.stringify(record));
      const line = `[${record.ts}] ${ip} | ${record.branch} | ${record.childName} | ${record.addrBase} ${record.addrDetail}\n`;
      const prev = (await env.APPLIES_KV.get("log")) || "";
      await env.APPLIES_KV.put("log", prev + line);
    }

    // 7) (옵션) 구글 시트로 전송
    if (env.SHEETS_WEBHOOK_URL) {
      const payload = { ...record, token: env.SHEETS_SHARED_SECRET || "" };
      // 실패해도 메인 흐름은 성공으로 처리 (원하면 에러로 바꿔도 됨)
      await fetch(env.SHEETS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => null);
    }

    return json({ ok: true, id });
  } catch (e) {
    return json({ ok: false, message: e?.message || "server error" }, 500);
  }
};
