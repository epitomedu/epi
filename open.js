/**
 * open.js — Cloudflare Pages / 정적사이트에서도 작동하는 완전한 시간제한 스크립트
 * by ChatGPT (검증됨)
 */

(function () {
  // === 설정: KST 기준 오픈 시각 ===
  const OPEN_AT_KST = "2025-10-12 18:36:00";

  // 현재 시각(UTC 기준)
  const nowUtc = new Date();

  // 오픈 시각을 UTC 기준으로 변환 (KST는 UTC+9)
  const openUtc = new Date(
    Date.UTC(
      ...OPEN_AT_KST.split(/[- :]/).map((v, i) =>
        i === 1 ? Number(v) - 1 : Number(v)
      )
    ) - 9 * 60 * 60 * 1000
  );

  // 현재 경로
  const path = window.location.pathname;

  // 디버깅용 (필요시 콘솔 확인)
  // console.log("now(UTC):", nowUtc, "open(UTC):", openUtc, "path:", path);

  // --- 로직 ---
  // 접수 시작 이후 → /apply로 이동
  if (nowUtc >= openUtc) {
    if (path === "/" || path === "/index.html") {
      window.location.replace("/apply");
    }
  }
  // 접수 전 → /apply 접근시 차단
  else {
    if (path === "/apply" || path === "/apply.html") {
      alert("아직 접수 기간이 아닙니다.");
      window.location.replace("/");
    }
  }
})();
