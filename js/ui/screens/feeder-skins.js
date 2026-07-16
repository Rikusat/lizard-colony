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
    1: "default", 2: "default", 3: "default", 4: "default", 5: "default",
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

    // 羅針盤(砂漠=古代遺跡の原初機構)。crank.md §3.4。割り当てはRic確定待ち(ハーネスで強制可)
    compass: {
      id: "compass",
      dialClass: "skin-compass",
      face() {
        const fx = CFG.crankFxLevel > 0;
        return `
          <svg viewBox="0 0 64 64" class="fd-svg" aria-hidden="true">
            <defs>
              <linearGradient id="cp-stone" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style="stop-color:#6b5d42"/>
                <stop offset=".5" style="stop-color:#4a4234"/>
                <stop offset="1" style="stop-color:#2c261c"/>
              </linearGradient>
              <radialGradient id="cp-bronze" cx=".4" cy=".32" r=".95">
                <stop offset="0" style="stop-color:#8a7146"/>
                <stop offset=".65" style="stop-color:#5d4a2c"/>
                <stop offset="1" style="stop-color:#3a2f1c"/>
              </radialGradient>
              <linearGradient id="cp-gold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style="stop-color:var(--amber-400)"/>
                <stop offset="1" style="stop-color:var(--amber-600)"/>
              </linearGradient>
            </defs>
            <!-- 風化した石環(静)+刻印+ひび -->
            <circle cx="32" cy="32" r="25.5" fill="url(#cp-stone)"/>
            <circle cx="32" cy="32" r="25.5" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="1.6"/>
            <g stroke="rgba(20,16,10,.7)" stroke-width="1.4" stroke-linecap="round">
              <path d="M32 7v3.2M32 53.8V57M7 32h3.2M53.8 32H57M14.7 14.7l2.2 2.2M47.1 47.1l2.2 2.2M49.3 14.7l-2.2 2.2M16.9 47.1l-2.2 2.2"/>
            </g>
            <path d="M10 24c3 1.5 4 4 3.5 7M50 45c1.8-.6 4-.2 5.5 1.4" fill="none" stroke="rgba(0,0,0,.4)" stroke-width="1"/>
            <!-- 彫刻帯(多層・待機で微かに逆行) -->
            <g class="cp-band${fx ? "" : " fx0"}">
              <circle cx="32" cy="32" r="20.5" fill="none" stroke="rgba(216,195,165,.28)" stroke-width="2.4"
                stroke-dasharray="1.6 3.4 4.2 3.4"/>
              <path d="M32 10.2l1.1 2.2h-2.2zM53.8 32l-2.2 1.1v-2.2zM32 53.8l-1.1-2.2h2.2zM10.2 32l2.2-1.1v2.2z"
                fill="rgba(216,195,165,.35)"/>
            </g>
            <!-- 方位盤(回る主体=.fd-wheel) -->
            <g class="fd-wheel">
              <circle cx="32" cy="32" r="16" fill="url(#cp-bronze)"/>
              <circle cx="32" cy="32" r="16" fill="none" stroke="rgba(0,0,0,.5)" stroke-width="1"/>
              <circle cx="32" cy="32" r="13" fill="none" stroke="rgba(216,195,165,.25)" stroke-width=".8" stroke-dasharray="1 2.3"/>
              <!-- 八芒ローズ(長4+短4) -->
              <g fill="url(#cp-gold)">
                <path d="M32 18l2.4 11.6L32 32l-2.4-2.4z"/>
                <path d="M46 32l-11.6 2.4L32 32l2.4-2.4z"/>
                <path d="M32 46l-2.4-11.6L32 32l2.4 2.4z"/>
                <path d="M18 32l11.6-2.4L32 32l-2.4 2.4z"/>
              </g>
              <g fill="rgba(216,195,165,.5)">
                <path d="M41.9 22.1 33.7 30.3 32 32l1.7-4.2z"/>
                <path d="M41.9 41.9 33.7 33.7 32 32l4.2 1.7z"/>
                <path d="M22.1 41.9l8.2-8.2L32 32l-1.7 4.2z"/>
                <path d="M22.1 22.1l8.2 8.2L32 32l-4.2-1.7z"/>
              </g>
              <!-- 磁鉄の針(待機で北を探して揺れる) -->
              <g class="cp-needle${fx ? "" : " fx0"}">
                <path d="M32 20.5l2 10.2-2 2.6-2-2.6z" fill="var(--paper-100)" opacity=".92"/>
                <path d="M32 43.5l-2-10.2 2-2.6 2 2.6z" fill="#241812"/>
              </g>
              <!-- 北極星石(オート中に緑へ=直感アンカー補強) -->
              <circle cx="32" cy="19.2" r="1.9" class="cp-north"/>
              <circle cx="32" cy="32" r="3.4" fill="url(#cp-gold)" stroke="rgba(0,0,0,.45)" stroke-width=".8"/>
              <circle cx="32" cy="32" r="1.2" fill="var(--paper-100)" opacity=".85"/>
            </g>
            <!-- 水晶ドームの照り(静) -->
            <path d="M14 22a20 20 0 0 1 22-9" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="3" stroke-linecap="round"/>
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
