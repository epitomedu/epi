// === 접수 시작 시간 (KST) ===
const OPEN_AT_KST = "2025-10-12 18:00:00";

// 현재 UTC 시간
const nowUtc = new Date();

// KST는 UTC보다 9시간 빠름 → openTime을 UTC 기준으로 변환
const openTimeUtc = new Date(
  new Date(OPEN_AT_KST.replace(" ", "T")).getTime() - (9 * 60 * 60 * 1000)
);

// 현재 페이지 경로
const path = window.location.pathname;

// ✅ 접수 시작 이후
if (nowUtc >= openTimeUtc) {
  if (path === "/" || path === "/index.html") {
    // 자동 전환
    window.location.replace("/apply");
  }
}
// 🚫 접수 전
else {
  if (path === "/apply" || path === "/apply.html") {
    alert("아직 접수 기간이 아닙니다.");
    window.location.replace("/");
  }
}
