/* 钓鱼指南 · 分享：二维码生成 + 链接解析 */
/* ============================================================
   分享钓点：二维码 + 链接 + 对方打开即定位
   ------------------------------------------------------------
   二维码是自己实现的（Byte 模式 / UTF-8 / 纠错级别 M / 版本 1–10）。
   不引外部二维码图片服务的原因很实际：分享的主场景就是在微信里扫，
   而那些免费 API 在国内网络下时好时坏，一旦挂掉，分享就整个废了。
   ============================================================ */
const QRGEN = (function(){
  /* --- GF(256)，本原多项式 0x11d --- */
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++){ EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;

  /* 纠错生成多项式 (x-α⁰)…(x-αⁿ⁻¹)，降幂存放，首项恒为 1 */
  function genPoly(n){
    let g = [1];
    for (let i = 0; i < n; i++){
      const ng = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++){ ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); }
      g = ng;
    }
    return g;
  }
  /* 系统码：数据后面补 n 个 0 做长除，余数即纠错码 */
  function rsEncode(data, n){
    const g = genPoly(n), res = new Uint8Array(data.length + n);
    res.set(data);
    for (let i = 0; i < data.length; i++){
      const f = res[i];
      if (!f) continue;
      for (let j = 0; j < n; j++) res[i + 1 + j] ^= mul(g[j + 1], f);
    }
    return Array.from(res.subarray(data.length));
  }

  /* 版本参数（纠错级别 M）：每块纠错码字 + 分组 [块数, 每块数据码字] */
  const SPEC = {
    1:[10,[[1,16]]], 2:[16,[[1,28]]], 3:[26,[[1,44]]], 4:[18,[[2,32]]], 5:[24,[[2,43]]],
    6:[16,[[4,27]]], 7:[18,[[4,31]]], 8:[22,[[2,38],[2,39]]], 9:[22,[[3,36],[2,37]]], 10:[26,[[4,43],[1,44]]]
  };
  const ALIGN = {1:[],2:[18],3:[22],4:[26],5:[30],6:[34],7:[22,38],8:[24,42],9:[26,46],10:[28,50]};
  const dataCw  = v => SPEC[v][1].reduce((a, g) => a + g[0] * g[1], 0);
  const byteCap = v => (dataCw(v) * 8 - 4 - (v < 10 ? 8 : 16)) >> 3;

  /* 手写 UTF-8：不依赖 TextEncoder，旧 WebView 也能跑 */
  function utf8(str){
    const out = [];
    for (let i = 0; i < str.length; i++){
      let c = str.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length){
        const n = str.charCodeAt(i + 1);
        if (n >= 0xdc00 && n <= 0xdfff){ c = 0x10000 + ((c - 0xd800) << 10) + (n - 0xdc00); i++; }
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  /* 位流 → 分块 → 纠错 → 交织，得到最终码字序列 */
  function codewords(bytes, ver){
    const total = dataCw(ver), capBits = total * 8, b = [];
    const put = (val, n) => { for (let i = n - 1; i >= 0; i--) b.push((val >> i) & 1); };
    put(4, 4);                                   // Byte 模式
    put(bytes.length, ver < 10 ? 8 : 16);        // 字符计数：v1–9 用 8 位，v10+ 用 16 位
    for (let i = 0; i < bytes.length; i++) put(bytes[i], 8);
    put(0, Math.min(4, capBits - b.length));     // 结束符（容量不足就截断）
    while (b.length % 8) b.push(0);              // 补齐到字节
    const w = [];
    for (let i = 0; i < b.length; i += 8){ let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | b[i + j]; w.push(v); }
    for (let p = 0; w.length < total; p++) w.push(p % 2 ? 0x11 : 0xec);   // 填充码字交替
    const ec = SPEC[ver][0], blocks = [];
    let off = 0;
    for (let g = 0; g < SPEC[ver][1].length; g++){
      const cnt = SPEC[ver][1][g][0], len = SPEC[ver][1][g][1];
      for (let i = 0; i < cnt; i++){ blocks.push(w.slice(off, off + len)); off += len; }
    }
    const ecc = blocks.map(bl => rsEncode(bl, ec));
    const out = [];
    let maxLen = 0;
    for (let i = 0; i < blocks.length; i++) if (blocks[i].length > maxLen) maxLen = blocks[i].length;
    for (let i = 0; i < maxLen; i++) for (let j = 0; j < blocks.length; j++) if (i < blocks[j].length) out.push(blocks[j][i]);
    for (let i = 0; i < ec; i++) for (let j = 0; j < ecc.length; j++) out.push(ecc[j][i]);
    return out;
  }

  /* 版本信息：BCH(18,6)，生成多项式 0x1f25 */
  const bch18 = v => {
    let rem = v;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    return ((v << 12) | (rem & 0xfff)) >>> 0;
  };
  /* 格式信息：5 位数据（纠错 M=00 + 3 位掩模）→ BCH(15,5)，再异或 0x5412 */
  function fmtBits(mask){
    const d = mask;
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((d << 10 | rem) ^ 0x5412) & 0x7fff;
  }

  function build(ver, cw, mask){
    const n = ver * 4 + 17;
    const m = [], fn = [];
    for (let i = 0; i < n; i++){ m.push(new Uint8Array(n)); fn.push(new Uint8Array(n)); }
    const set = (r, c, v) => { if (r < 0 || r >= n || c < 0 || c >= n) return; m[r][c] = v; fn[r][c] = 1; };

    for (let i = 0; i < n; i++){ set(6, i, i % 2 ? 0 : 1); set(i, 6, i % 2 ? 0 : 1); }   // 定位图形
    const finder = (R, C) => {
      for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++){
        const d = Math.max(Math.abs(dr), Math.abs(dc));
        if (d === 4) set(R + dr, C + dc, 0);                       // 分隔符
        else if (d <= 3) set(R + dr, C + dc, d === 2 ? 0 : 1);
      }
    };
    finder(3, 3); finder(3, n - 4); finder(n - 4, 3);
    const pos = [6].concat(ALIGN[ver] || []);
    for (let a = 0; a < pos.length; a++) for (let b = 0; b < pos.length; b++){
      const r = pos[a], c = pos[b];
      if ((r === 6 && c === 6) || (r === 6 && c === n - 7) || (r === n - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++)
        set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) === 1 ? 0 : 1);
    }
    /* 格式信息区先占位，掩模定下来后再写真实值。
       第一份：bit0–7 竖排在第 8 列，bit8–14 横排在第 8 行；第二份对调。 */
    for (let i = 0; i <= 5; i++) set(i, 8, 0);
    set(7, 8, 0); set(8, 8, 0); set(8, 7, 0);
    for (let i = 9; i < 15; i++) set(8, 14 - i, 0);
    for (let i = 0; i < 8; i++) set(8, n - 1 - i, 0);
    for (let i = 8; i < 15; i++) set(n - 15 + i, 8, 0);
    set(n - 8, 8, 1);                                              // 固定黑模块
    if (ver >= 7){
      const vb = bch18(ver);
      for (let i = 0; i < 18; i++){
        const bit = (vb >> i) & 1, a = n - 11 + (i % 3), b = Math.floor(i / 3);
        set(b, a, bit); set(a, b, bit);
      }
    }
    /* 数据蛇形填入，跳过功能图形；v2–6 末尾剩下的几个模块保持 0（规范要求的 remainder bits） */
    let k = 0;
    for (let right = n - 1; right >= 1; right -= 2){
      if (right === 6) right = 5;
      for (let vert = 0; vert < n; vert++){
        for (let j = 0; j < 2; j++){
          const x = right - j, up = ((right + 1) & 2) === 0, y = up ? n - 1 - vert : vert;
          if (!fn[y][x] && k < cw.length * 8){ m[y][x] = (cw[k >> 3] >> (7 - (k & 7))) & 1; k++; }
        }
      }
    }
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++){
      if (fn[r][c]) continue;
      let inv = false;
      switch (mask){
        case 0: inv = (c + r) % 2 === 0; break;
        case 1: inv = r % 2 === 0; break;
        case 2: inv = c % 3 === 0; break;
        case 3: inv = (c + r) % 3 === 0; break;
        case 4: inv = (Math.floor(c / 3) + Math.floor(r / 2)) % 2 === 0; break;
        case 5: inv = (c * r) % 2 + (c * r) % 3 === 0; break;
        case 6: inv = ((c * r) % 2 + (c * r) % 3) % 2 === 0; break;
        case 7: inv = ((c + r) % 2 + (c * r) % 3) % 2 === 0; break;
      }
      if (inv) m[r][c] ^= 1;
    }
    const fb = fmtBits(mask), fset = (r, c, i) => set(r, c, (fb >> i) & 1);
    for (let i = 0; i <= 5; i++) fset(i, 8, i);
    fset(7, 8, 6); fset(8, 8, 7); fset(8, 7, 8);
    for (let i = 9; i < 15; i++) fset(8, 14 - i, i);
    for (let i = 0; i < 8; i++) fset(8, n - 1 - i, i);
    for (let i = 8; i < 15; i++) fset(n - 15 + i, 8, i);
    set(n - 8, 8, 1);
    return {m: m, n: n};
  }

  /* 罚分（规范 ISO/IEC 18004 四条）：
     N1 同色连续 ≥5 每处 3+(len-5) ／ N2 2×2 同色块每处 3
     N3 出现 1:1:3:1:1 且一侧有 4 格白（11 位窗口匹配 10111010000 / 00001011101）每处 40
     N4 黑白比偏离 50% 每 5% 记 10。掩模取罚分最低的那个。 */
  function penalty(m, n){
    let p = 0;
    /* N1：行、列分别扫，末尾补一次结算 */
    for (let r = 0; r < n; r++){
      let last = -1, cnt = 0;
      for (let c = 0; c <= n; c++){
        const v = c < n ? m[r][c] : -1;
        if (v === last) cnt++;
        else { if (cnt >= 5) p += 3 + (cnt - 5); last = v; cnt = 1; }
      }
    }
    for (let c = 0; c < n; c++){
      let last = -1, cnt = 0;
      for (let r = 0; r <= n; r++){
        const v = r < n ? m[r][c] : -1;
        if (v === last) cnt++;
        else { if (cnt >= 5) p += 3 + (cnt - 5); last = v; cnt = 1; }
      }
    }
    /* N3：11 位滑动窗口 */
    for (let r = 0; r < n; r++){
      let bits = 0;
      for (let c = 0; c < n; c++){
        bits = ((bits << 1) & 0x7ff) | m[r][c];
        if (c >= 10 && (bits === 0x5d0 || bits === 0x05d)) p += 40;
      }
    }
    for (let c = 0; c < n; c++){
      let bits = 0;
      for (let r = 0; r < n; r++){
        bits = ((bits << 1) & 0x7ff) | m[r][c];
        if (r >= 10 && (bits === 0x5d0 || bits === 0x05d)) p += 40;
      }
    }
    /* N2：2×2 同色 */
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++){
      const s = m[r][c] + m[r][c + 1] + m[r + 1][c] + m[r + 1][c + 1];
      if (s === 0 || s === 4) p += 3;
    }
    /* N4：黑白比 */
    let dark = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) dark += m[r][c];
    p += Math.abs(Math.ceil((dark * 100 / (n * n)) / 5) - 10) * 10;
    return p;
  }

  function encode(text){
    const bytes = utf8(text);
    let ver = 0;
    for (let v = 1; v <= 10; v++) if (bytes.length <= byteCap(v)){ ver = v; break; }
    if (!ver) return null;                       // 超长，交给调用方降级
    const cw = codewords(bytes, ver);
    let best = null;
    for (let mask = 0; mask < 8; mask++){
      const r = build(ver, cw, mask), p = penalty(r.m, r.n);
      if (!best || p < best.p) best = {m: r.m, n: r.n, p: p, mask: mask, ver: ver};
    }
    return best;
  }
  /* 输出 SVG：1 模块 = 1 单位，靠 viewBox 缩放，四周留 4 模块静区 */
  function svg(text){
    const r = encode(text);
    if (!r) return "";
    const q = 4, n = r.n, S = n + q * 2;
    let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
      if (r.m[y][x]) d += "M" + (x + q) + " " + (y + q) + "h1v1h-1z";
    return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 " + S + " " + S + "\" shape-rendering=\"crispEdges\">"
      + "<rect width=\"" + S + "\" height=\"" + S + "\" fill=\"#ffffff\"/>"
      + "<path d=\"" + d + "\" fill=\"#111111\"/></svg>";
  }
  return {svg: svg, encode: encode, cap: byteCap, blen: s => utf8(s).length, _penalty: penalty};
})();

/* 分享链接：把钓点编进 URL hash，对方打开即定位。
   file:// 下 origin 是字符串 "null"，这时退回用去掉 hash 的 href。 */
function shareUrl(s, withNote){
  let base = location.href.split("#")[0];
  if (location.origin && location.origin !== "null") base = location.origin + location.pathname;
  const seg = [(+s.lat).toFixed(6), (+s.lng).toFixed(6), encodeURIComponent(String(s.name || "钓点"))];
  if (withNote && s.note) seg.push(encodeURIComponent(String(s.note).slice(0, 60)));
  return base + "#s=" + seg.join(",");
}
function shareCopyText(s){
  return "钓点：" + (s.name || "钓点")
    + "\n坐标：" + (+s.lat).toFixed(6) + ", " + (+s.lng).toFixed(6)
    + (s.note ? "\n备注：" + s.note : "")
    + "\n打开看位置：" + shareUrl(s, false);
}
const inWeChat = () => /micromessenger/i.test(navigator.userAgent || "");
function amapUrl(lat, lng, name){
  return "https://uri.amap.com/marker?position=" + (+lng).toFixed(6) + "," + (+lat).toFixed(6)
    + "&name=" + encodeURIComponent(name || "钓点");
}

/* 二维码容量有限（版本 10 / 纠错 M 约 213 字节），装不下就逐级降级：
   先砍备注，再逐步截断名字，最后总能出码——分享不出码比少几个字严重得多。 */
function shareUrlFit(s){
  const cap = QRGEN.cap(10);
  let url = shareUrl(s, true);
  if (QRGEN.blen(url) <= cap) return url;
  const nm = String(s.name || "");
  for (let cut = 24; cut >= 1; cut = Math.floor(cut / 2)){
    url = shareUrl({lat: s.lat, lng: s.lng, name: nm.slice(0, cut)}, false);
    if (QRGEN.blen(url) <= cap) return url;
  }
  return shareUrl({lat: s.lat, lng: s.lng, name: "钓点"}, false);
}

function openShare(s){
  const url = shareUrlFit(s);
  const nm = s.name || "钓点";
  $("#modal").innerHTML = "<button class=\"x\" id=\"mClose\">×</button>"
    + "<h3>分享钓点</h3>"
    + "<div class=\"share-who\">" + esc(nm) + " · " + (+s.lat).toFixed(4) + "°N, " + (+s.lng).toFixed(4) + "°E</div>"
    + "<div class=\"share-qr\" id=\"shareQr\"><div class=\"qrwait\">二维码生成中…</div></div>"
    + "<div class=\"share-link\">"
    +   "<input id=\"shareUrl\" readonly value=\"" + esc(url) + "\">"
    +   "<button class=\"btn sm\" id=\"shareCopy\">复制链接</button>"
    + "</div>"
    + "<p class=\"share-hint\">" + (inWeChat()
        ? "微信里没法直接调起「发送给朋友」：<b>点右上角 ⋯ → 发送给朋友</b>，或让对方<b>长按上面二维码</b>识别。"
        : "把链接发到微信，或让对方<b>扫上面的二维码</b>。对方打开会直接定位到这个钓点。")
    + "</p>"
    + "<div class=\"share-more\">"
    +   "<a href=\"" + esc(amapUrl(s.lat, s.lng, nm)) + "\" target=\"_blank\" rel=\"noopener\">在高德地图打开 ↗</a>"
    +   "<button class=\"btn sm ghost\" id=\"shareText\">复制分享文案</button>"
    + "</div>";
  $("#mask").classList.add("on");
  const mClose = $("#mClose"); if (mClose) mClose.onclick = closeModal;
  const cp = $("#shareCopy"), tx = $("#shareText");
  /* 这些按钮是动态生成的，没有平台锚点，可以放心改文案 */
  const flash = (btn, txt) => {
    if (!btn) return;
    const old = btn.textContent; btn.textContent = txt;
    setTimeout(() => { btn.textContent = old; }, 1400);
  };
  if (cp) cp.onclick = () => copyText(url, () => flash(cp, "已复制"));
  if (tx) tx.onclick = () => copyText(shareCopyText(s), () => flash(tx, "已复制"));
  /* 生成放到下一帧，先把面板显示出来 */
  setTimeout(() => {
    const box = $("#shareQr"); if (!box) return;
    let sv = "";
    try{ sv = QRGEN.svg(url); }catch(e){ sv = ""; }
    box.innerHTML = sv
      ? "<div class=\"qrbox\">" + sv + "</div>"
      : "<div class=\"qrwait\">二维码生成失败，直接复制链接发送即可。</div>";
  }, 0);
}

/* 别人分享过来的钓点：#s=纬度,经度,名称[,备注] */
let sharedPt = null, sharedLayer = null;
function parseShared(){
  const m = /[#&]s=([^&]+)/.exec(location.hash || "");
  if (!m) return null;
  const seg = decodeURIComponent(m[1]).split(",");
  const lat = parseFloat(seg[0]), lng = parseFloat(seg[1]);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {
    lat: lat, lng: lng,
    name: seg[2] ? decodeURIComponent(seg[2]) : "分享的钓点",
    note: seg[3] ? decodeURIComponent(seg[3]) : ""
  };
}
function drawShared(){
  if (!sharedPt || !map || typeof L === "undefined") return;
  if (sharedLayer){ sharedLayer.remove(); sharedLayer = null; }
  sharedLayer = L.layerGroup().addTo(map);
  const ic = L.divIcon({
    className: "shared-wrap",
    html: '<div class="shared-pin"><i></i></div>',
    iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -16]
  });
  const mk = L.marker([sharedPt.lat, sharedPt.lng], {icon: ic}).addTo(sharedLayer);
  mk.bindPopup("<b>" + esc(sharedPt.name) + "</b>"
    + "<div class=\"pop-row\">" + esc(sharedPt.note || "别人分享给你的钓点") + "</div>"
    + "<div class=\"pop-act\"><button id=\"sharedSave\">存为我的钓点</button>"
    + "<a href=\"" + esc(amapUrl(sharedPt.lat, sharedPt.lng, sharedPt.name)) + "\" target=\"_blank\" rel=\"noopener\">高德打开</a></div>");
  mk.on("popupopen", () => {
    const box = mk.getPopup().getElement(), b = box && box.querySelector("#sharedSave");
    if (b) b.onclick = () => {
      spots.push({name: sharedPt.name, lat: sharedPt.lat, lng: sharedPt.lng, note: sharedPt.note, ts: Date.now()});
      saveSpots(); refreshMarkers(); renderSpots(); closePopup();
      if (sharedLayer){ sharedLayer.remove(); sharedLayer = null; }
      sharedPt = null;
    };
  });
  map.flyTo([sharedPt.lat, sharedPt.lng], 15, {duration: .6});
  setTimeout(() => { try{ mk.openPopup(); }catch(e){} }, 700);
}
function openShared(){
  sharedPt = parseShared();
  if (!sharedPt) return;
  go("map");
  ensureMap();
  let tries = 0;
  (function wait(){
    if (map){ if (!sharedLayer) drawShared(); return; }   // ensureMap 可能已经画过了，别画两遍
    if (++tries > 40){                      // 地图组件加载不出来时，至少把坐标给到兜底列表
      const fb = $("#mapFallback");
      if (fb && !fb.hidden){
        fb.insertAdjacentHTML("afterbegin", "<p style=\"margin:0 0 10px\"><b>有人给你分享了一个钓点：</b>"
          + esc(sharedPt.name) + " · " + sharedPt.lat.toFixed(4) + "°N, " + sharedPt.lng.toFixed(4) + "°E "
          + "<a href=\"" + esc(amapUrl(sharedPt.lat, sharedPt.lng, sharedPt.name)) + "\" target=\"_blank\" rel=\"noopener\">在高德打开 ↗</a></p>");
      }
      return;
    }
    setTimeout(wait, 500);
  })();
}
openShared();

