/* 钓鱼指南 · 内容渲染：鱼种 / 钓法 / 饵料 / 装备 */
/* ============================================================
   鱼种
   ============================================================ */
let fishCat = "全部";
function renderFishFilter(){
  const cats = ["全部", "淡水", "海水"];
  $("#fishFilter").innerHTML = cats.map(c =>
    `<button class="btn ${c===fishCat?"":"ghost"} sm" data-c="${c}">${c}${c==="全部"?"（"+FISH.length+"）":""}</button>`
  ).join("");
  $$("#fishFilter button").forEach(b => b.onclick = () => { fishCat = b.dataset.c; renderFishFilter(); renderFish(); });
}
function renderFish(){
  const list = FISH.filter(f => fishCat === "全部" || f.w === fishCat);
  $("#fishList").innerHTML = list.map(f => `
    <div class="fish" data-n="${esc(f.n)}">
      <div class="av" style="background:linear-gradient(135deg,${f.c},${f.c}bb)">${f.n[0]}</div>
      <div style="min-width:0">
        <div class="nm">${f.n}</div>
        <div class="al">${f.al}</div>
        <div class="tg">
          <span class="tag">${f.layer}</span>
          <span class="tag ${f.w==="海水"?"b":"g"}">${f.w}</span>
        </div>
      </div>
    </div>`).join("");
  $$("#fishList .fish").forEach(el => el.onclick = () => openFish(el.dataset.n));
}
renderFishFilter(); renderFish();
function openFish(name){
  const f = FISH.find(x => x.n === name);
  if (!f) return;
  $("#modal").innerHTML = `
    <button class="x" id="mClose">×</button>
    <h3><span class="av" style="background:linear-gradient(135deg,${f.c},${f.c}bb);width:36px;height:36px;border-radius:10px;font-size:15px">${f.n[0]}</span>${f.n}</h3>
    <div class="small muted" style="margin-left:47px">${f.al}</div>
    <div class="flex mt" style="margin-left:47px;gap:6px">
      <span class="tag">${f.layer}</span><span class="tag ${f.w==="海水"?"b":"g"}">${f.w}</span>
    </div>
    <dl class="kv">
      <dt>适温</dt><dd>${f.temp}</dd>
      <dt>季节</dt><dd>${f.season}</dd>
      <dt>栖息</dt><dd>${f.habitat}</dd>
      <dt>推荐饵</dt><dd><div style="display:flex;gap:6px;flex-wrap:wrap">${f.baits.map(b=>`<span class="tag w">${b}</span>`).join("")}</div></dd>
      <dt>钓法</dt><dd><ul class="li">${f.methods.map(m=>`<li><span class="tag${MKIND[m.k]?" "+MKIND[m.k]:""}">${m.k}</span>${m.t}</li>`).join("")}</ul></dd>
      <dt>线组</dt><dd><span class="tag b">${f.rig}</span></dd>
      <dt>漂相</dt><dd>${f.du}</dd>
    </dl>
    <div class="note">${f.tips}</div>
    <div class="flex mt2">
      <button class="btn sm" id="mLog">记一笔渔获日志</button>
    </div>`;
  $("#mask").classList.add("on");
  $("#mClose").onclick = closeModal;
  $("#mLog").onclick = () => { closeModal(); go("log"); $("#l-fish").value = f.n; $("#l-fish").focus(); };
}
function closeModal(){ $("#mask").classList.remove("on"); }
$("#mask").onclick = e => { if (e.target.id === "mask") closeModal(); };
document.addEventListener("keydown", e => {
  if (e.key === "Escape"){ closeModal(); closeSearch(); }
});

/* ============================================================
   钓法
   ============================================================ */
$("#methodList").innerHTML = METHODS.map((m, i) => `
  <details class="acc" ${i===0?"open":""}>
    <summary><span class="num">${i+1}</span>${m.n}<span class="tag" style="margin-left:8px">${m.tag}</span></summary>
    <div class="body">${m.body}</div>
  </details>`).join("");

/* ============================================================
   饵料
   ============================================================ */
let baitCat = "全部";                     // 进页面时按当前月份默认选中当季（见下方 init）
const SEASONLABEL = {winter:"冬", spring:"春", summer:"夏", autumn:"秋", all:"通用"};
const SEASONKEY = {"春":"spring","夏":"summer","秋":"autumn","冬":"winter","通用":"all"};
function renderBaitFilter(){
  const cats = ["全部","春","夏","秋","冬","通用"];
  const auto = SEASONLABEL[curSeasonKey()];      // 本月对应的季节页签
  $("#baitFilter").innerHTML = cats.map(c =>
    `<button class="btn ${c===baitCat?"":"ghost"} sm" data-c="${c}">${c}</button>`).join("")
    /* 只有当前正好停在「本月季节」时才提示，用户手动切到别的季节不会显示假提示 */
    + (baitCat !== "全部" && baitCat === auto
        ? `<span class="small muted" data-auto-season>已按当前月份（${new Date().getMonth()+1} 月）默认选中「${auto}」，点「全部」看所有配方</span>`
        : "");
  $$("#baitFilter button").forEach(b => b.onclick = () => { baitCat = b.dataset.c; renderBaitFilter(); renderBait(); });
}
function renderBait(){
  const key = SEASONKEY[baitCat];
  const list = key ? BAITS.filter(r => r.season === key) : BAITS;
  $("#baitList").innerHTML = list.map(r => `
    <div class="recipe">
      <h4>${r.n}<span class="tag ${r.season==="winter"?"b":r.season==="summer"?"g":""}">${SEASONLABEL[r.season]}</span></h4>
      <div class="desc">${r.desc}</div>
      <div class="mix">
        ${r.mix.map(([nm, pc]) => `
          <div class="row">
            <div><span>${nm}</span><em>${pc}%</em>
              <div class="track"><i style="width:${pc}%"></i></div>
            </div>
          </div>`).join("")}
      </div>
      <div class="note mt">${r.use}</div>
    </div>`).join("");
}
baitCat = SEASONLABEL[curSeasonKey()];   // 进页面默认落到当前月份的当季配方
renderBaitFilter(); renderBait();

/* ============================================================
   装备
   ============================================================ */
const CKEY = "fish.gear.v1";
let ckState = store.get(CKEY, {});
function renderGear(){
  $("#gearList").innerHTML = GEAR.map(sec => `
    <div class="card">
      <div class="flex" style="justify-content:space-between;margin-bottom:8px">
        <b style="font-size:14px">${sec.g}</b>
        <button class="btn ghost sm" data-sec="${sec.g}">全选/取消</button>
      </div>
      <div>${sec.items.map(([nm, spec, qty]) => {
        const k = sec.g + "|" + nm;
        return `<label class="ck"><input type="checkbox" data-k="${esc(k)}" ${ckState[k]?"checked":""}>
          <span>${nm}${spec!=="——"?`<span class="muted small"> · ${spec}</span>`:""}</span>
          <span class="qty">${qty}</span></label>`;
      }).join("")}</div>
    </div>`).join("");
  $$("#gearList input[type=checkbox]").forEach(cb => cb.onchange = () => {
    ckState[cb.dataset.k] = cb.checked; store.set(CKEY, ckState); statGear();
  });
  $$("#gearList button[data-sec]").forEach(b => b.onclick = () => {
    const sec = GEAR.find(x => x.g === b.dataset.sec);
    const keys = sec.items.map(([nm]) => sec.g + "|" + nm);
    const allOn = keys.every(k => ckState[k]);
    keys.forEach(k => ckState[k] = !allOn);
    store.set(CKEY, ckState); renderGear();
  });
  statGear();
}
function statGear(){
  const total = GEAR.reduce((a, s) => a + s.items.length, 0);
  const done = Object.values(ckState).filter(Boolean).length;
  $("#ckStat").textContent = `已备齐 ${done} / ${total} 项`;
}
$("#ckAll").onclick = () => {
  GEAR.forEach(s => s.items.forEach(([nm]) => ckState[s.g + "|" + nm] = true));
  store.set(CKEY, ckState); renderGear();
};
$("#ckNone").onclick = () => { ckState = {}; store.set(CKEY, ckState); renderGear(); };
renderGear();

