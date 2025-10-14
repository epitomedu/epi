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

export const onRequestPost = async (context) => {
  try {
    const { request, env } = context;
    const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";

    // 0) Body 파싱(JSON 우선, 폼 제출 fallback)
    let body = {};
    const ct = (request.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) {
      body = await request.json();
    } else if (ct.includes("application/x-www-form-urlencoded")) {
      const form = await request.formData();
      for (const [k, v] of form.entries()) body[k] = v;
    } else {
      // 기타 타입도 일단 시도
      try {
        body = await request.json();
      } catch {
        const form = await request.formData().catch(() => null);
        if (form) for (const [k, v] of form.entries()) body[k] = v;
      }
    }

    // 1) 필수 항목 검증
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

    // 1-1) 값 정규화(전화번호 등)
    body.parentPhone = String(body.parentPhone).replace(/\D/g, "");

    // 2) 접수 시간 가드(KST)
    const OPEN_AT_KST = env.OPEN_AT_KST || "2025-10-12 17:00:00";
    const now = new Date();
    const nowKST = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const openAt = new Date(OPEN_AT_KST.replace(" ", "T"));
    if (nowKST < openAt) {
      return json({ ok: false, message: "접수 시작 전입니다." }, 403);
    }

    // 3) 레이트리밋(선택: KV)
    if (env.APPLIES_KV) {
      const rlKey = `rl:${ip}`;
      const hit = await env.APPLIES_KV.get(rlKey);
      if (hit) return json({ ok: false, message: "잠시 후 다시 시도해주세요." }, 429);
      await env.APPLIES_KV.put(rlKey, "1", { expirationTtl: 10 });
    }

    // 4) (선택) 중복접수 방지 – 이름+생년+전화 조합으로 락
    if (env.APPLIES_KV && env.ENABLE_DUPCHECK === "1") {
      const dupKey = `dup:${(body.childName || "").trim()}|${(body.childBirth || "").trim()}|${body.parentPhone}`;
      const exists = await env.APPLIES_KV.get(dupKey);
      if (exists) {
        return json({ ok: false, message: "이미 접수된 내역이 있습니다." }, 409);
      }
      // 5분 동안 중복 방지(원하면 더 길게)
      await env.APPLIES_KV.put(dupKey, "1", { expirationTtl: 300 });
    }

    // 5) 저장 ID & 레코드
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const record = {
      id,
      ts: new Date().toISOString(),
      ip,
      ...body,
    };

    // 5-1) (선택) 원본 저장
    if (env.APPLIES_KV) {
      await env.APPLIES_KV.put(`apply:${id}`, JSON.stringify(record));
    }

    // 6) 구글 시트(Apps Script Web App) 전송
    if (env.SHEETS_WEBHOOK_URL) {
      const payload = { ...record, token: env.SHEETS_SHARED_SECRET || "" };
      const res = await fetch(env.SHEETS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // 시트 전송 실패해도 메인 저장은 성공 처리(원하면 주석 해제해 에러로 반환)
      // if (!res.ok) {
      //   const text = await res.text().catch(() => "");
      //   return json({ ok: false, message: "Sheets push failed", detail: text }, 502);
      // }
    }

    return json({ ok: true, id });
  } catch (e) {
    // 서버 오류
    console.error("apply error:", e);
    return json({ ok: false, message: e?.message || "server error" }, 500);
  }
};
