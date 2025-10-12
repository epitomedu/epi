const OPEN_AT_KST = "2025-10-12 17:00:00";

// 현재 UTC
const nowUtc = new Date();

// openTime을 UTC로 변환 (KST -9시간)
const openTimeUtc = new Date(
  new Date(OPEN_AT_KST.replace(" ", "T")).getTime() - (9 * 60 * 60 * 1000)
);

// 현재 페이지 경로
const path = window.location.pathname;

// 접수 시간 이후
if (nowUtc >= openTimeUtc) {
  if (path !== "/apply") {
    window.location.href = "/apply";
  }
}
// 접수 전 (apply 페이지 접근 시 강제 차단)
else {
  if (path === "/apply") {
    window.location.href = "/";
  }
}
