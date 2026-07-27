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

  // 切れ目付きリングを「線のみ」で(ギャップ=スリットを飛ばして描く)。θ: 0=右/90=上、y上向き。
  // sides省略/0=円弧(原型)。sides>=3=多角形枠: 角度で outline をサンプルし、各角度の半径を多角形式で算出。
  //   頂点=rr(物理半径radii[i]に接する)/辺=rr*cos(π/sides)へ僅かに窪む。切れ目は円弧と同じく「角度」で飛ばす=物理の角度窓と厳密一致。
  //   枠は baseDeg(=そのリングの現在の切れ目角=独立回転)に追従して丸ごと回る=頂点が回転を可視化=「回転しあう幾何」。
  _slitRing(ctx, cx, cy, rr, baseDeg, halfDeg, stroke, lw, sides) {
    const start = baseDeg + halfDeg, span = 360 - 2 * halfDeg;
    const poly = sides && sides >= 3;
    const steps = poly ? Math.max(48, Math.round(span / 2)) : Math.max(20, Math.round(span / 5));
    const seg = poly ? (2 * Math.PI / sides) : 0;
    const kfac = poly ? Math.cos(Math.PI / sides) : 1;      // 辺の窪み率(apothem/circumradius)
    const rot = baseDeg * Math.PI / 180;                    // 枠の向き=切れ目角に追従(枠ごと回転)
    ctx.beginPath();
    for (let k = 0; k <= steps; k++) {
      const th = (start + span * k / steps) * Math.PI / 180;
      let r = rr;
      if (poly) {
        const a = ((th - rot) % seg + seg) % seg - seg / 2; // -seg/2..seg/2(辺内の位置)
        r = rr * kfac / Math.cos(a);                        // 頂点=rr/辺=rr*kfac
      }
      const x = cx + r * Math.cos(th), y = cy - r * Math.sin(th);
      k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke();
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
      this._slitRing(ctx, cx, cy, radii[i] * R, sa, half[i], rc(sk.rail, baseA), lw, (sk.shape === "poly" ? sk.sides : 0));
    }
    // 中心=回廊の終点(奇跡の到達点)。ごく小さく静かに
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.6, R * 0.028), 0, 7);
    ctx.fillStyle = rc(sk.center, 0.4 + align * 0.4); ctx.fill();

    // 張り付いた失敗の痕跡(内側=惜しいほど明るく大きく=静かな殿堂)。寿命は到達の深さ別(§④)。
    const now = (typeof Render !== "undefined") ? Render.time : 0;
    for (const s of Slit.stuck) {
      const [x, y] = pt(s.r, s.theta);
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
