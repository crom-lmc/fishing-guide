/* 钓鱼指南 · 初始化收尾 */
/* 初始化：季节与时段按打开页面的当前时间预填，不必等定位 */
applySeasonTime();
compute();
/* 非安全源（http）下浏览器会直接禁用定位，给一个可点击的 HTTPS 入口。
   本机调试地址排除了——localhost 换成 https 没有意义。 */
(function httpHint(){
  const el = $("#httpWarn"), go = $("#httpWarnGo");
  if (!el || !go || location.protocol !== "http:") return;
  const host = location.hostname;
  if (!host || host === "localhost" || host === "127.0.0.1" || host === "[::1]") return;
  go.href = "https://" + host + location.pathname + location.search;
  el.hidden = false;
})();

if (document.title) document.title = simp(document.title);
simpEl(document.body);

