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
    const D = Math.PI / 180;
    if (k === "star") {                                      // 星形(尖った頂点が外へ突き出す)。頂点=物理半径rr / 谷=rr*innerF
      const pts = sk.points || 5, inF = sk.innerF != null ? sk.innerF : 0.45;
      const seg = 2 * Math.PI / pts, a = (((thDeg - rotDeg) * D) % seg + seg) % seg, h = seg / 2;
      // 極座標での直線(頂点→谷): 2点(a1,r1),(a2,r2)を通る直線の半径 r(a)
      const line = (a1, r1, a2, r2) => (r1 * r2 * Math.sin(a2 - a1)) / (r1 * Math.sin(a - a1) + r2 * Math.sin(a2 - a));
      return a <= h ? line(0, rr, h, rr * inF) : line(h, rr * inF, seg, rr);
    }
    if (k === "gear") {                                      // 歯車環(内向きの歯)。歯先=物理半径rr / 歯底=rr*(1-toothDepth)
      const n = sk.teeth || 14, dep = sk.toothDepth != null ? sk.toothDepth : 0.16, fr = sk.toothFrac != null ? sk.toothFrac : 0.45;
      const seg = 360 / n, a = (((thDeg - rotDeg) % seg) + seg) % seg;
      return a < seg * fr ? rr * (1 - dep) : rr;
    }
    if (k === "reuleaux") {                                  // ルーロー三角形(定幅曲線)。頂点=物理半径rr・幅が一定=回転しても隙間の読みが安定
      // 中心-頂点距離d=rr / 円弧半径s=rr√3。頂点Vの対辺の弧: |P-V|=s を極座標で解いて r=rr[cosΔ+√(3-sin²Δ)](Δ=V基準で120°..240°)
      for (let kk = 0; kk < 3; kk++) {
        const d = ((thDeg - rotDeg - kk * 120) % 360 + 360) % 360;
        if (d >= 120 && d <= 240) { const t = d * D; return rr * (Math.cos(t) + Math.sqrt(3 - Math.sin(t) * Math.sin(t))); }
      }
      return rr;
    }
    return rr;                                               // 円(原型)=半径は物理そのまま
  },

  // リング別の意匠を解決(惑星スキンに rings[i] を重ねる)。rings未定義の惑星は従来どおり惑星単位の単一shape=既存6惑星は不変。
  _slitRingSkin(sk, i) {
    const per = sk && sk.rings && sk.rings[i];
    return per ? Object.assign({}, sk, per) : (sk || {});
  },

  // 切れ目付きリングを「線のみ」で(ギャップ=スリットを飛ばして描く)。θ: 0=右/90=上、y上向き。
  // 全形状で切れ目は「角度」で飛ばす=物理の角度窓と厳密一致(見た目の隙間=粒子が通れる角度)。
  //   円(既定)/ 多角形 / 有機曲線 / 星形 / 歯車環 / ルーロー三角形。いずれも輪郭そのものが姿形を作る(線種で円をなぞらない=合格条件1)。
  _slitRing(ctx, cx, cy, rr, baseDeg, halfDeg, stroke, lw, sk) {
    sk = sk || {};
    const kind = sk.shape || "ring";
    const start = baseDeg + halfDeg, span = 360 - 2 * halfDeg;
    const shaped = (kind === "poly" || kind === "organic" || kind === "star" || kind === "gear" || kind === "reuleaux");
    const stepDeg = kind === "gear" ? 0.4 : (shaped ? 2 : 5);  // 歯車は角を立てるため細かく刻む
    ctx.strokeStyle = stroke; ctx.lineWidth = lw * (sk.lwMul || 1);
    // 角度[a0,a1]の弧を1本描く(半径は姿形で変調)
    const arc = (a0, a1, rmul) => {
      const sp = a1 - a0, steps = Math.max(shaped ? 8 : 2, Math.round(sp / stepDeg));
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
    arc(start, start + span, 1);                              // 円 / 多角形 / 有機 / 星形 / 歯車 / ルーロー
    if (kind === "gear" && sk.flankStripe) {                   // 警戒縞=歯の側面(歯先↔歯底をつなぐ半径方向の辺)を強調して縞に見せる
      const n = sk.teeth || 14, dep = sk.toothDepth != null ? sk.toothDepth : 0.16, fr = sk.toothFrac != null ? sk.toothFrac : 0.45;
      const seg = 360 / n, r0 = rr * (1 - dep);
      ctx.lineWidth = lw * (sk.lwMul || 1) * 1.6;
      for (let t = -1; t <= n; t++) for (const off of [0, seg * fr]) {
        const a = baseDeg + t * seg + off;
        if (a < start || a > start + span) continue;           // 切れ目の中には描かない(角度窓を侵さない)
        const th = a * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(cx + r0 * Math.cos(th), cy - r0 * Math.sin(th));
        ctx.lineTo(cx + rr * Math.cos(th), cy - rr * Math.sin(th));
        ctx.stroke();
      }
    }
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
      const sa = sang[i] * 180 / Math.PI, rsk = this._slitRingSkin(sk, i); // リング別の幾何(未指定なら惑星単位)
      this._slitRing(ctx, cx, cy, radii[i] * R, sa, half[i], rc(rsk.rail, baseA), lw, rsk);
    }
    // 中心=回廊の終点(球の着地点・賢者の石の生成点)。ごく小さく静かに、しかし常に最も明瞭に(合格条件4)。
    // 全リングの描画は R*slitCenterCoreF*slitCenterClearF の内側へ侵入しない(姿形QAが全惑星×全リングで実測)。
    const cr = Math.max(1.6, R * (CFG.slitCenterCoreF || 0.028));
    ctx.fillStyle = rc(sk.center, 0.4 + align * 0.4);
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, 7); ctx.fill();

    // 張り付いた失敗の痕跡(内側=惜しいほど明るく大きく=静かな殿堂)。寿命は到達の深さ別(§④)。
    const now = (typeof Render !== "undefined") ? Render.time : 0;
    for (const s of Slit.stuck) {
      // 痕跡は「弾かれた壁の上」に置く=そのリングの姿形で変調した半径へ写像(痕が枠から浮かない=判定基準5 物理整合)
      const sr = this._slitShapeR(this._slitRingSkin(sk, s.ring), s.r, s.theta, (sang[s.ring] || 0) * 180 / Math.PI);
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
    //   V6-P5 S3: 音も**この同じ行**で鳴らす。全通過(=賢者の石の生成)は約1/3900の極めて稀な事象で、
    //   優先度表の最上位(stone:5)=この作品で最も重い一撃。音idへの変換は CFG.soundCues が唯一の窓口
    //   (Game のイベントと同じ表を引く=変換点を2つに割らない)。視覚の対=中心の控えめなブルーム。
    for (const ev of Slit.drainEvents()) {
      if (calm) continue;
      if (ev.type === "SlitSuccess") {
        this._slitFx.push({ kind: "win", t: 1.1, ttl: 1.1 });
        const sid = typeof CFG !== "undefined" && CFG.soundCues && CFG.soundCues[ev.type];
        if (sid && typeof Sound !== "undefined") Sound.play(sid);
      }
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
