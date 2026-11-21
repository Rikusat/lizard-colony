// =============================================================
// ui/icons — 自作SVGアイコンスプライト(UISkills §9: 絵文字全面禁止)
// 統一言語: 24x24グリッド / 線幅2 / 丸端(round) / 塗りはcurrentColorのみ
// → 色トークン・惑星アクセントに追従する。使用: Icon.svg("id")
// =============================================================

// Twelve-pixel cabinet glyphs. Rows run from top to bottom, 0 (edge) to 4 (glint).
const PIXEL_INKS = {
  brass: ["#493622", "#865b36", "#c89450", "#ebc97e", "#fff0bd"],
  sage: ["#1c3831", "#42674c", "#799b58", "#abd083", "#e3edaf"],
  ice: ["#23384d", "#386487", "#5d99b6", "#97d5dc", "#e8f9ed"],
  violet: ["#352b46", "#684e82", "#9979ba", "#cbace0", "#f6dff9"],
  coral: ["#482b32", "#8d4546", "#bf6b5b", "#ea9e7a", "#ffdbc0"],
  shell: ["#393d31", "#756c51", "#ae9e77", "#d7caa6", "#fbefd1"],
};

function pixelIcon(ink, rows) {
  const paths = ink.map(() => "");
  rows.trim().split(/\s+/).forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== ".") paths[Number(row[x])] += `M${x} ${y}h1v1h-1z`;
    }
  });
  return '<g transform="scale(2)" shape-rendering="crispEdges" stroke="none">' +
    paths.map((d, i) => d ? `<path fill="${ink[i]}" d="${d}"/>` : "").join("") + "</g>";
}

const ICONS = {
  // ---- 資源 ----
  coin: pixelIcon(PIXEL_INKS.brass, `
    ............
    ....0000....
    ..00333300..
    ..034342210.
    .0342332210.
    .0332323210.
    .0323232210.
    .0323322210.
    ..03222210..
    ..00111100..
    ....0000....
    ............`),
  cricket: pixelIcon(PIXEL_INKS.sage, `
    .........3.3
    ........2.2.
    .......030..
    ..002203430.
    .03333232110
    034433332101
    0233322210..
    ..012222010.
    ...02.01..10
    ..220..020.2
    .320....320.
    ............`),
  gem: pixelIcon(PIXEL_INKS.ice, `
    ............
    ...000000...
    ..03433430..
    .0343443240.
    044443332230
    022333322110
    .0233322210.
    ..02332210..
    ...023210...
    ....0220....
    .....00.....
    ............`),
  // 賢者の石(v11・四重スリット装置のレア報酬): 六角の原石(小サイズでcoinの円と混ざらない非円シルエット)+内環+錬金の三角。
  //   【改形履歴】旧=円形→小14pxでcoinと同一の●に潰れる(2026-07-24実測)→六角へ。
  stone: pixelIcon(PIXEL_INKS.coral, `
    ............
    .....00.....
    ....0340....
    ...034320...
    ..04333220..
    .0343332220.
    .0323432210.
    .0233322110.
    ..02222210..
    ...011110...
    ....0000....
    ............`),
  bio: '<path d="M8 3c0 6 8 6 8 9s-8 3-8 9M16 3c0 6-8 6-8 9s8 3 8 9M9 6.5h6M9 17.5h6" fill="none"/>',
  // ---- 特性(trait)ロゴ / 固定印(S3) ----
  // ミミカクシ: 眼を覆う仮面(帯+2つの眼)。特性カードのロゴ。
  "trait-mask": '<path d="M4 9.5c2.6-1.6 13.4-1.6 16 0 .2 4-1.3 6.3-4.6 6.3-1.7 0-2.2-1.2-3.4-1.2s-1.7 1.2-3.4 1.2C5.3 15.8 3.8 13.5 4 9.5z" fill="none"/><circle cx="8.6" cy="11.2" r="1.3"/><circle cx="15.4" cy="11.2" r="1.3"/>',
  // ネオン: 折れ曲がるネオン管(灯の点)。energy(塗りの稲妻)とは別言語=線のみ。
  "trait-neon": '<path d="M4 16 8.5 9l3.5 4.5L15.5 8l4 6" fill="none"/><circle cx="4" cy="16" r="1.1"/><circle cx="19.5" cy="14" r="1.1"/>',
  // ハクシ(白紙): 輪郭だけの体に、抜け落ちた白斑(塗りの小斑)。
  "trait-hakushi": '<path d="M12 3.5c4.8 0 8 3.6 8 8s-3.2 9-8 9-8-4.6-8-9 3.2-8 8-8z" fill="none"/><ellipse cx="9.8" cy="10.6" rx="3" ry="2.1"/><circle cx="15" cy="14.6" r="1.5"/>',
  // トライアド: 三連の菱紋(三角配置)。
  "trait-triad": '<path d="M12 4.2 14.4 7 12 9.8 9.6 7z"/><path d="M6.6 13.2 9 16l-2.4 2.8L4.2 16z"/><path d="M17.4 13.2 19.8 16l-2.4 2.8L15 16z"/><path d="M12 9.8 6.6 13.2M12 9.8l5.4 3.4" fill="none" stroke-opacity=".45"/>',
  // オウゴンヅカ: 眼を囲う金環(二重)。
  "trait-ougon": '<circle cx="12" cy="12" r="7.5" fill="none"/><circle cx="12" cy="12" r="4.2" fill="none" stroke-opacity=".55"/><circle cx="12" cy="12" r="1.6"/>',
  // シンカイ: 波線の下に沈む発光の点列。
  "trait-shinkai": '<path d="M4 7c2-1.6 4-1.6 6 0s4 1.6 6 0 3-1.2 4 0" fill="none"/><circle cx="7" cy="13" r="1.4"/><circle cx="12" cy="15.5" r="1.4"/><circle cx="17" cy="13.5" r="1.4"/><circle cx="9.6" cy="18.4" r="1"/><circle cx="14.6" cy="19" r="1"/>',
  // ヒョウガ: 結晶(霜)の六枝。
  "trait-hyoga": '<path d="M12 3v18M5 7.5l14 9M19 7.5l-14 9M12 6.4l-2-2M12 6.4l2-2M12 17.6l-2 2M12 17.6l2 2" fill="none"/>',
  // ドクシルシ: 暗環で締めた警告斑(主斑=眼状+従斑)=毒蛙の文法。
  "trait-doku": '<circle cx="10" cy="10" r="4.6" fill="none"/><circle cx="10" cy="10" r="1.7"/><circle cx="17" cy="14.5" r="2.2" fill="none" stroke-opacity=".7"/><circle cx="13" cy="18.2" r="1.2"/><circle cx="16.8" cy="7" r="1"/>',
  // ホシワタリ: 大小の星屑と、それを渡る航路線。
  "trait-hoshi": '<circle cx="6.5" cy="8" r="1.7"/><circle cx="17.5" cy="16.5" r="1.9"/><circle cx="12.5" cy="12.5" r="1.1"/><circle cx="16.5" cy="6" r=".8"/><circle cx="6" cy="17" r=".8"/><path d="M6.5 8l6 4.5 5 4" fill="none" stroke-opacity=".5"/>',
  // コケムシロ: もこもこと重なる苔の丘と胞子の点。
  "trait-koke": '<path d="M4 16.5c1.2-3 3.8-4.4 6-3.4 1-2.6 4.2-3.6 6.2-2 2 .8 3.2 3 2.6 5.4H4z" fill="none"/><circle cx="8.5" cy="9.5" r=".9"/><circle cx="13.5" cy="7.5" r=".9"/><circle cx="17.5" cy="10.5" r=".9"/>',
  // スアミ: 結節(巣の灯)を糸が渡る網。
  "trait-suami": '<circle cx="5.5" cy="12" r="1.5"/><circle cx="12" cy="7" r="1.5"/><circle cx="18.5" cy="12" r="1.5"/><circle cx="12" cy="17" r="1.5"/><path d="M5.5 12 12 7l6.5 5M5.5 12 12 17l6.5-5M12 7v10" fill="none" stroke-opacity=".55"/>',
  // ヨウガン: 岩塊に走る亀裂(稲妻状の裂け目)。
  "trait-yougan": '<path d="M5 18 4 10l4-5.5L15 4l5 4.5.8 7L17 20l-8 .8z" fill="none"/><path d="M8 6.5l2.6 4-1.8 3 2.8 4.4M14.6 5l-1 4.2 3 2.6-1.2 4.6" fill="none"/>',
  // アミダグラ: 縦線を桟が渡る籤(あみだ)の網目=回路ともつかぬ幾何学。
  "trait-amidagura": '<path d="M6 4v16M12 4v16M18 4v16M6 8h6M12 12h6M6 16h6M12 6h6" fill="none"/><circle cx="18" cy="6" r="1.2"/><circle cx="6" cy="16" r="1.2"/>',
  // クロノ: 歯車と秒針。
  "trait-chrono": '<circle cx="12" cy="12" r="6.5" fill="none"/><path d="M12 3.4v2M12 18.6v2M3.4 12h2M18.6 12h2M5.9 5.9l1.4 1.4M16.7 16.7l1.4 1.4M18.1 5.9l-1.4 1.4M7.3 16.7l-1.4 1.4" fill="none"/><path d="M12 12V7.6M12 12l3.2 1.8" fill="none"/><circle cx="12" cy="12" r="1.1"/>',
  // チェレンコ: 内から滲む微光(二重の暈)。
  "trait-cherenko": '<circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="6.2" fill="none" stroke-opacity=".6"/><circle cx="12" cy="12" r="9" fill="none" stroke-opacity=".3"/>',
  // ヴォイド: 塗り潰された円と、辛うじて残る輪郭の弧。
  "trait-void": '<circle cx="12" cy="12" r="6" /><path d="M12 2.6a9.4 9.4 0 0 1 9.4 9.4M12 21.4A9.4 9.4 0 0 1 2.6 12" fill="none" stroke-opacity=".5"/>',
  // ---- 合成専用特性(§8・到達の証) ----
  // ハガネ: 鋼塊と刃文の波。
  "trait-hagane": '<path d="M7 8h10l3.5 7H3.5z"/><path d="M4.5 18c2.5-1.8 5-1.8 7.5 0s5 1.8 7.5 0" fill="none"/>',
  // コンテンギ: 交差する軌道環と星点。
  "trait-kontengi": '<circle cx="12" cy="12" r="8" fill="none"/><ellipse cx="12" cy="12" rx="8" ry="3" fill="none"/><ellipse cx="12" cy="12" rx="3" ry="8" fill="none" stroke-opacity=".55"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="10" r="1"/>',
  // ムメイ: 破線の輪郭の仮面(眼の穴だけ確か)。
  "trait-mumei": '<path d="M4 9.5c2.6-1.6 13.4-1.6 16 0 .2 4-1.3 6.3-4.6 6.3-1.7 0-2.2-1.2-3.4-1.2s-1.7 1.2-3.4 1.2C5.3 15.8 3.8 13.5 4 9.5z" fill="none" stroke-dasharray="3 2.6"/><circle cx="8.6" cy="11.2" r="1.3"/><circle cx="15.4" cy="11.2" r="1.3"/>',
  // ホウカン: 三尖の冠(中央が高い)+台座の帯。
  "trait-houkan": '<path d="M5 16V9.5l3.5 3L12 5.5l3.5 7 3.5-3V16z" fill="none"/><path d="M5 18.5h14" fill="none"/><circle cx="12" cy="12.6" r="1.2"/>',
  // シズミマチ: 波の下に沈むビルの窓灯。
  "trait-shizumimachi": '<path d="M4 6c2-1.6 4-1.6 6 0s4 1.6 6 0 3-1.2 4 0" fill="none"/><path d="M6 20v-9h4v9M14 20V8h5v12" fill="none"/><rect x="7.2" y="12.6" width="1.5" height="1.5"/><rect x="7.2" y="15.6" width="1.5" height="1.5"/><rect x="15.6" y="10" width="1.5" height="1.5"/><rect x="15.6" y="13.2" width="1.5" height="1.5"/><rect x="15.6" y="16.4" width="1.5" height="1.5"/>',
  // リンカイ: 黒い核と強い光輪(臨界)。
  "trait-rinkai": '<circle cx="12" cy="12" r="5.2"/><circle cx="12" cy="12" r="8.6" fill="none"/><circle cx="12" cy="12" r="1.2" fill="none" stroke-opacity=".7"/>',
  // 固定印(S3③・繁殖ピッカー): 賢者の石の系譜=六角の原石+内環+芯(stoneの記号性から引用・深紅で小さく静かに)。
  //   シルエットで判別(六角+環=lockの錠形ともtraitロゴとも紛れない)。
  "fix-seal": '<path d="M12 3.6 18.6 7.8v8.4L12 20.4 5.4 16.2V7.8z" fill="none"/><circle cx="12" cy="12" r="3.6" fill="none"/><circle cx="12" cy="12" r="1.1"/>',
  // 食料: 飼料袋(結び目+膨らむ袋=四角系)。【改形履歴】旧=ドーム皿→小サイズでcoin(円)/orichalcum(ドーム)と酷似(2026-07-24実測)→袋へ。
  food: '<path d="M9.5 6.5 8 4.5h8l-1.5 2c1.8 1.6 3.5 3.8 3.5 7 0 4-2.6 7-6 7s-6-3-6-7c0-3.2 1.7-5.4 3.5-7z"/><path d="M8.6 9.5h6.8" fill="none" stroke-opacity=".5"/>',
  energy: '<path d="M13 2 5 14h5l-1 8 8-12h-5z"/>',
  science: '<path d="M10 3v6l-5.5 9A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-3L14 9V3" fill="none"/><path d="M8.5 3h7M8 15h8"/>',
  erosion: '<circle cx="12" cy="13" r="6"/><path d="M12 7V4M8 8 5 5M16 8l3-3M6 13H3M21 13h-3M8 18l-2.5 2.5M16 18l2.5 2.5M12 10v6M9.5 11.5v3M14.5 11.5v3" fill="none"/>',
  // ---- 鉱石 ----
  amethyst: pixelIcon(PIXEL_INKS.violet, `
    ......0.....
    .....030....
    ....03420...
    ....04320...
    ..0.04320.0.
    .03004320330
    .04201420320
    .04201420320
    ..0221220220
    ..022222210.
    ...0111110..
    ....00000...`),
  iridium: '<circle cx="12" cy="12" r="3.4" fill="none"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.3 6.3l2.2 2.2M15.5 15.5l2.2 2.2M17.7 6.3l-2.2 2.2M8.5 15.5l-2.2 2.2" fill="none"/>',
  amber: '<path d="M12 3c4 5 6.5 8 6.5 11.5a6.5 6.5 0 1 1-13 0C5.5 11 8 8 12 3z"/><circle cx="12" cy="14" r="2.4" fill="none" stroke-opacity=".55"/>',
  meteorite: '<circle cx="14" cy="15" r="5.5"/><path d="M4 4l5 5M8 3l3 3M3 9l3 3" fill="none"/>',
  orichalcum: '<path d="M4 16 7 9h10l3 7z"/><path d="M7 9l2-4h6l2 4" fill="none"/>',
  titanium: '<path d="M4 8c5-4 11-4 16 0l-3 3c-3-2.5-7-2.5-10 0z"/><path d="M12 10v10" fill="none"/>',
  // ---- 惑星(ステージ) ----
  "p-desert": '<path d="M12 4v16M12 9c0-2.5 3-2.5 3-5M12 13c0-3-4-2.5-4-6M6 20h12" fill="none"/>',
  "p-grass": '<path d="M12 20V9M12 13C12 9 8 9 7 5c4 0 5 2 5 4M12 11c0-3.5 4-3 5-7-4 .5-5 3-5 5M5 20h14" fill="none"/>',
  "p-forest": '<path d="M12 3 6 11h3l-4 6h6v4h2v-4h6l-4-6h3z"/>',
  "p-swamp": '<path d="M4 19c2-1.5 4-1.5 6 0s4 1.5 6 0 3-1 4 0M8 16V7M12 15V5M16 16V8" fill="none"/><path d="M8 7c-1.6 0-2.4-1-2.4-2M12 5c1.6 0 2.4-1 2.4-2M16 8c1.6 0 2.4-1 2.4-2" fill="none"/>',
  "p-volcano": '<path d="M9 5h6l5 15H4z" fill="none"/><path d="M9 5c1 2 2 2 3 0s2-2 3 0M8 13c1.5 1.5 3 1.5 4 0s2.5-1.5 4 0" fill="none"/>',
  "p-jungle": '<path d="M12 21V9M12 9c-5 0-8-2-9-5 5 0 8 1 9 5zM12 9c5 0 8-2 9-5-5 0-8 1-9 5zM12 13c-3 0-5-1-6-3M12 13c3 0 5-1 6-3" fill="none"/>',
  "p-marsh": '<path d="M12 20v-8M12 12C7 12 5 9 5 5c4 0 7 3 7 7zM12 12c5 0 7-3 7-7-4 0-7 3-7 7z" fill="none"/><path d="M4 20h16" fill="none"/>',
  "p-snow": '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5" fill="none"/>',
  "p-cave": '<path d="M3 20V9a9 7 0 0 1 18 0v11M8 9v5M12 9v8M16 9v4" fill="none"/>',
  "p-reactor": '<path d="M4 20c2-4 2-9 .8-13h6.4C10 11 10 16 12 20z" fill="none"/><circle cx="17.5" cy="15.5" r="3.5" fill="none"/><path d="M17.5 12v-2M2 20h20" fill="none"/>',
  "p-sentry": '<path d="M10 20L11 4h2l1 16" fill="none"/><circle cx="12" cy="8" r="1.2"/><path d="M2 20h20M4 17c2-1.5 4-1.5 6 0M14 17c2-1.5 4-1.5 6 0" fill="none"/>',
  "p-abyss": '<path d="M4 20v-6a8 8 0 0 1 16 0v6M8 20v-4M16 20v-4M2 20h20" fill="none"/><circle cx="18.5" cy="6" r="1"/><circle cx="16.5" cy="3" r=".8"/>',
  "p-kofun": '<path d="M5 16c1.5-4 12.5-4 14 0M8.5 16c1-2.5 6-2.5 7 0v-3.4c-1-2.2-6-2.2-7 0z M8.5 12.6c1-2.4 6-2.4 7 0" fill="none"/><path d="M2 19c2-1.4 4-1.4 6 0 2-1.4 4-1.4 6 0 2-1.4 4-1.4 6 0" fill="none"/>',
  "p-city": '<path d="M3 20V11h4v9M9 20V5h5v15M16 20V9h5v11" fill="none"/><path d="M11 8h1M11 11h1M11 14h1M18 12h1M18 15h1M4.5 14h1" fill="none"/><path d="M2 20h20" fill="none"/>',
  "p-ruins": '<path d="M5 20h14M6 17h12M8 17V8M12 17V8M16 17V8M6 8h12l-1-3H7z" fill="none"/>',
  planet: pixelIcon(PIXEL_INKS.ice, `
    ............
    .....000....
    ...003330...
    ..03443320..
    ..03333220.3
    ..0322220332
    .0022033321.
    0333432110..
    021002110...
    ...00000....
    ............
    ............`),
  // ---- ボス ----
  snake: '<path d="M5 18c0-3 3-4 6-4s5-1 5-3.5S13.5 7 11 7H8" fill="none"/><path d="M16 18c-3 0-5-1.5-5-4" fill="none"/><circle cx="6.5" cy="18" r="2.5"/><path d="M4 18l-2 1M4 17.4 2 17" fill="none"/>',
  hawk: '<path d="M12 5 3 12c3 0 4 1 5 3l4-3 4 3c1-2 2-3 5-3z"/><path d="M12 12v7M10 19h4" fill="none"/>',
  crow: '<path d="M5 6c5 0 9 3 10 8l4 2-4 1c-3 0-8-2-10-6z"/><circle cx="8" cy="9" r="1" fill="#000" opacity=".5"/><path d="M9 17l-2 4M13 18l-1 3" fill="none"/>',
  monitor: '<path d="M2.5 13.5c3-.8 4.5-3.5 8.5-3.5 2.6 0 4.4.9 6 2.3.9.8 2.2 1.2 3.5 1.2l1.5.5-1.5 1c-1.5 2.2-3.8 3.5-7 3.5-4.5 0-6.5-2.8-11-3.5z"/><path d="M8 18.5 7 21.5M14 18.8l.8 2.7M18.5 9.5c1.2-1.6 1.2-3.8 0-5.5M12 10V7.5" fill="none"/><circle cx="17.3" cy="13.2" r="1" fill="#1A120B"/>',
  scorpion: '<path d="M7 14c0 3 2 5 5 5s5-2 5-5-2-4-5-4-3-1-3-3 1-3 3-3" fill="none"/><path d="M12 3c2 0 3 1 3 3M7 12 4 9M7 15H4M7 18l-2 2" fill="none"/><circle cx="16" cy="14" r="1.6"/>',
  spider: '<circle cx="12" cy="13" r="4"/><path d="M9 10 4 5M15 10l5-5M8 13H2M16 13h6M9 16l-4 4M15 16l4 4" fill="none"/>',
  bugger: '<ellipse cx="12" cy="13" rx="5" ry="6.5"/><path d="M12 6.5V3M9 4l1.5 2M15 4l-1.5 2M7 10H3M7 15H3.5M17 10h4M17 15h3.5M12 8v10" fill="none"/>',
  // ---- 味方 ----
  turtle: '<path d="M6 14a6 5 0 0 1 12 0v2H6z"/><path d="M18 13h2.5a1.5 1.5 0 0 1 0 3H18M7 16l-1.5 3M17 16l1.5 3M9 12l3 2 3-2M12 9v5" fill="none"/>',
  gecko: '<path d="M6 5c2 0 3.5 1.5 3.5 3.5S11 12 13 12s5 1 5 4-2.5 4-5 4" fill="none"/><circle cx="5.5" cy="5" r="2.5"/><path d="M12 12l-2-2M14 12l1-2.5M13 20l-2 1.5M16 19.5l1 2" fill="none"/>',
  owl: '<path d="M6 8a6 6 0 0 1 12 0v7a6 4.5 0 0 1-12 0z" fill="none"/><circle cx="9.5" cy="10" r="1.6"/><circle cx="14.5" cy="10" r="1.6"/><path d="M12 12.5l-1.2 1.8h2.4zM5 5 7 7M19 5l-2 2" fill="none"/>',
  meerkat: '<path d="M9 21V10a3 3 0 0 1 6 0v11" fill="none"/><circle cx="12" cy="6" r="3" fill="none"/><path d="M10 3.5 9 2M14 3.5 15 2M9 14h6M6 21h12" fill="none"/>',
  ferret: '<path d="M3 15c4 0 5-4 9-4 3 0 4 1.5 4 3s-1.5 3-4 3c-3 0-4-2-9-2z"/><circle cx="18" cy="12" r="2.8"/><path d="M17 9.8 16.5 8M19 9.8 19.5 8M13 17l-1 3M9 16l-1 3.5" fill="none"/>',
  eagle: '<path d="M12 4 2 10c4 0 5 2 6 4l4-2.5L16 14c1-2 2-4 6-4z"/><path d="M12 11.5V18M9 18.5c2 1.5 4 1.5 6 0" fill="none"/>',
  paw: '<ellipse cx="12" cy="15.5" rx="4.5" ry="3.5"/><circle cx="6.5" cy="11" r="1.8"/><circle cx="10" cy="8" r="1.8"/><circle cx="14" cy="8" r="1.8"/><circle cx="17.5" cy="11" r="1.8"/>',
  // ---- 設備 ----
  water: '<path d="M12 3c4 5 6.5 8.5 6.5 12a6.5 6.5 0 1 1-13 0C5.5 11.5 8 8 12 3z" fill="none"/><path d="M9 14.5c0 2 1.5 3.5 3 3.5" fill="none"/>',
  heat: '<circle cx="12" cy="10" r="5" fill="none"/><path d="M12 2.5V5M4.5 10H7M17 10h2.5M6.7 4.7 8.4 6.4M17.3 4.7l-1.7 1.7M9 18h6M10 21h4" fill="none"/>',
  feeder: '<path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M7 12V9M12 12V8M17 12V9" fill="none"/>',
  breedfac: '<path d="M12 20s-7-4.5-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7 2.5C19 15.5 12 20 12 20z" fill="none"/><circle cx="12" cy="13" r="1.6"/>',
  observatory: '<path d="M4 20 14 6" fill="none"/><path d="M12 4l6 4-2.5 3.5-6-4zM18 8l3-1M8 20h8" fill="none"/>',
  fence: '<path d="M5 8v12M12 8v12M19 8v12M5 8l1.5-3L8 8M12 8l1.5-3L15 8M19 8l1.5-3L22 8v0M3 12h18M3 17h18" fill="none"/>',
  shelter: '<path d="M4 11 12 4l8 7v9H4z" fill="none"/><path d="M9 20v-6h6v6" fill="none"/>',
  watchtower: '<path d="M7 21 9 8h6l2 13M6 8h12l-1-4H7zM5 21h14M9.5 13h5" fill="none"/>',
  trap: '<circle cx="12" cy="13" r="7" fill="none"/><path d="M12 6v3M12 17v3M5.5 10l2.7 1.3M18.5 10l-2.7 1.3M6.5 18l2.3-2M17.5 18l-2.3-2M12 11.5l1.5 1.5-1.5 1.5-1.5-1.5z"/>',
  burrow: '<path d="M4 18a8 8 0 0 1 16 0z"/><path d="M2.5 18h19M9 18a3 3 0 0 1 6 0" fill="none"/>',
  build: pixelIcon(PIXEL_INKS.shell, `
    ............
    .......002..
    ......032...
    ......032.20
    ......033320
    .....032220.
    ....032000..
    ...0320.....
    ..0320......
    .0320.......
    .020........
    ............`),
  // ---- 汎用UI ----
  hq: pixelIcon(PIXEL_INKS.shell, `
    ............
    ......0.....
    ....0030....
    ..00344300..
    ..033333320.
    ..033222210.
    ..034022010.
    ..032222210.
    ..034002210.
    .03320022210
    .00000000000
    ............`),
  dex: pixelIcon(PIXEL_INKS.sage, `
    ............
    ..00000000..
    .0333333320.
    .0433333320.
    .0324443220.
    .0322222220.
    .0323332220.
    .0322222220.
    .0111111110.
    .0344444310.
    ..000000000.
    ............`),
  mission: pixelIcon(PIXEL_INKS.shell, `
    ............
    ..00000000..
    ..034444320.
    ..034333320.
    ..032332020.
    ..033220320.
    ..032023320.
    ..033332220.
    ..033222220.
    ..032222220.
    ..000000000.
    ............`),
  stats: pixelIcon(PIXEL_INKS.sage, `
    ............
    .......000..
    .......0340.
    .....000320.
    .....034320.
    ...00032320.
    ...03432320.
    ...03232320.
    ...03232320.
    ..044444432.
    ..000000000.
    ............`),
  settings: pixelIcon(PIXEL_INKS.shell, `
    ............
    ....0330....
    ..03033030..
    .0333333320.
    ..03300220..
    .0330..0220.
    .0320..0220.
    ..03200220..
    .0322222220.
    ..02022020..
    ....0220....
    ............`),
  nestweb: '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" fill="none"/><path d="M12 7.5c2.5 0 4.5 2 4.5 4.5s-2 4.5-4.5 4.5-4.5-2-4.5-4.5 2-4.5 4.5-4.5z" fill="none"/>',
  egg: pixelIcon(PIXEL_INKS.shell, `
    ............
    .....00.....
    ....0340....
    ...034430...
    ...043320...
    ..03433220..
    ..03333220..
    ..03232210..
    ..03222210..
    ...022110...
    ....0000....
    ............`),
  lizard: pixelIcon(PIXEL_INKS.sage, `
    ............
    ............
    .........00.
    .......03330
    ..2..0034320
    .02.04323220
    .0233322220.
    ..02223200..
    ...002020...
    ....20..20..
    ...32...32..
    ............`),
  // ブランドロゴ専用の横向きトカゲ(頭・胴・尾・脚が明快で円内に余裕を持って収まる。#i-lizardは共用のため別定義)
  lizardLogo: '<path d="M6 13c2.6 0 4-2.6 7-2.6 2.2 0 3.6.7 5 2l3 .8-2.6 1c-1.5 1.5-3.2 2.3-5.4 2.3-3 0-4.4-2.6-7-4z"/><circle cx="5.4" cy="12.7" r="2"/><path d="M9.5 15.2 8.6 18M13 15.6l.8 2.6M18.2 12.6c.7-1.4.7-3 0-4.4" fill="none"/>',
  feed: '<path d="M7 3v7a2.5 2.5 0 0 0 5 0V3M9.5 3v18M16 3c2 1 3 3.5 3 6 0 2-1 3-2 3v9" fill="none"/>',
  breed: pixelIcon(PIXEL_INKS.coral, `
    ............
    ............
    ..000..000..
    .0333003330.
    .0343333320.
    .0333332220.
    ..03332220..
    ...032220...
    ....0220....
    .....00.....
    ............
    ............`),
  auto: '<path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2" fill="none"/><path d="M20 4v5h-5M4 20v-5h5" fill="none"/>',
  hint: '<path d="M8 15a6 6 0 1 1 8 0c-1 1-1.5 2-1.5 3h-5C9.5 17 9 16 8 15z" fill="none"/><path d="M10 21h4" fill="none"/>',
  // V6-P5 S1: 音の設定トグル用。ON=音波あり / OFF=×付き(状態を形で示す=色のみに依存しない・UISkills §1.6/§7)
  sound: '<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" fill="none"/><path d="M15.4 9.2a4.2 4.2 0 0 1 0 5.6M18.1 6.7a7.8 7.8 0 0 1 0 10.6" fill="none"/>',
  soundOff: '<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" fill="none"/><path d="M15.8 9.6l5 4.8M20.8 9.6l-5 4.8" fill="none"/>',
  // 錠前: 研究ロック等「未解放」+固定印(S5-b「必ず子へ継がれる」)で共用。REL§6-1(2026-08-29): 旧63行の
  //   重複定義(キー穴の点つき)は後勝ちで本定義が有効だったため重複側を除去=現行表示のまま
  //   (rocketStages/slitSkinByStageで同型の二重定義が実害化した前例への予防)。
  lock: '<rect x="6" y="11" width="12" height="9" rx="2" fill="none"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" fill="none"/>',
  check: '<path d="M4 13l5 5L20 7" fill="none"/>',
  star: '<path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.7 6.7 19.6l1.1-6L3.4 9.4l6-.8z"/>',
  crown: '<path d="M4 18 3 8l5 3 4-6 4 6 5-3-1 10z"/><path d="M6 21h12" fill="none"/>',
  scroll: '<path d="M7 4h11a2 2 0 0 1 2 2v1h-4M7 4a2 2 0 0 0-2 2v12a2 2 0 0 1-2 2h13a2 2 0 0 0 2-2V6" fill="none"/><path d="M8 9h6M8 13h6" fill="none"/>',
  warn: '<path d="M12 3 2 20h20z" fill="none"/><path d="M12 9v5M12 17v.5" fill="none"/>',
  spark: '<path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  meteor: '<circle cx="16" cy="16" r="4.5"/><path d="M3 3l7 7M9 2l4 4M2 9l4 4" fill="none"/>',
  rocket: '<path d="M12 2c3 2 4 6 4 9l-1 6h-6l-1-6c0-3 1-7 4-9z" fill="none"/><circle cx="12" cy="9" r="1.7" fill="none"/><path d="M9 14l-3 3 3 .5M15 14l3 3-3 .5M10.5 17.5 12 22l1.5-4.5" fill="none"/>',
  camera: '<rect x="3" y="7" width="18" height="13" rx="2" fill="none"/><path d="M8 7l2-3h4l2 3" fill="none"/><circle cx="12" cy="13" r="3.5" fill="none"/>',
  gift: '<rect x="4" y="10" width="16" height="10" rx="1" fill="none"/><path d="M12 6v14M4 10h16M12 6c-1.5 0-4-.5-4-2.5S11 2 12 6zM12 6c1.5 0 4-.5 4-2.5S13 2 12 6z" fill="none"/>',
  save: '<path d="M5 3h11l3 3v15H5z" fill="none"/><path d="M8 3v5h7V3M8 21v-7h8v7" fill="none"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2" fill="none"/><path d="M4 10h16M9 3v4M15 3v4" fill="none"/>',
  medal: '<circle cx="12" cy="14" r="5" fill="none"/><path d="M12 12.2l1 2h2l-1.6 1.3.6 2-2-1.2-2 1.2.6-2L9 14.2h2z"/><path d="M8 4l2 5M16 4l-2 5" fill="none"/>',
  skull: '<path d="M12 3a7 7 0 0 0-7 7c0 3 2 5 3 5.5V19h8v-3.5c1-.5 3-2.5 3-5.5a7 7 0 0 0-7-7z" fill="none"/><circle cx="9.5" cy="10.5" r="1.4"/><circle cx="14.5" cy="10.5" r="1.4"/><path d="M10 19v2M14 19v2" fill="none"/>',
  injured: '<circle cx="12" cy="12" r="8" fill="none"/><path d="M12 7v10M7 12h10" fill="none"/>',
  fire: '<path d="M12 2c1 3-2 4-2 7a2 2 0 0 0 4 .5C16 11 17 13 17 15a5 5 0 0 1-10 0c0-5 4-7 5-13z" fill="none"/>',
  unknown: '<circle cx="12" cy="12" r="9" fill="none"/><path d="M9 9.5A3 3 0 0 1 15 10c0 2-3 2-3 4M12 17.5v.5" fill="none"/>',
  close: '<path d="M5 5l14 14M19 5 5 19" fill="none"/>',
  shield: '<path d="M12 3 5 6v6c0 5 3.5 8 7 9 3.5-1 7-4 7-9V6z" fill="none"/><path d="M9 12l2 2 4-4" fill="none"/>',
};

const Icon = {
  injected: false,
  inject() {
    if (this.injected) return;
    this.injected = true;
    const defs = Object.entries(ICONS)
      .map(([id, body]) => `<symbol id="i-${id}" viewBox="0 0 24 24">
        <g fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</g></symbol>`)
      .join("");
    const div = document.createElement("div");
    div.style.display = "none";
    div.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${defs}</svg>`;
    document.body.prepend(div);
  },
  // インラインSVG参照。cls追加可(例: Icon.svg("gem", "ic-gem"))
  svg(id, cls) {
    if (!ICONS[id]) id = "unknown";
    return `<svg class="icon${cls ? " " + cls : ""}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  },
};

// 早期注入(bodyがあれば即・なければDOMContentLoaded)
if (document.body) Icon.inject();
else document.addEventListener("DOMContentLoaded", () => Icon.inject());
