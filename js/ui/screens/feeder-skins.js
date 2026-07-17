// =============================================================
// screens/feeder-skins — クランクの機構スキン層(Crank_Deepening Phase 0)
// 骨格(feeder.js=操作/状態)とスキン(本ファイル=見た目)を分離する。
// 【スキン契約】skinは以下だけを提供し、操作骨格には一切関与しない:
//   - id:        スキンID
//   - dialClass: #feeder-dial に付くCSSクラス(スキン固有スタイルのスコープ)
//   - face():    クランク盤面のSVGマークアップ(64x64 viewBox)。
//                回転する部分は必ず class="fd-wheel" のグループに含める
//                (骨格が spin/boing/オート回転をこのクラスに適用するため)
// 操作(タップ/長押し/オート/補給/レバー/折りたたみ/同速関係)は全惑星で完全統一。
// エフェクト量は CFG.crankFxLevel(0=最小/1=標準)を各スキンが尊重する。
// =============================================================

const CrankSkins = {
  // 惑星ID→スキンID(crank.md §3.1の確定表と1:1。フォールバックに頼らず全惑星を明示)
  // 1=乾燥地帯(アリド)=始まりの地・教科書(不変) / 10=古代遺跡(オリジン)=羅針盤(確定)
  byPlanet: {
    1: "default", 2: "neon", 3: "clock", 4: "tomb", 5: "forge",
    6: "shrine", 7: "abyss", 8: "servo", 9: "junk",
    10: "compass",
  },

  skins: {
    // 現行の真鍮クランク(Brushup V2.1確定版)をそのまま"default"として登録
    default: {
      id: "default",
      dialClass: "skin-default",
      face() {
        return `
          <svg viewBox="0 0 64 64" class="fd-svg" aria-hidden="true">
            <defs>
              <linearGradient id="fd-brass" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style="stop-color:var(--amber-400)"/>
                <stop offset=".55" style="stop-color:var(--amber-500)"/>
                <stop offset="1" style="stop-color:var(--amber-600)"/>
              </linearGradient>
              <radialGradient id="fd-well" cx=".38" cy=".3" r=".9">
                <stop offset="0" style="stop-color:#3a2c16"/>
                <stop offset="1" style="stop-color:#14100a"/>
              </radialGradient>
            </defs>
            <circle cx="32" cy="32" r="25" fill="url(#fd-well)"/>
            <circle cx="32" cy="32" r="25" class="fd-rim"/>
            <circle cx="32" cy="32" r="21.5" fill="none" class="fd-rim-in"/>
            <g class="fd-wheel">
              <g class="fd-teeth" fill="url(#fd-brass)">
                <path d="M32 12l2.2 4h-4.4zM32 52l2.2-4h-4.4zM12 32l4-2.2v4.4zM52 32l-4-2.2v4.4z"/>
                <path d="M18 18l4.4 1.3-3.1 3.1zM46 18l-1.3 4.4 3.1-3.1z" transform="rotate(0 32 32)"/>
                <path d="M18 46l1.3-4.4 3.1 3.1zM46 46l-4.4-1.3 3.1-3.1z"/>
              </g>
              <circle cx="32" cy="32" r="16.5" fill="url(#fd-brass)" class="fd-plate2"/>
              <circle cx="32" cy="32" r="16.5" fill="none" class="fd-plate-line"/>
              <path d="M32 19v26M19 32h26M22.8 22.8l18.4 18.4M41.2 22.8 22.8 41.2" class="fd-spokes"/>
              <circle cx="32" cy="32" r="5" class="fd-hub"/>
              <circle cx="32" cy="32" r="2" class="fd-hub-pin"/>
              <g class="fd-handle">
                <rect x="30.4" y="8" width="3.2" height="9" rx="1.6" class="fd-handle-grip"/>
                <circle cx="32" cy="12.5" r="3" class="fd-handle-cap"/>
              </g>
            </g>
          </svg>`;
      },
    },

    // 羅針盤(ID10 古代遺跡=オリジン)。crank.md §3.4/§4.5: 石の機構として再設計
    // 固有ギミック=長針(cp-ln)・短針(cp-sn)が独立に振れる。石の物理はCSS側(skin-compassスコープ)
    compass: {
      id: "compass",
      dialClass: "skin-compass",
      face() {
        const fx = CFG.crankFxLevel > 0 ? "" : " fx0";
        return `
          <svg viewBox="0 0 64 64" class="fd-svg" aria-hidden="true">
            <defs>
              <linearGradient id="cp-stone" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style="stop-color:#6b5d42"/>
                <stop offset=".5" style="stop-color:#4a4234"/>
                <stop offset="1" style="stop-color:#2c261c"/>
              </linearGradient>
              <radialGradient id="cp-disc" cx=".4" cy=".32" r=".95">
                <stop offset="0" style="stop-color:#7d7059"/>
                <stop offset=".6" style="stop-color:#57503c"/>
                <stop offset="1" style="stop-color:#332d20"/>
              </radialGradient>
              <linearGradient id="cp-gold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style="stop-color:var(--amber-400)"/>
                <stop offset="1" style="stop-color:var(--amber-600)"/>
              </linearGradient>
            </defs>
            <!-- 風化した石環(静): 刻印・ひび・縁の欠け -->
            <circle cx="32" cy="32" r="25.5" fill="url(#cp-stone)"/>
            <circle cx="32" cy="32" r="25.5" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="1.6"/>
            <path d="M50.5 12.8l3.4 2.6-2.2 2.8z" fill="#14100a" opacity=".55"/>
            <g stroke="rgba(20,16,10,.7)" stroke-width="1.4" stroke-linecap="round">
              <path d="M32 7v3.2M32 53.8V57M7 32h3.2M53.8 32H57M14.7 14.7l2.2 2.2M47.1 47.1l2.2 2.2M49.3 14.7l-2.2 2.2M16.9 47.1l-2.2 2.2"/>
            </g>
            <path d="M10 24c3 1.5 4 4 3.5 7M50 45c1.8-.6 4-.2 5.5 1.4M23 8.5c.8 2 .3 3.4-.8 4.6" fill="none" stroke="rgba(0,0,0,.4)" stroke-width="1"/>
            <!-- 苔の斑(静) -->
            <circle cx="12.5" cy="38.5" r="1.6" fill="rgba(111,184,160,.35)"/>
            <circle cx="14.4" cy="40.6" r="1" fill="rgba(111,184,160,.25)"/>
            <circle cx="48.8" cy="17.8" r="1.2" fill="rgba(111,184,160,.28)"/>
            <!-- 彫刻帯(多層・待機で微かに逆行) -->
            <g class="cp-band${fx}">
              <circle cx="32" cy="32" r="20.5" fill="none" stroke="rgba(216,195,165,.28)" stroke-width="2.4"
                stroke-dasharray="1.6 3.4 4.2 3.4"/>
              <path d="M32 10.2l1.1 2.2h-2.2zM53.8 32l-2.2 1.1v-2.2zM32 53.8l-1.1-2.2h2.2zM10.2 32l2.2-1.1v2.2z"
                fill="rgba(216,195,165,.35)"/>
            </g>
            <!-- 石盤(回る主体=.fd-wheel): 欠け・風化筋を持つ重い円盤 -->
            <g class="fd-wheel">
              <circle cx="32" cy="32" r="16" fill="url(#cp-disc)"/>
              <circle cx="32" cy="32" r="16" fill="none" stroke="rgba(0,0,0,.5)" stroke-width="1"/>
              <path d="M45.4 24.6l2.8-1.2-1.6 3.4z" fill="#241f14"/>
              <path d="M20.5 44.2l-2.3 2-.4-2.8z" fill="#241f14" opacity=".8"/>
              <g stroke="rgba(0,0,0,.3)" stroke-width=".9" fill="none">
                <path d="M32 32L21 20M32 32l13.5 5M32 32l-4 13"/>
              </g>
              <circle cx="32" cy="32" r="13" fill="none" stroke="rgba(216,195,165,.25)" stroke-width=".8" stroke-dasharray="1 2.3"/>
              <!-- 八芒ローズ(彫り込み) -->
              <g fill="url(#cp-gold)" opacity=".9">
                <path d="M32 18l2.4 11.6L32 32l-2.4-2.4z"/>
                <path d="M46 32l-11.6 2.4L32 32l2.4-2.4z"/>
                <path d="M32 46l-2.4-11.6L32 32l2.4 2.4z"/>
                <path d="M18 32l11.6-2.4L32 32l-2.4 2.4z"/>
              </g>
              <g fill="rgba(216,195,165,.45)">
                <path d="M41.9 22.1 33.7 30.3 32 32l1.7-4.2z"/>
                <path d="M41.9 41.9 33.7 33.7 32 32l4.2 1.7z"/>
                <path d="M22.1 41.9l8.2-8.2L32 32l-1.7 4.2z"/>
                <path d="M22.1 22.1l8.2 8.2L32 32l-4.2-1.7z"/>
              </g>
              <!-- 北極星石(オート中に緑=直感アンカー) -->
              <circle cx="32" cy="19.2" r="1.9" class="cp-north"/>
              <!-- 軸の鋲(4点) -->
              <g fill="rgba(20,16,10,.6)">
                <circle cx="27.5" cy="27.5" r=".9"/><circle cx="36.5" cy="27.5" r=".9"/>
                <circle cx="27.5" cy="36.5" r=".9"/><circle cx="36.5" cy="36.5" r=".9"/>
              </g>
            </g>
            <!-- 長針(鉄・独立): 待機=北を探す大きな揺れ / タップ=減衰2往復 -->
            <g class="cp-ln-sway${fx}"><g class="cp-ln">
              <path d="M32 13.5l1.7 15.5-1.7 5-1.7-5z" fill="#241812" stroke="rgba(216,195,165,.35)" stroke-width=".5"/>
              <path d="M32 13.5l1.7 15.5H32z" fill="var(--paper-100)" opacity=".7"/>
            </g></g>
            <!-- 短針(青銅・独立・位相ずれ): タップ=速い3往復 -->
            <g class="cp-sn-sway${fx}"><g class="cp-sn">
              <path d="M32 22.5l1.3 8-1.3 3.2-1.3-3.2z" fill="url(#cp-gold)" stroke="rgba(0,0,0,.4)" stroke-width=".5"/>
            </g></g>
            <!-- 軸受(針の上に固定) -->
            <circle cx="32" cy="32" r="3.4" fill="url(#cp-gold)" stroke="rgba(0,0,0,.45)" stroke-width=".8"/>
            <circle cx="32" cy="32" r="1.2" fill="var(--paper-100)" opacity=".85"/>
            <!-- 水晶ドームの照り(静) -->
            <path d="M14 22a20 20 0 0 1 22-9" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="3" stroke-linecap="round"/>
          </svg>`;
      },
    },

    // ネオンの操作盤(ID2 摩天楼スラム=ネオヴェルデ)。crank.md §3.4/§4.5: 電子の機構
    // 慣性ゼロ・離散スナップ・グリッチ。格差=左上弧が明るく右下弧が薄暗い(死に/明滅セグメント)
    neon: {
      id: "neon",
      dialClass: "skin-neon",
      face() {
        const fx = CFG.crankFxLevel > 0 ? "" : " fx0";
        // 外周24セグメント: 左上弧(15..23,0..4)=高層hi / 右下弧=スラムlo(+死に14,17/明滅19)
        let outer = "";
        for (let i = 0; i < 24; i++) {
          const deg = i * 15;
          const hi = (i >= 15 || i <= 4);
          let cls = hi ? "e-seg hi" : "e-seg lo";
          if (i === 14 || i === 17) cls = "e-seg dead";
          if (i === 19) cls = "e-seg flick" + fx;
          outer += `<rect x="30.7" y="7.6" width="2.6" height="5.6" rx="1" transform="rotate(${deg} 32 32)" class="${cls}"/>`;
        }
        let inner = "";
        for (let i = 0; i < 12; i++) {
          const deg = i * 30 + 15;
          const hi = (i >= 8 || i <= 2);
          inner += `<rect x="30.9" y="16.4" width="2.2" height="4.2" rx="1" transform="rotate(${deg} 32 32)" class="e-seg ${hi ? "hi" : "lo"}"/>`;
        }
        return `
          <svg viewBox="0 0 64 64" class="fd-svg" aria-hidden="true">
            <defs>
              <radialGradient id="ne-glass" cx=".38" cy=".3" r="1">
                <stop offset="0" style="stop-color:#161a28"/>
                <stop offset="1" style="stop-color:#07080f"/>
              </radialGradient>
            </defs>
            <!-- 黒曜ガラスの盤(静)+格差ベゼル(左=シアン鮮明/右=くすみ) -->
            <circle cx="32" cy="32" r="25.5" fill="url(#ne-glass)"/>
            <path d="M32 6.5A25.5 25.5 0 0 0 6.5 32" fill="none" stroke="rgba(95,204,217,.75)" stroke-width="1.6"/>
            <path d="M6.5 32A25.5 25.5 0 0 0 32 57.5" fill="none" stroke="rgba(95,204,217,.30)" stroke-width="1.4"/>
            <path d="M32 6.5A25.5 25.5 0 0 1 57.5 32" fill="none" stroke="rgba(217,87,176,.55)" stroke-width="1.6"/>
            <path d="M57.5 32A25.5 25.5 0 0 1 32 57.5" fill="none" stroke="rgba(120,90,110,.28)" stroke-width="1.4"/>
            <!-- 回る主体(.fd-wheel): セグメント環+走査ビーム -->
            <g class="fd-wheel">
              ${outer}
              ${inner}
              <g class="e-beam-g">
                <path d="M32 32L32 8.6" stroke="rgba(95,204,217,.9)" stroke-width="1.6" class="e-beam"/>
                <path d="M32 8.6l-1.8 3.4h3.6z" fill="rgba(95,204,217,.9)" class="e-beam"/>
                <path d="M32 32L32 8.6" stroke="rgba(95,204,217,.25)" stroke-width="4" class="e-beam-halo"/>
              </g>
              <circle cx="32" cy="32" r="9.5" fill="none" stroke="rgba(95,204,217,.18)" stroke-width=".8" stroke-dasharray="2 3"/>
            </g>
            <!-- 稼働コア(オート=緑の電源LED・直感アンカー) -->
            <circle cx="32" cy="32" r="5.2" fill="#0b0d14" stroke="rgba(95,204,217,.4)" stroke-width="1"/>
            <circle cx="32" cy="32" r="2.6" class="e-core"/>
            <!-- 走査線(待機微動・fx0/reducedで停止) -->
            <g class="e-scan${fx}"><rect x="8" y="0" width="48" height="1.4" fill="rgba(159,208,255,.14)"/></g>
            <!-- ガラスの照り(静) -->
            <path d="M14 21a20 20 0 0 1 21-9.5" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="3" stroke-linecap="round"/>
          </svg>`;
      },
    },

    // 木製からくり時計(ID3 シルヴァ)。crank.md §3.4/§4.5: 木の機構=等時性の拍
    // 輪列(主輪+逆回転の小歯車1:3)と振り子。脱進機のラチェット送りが手触りの核
    clock: {
      id: "clock",
      dialClass: "skin-clock",
      face() {
        // 主輪の歯16枚(木の歯・角丸)
        let teeth = "";
        for (let i = 0; i < 16; i++) {
          teeth += `<rect x="30.8" y="8.2" width="2.4" height="4.4" rx="1.1" transform="rotate(${i * 22.5} 32 32)" fill="#8a6a42" stroke="#3e2c17" stroke-width=".8"/>`;
        }
        // 彫り抜きスポーク4穴
        let holes = "";
        for (let i = 0; i < 4; i++) {
          holes += `<circle cx="32" cy="17.5" r="4.6" transform="rotate(${45 + i * 90} 32 32)" fill="#4a3520"/>`;
        }
        // 小歯車の歯10枚(中心0,0・半径6)
        let t2 = "";
        for (let i = 0; i < 10; i++) {
          t2 += `<rect x="-1" y="-7.6" width="2" height="2.6" rx=".9" transform="rotate(${i * 36})" fill="#7a5c38"/>`;
        }
        return `
          <svg viewBox="0 0 64 64" class="fd-svg" aria-hidden="true">
            <defs>
              <radialGradient id="cw-wood" cx=".4" cy=".32" r="1">
                <stop offset="0" style="stop-color:#9a7648"/>
                <stop offset="1" style="stop-color:#5c4226"/>
              </radialGradient>
            </defs>
            <!-- 木の台座(静)+ほぞ組の継ぎ目 -->
            <circle cx="32" cy="32" r="27" fill="url(#cw-wood)"/>
            <circle cx="32" cy="32" r="27" fill="none" stroke="#3e2c17" stroke-width="1.6"/>
            <path d="M32 5v3.4M32 55.6V59M5 32h3.4M55.6 32H59" stroke="#3e2c17" stroke-width="1.4"/>
            <!-- 年輪・木目(静) -->
            <path d="M13 25a20 20 0 0 1 10-9M50 42a20 20 0 0 1-9 8" fill="none" stroke="rgba(62,44,23,.5)" stroke-width="1"/>
            <path d="M17 40a17 17 0 0 0 7 6" fill="none" stroke="rgba(154,118,72,.55)" stroke-width=".8"/>
            <!-- 回る主体: 木歯車の主輪(.fd-wheel=骨格が回転を適用) -->
            <g class="fd-wheel">
              ${teeth}
              <circle cx="32" cy="32" r="21.5" fill="url(#cw-wood)" stroke="#3e2c17" stroke-width="1.4"/>
              <path d="M20 24a14 14 0 0 1 9-6M44 41a14 14 0 0 1-8 6" fill="none" stroke="rgba(62,44,23,.45)" stroke-width=".9"/>
              ${holes}
              <circle cx="32" cy="32" r="8.2" fill="#6b4e2e" stroke="#3e2c17" stroke-width="1.2"/>
            </g>
            <!-- 振り子(前面・待機の拍・fx0/reducedで停止) -->
            <g transform="translate(32 34)"><g class="cw-pend">
              <path d="M0 0V15" stroke="#3e2c17" stroke-width="1.6"/>
              <circle cx="0" cy="17" r="3.4" fill="#8a6a42" stroke="#3e2c17" stroke-width="1.2"/>
            </g></g>
            <!-- 小歯車(逆回転・1:3連動) -->
            <g transform="translate(49 15)"><g class="cw-g2">
              ${t2}
              <circle r="6" fill="#8a6a42" stroke="#3e2c17" stroke-width="1.1"/>
              <circle r="1.6" fill="#c9a86a"/>
            </g></g>
            <!-- 軸受け: 真鍮の芯+翡翠の軸受け石(オート=緑・直感アンカー) -->
            <circle cx="32" cy="32" r="4.6" fill="#c9a86a" stroke="#7a5c38" stroke-width="1"/>
            <circle cx="32" cy="32" r="2.4" class="cw-jewel"/>
          </svg>`;
      },
    },
    // 溶鉱炉(ID5 イグニス)。crank.md §3.4/§4.5: 炎/溶鉄の機構=粘る手触り
    // 坩堝リング(溶滴+スラグ)と炉床の熾火。緑=炉心の炎色反応
    forge: {
      id: "forge",
      dialClass: "skin-forge",
      face() {
        // 坩堝リングの溶滴(明るい玉)とスラグ(黒い塊)。回転が見える浮遊物
        let drops = "";
        const dropSpec = [
          [0, 2.0, "#ffd27a"], [55, 1.5, "#ff9a3c"], [95, 1.8, "#ffce6b"],
          [150, 1.4, "#ff8a2a"], [205, 2.1, "#ffd98f"], [260, 1.5, "#ffa94d"], [310, 1.7, "#ffc766"],
        ];
        for (const [deg, r, c] of dropSpec) {
          drops += `<circle cx="32" cy="15" r="${r}" fill="${c}" transform="rotate(${deg} 32 32)"/>`;
        }
        let slag = "";
        for (const deg of [30, 128, 232, 292]) {
          slag += `<path d="M30.6 13.6l2.8-.8 1 2.4-2.6 1.2z" fill="#3a2018" transform="rotate(${deg} 32 32)"/>`;
        }
        // 火の粉(静止位置・明滅は熾火と同期)
        let sparks = "";
        for (const [x, y, r] of [[14, 20, .9], [50, 24, .8], [20, 47, .8], [46, 45, .9], [32, 8.5, .7]]) {
          sparks += `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffce6b" class="fl-ember"/>`;
        }
        return `
          <svg viewBox="0 0 64 64" class="fd-svg" aria-hidden="true">
            <defs>
              <radialGradient id="fl-iron" cx=".4" cy=".3" r="1">
                <stop offset="0" style="stop-color:#4a3228"/>
                <stop offset="1" style="stop-color:#241310"/>
              </radialGradient>
              <radialGradient id="fl-heat" cx=".5" cy=".62" r=".65">
                <stop offset="0" style="stop-color:rgba(255,154,60,.55)"/>
                <stop offset=".6" style="stop-color:rgba(214,69,28,.28)"/>
                <stop offset="1" style="stop-color:rgba(214,69,28,0)"/>
              </radialGradient>
            </defs>
            <!-- 鋳鉄の炉体(静)+リベット -->
            <circle cx="32" cy="32" r="27" fill="url(#fl-iron)"/>
            <circle cx="32" cy="32" r="27" fill="none" stroke="#160c08" stroke-width="1.8"/>
            <circle cx="32" cy="32" r="23.6" fill="none" stroke="#5c3d2e" stroke-width=".9"/>
            <g fill="#6b4635">
              <circle cx="32" cy="6.8" r="1.2"/><circle cx="57.2" cy="32" r="1.2"/>
              <circle cx="32" cy="57.2" r="1.2"/><circle cx="6.8" cy="32" r="1.2"/>
              <circle cx="14.2" cy="14.2" r="1.1"/><circle cx="49.8" cy="14.2" r="1.1"/>
              <circle cx="14.2" cy="49.8" r="1.1"/><circle cx="49.8" cy="49.8" r="1.1"/>
            </g>
            <!-- 炉床の熾火(待機=ゆっくり明滅 / 操作=ふいごで吹き上がる) -->
            <circle cx="32" cy="32" r="24" fill="url(#fl-heat)" class="fl-hearth"/>
            ${sparks}
            <!-- 回る主体: 坩堝リング(.fd-wheel) -->
            <g class="fd-wheel">
              <circle cx="32" cy="32" r="17" fill="none" stroke="#2a1510" stroke-width="6.4"/>
              <circle cx="32" cy="32" r="17" fill="none" stroke="#d6451c" stroke-width="4.6"/>
              <circle cx="32" cy="32" r="17" fill="none" stroke="#ff9a3c" stroke-width="2.4" stroke-dasharray="14 7 22 5 17 9 25 8"/>
              ${drops}
              ${slag}
              <!-- 赤熱の残光アーク(尾)。通常は消灯・回転で灯りゆっくり冷める -->
              <path d="M32 12.4A19.6 19.6 0 0 0 12.4 32" fill="none" stroke="#ffce6b" stroke-width="3.4" stroke-linecap="round" class="fl-trail"/>
            </g>
            <!-- 炉心: 溶湯だまり+炎(オート=緑の炎色反応・直感アンカー) -->
            <circle cx="32" cy="32" r="8.6" fill="#1c0e0a" stroke="#5c3d2e" stroke-width="1"/>
            <circle cx="32" cy="32" r="6.4" fill="#d6451c"/>
            <circle cx="31" cy="31" r="4.2" fill="#ff9a3c"/>
            <path d="M32 27.6c1.8 1.6 2.4 3 1.6 4.8-.5 1.2-1.9 1.9-3.2 1.4-1.9-.7-2.3-2.6-1.2-4.4.7-1.1 1.6-1.6 2.8-1.8z" class="fl-core"/>
            <!-- 鋳型の刻印(静) -->
            <path d="M25 53.4h14M28 55.6h8" stroke="#160c08" stroke-width="1" opacity=".8"/>
          </svg>`;
      },
    },
    // 使い捨て高効率機構(ID9 ヴォルタ=廃原子炉)。crank.md §3.4/§4.5:
    // あからさまに雑な寄せ集め×キビキビ高性能。チープさはCFG.crankCheapLevelで調整
    junk: {
      id: "junk",
      dialClass: "skin-junk",
      face() {
        const cheap = CFG.crankCheapLevel > 0;
        // ジャンクファン: 色バラバラの7枚ブレード(1枚は明らかに別規格)
        const bladeCols = ["#8a9096", "#7a8288", "#9aa0a6", "#6d7378", "#c9a86a", "#848a90", "#5f6a72"];
        let blades = "";
        for (let i = 0; i < 7; i++) {
          const odd = i === 4; // 異物ブレード: 大きく色も違う
          const len = odd ? 17.5 : 15, w = odd ? 6.2 : 4.8;
          blades += `<rect x="${32 - w / 2}" y="${31 - len - 6}" width="${w}" height="${len}" rx="2.2" fill="${bladeCols[i]}" transform="rotate(${i * 51.4 + (odd ? 4 : 0)} 32 32)"/>`;
        }
        // 規格違いのネジ(プラス/マイナス/六角/欠落穴/浮き)
        const screws = `
          <g stroke="#41474c" stroke-width="1">
            <circle cx="11" cy="14" r="2.4" fill="#9aa0a6"/><path d="M9.6 14h2.8M11 12.6v2.8"/>
            <circle cx="53" cy="12" r="2.4" fill="#b8bec4"/><path d="M51.4 12.6l3.2-1.2"/>
            <path d="M52.9 50.2l2.1 1.2v2.4l-2.1 1.2-2.1-1.2v-2.4z" fill="#8a9096"/>
          </g>
          <circle cx="11.5" cy="50" r="2.1" fill="#22262a"/>
          ${cheap ? `<g class="jk-loose" transform="rotate(14 32 59)"><circle cx="32" cy="59" r="2.3" fill="#c8b48a" stroke="#6b5d42" stroke-width="1"/><path d="M30.6 59h2.8" stroke="#6b5d42" stroke-width="1"/></g>` : ""}`;
        // 剥き出し配線(チープ時は3本)
        const wires = `
          <path d="M6 24c6-4 10 4 16-1" fill="none" stroke="#c0392b" stroke-width="1.6"/>
          <path d="M8 43c6 4 10-3 15 3" fill="none" stroke="#3d7ac0" stroke-width="1.4"/>
          ${cheap ? `<path d="M42 55c5 2 9-2 13 1" fill="none" stroke="#d9b34a" stroke-width="1.4"/>` : ""}`;
        // 応急処置テープ(黄=警告柄・銀ダクト。貼り方が雑)
        const tapes = cheap ? `
          <g transform="rotate(20 48 9)">
            <rect x="39" y="6" width="19" height="5.4" fill="#d9b34a"/>
            <path d="M42 6l-2.6 5.4M47 6l-2.6 5.4M52 6l-2.6 5.4M57 6l-2.6 5.4" stroke="#26221a" stroke-width="2"/>
          </g>
          <g class="jk-tape" transform="rotate(-13 14 57)">
            <rect x="7" y="54.5" width="15" height="5" fill="#a8adb2" opacity=".92"/>
            <path d="M7 54.5l2 5M22 54.5l-2.4 5" stroke="#8a9096" stroke-width=".8"/>
          </g>` : "";
        // 型番シール(傾いてる)
        const sticker = `
          <g transform="rotate(-8 20 53)">
            <rect x="13.5" y="50" width="13" height="5.6" rx="1" fill="#d9dde0"/>
            <path d="M15.5 52h9M15.5 54h6.5" stroke="#7d8489" stroke-width=".9"/>
          </g>`;
        return `
          <svg viewBox="0 0 64 64" class="fd-svg" aria-hidden="true">
            <!-- 筐体: 継ぎ目のずれた色違いプラ板2枚(グラデ無し=安いフラット) -->
            <path d="M29.5 5a27 27 0 0 0-2.5 53.9L29.5 59z" fill="#8f959b"/>
            <path d="M29.5 5a27 27 0 0 1 2.5 54l-4.5-.1z" fill="#7d8489"/>
            <path d="M29.5 5L27 58.9" stroke="#565c61" stroke-width="1.2"/>
            <circle cx="32" cy="32" r="27" fill="none" stroke="#41474c" stroke-width="1.6"/>
            <!-- 通気スリット(安物の打ち抜き) -->
            <path d="M20 47.5h7M19 44.5h8M20 41.5h7" stroke="#565c61" stroke-width="1.6"/>
            <!-- ファンの奥板 -->
            <circle cx="32" cy="32" r="21" fill="#33383d"/>
            <circle cx="32" cy="32" r="21" fill="none" stroke="#41474c" stroke-width="1"/>
            <!-- 回る主体: ジャンクファン(.fd-wheel) -->
            <g class="fd-wheel">
              ${blades}
              <circle cx="32" cy="32" r="6.6" fill="#c8cdd2" stroke="#7d8489" stroke-width="1"/>
              <circle cx="33.1" cy="31.2" r="2" fill="#6d7378"/>
              <path d="M32.1 30.2l2 2M34.1 30.2l-2 2" stroke="#41474c" stroke-width=".8"/>
            </g>
            <!-- 保護グリル(1本曲がってる) -->
            <path d="M13 25h38M13 39h38M25 12.6v38.8M39 12.6v38.8" stroke="rgba(180,186,192,.35)" stroke-width="1.2"/>
            ${cheap ? `<path d="M13 32h16q4 3 22 .5" fill="none" stroke="rgba(180,186,192,.45)" stroke-width="1.3"/>` : `<path d="M13 32h38" stroke="rgba(180,186,192,.35)" stroke-width="1.2"/>`}
            ${screws}
            ${wires}
            ${tapes}
            ${sticker}
            <!-- 熱暴走/瞬間冷却: 雑に斜めに貼られた温度ストリップ(crank.md §3.4・3つ目の矛盾) -->
            <g transform="rotate(3 56 32)">
              <rect x="53.4" y="17.5" width="6.4" height="29.5" rx="1.2" fill="#d9dde0"/>
              <rect x="54.8" y="19" width="3.6" height="26" fill="#22262a"/>
              <rect x="54.8" y="19" width="3.6" height="3.4" fill="rgba(214,69,28,.4)"/>
              <rect x="54.8" y="19" width="3.6" height="26" class="jk-heat"/>
              <rect x="54.8" y="19" width="3.6" height="26" class="jk-cool"/>
              <path d="M58.6 25h1.2M58.6 31h1.2M58.6 37h1.2M58.6 43h1.2" stroke="#7d8489" stroke-width=".8"/>
            </g>
            <circle cx="32" cy="32" r="21" class="jk-coolflash"/>
            <!-- 安物の5mm LED(配線で外付け・オート=緑点灯の直感アンカー) -->
            <path d="M42 8q3-4 6-1" fill="none" stroke="#41474c" stroke-width="1"/>
            <rect x="46.6" y="8" width="4" height="2.6" fill="#565c61"/>
            <circle cx="48.6" cy="6.6" r="2.7" class="jk-led"/>
          </svg>`;
      },
    },
    // 軍用サーボ(ID8 グラキス=氷の前線)。crank.md §3.4/§4.5:
    // 冷たく正確・軍用グレード・無機質=「借り物の力」。位置の不連続(スルー&ホールド)
    servo: {
      id: "servo",
      dialClass: "skin-servo",
      face() {
        return `
          <svg viewBox="0 0 64 64" class="fd-svg" aria-hidden="true">
            <!-- 黒装甲プレート: 角張り・非対称に切り落とされた角・精確なパネルライン -->
            <path d="M14 8h30l12 12v22l-8 14H16L6 44V16z" fill="#1a1e24" stroke="#0b0d10" stroke-width="1.6"/>
            <path d="M44 8l12 12-7 .2z" fill="#12151a"/>
            <path d="M14 8L6 16h9zM16 56l-10-12 8-.4z" fill="#232830"/>
            <path d="M9 30h6M49 42h7M18 11h12" stroke="#0b0d10" stroke-width="1"/>
            <!-- 精確な六角ボルト(ジャンクの規格違いと正反対=全て同一規格) -->
            <g fill="#2c323a" stroke="#0b0d10" stroke-width=".7">
              <path d="M11.2 12.5l1.8 1v2l-1.8 1-1.8-1v-2z"/>
              <path d="M52.8 12.5l1.8 1v2l-1.8 1-1.8-1v-2z"/>
              <path d="M54.8 47.5l1.8 1v2l-1.8 1-1.8-1v-2z"/>
              <path d="M11.2 47.5l1.8 1v2l-1.8 1-1.8-1v-2z"/>
            </g>
            <!-- ケーブル束(片側のみ=非対称) -->
            <path d="M56 26c-2 3-2 8 0 12" fill="none" stroke="#0b0d10" stroke-width="3"/>
            <path d="M56 26c-2 3-2 8 0 12" fill="none" stroke="#3a2226" stroke-width="1.4"/>
            <!-- ベアリング座 -->
            <circle cx="32" cy="32" r="21.5" fill="#101318"/>
            <circle cx="32" cy="32" r="21.5" fill="none" stroke="#2c323a" stroke-width="1"/>
            <circle cx="32" cy="32" r="19.5" fill="none" stroke="#0b0d10" stroke-width="1.2" stroke-dasharray="2.4 1.6"/>
            <!-- 回る主体: 剥き出しの非対称ローター(.fd-wheel) -->
            <g class="fd-wheel">
              <circle cx="32" cy="32" r="17" fill="none" stroke="#232830" stroke-width="4.6"/>
              <circle cx="32" cy="32" r="17" fill="none" stroke="#3a4048" stroke-width="1" stroke-dasharray="6 4"/>
              <!-- 太いアーマチュア+カウンターウェイト(非対称の異質さ) -->
              <path d="M29 30.5h-13a2.4 2.4 0 0 0 0 3h13z" fill="#2c323a" stroke="#0b0d10" stroke-width=".8"/>
              <rect x="12.5" y="27.5" width="6.5" height="9" rx="1" fill="#232830" stroke="#0b0d10" stroke-width=".9"/>
              <!-- 細いスポーク2本(120°/230°) -->
              <path d="M33.4 29.6l8.6-11.4 1.7 1.2-8 12z" fill="#232830" stroke="#0b0d10" stroke-width=".7"/>
              <path d="M33.8 33.6l11 7.4-1 1.6-11.3-6.8z" fill="#232830" stroke="#0b0d10" stroke-width=".7"/>
              <!-- 標的指示のインデックス(回転が読める白マーク) -->
              <rect x="31.1" y="13.6" width="1.8" height="4" fill="#c8cdd2"/>
            </g>
            <!-- 赤い単眼(常時赤・識別はLED列に譲る) -->
            <circle cx="32" cy="32" r="7.6" fill="#0b0d10" stroke="#2c323a" stroke-width="1.2"/>
            <circle cx="32" cy="32" r="5.4" fill="#26090b"/>
            <circle cx="32" cy="32" r="3.1" class="sv-eye"/>
            <circle cx="30.9" cy="30.9" r="1" fill="rgba(255,255,255,.55)"/>
            <!-- 単眼のスキャンライン(待機の監視・fx0/reducedで停止) -->
            <g class="sv-scan-clip"><rect x="24" y="31.4" width="6" height="1.2" class="sv-scan"/></g>
            <!-- ステータスLED列(角ブラケット・オート=緑点灯=機械の目が起動・直感アンカー) -->
            <path d="M14 18.6v10h4v-10z" fill="#12151a" stroke="#0b0d10" stroke-width=".8"/>
            <rect x="15" y="19.8" width="2" height="2" class="sv-led"/>
            <rect x="15" y="23" width="2" height="2" class="sv-led"/>
            <rect x="15" y="26.2" width="2" height="2" class="sv-led"/>
          </svg>`;
      },
    },
    // 静寂の水圧呼吸(ID7 メアリス=水中都市)。crank.md §3.4/§4.5:
    // 穏やかで満ちた水の機構。引き算が品位(ゲージ・力み・派手さを足さない)
    abyss: {
      id: "abyss",
      dialClass: "skin-abyss",
      face() {
        return `
          <svg viewBox="0 0 64 64" class="fd-svg" aria-hidden="true">
            <defs>
              <radialGradient id="ab-water" cx=".42" cy=".3" r="1">
                <stop offset="0" style="stop-color:#2c5468"/>
                <stop offset="1" style="stop-color:#12293a"/>
              </radialGradient>
            </defs>
            <!-- 耐圧舷窓の枠(静・穏やかなリベット) -->
            <circle cx="32" cy="32" r="27" fill="#2c4a58"/>
            <circle cx="32" cy="32" r="27" fill="none" stroke="#16303c" stroke-width="1.6"/>
            <g fill="#4a6a76">
              <circle cx="32" cy="7.6" r="1.1"/><circle cx="49.3" cy="14.7" r="1.1"/>
              <circle cx="56.4" cy="32" r="1.1"/><circle cx="49.3" cy="49.3" r="1.1"/>
              <circle cx="32" cy="56.4" r="1.1"/><circle cx="14.7" cy="49.3" r="1.1"/>
              <circle cx="7.6" cy="32" r="1.1"/><circle cx="14.7" cy="14.7" r="1.1"/>
            </g>
            <!-- 窓の中の水 -->
            <circle cx="32" cy="32" r="21.5" fill="url(#ab-water)"/>
            <circle cx="32" cy="32" r="21.5" fill="none" stroke="#16303c" stroke-width="1.2"/>
            <!-- 水中光のコースティクス(やわらかい明滅・fx0/reducedで停止) -->
            <ellipse cx="26" cy="24" rx="12" ry="7" fill="rgba(170,220,235,.22)" class="ab-caustic"/>
            <ellipse cx="40" cy="40" rx="9" ry="5.5" fill="rgba(170,220,235,.14)" class="ab-caustic c2"/>
            <!-- 回る主体: 4枚羽のハッチホイール(.fd-wheel) -->
            <g class="fd-wheel">
              <circle cx="32" cy="32" r="15" fill="none" stroke="#52707a" stroke-width="2.6"/>
              <path d="M32 30.6c-4-1.8-8.4-1.4-12.6 1.4 4.2 2.8 8.6 3.2 12.6 1.4z" fill="#5f7e88" opacity=".9"/>
              <path d="M33.4 32c1.8-4 1.4-8.4-1.4-12.6-2.8 4.2-3.2 8.6-1.4 12.6z" fill="#5f7e88" opacity=".9"/>
              <path d="M32 33.4c4 1.8 8.4 1.4 12.6-1.4-4.2-2.8-8.6-3.2-12.6-1.4z" fill="#5f7e88" opacity=".9"/>
              <path d="M30.6 32c-1.8 4-1.4 8.4 1.4 12.6 2.8-4.2 3.2-8.6 1.4-12.6z" fill="#5f7e88" opacity=".9"/>
              <circle cx="32" cy="32" r="4.6" fill="#c9d6da" stroke="#52707a" stroke-width="1"/>
              <circle cx="32" cy="18.4" r="1.4" fill="#e8f0f2"/>
            </g>
            <!-- 気泡がゆっくり昇る(8秒/粒・fx0/reducedで停止) -->
            <circle cx="24" cy="46" r="1.6" fill="none" stroke="rgba(200,230,245,.55)" stroke-width=".9" class="ab-bub"/>
            <circle cx="38" cy="48" r="1.1" fill="none" stroke="rgba(200,230,245,.45)" stroke-width=".8" class="ab-bub b2"/>
            <circle cx="31" cy="50" r="1.3" fill="none" stroke="rgba(200,230,245,.5)" stroke-width=".8" class="ab-bub b3"/>
            <!-- ガラスの照り(静) -->
            <path d="M18 20a18 18 0 0 1 15-7" fill="none" stroke="rgba(230,245,250,.16)" stroke-width="2.6" stroke-linecap="round"/>
            <!-- 水中照明(縁の小さな灯・オート=やわらかな緑・直感アンカー) -->
            <path d="M46.5 10.5l5 3.4" stroke="#16303c" stroke-width="2.6"/>
            <circle cx="49" cy="12.2" r="3" fill="#24404c" stroke="#16303c" stroke-width="1"/>
            <circle cx="49" cy="12.2" r="1.7" class="ab-lamp"/>
          </svg>`;
      },
    },
    // 神器の舞(ID6 ユンガ=祭祀の密林)。crank.md §3.4/§4.5:
    // クランク=食料をもたらす神。背景の祭壇の御神体と同じ意匠の車輪が実際に回る
    shrine: {
      id: "shrine",
      dialClass: "skin-shrine",
      face() {
        // 奉納の布(房): 輪の縁から4枚垂れ、回転とともに巡る(各房は揺れの入れ子)
        let tassels = "";
        for (let i = 0; i < 4; i++) {
          const deg = 45 + i * 90;
          tassels += `<g transform="rotate(${deg} 32 32) translate(32 13.5)"><g class="sh-tassel t${i}">
            <path d="M-2 0l.6 7.5q1.4 1.5 2.8 0L2 0z" fill="#b8563a"/>
            <path d="M-2 0h4" stroke="#8a3a26" stroke-width="1"/>
          </g></g>`;
        }
        return `
          <svg viewBox="0 0 64 64" class="fd-svg" aria-hidden="true">
            <!-- 祠の台座(濃い木・彫りの環) -->
            <circle cx="32" cy="32" r="27" fill="#3a2c1a"/>
            <circle cx="32" cy="32" r="27" fill="none" stroke="#241a0e" stroke-width="1.8"/>
            <circle cx="32" cy="32" r="24.2" fill="none" stroke="#5a4526" stroke-width="1.2" stroke-dasharray="3.4 2.6"/>
            <!-- 朱の飾り紐(左右) -->
            <path d="M8.5 24c-2 5-2 11 0 16" fill="none" stroke="#b8563a" stroke-width="2.2"/>
            <path d="M55.5 24c2 5 2 11 0 16" fill="none" stroke="#b8563a" stroke-width="2.2"/>
            <!-- ドクロの護符(下・小さく=畏敬) -->
            <g transform="translate(32 56)">
              <circle r="3.4" fill="#d8cfb8"/>
              <circle cx="-1.3" cy="-.4" r=".9" fill="#241a0e"/>
              <circle cx="1.3" cy="-.4" r=".9" fill="#241a0e"/>
              <path d="M-1.6 1.8h3.2" stroke="#241a0e" stroke-width=".9"/>
            </g>
            <!-- 回る主体: 御神体の車輪(祭壇と同じ意匠=金環+4本スポーク) -->
            <g class="fd-wheel">
              <circle cx="32" cy="32" r="16.5" fill="none" stroke="#c9a86a" stroke-width="3"/>
              <circle cx="32" cy="32" r="16.5" fill="none" stroke="#8a6f3e" stroke-width=".9" stroke-dasharray="2 2.4"/>
              <g stroke="#6a4a2c" stroke-width="3.4" stroke-linecap="round">
                <path d="M32 32L43 21M32 32L21 21M32 32L21 43M32 32L43 43"/>
              </g>
              <g fill="#c9a86a">
                <circle cx="43.6" cy="20.4" r="1.7"/><circle cx="20.4" cy="20.4" r="1.7"/>
                <circle cx="20.4" cy="43.6" r="1.7"/><circle cx="43.6" cy="43.6" r="1.7"/>
              </g>
              ${tassels}
            </g>
            <!-- 御神体の翡翠(中心・オート=祭壇と同じ色に灯る・直感アンカー) -->
            <circle cx="32" cy="32" r="5.4" fill="#241a0e" stroke="#c9a86a" stroke-width="1.6"/>
            <circle cx="32" cy="32" r="3" class="sh-jewel"/>
            <!-- 獅子仮面(頂き・タップで顎がカッと開く) -->
            <g transform="translate(32 7)">
              <path d="M-7.5 1.5Q-8.5 -4.5 -3.5 -5.5L3.5 -5.5Q8.5 -4.5 7.5 1.5Q4.5 3.5 0 3.5Q-4.5 3.5 -7.5 1.5z" fill="#b8563a" stroke="#241a0e" stroke-width="1.1"/>
              <circle cx="-3" cy="-1.4" r="1.2" fill="#ffd27a"/>
              <circle cx="3" cy="-1.4" r="1.2" fill="#ffd27a"/>
              <path d="M-6.5 -5l-2 -2.6M6.5 -5l2 -2.6" stroke="#c9a86a" stroke-width="1.4"/>
              <g class="sh-jaw"><path d="M-4.5 2.6Q0 5.6 4.5 2.6L3.5 5.4Q0 7.4 -3.5 5.4z" fill="#8a3a26" stroke="#241a0e" stroke-width=".9"/></g>
            </g>
          </svg>`;
      },
    },
    // 金鈴の残響(ID4 パルス=古代古墳)。crank.md §3.4/§4.5・全10素材の掉尾:
    // 主役は回転中でなく静止後の余韻(石ID10=回転の重さ、との時間軸分離)。古金+緑青
    tomb: {
      id: "tomb",
      dialClass: "skin-tomb",
      face() {
        // 宝輪の飾りスポーク6本(雫形の先飾り)
        let spokes = "";
        for (let i = 0; i < 6; i++) {
          spokes += `<g transform="rotate(${i * 60} 32 32)">
            <path d="M32 27.5V19.5" stroke="#8a7440" stroke-width="2.2"/>
            <path d="M32 15.6c1.6 1.6 1.6 3.4 0 4.6-1.6-1.2-1.6-3 0-4.6z" fill="#a8905a"/>
          </g>`;
        }
        return `
          <svg viewBox="0 0 64 64" class="fd-svg" aria-hidden="true">
            <!-- 石の外枠(玄室の石組み)+古金の象嵌環 -->
            <circle cx="32" cy="32" r="27" fill="#443f33"/>
            <circle cx="32" cy="32" r="27" fill="none" stroke="#28241b" stroke-width="1.8"/>
            <circle cx="32" cy="32" r="24" fill="none" stroke="#8a7440" stroke-width="1.6"/>
            <circle cx="32" cy="32" r="24" fill="none" stroke="rgba(111,184,160,.35)" stroke-width="1.6" stroke-dasharray="4 15"/>
            <path d="M12 15l4 5M50 47l-3.4-4.4" stroke="rgba(111,184,160,.4)" stroke-width="2"/>
            <!-- 回る主体: 古金の宝輪(くすんだ金+緑青の斑=長い時を経た王の金) -->
            <g class="fd-wheel">
              <circle cx="32" cy="32" r="16.5" fill="none" stroke="#a8905a" stroke-width="3.2"/>
              <circle cx="32" cy="32" r="16.5" fill="none" stroke="#6b5a34" stroke-width="1" stroke-dasharray="2.6 2"/>
              ${spokes}
              <path d="M44.5 24a14.5 14.5 0 0 1 2.6 5" fill="none" stroke="rgba(111,184,160,.55)" stroke-width="3"/>
              <path d="M20 42.8a14.5 14.5 0 0 1-2.2-3.4" fill="none" stroke="rgba(111,184,160,.45)" stroke-width="2.6"/>
              <circle cx="32" cy="15.5" r="1.3" fill="#d8c894"/>
            </g>
            <!-- 玄室の窓(中心・オート=燐火が灯る・直感アンカー) -->
            <circle cx="32" cy="32" r="6.2" fill="#171410" stroke="#8a7440" stroke-width="1.4"/>
            <path d="M32 29.4c1.5 1.5 1.9 2.9 1 4.3-.6 1-2 1.4-3 .8-1.4-.8-1.5-2.5-.4-4 .6-.8 1.4-1.1 2.4-1.1z" class="tb-wisp"/>
            <!-- 金鈴(左右・紐で垂れる。静止後の残響の主役) -->
            <g transform="translate(13.5 44.5)"><g class="tb-bell b1">
              <path d="M0 0v3.6" stroke="#6b5a34" stroke-width="1"/>
              <path d="M-3.2 8.2q0-4.6 3.2-4.6t3.2 4.6l1 1.8h-8.4z" fill="#b89c62" stroke="#6b5a34" stroke-width=".9"/>
              <circle cx="0" cy="10.8" r="1" fill="#8a7440"/>
            </g></g>
            <g transform="translate(50.5 44.5)"><g class="tb-bell b2">
              <path d="M0 0v3.6" stroke="#6b5a34" stroke-width="1"/>
              <path d="M-3.2 8.2q0-4.6 3.2-4.6t3.2 4.6l1 1.8h-8.4z" fill="#b89c62" stroke="#6b5a34" stroke-width=".9"/>
              <circle cx="0" cy="10.8" r="1" fill="#8a7440"/>
            </g></g>
          </svg>`;
      },
    },
  },

  // 現在の惑星に対応するスキン(未割り当てはdefault)
  current() {
    const pid = Game.currentStage ? Game.currentStage().id : 0;
    return this.skins[this.byPlanet[pid]] || this.skins.default;
  },
};
