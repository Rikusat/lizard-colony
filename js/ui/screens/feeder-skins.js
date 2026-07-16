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
  // 惑星ID→スキンID(Phase 2で確定表をcrank.mdへ。現状は全惑星default)
  byPlanet: {},

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
  },

  // 現在の惑星に対応するスキン(未割り当てはdefault)
  current() {
    const pid = Game.currentStage ? Game.currentStage().id : 0;
    return this.skins[this.byPlanet[pid]] || this.skins.default;
  },
};
