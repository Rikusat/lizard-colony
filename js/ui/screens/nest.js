// =============================================================
// screens/nest — 巣ネットワーク画面(V4.1・蜘蛛の巣状・閲覧専用)
// UISkills.md §8: ui/screens/nest相当。
// =============================================================

Object.assign(UI, {
  // ⑤ 巣の卵タップ→【小ウィンドウ】(モーダルでない=飼育槽を隠さない・孵化秒数が進み表示が同期し続ける)
  openEggMenu(i) {
    const egg = Game.state.eggs[i];
    if (!egg) return;
    this._eggPop = { egg };
    this._buildEggPop();
  },
  _buildEggPop() {
    const frame = document.getElementById("frame") || document.body;
    let el = document.getElementById("egg-pop");
    if (!el) {
      el = document.createElement("div"); el.id = "egg-pop";
      frame.appendChild(el);
      el.addEventListener("pointerdown", (e) => { // 委譲(innerHTML再構築でも失われない)
        if (e.target.closest(".ep-close")) { this.closeEggPop(); return; }
        if (e.target.closest(".ep-hatch")) {
          const egg = this._eggPop && this._eggPop.egg; if (!egg) return;
          if (Game.state.gems < 1) { UI.denyFlash("gems"); return; }
          const idx = Game.state.eggs.indexOf(egg);
          if (idx < 0) { this.closeEggPop(); return; }
          Game.instantHatch(idx); // ダイヤ1消費→孵化タイマーを0に
          this.closeEggPop();
        }
      });
    }
    this._renderEggPop();
  },
  // 毎フレームの update() から呼ばれ、孵化カウントダウン/進捗を同期(時間が進み表示が止まらない)
  _renderEggPop() {
    const el = document.getElementById("egg-pop"); if (!el || !this._eggPop) return;
    const egg = this._eggPop.egg;
    if (Game.state.eggs.indexOf(egg) < 0) { this.closeEggPop(); return; } // 孵化して消えた→自動で閉じる
    const sp = speciesById(egg.speciesId);
    const mo = (typeof MORPHS !== "undefined") && MORPHS.find((m) => m.id === egg.morphId);
    const sec = Math.max(0, Math.ceil(egg.t));
    const prog = Math.max(0, Math.min(1, egg.total ? 1 - egg.t / egg.total : 1));
    const canGem = Game.state.gems >= 1;
    el.innerHTML =
      `<div class="ep-head"><span>${Icon.svg("egg")} 巣の卵</span><button class="ep-close" aria-label="閉じる">×</button></div>` +
      `<div class="ep-name">${(mo ? mo.name + " " : "") + (sp ? sp.name : "卵")}</div>` +
      `<div class="ep-time">孵化まで <b>${sec > 0 ? sec + "秒" : "まもなく"}</b></div>` +
      `<div class="ep-prog"><span style="width:${Math.round(prog * 100)}%"></span></div>` +
      `<button class="ep-hatch cta"${canGem ? "" : ' aria-disabled="true"'}>${Icon.svg("gem")} 今すぐ孵化 <small>ダイヤ1 / 所持 ${Game.state.gems}</small></button>`;
  },
  closeEggPop() {
    this._eggPop = null;
    const el = document.getElementById("egg-pop");
    if (el && el.parentNode) el.parentNode.removeChild(el);
  },

  openNest() {
    Game.ensureNestWeb();
    const st = Game.currentStage();
    this.openModal(`${Icon.svg("nestweb")} 巣ネットワーク — 全惑星共通(閲覧専用)`, (body) => this.buildNest(body));
    // 既読化(バッジ解除)
    Game.state.nestWeb.seen = Game.nestWebCounts().open;
  },

  buildNest(body) {
    const web = Game.state.nestWeb;
    const nodes = buildNestWeb();
    const counts = Game.nestWebCounts();
    // 次に開きそうなノード(進捗最大の未解放)
    let next = null, nextP = -1;
    for (const n of nodes) {
      if (n.id === "core" || web.nodes[n.id]) continue;
      const p = Game.nestProgress(n);
      if (p > nextP) { nextP = p; next = n; }
    }
    body.innerHTML = `
      <div class="nest-head">
        <span>解放済み <b>${counts.open}/${counts.total}</b>
          ${next ? ` / 次に開きそう: <b>${next.name}</b>(${Math.floor(nextP * 100)}%)` : ""}
          ${web.surprises ? ` / ${Icon.svg("spark")}先行解放 ${web.surprises}回` : ""}</span>
        <span class="nest-legend">
          <i class="lg on"></i>解放済み <i class="lg near"></i>もうすぐ <i class="lg off"></i>未解放
        </span>
        <span style="font-size:calc(11px * var(--fs-scale, 1));color:var(--sub)">操作は不要。繁殖を続ければ勝手に育つ</span>
      </div>
      <div id="nest-scroll"><div id="nest-web"></div></div>
      <div id="nest-tip" class="hidden"></div>`;
    const wrap = body.querySelector("#nest-web");
    const SIZE = 1100, C = SIZE / 2;
    const R_STEP = 95;
    // 糸(SVG): 各ノード→内側リングの最寄りノード
    let svg = `<svg width="${SIZE}" height="${SIZE}" style="position:absolute;inset:0;pointer-events:none">`;
    const posOf = (n) => n.id === "core"
      ? [C, C]
      : [C + Math.cos(n.angle) * (R_STEP * (n.ring + 1)), C + Math.sin(n.angle) * (R_STEP * (n.ring + 1))];
    for (const n of nodes) {
      if (n.id === "core") continue;
      const [x, y] = posOf(n);
      // 内側の最寄り
      const inner = nodes.filter((m) => (n.ring === 0 ? m.id === "core" : m.ring === n.ring - 1));
      let best = inner[0], bd = 1e9;
      for (const m of inner) {
        const [mx, my] = posOf(m);
        const d = (mx - x) ** 2 + (my - y) ** 2;
        if (d < bd) { bd = d; best = m; }
      }
      const [bx, by] = posOf(best);
      const open = !!web.nodes[n.id];
      const parentOpen = best.id === "core" || !!web.nodes[best.id];
      const cls = open && parentOpen ? "lit" : open ? "half" : "off";
      svg += `<line class="${cls}" x1="${bx}" y1="${by}" x2="${x}" y2="${y}"/>`;
    }
    svg += `</svg>`;
    let html = svg;
    for (const n of nodes) {
      const [x, y] = posOf(n);
      const open = n.id === "core" || web.nodes[n.id];
      const p = open ? 1 : Game.nestProgress(n);
      const near = !open && p >= CFG.nestNearThreshold;
      const cls = n.id === "core" ? "core" : open ? "on" : near ? "near" : "off";
      const tip = n.id === "core" ? "巣の中心"
        : open ? `${n.name} — 解放済み` : `${n.name} — 進捗${Math.floor(p * 100)}%`;
      html += `<div class="wnode ${cls}" data-node="${n.id}" data-tip="${tip}" style="left:${x}px;top:${y}px">
        <span>${n.id === "core" ? Icon.svg("nestweb") : open ? Icon.svg(oreById(n.reward.ore).icon) : Icon.svg(n.icon)}</span></div>`;
    }
    wrap.innerHTML = html;
    // タップ=ツールチップのみ(§4.2)。解放操作は存在しない
    const tip = body.querySelector("#nest-tip");
    for (const el of wrap.querySelectorAll(".wnode")) {
      el.addEventListener("click", () => {
        const n = nodes.find((x) => x.id === el.dataset.node);
        if (!n || n.id === "core") { tip.classList.add("hidden"); return; }
        const open = web.nodes[n.id];
        const o = oreById(n.reward.ore);
        const condTxt = n.conds.map((c) => {
          const def = NEST_CONDS.find((d) => d.type === c.type);
          const cur = Math.floor(Game.nestMetric(c.type));
          return `${Icon.svg(def.icon)}${def.name} ${Math.min(cur, c.need)}/${c.need}${c.type === "dexRate" ? "%" : ""}`;
        }).join(" + ");
        tip.classList.remove("hidden");
        tip.innerHTML = `<b>${n.name}</b> ${open ? Icon.svg("check") + "解放済み" : ""}<br>
          条件: ${condTxt}<br>報酬: ${Icon.svg(o.icon)}${o.name}×${n.reward.n}
          ${open ? "" : `<br><span style="color:var(--sub)">いつもの繁殖を続ければ自然に開く</span>`}`;
      });
    }
    // 初期表示は中央へスクロール
    const sc = body.querySelector("#nest-scroll");
    requestAnimationFrame(() => {
      sc.scrollLeft = C - sc.clientWidth / 2;
      sc.scrollTop = C - sc.clientHeight / 2;
    });
    // ドラッグでパン
    let drag = null;
    sc.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, l: sc.scrollLeft, t: sc.scrollTop }; });
    sc.addEventListener("pointermove", (e) => {
      if (!drag) return;
      sc.scrollLeft = drag.l - (e.clientX - drag.x);
      sc.scrollTop = drag.t - (e.clientY - drag.y);
    });
    for (const ev of ["pointerup", "pointerleave"]) sc.addEventListener(ev, () => { drag = null; });
  },
});
