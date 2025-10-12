<!-- open.js -->
<script>
// ===== 접수 시작 시각(한국시간, KST) =====
const OPEN_AT_KST = "2025-10-12T19:00:00+09:00";  // ← 반드시 +09:00 포함!

// KST "현재 시각" 안전 계산 (브라우저 로컬시간 영향 제거)
function nowInKST() {
  // 문자열로 변환 후 Date로 재해석 → 서울 타임존 시각 확보
  const kstString = new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" });
  return new Date(kstString);
}

(function gateByTime() {
  try {
    const openAt = new Date(OPEN_AT_KST);     // KST 타임존 포함
    const now    = nowInKST();                 // 현재 KST

    const path = location.pathname;

    // 1) /apply(또는 하위) 접근 차단: 접수 전이면 루트로 되돌림
    if (/^\/apply(\/|$)/.test(path)) {
      if (now < openAt) {
        // 캐시/뒤로가기로 다시 들어오는 것 방지: replace 사용
        location.replace("/");
        return;
      }
    } else {
      // 2) 그 외 경로(예: /): 접수 시간이 되면 /apply 로 자동 전환
      if (now >= openAt) {
        location.replace("/apply");
        return;
      }
    }
  } catch (e) {
    // 만약 파싱 실패해도 페이지는 계속 보이도록
    console.error("[open.js] time gate error:", e);
  }
})();
</script>
