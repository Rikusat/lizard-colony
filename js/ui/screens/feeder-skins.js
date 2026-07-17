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
    1: "default", 2: "neon", 3: "clock", 4: "default", 5: "default",
    6: "default", 7: "default", 8: "default", 9: "default",
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
  },

  // 現在の惑星に対応するスキン(未割り当てはdefault)
  current() {
    const pid = Game.currentStage ? Game.currentStage().id : 0;
    return this.skins[this.byPlanet[pid]] || this.skins.default;
  },
};
