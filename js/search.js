/* 钓鱼指南 · 搜索 */
/* ============================================================
   搜索
   ============================================================ */
const INDEX = [];
FISH.forEach(f => INDEX.push({t:f.n, tp:"鱼种", p:`${f.al} · ${f.layer} · ${f.temp}`, k:(f.n+f.al+f.habitat+f.baits.join("")+f.methods.map(m=>m.k+m.t).join("")+f.tips).toLowerCase(), go:()=>{go("fish"); openFish(f.n);}}));
METHODS.forEach(m => INDEX.push({t:m.n, tp:"钓法", p:m.body.replace(/<[^>]+>/g," ").replace(/\s+/g," ").slice(0,90), k:(m.n+m.body.replace(/<[^>]+>/g,"")).toLowerCase(), go:()=>{go("method"); const i=METHODS.indexOf(m); const el=$$("#methodList details")[i]; if(el){el.open=true; el.scrollIntoView({behavior:"smooth",block:"center"});} }}));
BAITS.forEach(b => INDEX.push({t:b.n, tp:"饵料", p:b.desc, k:(b.n+b.desc+b.mix.map(x=>x[0]).join("")).toLowerCase(), go:()=>{go("bait"); baitCat="全部"; renderBaitFilter(); renderBait(); }}));
GEAR.forEach(s => s.items.forEach(it => INDEX.push({t:it[0], tp:"装备", p:`${s.g} · ${it[1]}`, k:(it[0]+it[1]+s.g).toLowerCase(), go:()=>{go("gear");}})));
[
  {t:"调四钓二", p:"台钓调漂标准流程：粗找底 → 下拉浮漂 → 剪铅调目 → 挂饵找钓目 → 验证微调", go:()=>{go("method");}},
  {t:"打窝技巧", p:"少量多次、窝料粗于饵料、打在钓点后方。酒米 / 菜籽饼 / 老玉米 / 商品窝料", go:()=>{go("method");}},
  {t:"看漂相", p:"上顶、下顿、黑漂、走漂、乱漂——六种常见漂相的含义与提竿时机", go:()=>{go("method");}},
  {t:"四季出钓", p:"春钓浅滩腥、夏钓深凉清、秋钓全天香、冬钓深阳虫", go:()=>{go("rules");}},
  {t:"禁渔期", p:"长江十年禁渔、黄河季节性禁渔期，出钓前查当地当年公告", go:()=>{go("rules");}},
  {t:"电鱼违法", p:"电鱼、毒鱼、炸鱼、绝户网均为法律禁止的破坏性捕捞方式，可追究刑事责任", go:()=>{go("rules");}},
  {t:"防触电", p:"碳素竿导电，电力线路下方严禁扬竿、通过、垂钓", go:()=>{go("rules");}},
  {t:"夜钓安全", p:"不单独夜钓、带救生衣与头灯、提前告知家人行程", go:()=>{go("rules");}}
].forEach(x => INDEX.push({t:x.t, tp:"要点", p:x.p, k:(x.t+x.p).toLowerCase(), go:x.go}));



const qEl = $("#q");
const sbox = $("#sbox");
let tmr = null;
const syncQ = () => sbox.classList.toggle("hasq", qEl.value.length > 0);
qEl.addEventListener("input", () => {
  syncQ();
  clearTimeout(tmr); tmr = setTimeout(runSearch, 160);
});
qEl.addEventListener("focus", () => { if (qEl.value.trim()) runSearch(); });
$("#qClr").onclick = () => {
  qEl.value = ""; syncQ();
  closeSearch();
  qEl.focus();
};
/* 键盘快捷键：/ 或 Ctrl(Cmd)+K 聚焦搜索 */
addEventListener("keydown", e => {
  const tag = (document.activeElement && document.activeElement.tagName) || "";
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  if (((e.key === "/" && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k"))){
    e.preventDefault();
    qEl.focus(); qEl.select();
  }
});
$("#searchClose").onclick = () => closeSearch();
function runSearch(){
  const q = qEl.value.trim().toLowerCase();
  if (q.length < 1){ closeSearch(); return; }
  const hits = INDEX.filter(x => x.k.includes(q) || x.t.toLowerCase().includes(q)).slice(0, 30);
  $("#searchTitle").textContent = hits.length ? `找到 ${hits.length} 条结果` : "搜索结果";
  $("#searchHits").innerHTML = hits.length
    ? hits.map((h, i) => `<div class="hit" data-i="${i}"><div class="tp">${h.tp}</div><b>${esc(h.t)}</b><div class="p">${esc(h.p)}</div></div>`).join("")
    : `<div class="empty">没有匹配内容。试试"鲫鱼""路亚""调漂""禁渔期""气压"。</div>`;
  $$("#searchHits .hit").forEach(el => el.onclick = () => {
    const hit = hits[+el.dataset.i];
    qEl.value = ""; syncQ();
    closeSearch();
    hit.go();
  });
  openSearch();
}

/* 小屏：表格超出屏幕时给一句横向滑动提示（桌面端 CSS 自动隐藏） */
function tableHint(tw){
  let h = tw.previousElementSibling;
  if (!h || !h.classList || !h.classList.contains("tw-hint")){
    h = document.createElement("div");
    h.className = "tw-hint";
    h.textContent = "← 左右滑动查看完整表格 →";
    tw.parentNode.insertBefore(h, tw);
  }
  h.classList.toggle("ok", !!tw.querySelector("table"));
}
$$(".tw").forEach(tableHint);

