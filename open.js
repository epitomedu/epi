// open.js — 모든 페이지 상단에서 불러옴

// ===== 접수 시작 시각 (KST, 반드시 +09:00 포함) =====
const OPEN_AT_KST = "2025-10-16T03:52:00+09:00";

// 현재 KST(한국 표준시) 계산 함수
function nowInKST() {
  const kstString = new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" });
  return new Date(kstString);
}

// 즉시 실행: 페이지 로드 순간에 실행됨
(function gateByTime() {
  try {
    const now = nowInKST();
    const openAt = new Date(OPEN_AT_KST);
    const path = location.pathname;

    // 1️⃣ 접수 페이지(/apply) 접근 차단
    if (/^\/apply(\/|$)/.test(path)) {
      if (now < openAt) {
        alert("아직 접수 기간이 아닙니다.");
        location.replace("/");
        return;
      }
    }
    // 2️⃣ 메인(/) → 접수 시간 되면 자동 이동
    else {
      if (now >= openAt) {
        location.replace("/apply");
        return;
      }
    }
  } catch (err) {
    console.error("[open.js] 오류:", err);
  }
})();
