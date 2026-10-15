/* 钓鱼指南 · 渔获日志 + 拍照识别 + 灯箱 */
/* ============================================================
   日志
   ============================================================ */
const LKEY = "fish.logs.v1";
const PHKEY = "fish.photos.v1";            // { [ts]: [ {full, w, h}, ... ] }
let logs = store.get(LKEY, []);
let photosDB = store.get(PHKEY, {});
function saveLogs(){ store.set(LKEY, logs); }
function savePhotosDB(){
  try { localStorage.setItem(PHKEY, JSON.stringify(photosDB)); return true; }
  catch(e){ return false; }
}
let logLat = null, logLng = null;   // 日志表单定位按钮暂存的钓点坐标
function renderLogs(){
  const cnt = logs.length;
  const totalFish = logs.reduce((a, x) => a + (+x.count || 0), 0);
  const totalH = logs.reduce((a, x) => a + (+x.hours || 0), 0);
  const maxW = logs.reduce((a, x) => Math.max(a, +x.max || 0), 0);
  const fmap = {};
  logs.forEach(x => { if (x.fish) fmap[x.fish] = (fmap[x.fish] || 0) + (+x.count || 0); });
  const topFish = Object.entries(fmap).sort((a, b) => b[1] - a[1])[0];
  const perH = totalH > 0 ? (totalFish / totalH).toFixed(2) : "0";

  $("#statBox").innerHTML = `
    <div class="stat"><div class="n">${cnt}</div><div class="l">出钓次数</div></div>
    <div class="stat"><div class="n">${totalFish}</div><div class="l">累计渔获（尾）</div></div>
    <div class="stat"><div class="n">${maxW.toFixed(2)}</div><div class="l">最大单尾（kg）</div></div>
    <div class="stat"><div class="n">${perH}</div><div class="l">平均每小时（尾）</div></div>
    <div class="stat"><div class="n">${totalH.toFixed(1)}</div><div class="l">累计时长（小时）</div></div>
    <div class="stat"><div class="n" style="font-size:19px">${topFish ? topFish[0] : "—"}</div><div class="l">最常上鱼${topFish ? "（"+topFish[1]+" 尾）" : ""}</div></div>`;

  if (!cnt){
    $("#logTableWrap").innerHTML = `<div class="empty">还没有记录。钓完回来花 30 秒记一笔，一个月后你会感谢自己。</div>`;
    tableHint($("#logTableWrap"));
    renderWall();
    return;
  }
  const rows = logs.slice().reverse().map((x, i) => {
    const idx = logs.length - 1 - i;
    const ph = (x.photos && x.photos.length)
      ? `<div style="display:flex;gap:5px;flex-wrap:wrap">${photoCell(x)}</div>`
      : "—";
    return `<tr>
      <td>${esc(x.date || "")}</td>
      <td>${x.lat != null ? `<a class="lk" href="javascript:void(0)" data-spot="${x.lat},${x.lng}">${esc(x.spot || "📍 钓点")}</a>` : esc(x.spot || "—")}</td>
      <td>${esc(x.hours ?? "")}</td>
      <td>${esc(x.fish || "—")}</td>
      <td>${esc(x.count ?? 0)}</td>
      <td>${(+x.max || 0).toFixed(2)}</td>
      <td>${ph}</td>
      <td style="max-width:280px;white-space:normal;color:var(--muted)">${esc(x.note || "")}</td>
      <td><button class="del" data-i="${idx}">删除</button></td>
    </tr>`;
  }).join("");
  $("#logTableWrap").innerHTML = `<table>
    <thead><tr><th>日期</th><th>钓点</th><th>时长(h)</th><th>主要鱼种</th><th>尾数</th><th>最大(kg)</th><th>渔获</th><th>备注</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>`;
  $$("#logTableWrap .del").forEach(b => b.onclick = () => {
    const i = +b.dataset.i;
    if (logs[i] && logs[i].ts != null) { delete photosDB[logs[i].ts]; savePhotosDB(); }
    logs.splice(i, 1); saveLogs(); renderLogs();
  });
  $$("#logTableWrap .lk").forEach(a => a.onclick = () => {
    const c = a.dataset.spot.split(",").map(Number);
    go("map"); focusSpot(c[0], c[1]);
  });
  $$("#logTableWrap .photo-thumb[data-ts]").forEach(el => el.onclick = () => {
    openLightbox(+el.dataset.ts, +el.dataset.k);
  });
  tableHint($("#logTableWrap"));
  renderWall();
}
$("#logAdd").onclick = () => {
  const date = $("#l-date").value || new Date().toISOString().slice(0, 10);
  const rec = {
    date,
    spot: $("#l-spot").value.trim(),
    hours: +$("#l-hours").value || 0,
    fish: $("#l-fish").value.trim(),
    count: +$("#l-count").value || 0,
    max: +$("#l-max").value || 0,
    note: $("#l-note").value.trim(),
    lat: logLat, lng: logLng,
    ts: Date.now(),
    photos: []
  };
  if (!rec.spot && !rec.fish && !rec.count && !draftPhotos.length){
    $("#logMsg").textContent = "至少填一个钓点或鱼种，或拍张照片再保存。"; return;
  }
  /* 先把照片落库，再写主记录：避免主记录引用了不存在的图片而打不开 */
  if (draftPhotos.length){
    photosDB[rec.ts] = draftPhotos.map(p => ({ full: p.full, w: p.w, h: p.h }));
    if (!savePhotosDB()){
      delete photosDB[rec.ts];
      $("#logMsg").textContent = "本机存储空间不足，照片无法保存。请删除部分旧记录或照片后再试。";
      return;
    }
    rec.photos = draftPhotos.map(p => ({ thumb: p.thumb, w: p.w, h: p.h }));
  }
  logs.push(rec); saveLogs(); renderLogs();
  ["l-spot","l-fish","l-note"].forEach(id => $("#" + id).value = "");
  $("#l-count").value = 0; $("#l-max").value = 0; $("#l-hours").value = 4;
  logLat = logLng = null;
  $("#l-loc").classList.remove("on", "busy");
  draftPhotos = []; renderDraftPhotos();
  $("#photoMsg").textContent = "手机点此直接调用相机；电脑可批量选图。";
  $("#logMsg").textContent = "已保存到本机。" + (rec.lat != null ? "（已记录钓点坐标）" : "") + (rec.photos.length ? "（含 " + rec.photos.length + " 张照片）" : "");
  setTimeout(() => $("#logMsg").textContent = "", 2600);
};
$("#logClear").onclick = () => {
  if (!logs.length) return;
  if (confirm("确定清空全部 " + logs.length + " 条记录？此操作不可恢复（含所有渔获照片）。")){
    logs = []; photosDB = {}; saveLogs(); savePhotosDB(); renderLogs();
  }
};
/* 钓点输入框旁的 📍：一键用当前位置命名钓点，并把坐标一并记下（保存后表格里可点开地图）。
   定位中按钮转 ⏳，成功后点亮表示坐标已记录；失败复用与地图/出钓指数同一套文案。 */
let locBusy = false;
$("#l-loc").onclick = () => {
  const btn = $("#l-loc"), msg = $("#logMsg");
  if (locBusy) return;
  if (!navigator.geolocation){ msg.textContent = "当前环境不支持定位，请手动填写钓点。"; return; }
  locBusy = true; btn.classList.remove("on"); btn.classList.add("busy");
  msg.textContent = "正在定位…";
  navigator.geolocation.getCurrentPosition(async pos => {
    const la = pos.coords.latitude, lo = pos.coords.longitude;
    msg.textContent = "已定位，正在解析地址…";
    let g = null;
    try{ g = await revGeo(la, lo); }catch(e){}
    const label = g ? [g.region, g.road].filter(Boolean).join(" · ") : "";
    $("#l-spot").value = label || la.toFixed(5) + ", " + lo.toFixed(5);
    logLat = la; logLng = lo;
    locBusy = false; btn.classList.remove("busy"); btn.classList.add("on");
    msg.textContent = label ? "已填入钓点地址（坐标已记录，表格里可点开地图）。"
                            : "已填入坐标，但没解析出地址，可手动补充。";
    setTimeout(() => { if ($("#logMsg").textContent.startsWith("已填入")) $("#logMsg").textContent = ""; }, 3200);
  }, err => {
    locBusy = false; btn.classList.remove("busy");
    msg.textContent = locErrText(err);
  }, {timeout:8000, enableHighAccuracy:true});
};
$("#l-date").value = new Date().toISOString().slice(0, 10);
renderLogs();

/* ============================================================
   拍照记录渔获
   ============================================================ */
/* 图片处理：尊重 EXIF 方向（createImageBitmap 的 imageOrientation），
   原图压缩到最大边 1280px / JPEG 0.72，另生成 240px 缩略图用于列表与渔获墙。 */
function loadBitmap(file){
  if (window.createImageBitmap){
    try { return window.createImageBitmap(file, { imageOrientation: "from-image" }); } catch(e){}
  }
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("decode")); };
    img.src = url;
  });
}
function drawScaled(src, maxDim, quality){
  let w = src.width || src.videoWidth || 1, h = src.height || src.videoHeight || 1;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").drawImage(src, 0, 0, w, h);
  return { dataURL: c.toDataURL("image/jpeg", quality), w, h };
}
async function processPhoto(file){
  const src = await loadBitmap(file);
  const full = drawScaled(src, 1280, 0.72);
  const thumb = drawScaled(src, 240, 0.6);
  if (src.close) { try { src.close(); } catch(e){} }
  return { full: full.dataURL, thumb: thumb.dataURL, w: full.w, h: full.h };
}

/* 表单草稿照片：添加前先存在内存，保存时随记录写入照片库 */
let draftPhotos = [];
function renderDraftPhotos(){
  const grid = $("#photoGrid");
  const rb = $("#recFish");
  if (rb) rb.disabled = !draftPhotos.length;
  if (!draftPhotos.length){ grid.innerHTML = ""; return; }
  grid.innerHTML = draftPhotos.map((p, i) =>
    `<div class="photo-thumb"><img src="${p.thumb}" alt="草稿照片"><button class="rm" data-i="${i}" aria-label="移除">✕</button></div>`
  ).join("");
  $$("#photoGrid .rm").forEach(b => b.onclick = () => {
    draftPhotos.splice(+b.dataset.i, 1); renderDraftPhotos();
  });
}
$("#logCam").onclick = () => $("#logPhoto").click();
$("#logPhoto").onchange = async () => {
  const files = Array.from($("#logPhoto").files || []);
  $("#logPhoto").value = "";
  if (!files.length) return;
  const msg = $("#photoMsg");
  msg.textContent = "正在处理 " + files.length + " 张…";
  let added = 0;
  for (const f of files){
    if (!f.type || !f.type.startsWith("image/")) continue;
    try { draftPhotos.push(await processPhoto(f)); added++; }
    catch(e){}
  }
  renderDraftPhotos();
  if (added){
    msg.textContent = "已添加 " + added + " 张" + (draftPhotos.length ? "（待保存共 " + draftPhotos.length + " 张）" : "") + "。";
  } else {
    msg.textContent = "图片读取失败，请重试或换一张。";
  }
  setTimeout(() => {
    if (msg.textContent.indexOf("已添加") === 0 || msg.textContent.indexOf("图片读取") === 0)
      msg.textContent = "手机点此直接调用相机；电脑可批量选图。";
  }, 3200);
};

/* 表格里的渔获缩略图（最多 3 张 + 余量角标） */
function photoCell(x){
  const n = x.photos.length;
  const shown = x.photos.slice(0, 3).map((p, k) =>
    `<div class="photo-thumb" data-ts="${x.ts}" data-k="${k}" style="width:46px"><img src="${p.thumb}" alt=""></div>`
  ).join("");
  const more = n > 3 ? `<span class="photo-thumb" data-ts="${x.ts}" data-k="0" style="width:46px;display:grid;place-items:center;background:var(--card2);color:var(--muted);font-size:12px">+${n-3}</span>` : "";
  return shown + more;
}

/* 渔获墙（全部照片的相册） */
function renderWall(){
  const wall = [];
  logs.forEach(x => (x.photos || []).forEach((p, k) => wall.push({ ts: x.ts, k, thumb: p.thumb, date: x.date, fish: x.fish })));
  const grid = $("#wallGrid"), cnt = $("#wallCount");
  cnt.textContent = wall.length ? (wall.length + " 张照片 · 点击看大图") : "";
  if (!wall.length){
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1;padding:30px 10px">还没有渔获照片。钓上鱼后点「📷 拍照 / 选图」记录下精彩瞬间吧。</div>`;
    return;
  }
  grid.innerHTML = wall.map(w =>
    `<div class="wall-ph" data-ts="${w.ts}" data-k="${w.k}"><img src="${w.thumb}" alt=""><div class="cap">${esc(w.date || "")}${w.fish ? " · " + esc(w.fish) : ""}</div></div>`
  ).join("");
  $$("#wallGrid .wall-ph").forEach(el => el.onclick = () => openLightbox(+el.dataset.ts, +el.dataset.k));
}

/* ============================================================
   拍照自动识别鱼种 / 尾数 / 最大单尾（多模态大模型 API）
   【安全版】API Key 已不在前端：前端只请求同源的 /api/vision，
   由服务器 nginx 反代到智谱接口，并在服务端注入 Authorization，
   因此浏览器源码里看不到 Key，公网部署也安全。
   模型：智谱 GLM-4V-Flash（免费视觉模型，经 /api/vision 反代）。
   ============================================================ */
const VISION_API_KEY = "";   // 安全版：Key 已不在前端，由服务器 nginx 反代 /api/vision 注入

const VISION_MAIN = {
  name: "智谱 GLM-4V-Flash（免费）",
  endpoint: "/api/vision",
  model: "glm-4v-flash",
  key: VISION_API_KEY
};
/* 安全版：统一走同源 /api/vision 反代（Key 在服务器 nginx 注入，前端不含 Key） */
function activeVision(){
  return { name:"智谱 GLM-4V-Flash（免费·服务端代理）", endpoint:"/api/vision", model:"glm-4v-flash" };
}

/* 归一化鱼种：模型常回「未知 / 无法确定 / unknown」等，需判空 */
function cleanSpecies(s){
  if (!s || typeof s !== "string") return "";
  const t = s.trim();
  if (!t) return "";
  const low = t.toLowerCase();
  if (/(未知|无法|不确定|看不清|不清楚|没看|未识别|未能|识别不出|分辨不出|unknown|uncertain|unclear|n\/a|none|null|\?)/.test(low)) return "";
  return t;
}

/* 生成识别结果提示：区分「认出鱼种 / 只认出数量重量 / 啥都没认出」三档，给出优雅文案 */
function buildRecMsg(o){
  const sp = cleanSpecies(o.species);
  const cnt = (o.count != null && !isNaN(+o.count)) ? Math.max(0, Math.round(+o.count)) : 0;
  const wgt = (o.maxWeightKg != null && !isNaN(+o.maxWeightKg)) ? Math.max(0, +o.maxWeightKg) : 0;
  const eng = o.engine || "免费模型";
  const conf = o.confidence || "?";
  if (sp){
    let s = "🐟 已识别：" + sp;
    if (cnt) s += " ×" + cnt;
    if (wgt) s += "，最大 " + wgt.toFixed(2) + "kg";
    s += "（" + eng + " · 把握：" + conf + "，请核对）";
    if (o.note) s += " · " + o.note;
    return s;
  }
  if (cnt || wgt){
    let s = "🤔 识别到 " + (cnt ? cnt + " 尾" : "") + (cnt && wgt ? " / " : "") + (wgt ? wgt.toFixed(2) + "kg" : "")
      + "，但没认出具体鱼种";
    s += "（" + eng + " · 把握：" + conf + "）";
    s += " —— 麻烦你手动补个鱼种～";
    if (o.note) s += " " + o.note;
    return s;
  }
  return "📷 这张照片没识别出明确的鱼获。换个角度、让鱼更完整清晰、背景干净点，旁边放只手或尺子当参照，再拍一张试试；也可以直接在表单里手动填。";
}

/* 调用视觉模型：返回 {species,count,maxWeightKg,confidence,note} */
async function recognizeFish(b64){
  const p = activeVision();
  const model = p.model;
  const sys = "你是钓鱼助手。用户发一张渔获照片，请识别：1) 鱼种 species（常见名，如鲫鱼/鲤鱼/翘嘴/罗非，多鱼种用顿号分隔）；"
    + "2) 尾数 count（整数，数不清就尽量估并在 note 说明）；3) 最大单尾重量 maxWeightKg（kg，数字，需参照照片里的手/尺/鱼钳估算，无法判断写 0）。"
    + "只输出 JSON，不要其它任何文字，格式：{\"species\":\"\",\"count\":0,\"maxWeightKg\":0,\"confidence\":\"高/中/低\",\"note\":\"\"}。";
  const body = {
    model,
    messages:[
      { role:"system", content:sys },
      { role:"user", content:[
        { type:"text", text:"请识别这张渔获照片的鱼种、尾数和最大单尾重量。" },
        { type:"image_url", image_url:{ url:"data:image/jpeg;base64," + b64 } }
      ]}
    ]
  };
  let r;
  try {
    r = await fetch(p.endpoint, {
      method:"POST",
      headers: p.key ? { "Content-Type":"application/json", "Authorization":"Bearer " + p.key } : { "Content-Type":"application/json" },
      body: JSON.stringify(body)
    });
  } catch(e){
    throw new Error("网络请求失败（多半是跨域 CORS 限制）。建议把本页用本地服务器或部署后访问，避免用 file:// 直接打开。");
  }
  if (!r.ok){
    let t = "";
    try { const j = await r.json(); t = (j.error && j.error.message) || JSON.stringify(j); } catch(e){ try { t = await r.text(); } catch(_){} }
    throw new Error("API 返回 " + r.status + "：" + String(t).slice(0, 160));
  }
  const j = await r.json();
  const content = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("模型未返回可解析的 JSON：" + content.slice(0, 160));
  let o;
  try { o = JSON.parse(m[0]); } catch(e){ throw new Error("JSON 解析失败：" + m[0].slice(0, 120)); }
  o.engine = p.name;
  return o;
}

$("#recFish").onclick = async () => {
  if (!draftPhotos.length){ $("#photoMsg").textContent = "先拍一张或选一张照片再识别。"; return; }
  const btn = $("#recFish"), msg = $("#photoMsg");
  const b64 = draftPhotos[0].full.replace(/^data:image\/\w+;base64,/, "");
  btn.disabled = true;
  msg.innerHTML = '<span class="rec-on">🤖 识别中…</span>';
  try {
    const o = await recognizeFish(b64);
    const sp = cleanSpecies(o.species);
    const cnt = (o.count != null && !isNaN(+o.count)) ? Math.max(0, Math.round(+o.count)) : 0;
    const wgt = (o.maxWeightKg != null && !isNaN(+o.maxWeightKg)) ? Math.max(0, +o.maxWeightKg) : 0;
    if (sp) $("#l-fish").value = sp;
    if (cnt) $("#l-count").value = cnt;
    if (wgt) $("#l-max").value = wgt.toFixed(2);
    msg.textContent = buildRecMsg(o);
  } catch(e){
    msg.textContent = "识别失败：" + e.message;
  } finally {
    btn.disabled = !draftPhotos.length;
  }
};

/* 大图灯箱：支持左右切换、点遮罩 / Esc 关闭、方向键翻页 */
let lbList = [], lbIdx = 0;
function openLightbox(ts, k){
  const arr = photosDB[ts] || [];
  if (!arr.length) return;
  lbList = arr; lbIdx = k || 0;
  showLb();
  $("#lightbox").classList.add("on");
}
function showLb(){
  const p = lbList[lbIdx];
  $("#lbImg").src = p.full;
  $("#lbCount").textContent = (lbIdx + 1) + " / " + lbList.length;
  $("#lbPrev").style.display = lbList.length > 1 ? "" : "none";
  $("#lbNext").style.display = lbList.length > 1 ? "" : "none";
}
$("#lbClose").onclick = () => $("#lightbox").classList.remove("on");
$("#lbPrev").onclick = () => { if (!lbList.length) return; lbIdx = (lbIdx - 1 + lbList.length) % lbList.length; showLb(); };
$("#lbNext").onclick = () => { if (!lbList.length) return; lbIdx = (lbIdx + 1) % lbList.length; showLb(); };
$("#lightbox").addEventListener("click", e => { if (e.target === $("#lightbox")) $("#lightbox").classList.remove("on"); });
document.addEventListener("keydown", e => {
  if (!$("#lightbox").classList.contains("on")) return;
  if (e.key === "Escape") $("#lightbox").classList.remove("on");
  else if (e.key === "ArrowLeft") $("#lbPrev").click();
  else if (e.key === "ArrowRight") $("#lbNext").click();
});
renderDraftPhotos();

