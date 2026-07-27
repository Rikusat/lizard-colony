// =============================================================
// screens/slit — 四重スリット実験装置【表現層】(roulette.md §9)
// ルール層(Slit)の実状態を「線のみ」で描く。極小窓・低コントラスト=飼育槽の生き物から注意を奪わない。
// 同心円のレール(切れ目=基準角のギャップ)/内向きに走る点レーザー/壁に張り付いた失敗の痕跡
// (内側=惜しいほど明るく残す=静かな殿堂)/成功=控えめな中心のブルーム。
// 惑星別意匠の差し替えを見据え、色/線はここに集約(骨格・確率はSlit=不変)。reduced-motionで演出簡略化。
// =============================================================

Object.assign(UI, {
  initSlit() {
    const cv = document.getElementById("slit-canvas");
    if (!cv) return;
    this._slitCv = cv;
    this._slitCtx = cv.getContext("2d");
    this._slitFx = []; // 一過性の火花/ブルーム
    if (typeof Slit !== "undefined") Slit.reset();
  },

  _syncSlitSize() {
    const cv = this._slitCv; if (!cv) return false;
    const rect = cv.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return true;
  },

  // 成功時の"静かな祝祭"(boot の Slit.onSuccess から)。中心の控えめなブルーム
  slitSuccessFx() {
    if (typeof Motion !== "undefined" && Motion.reduced) return;
    this._slitFx = this._slitFx || [];
    this._slitFx.push({ kind: "win", t: 1.1, ttl: 1.1 });
  },

  // 姿形の半径変調(語彙A環/B多角/D有機)。thDeg=描く角度・rotDeg=枠の向き(=そのリングの切れ目角=独立回転に追従)。
  //   物理は「角度窓」判定(slit.js: 固定半径radii[i]跨ぎ時に角度のみ照合)=形状は視覚的に自由。半径変調は意匠のみで確率に非接触。
  //   B多角: 頂点が物理半径rrに接し、辺はrr*cos(π/sides)へ窪む。D有機: rrの周りに小振幅で揺らぐ(半径が視覚上ズレない様、振幅は数%に制限)。
  _slitShapeR(sk, rr, thDeg, rotDeg) {
    const k = sk && sk.shape;
    if (k === "poly" && sk.sides >= 3) {
      const seg = 360 / sk.sides;
      const a = (((thDeg - rotDeg) % seg + seg) % seg - seg / 2) * Math.PI / 180; // 辺内の位置
      return rr * Math.cos(Math.PI / sk.sides) / Math.cos(a);
    }
    if (k === "organic") {                                   // 葉脈/蔓=2波の重ね(不規則だが決定論・角度の純関数)
      const t = (thDeg - rotDeg) * Math.PI / 180;
      const a1 = sk.wobAmp != null ? sk.wobAmp : 0.03, l1 = sk.wobLobes || 7;
      const a2 = sk.wobAmp2 != null ? sk.wobAmp2 : 0.012, l2 = sk.wobLobes2 || 17;
      return rr * (1 + a1 * Math.sin(l1 * t) + a2 * Math.sin(l2 * t + 1.7));
    }
    return rr;                                               // A環(原型)/C分節/E二重/F標識=半径は物理そのまま
  },

  // 切れ目付きリングを「線のみ」で(ギャップ=スリットを飛ばして描く)。θ: 0=右/90=上、y上向き。
  // 全語彙で切れ目は「角度」で飛ばす=物理の角度窓と厳密一致(見た目の隙間=粒子が通れる角度)。
  //   A環(既定)=円弧 / B多角=多角形枠 / C分節=短いsegmentの列(石列・殻片) / D有機=揺らぐ曲線(葉脈・蔓)
  //   E二重=同じ角度窓を持つ内外2本 / F標識=警戒縞(破線)の枠。
  //   C分節の「粒の隙間」は物理の切れ目より必ず十分小さく保つ(segGapMaxDeg上限)=切れ目の位置が曖昧にならない。
  _slitRing(ctx, cx, cy, rr, baseDeg, halfDeg, stroke, lw, sk) {
    sk = sk || {};
    const kind = sk.shape || "ring";
    const start = baseDeg + halfDeg, span = 360 - 2 * halfDeg;
    const curved = (kind === "poly" || kind === "organic");
    ctx.strokeStyle = stroke; ctx.lineWidth = lw * (sk.lwMul || 1);
    // 角度[a0,a1]の弧を1本描く(半径は姿形で変調)
    const arc = (a0, a1, rmul) => {
      const sp = a1 - a0, steps = Math.max(curved ? 8 : 2, Math.round(sp / (curved ? 2 : 5)));
      ctx.beginPath();
      for (let k = 0; k <= steps; k++) {
        const thd = a0 + sp * k / steps;
        const r = this._slitShapeR(sk, rr, thd, baseDeg) * rmul;
        const th = thd * Math.PI / 180;
        const x = cx + r * Math.cos(th), y = cy - r * Math.sin(th);
        k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    if (kind === "segment") {                                 // C分節: span を等分し各セルの一部だけ描く(隙間=粒の流れ)
      const n = Math.max(4, Math.round(span / (sk.segStepDeg || 14)));
      const cell = span / n;
      const gap = Math.min(cell * (sk.segGapFrac != null ? sk.segGapFrac : 0.24), sk.segGapMaxDeg || 4);
      ctx.lineCap = sk.segCap || "butt";
      for (let s = 0; s < n; s++) arc(start + s * cell + gap / 2, start + (s + 1) * cell - gap / 2, 1);
      ctx.lineCap = "butt";
      return;
    }
    if (kind === "double") {                                  // E二重: 同じ角度窓の内外2本(波紋の厚み)
      const sep = sk.dblSep != null ? sk.dblSep : 0.035;
      arc(start, start + span, 1 - sep); arc(start, start + span, 1 + sep);
      return;
    }
    if (kind === "sign") {                                    // F標識: 警戒縞(破線)の枠
      ctx.save(); ctx.setLineDash(sk.dashPx || [7, 5]);
      arc(start, start + span, 1);
      ctx.restore();
      return;
    }
    arc(start, start + span, 1);                              // A環 / B多角 / D有機
  },

  // 惑星別の意匠パレット(骨格・確率は不変=色のみ)。現惑星のCFG.slitSkinByStageを既定にマージ。読み取り専用。
  _slitSkin() {
    const def = (typeof CFG !== "undefined" && CFG.slitSkinDefault) || { rail: [170, 214, 236], glow: [214, 236, 255], center: [226, 168, 192], trace: [205, 232, 246], traceRing: [230, 165, 190], laser: [220, 245, 255], bloom: [255, 215, 190] };
    let id = null;
    if (typeof Game !== "undefined") id = (Game.currentStage && Game.currentStage() && Game.currentStage().id) || (Game.state && Game.state.stageSel);
    const byStage = (typeof CFG !== "undefined" && CFG.slitSkinByStage) || {};
    return Object.assign({}, def, byStage[id] || {});
  },

  drawSlit() {
    const ctx = this._slitCtx, cv = this._slitCv;
    if (!ctx || !cv || typeof Slit === "undefined") return;
    if (!this._syncSlitSize()) return;
    const sk = this._slitSkin();
    const rc = (a, alpha) => `rgba(${a[0]},${a[1]},${a[2]},${alpha})`; // パレット色→rgba
    const cw = cv.width, ch = cv.height, cx = cw / 2, cy = ch / 2;
    const R = Math.min(cw, ch) * 0.44;
    const calm = typeof Motion !== "undefined" && Motion.reduced;
    const N = CFG.slitRings, radii = CFG.slitRadiif, half = CFG.slitHalfDeg, base = CFG.slitBaseAngleDeg;
    const pt = (r, thDeg) => { const t = thDeg * Math.PI / 180; return [cx + r * R * Math.cos(t), cy - r * R * Math.sin(t)]; };

    ctx.clearRect(0, 0, cw, ch);
    const sc = cw / 240; // 窓サイズ追随のスケール

    // 各円の切れ目角(独立回転・§9.5食)。合成ベクトル長R=1に近い=切れ目が揃う=食が近い
    const sang = [];
    let vx = 0, vy = 0;
    for (let i = 0; i < N; i++) {
      const a = (Slit.ringSlitAngle ? Slit.ringSlitAngle(i) : base) * Math.PI / 180;
      sang.push(a); vx += Math.cos(a); vy += Math.sin(a);
    }
    const Rlen = Math.hypot(vx, vy) / N;                    // 0..1(整列度)
    const align = Math.max(0, (Rlen - 0.72) / 0.28);        // 0.72未満=気配なし → 1.0=完全整列
    const meanA = Math.atan2(vy, vx);                       // 平均角(切れ目が向かう先=回廊の中心)

    // 整列の予告(§9.5): 揃いに近づくほど、回廊の中心へごく淡い光の気配。派手にしない=食を"待つ"体験の核
    if (align > 0) {
      const gi = align * (calm ? 0.09 : 0.16);
      const ex = cx + Math.cos(meanA) * R * 1.02, ey = cy - Math.sin(meanA) * R * 1.02;
      const g = ctx.createLinearGradient(cx, cy, ex, ey);
      g.addColorStop(0, rc(sk.glow, gi)); g.addColorStop(1, rc(sk.glow, 0));
      ctx.strokeStyle = g; ctx.lineWidth = Math.max(1.5, 5 * sc * align); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
    }

    // 同心円レール(線のみ)。切れ目=線の"不在"で窓を定義(端点マーカーは置かない・§9.5)。星図の佇まい
    const baseA = 0.4 + align * 0.14;                       // 揃うほど僅かに明るく(気配)
    const lw = Math.max(1.0, 1.15 * sc);
    for (let i = 0; i < N; i++) {
      const sa = sang[i] * 180 / Math.PI;
      this._slitRing(ctx, cx, cy, radii[i] * R, sa, half[i], rc(sk.rail, baseA), lw, sk);
    }
    // 中心=回廊の終点(奇跡の到達点)。ごく小さく静かに。F標識の惑星のみ三葉(放射線標識)で飾る
    const cr = Math.max(1.6, R * 0.028);
    ctx.fillStyle = rc(sk.center, 0.4 + align * 0.4);
    if (sk.centerShape === "trefoil") {                       // 三葉=中心の周りに3枚の扇。最外リングの回転に追従して回る
      const rot0 = sang[0];
      for (let t = 0; t < 3; t++) {
        const a0 = rot0 + t * 2 * Math.PI / 3 - 0.42, a1 = a0 + 0.84;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, cr * 2.6, -a0, -a1, true); ctx.closePath(); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(cx, cy, cr * 0.9, 0, 7); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(cx, cy, cr, 0, 7); ctx.fill();
    }

    // 張り付いた失敗の痕跡(内側=惜しいほど明るく大きく=静かな殿堂)。寿命は到達の深さ別(§④)。
    const now = (typeof Render !== "undefined") ? Render.time : 0;
    for (const s of Slit.stuck) {
      // 痕跡は「弾かれた壁の上」に置く=姿形で変調した半径へ写像(多角形/有機でも痕が枠から浮かない=判定基準5 物理整合)
      const sr = this._slitShapeR(sk, s.r, s.theta, (sang[s.ring] || 0) * 180 / Math.PI);
      const [x, y] = pt(sr, s.theta);
      const depth = (s.ring + 1) / N;               // 0..1 内側ほど大
      const life0 = s.life0 || 6;
      let fade = Math.min(1, s.life / Math.min(1.5, life0 * 0.5)); // 消える前に薄く(短寿命でも見える)
      // 点滅(§④・控えめ=線のみの世界を乱さない): 残り<1sで淡く明滅。lane2(寿命1s)は全体が呼吸/lane3・4は最後だけ
      if (!calm && s.life < 1.0) fade *= 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(now * 13));
      const rad = (2.0 + depth * 2.8) * sc;
      const a = (0.5 + depth * 0.45) * fade;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, 7);
      ctx.fillStyle = rc(sk.trace, a); ctx.fill();
      if (depth >= 0.99) { // 最内到達=最高記録は静かに光る(reduced-motionでもリングは出す=記録の可視化を優先)
        ctx.beginPath(); ctx.arc(x, y, rad + 2.2 * sc, 0, 7);
        ctx.strokeStyle = rc(sk.traceRing, 0.7 * fade); ctx.lineWidth = 1.2 * sc; ctx.stroke();
      }
    }

    // 飛行中の球=点に近い一条のレーザー(内向きの短い光跡)
    const b = Slit.ball;
    if (b && b.phase === "fly") {
      const [x, y] = pt(b.r, b.theta);
      const [x2, y2] = pt(Math.min(1, b.r + 0.14), b.theta); // 外向きの尾
      const g = ctx.createLinearGradient(x2, y2, x, y);
      g.addColorStop(0, rc(sk.laser, 0)); g.addColorStop(1, rc(sk.laser, 0.95));
      ctx.strokeStyle = g; ctx.lineWidth = Math.max(1.4, 1.8 * (cw / 200)); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x, y); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, Math.max(1.4, 1.6 * (cw / 200)), 0, 7);
      ctx.fillStyle = rc(sk.laser, 0.98); ctx.fill();
    }

    // イベント購読: 成功=食の成立のみ控えめに祝う(§9.5: 端点マーカー/惜しさドットは置かない=幾何の純度)
    for (const ev of Slit.drainEvents()) {
      if (calm) continue;
      if (ev.type === "SlitSuccess") this._slitFx.push({ kind: "win", t: 1.1, ttl: 1.1 });
    }
    // fx描画(中心の控えめなブルームのみ)
    this._slitFx = (this._slitFx || []).filter((f) => f.t > 0);
    for (const f of this._slitFx) {
      f.t -= 0.016;
      const q = 1 - f.t / f.ttl;
      if (f.kind === "win") { // 中心の控えめなブルーム(賢者の石)=惑星別の成功色(タイミング・尺は不変)
        const rr = R * (0.1 + q * 0.9);
        const gg = ctx.createRadialGradient(cx, cy, 1, cx, cy, rr);
        gg.addColorStop(0, rc(sk.bloom, (1 - q) * 0.8)); gg.addColorStop(1, rc(sk.bloom, 0));
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.fill();
      }
    }
  },
});
