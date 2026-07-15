// =============================================================
// ui/hero/nest-reveal — 巣ノード解放のヒーロー(§6: 頻度高め=中庸の濃さ)
// 糸が走る→ノード発光→報酬表示。複数同時解放は1回にまとめる。
// 先行解放(サプライズ)は同じ器で少しだけ特別に。
// =============================================================

Object.assign(UI, {
  heroNestReveal(nodes, surprise) {
    if (!nodes || !nodes.length) return;
    const first = nodes[0];
    const o = oreById(first.reward.ore);
    // 報酬の合算(複数ノード同時解放をまとめる)
    const sum = {};
    for (const n of nodes) sum[n.reward.ore] = (sum[n.reward.ore] || 0) + n.reward.n;
    const rewardText = Object.entries(sum)
      .map(([ore, n]) => { const d = oreById(ore); return `${d.icon}${d.name}+${n}`; })
      .join(" ");
    const threads = [0, 60, 120, 180, 240, 300]
      .map((a) => `<i style="--a:${a}deg"></i>`).join("");
    const more = nodes.length > 1 ? ` ほか+${nodes.length - 1}` : "";
    const ok = Hero.show({
      cls: "hero-nest" + (surprise ? " surprise" : ""),
      main: `<div class="medal">${threads}<span>${o.icon}</span></div>`,
      info: `<div class="hero-stamp">${surprise ? "✨ 予想外の解放!!" : "巣ノード解放"}</div>
        <div class="hero-name">${first.name}${more}</div>
        <div class="hero-reward">${rewardText} — 巣ネットワークが届けてくれた</div>`,
      total: surprise ? 2000 : 1600,
    });
    // 非表示タブ等で出せなかった時はトーストへフォールバック
    if (!ok) UI.toast(`🕸 巣ノード解放!「${first.name}」${more} → ${rewardText}`);
  },
});
