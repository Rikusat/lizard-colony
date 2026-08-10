"use strict";
// ============================================================
// トカゲコロニー: マスターデータ / バランス定数
// ============================================================

const SAVE_VERSION = 15; // v15: Phase10 惑星の完全独立。自動移行バグで焼き付いた他惑星種を除去(再純血化)+空惑星に固有ペア再配置。v14→v15

const CFG = {
  saveKey: "lizardColonySaveV1",
  saveBackupKey: "lizardColonyV1Backup",   // V2以前→V3移行前のバックアップ
  saveBackupKeyV3: "lizardColonyV3Backup", // V3→V4移行前のバックアップ
  saveBackupKeyV4: "lizardColonyV4Backup", // V4→V4.1移行前のバックアップ(ロールバック用)
  saveBackupKeyV5: "lizardColonyV5Backup", // V4.1→V5移行前のバックアップ(コオロギ共通化)
  saveBackupKeyV6: "lizardColonyV6Backup", // V5→V6移行前のバックアップ(コオロギ→Gold払い戻し)
  saveBackupKeyV7: "lizardColonyV7Backup", // V6→V7移行前のバックアップ(コオロギ給餌の復活)
  saveBackupKeyV8: "lizardColonyV8Backup", // V7→V8移行前のバックアップ(ボス見届け化・今すぐ呼ぶ1日制限)
  saveBackupKeyV9: "lizardColonyV9Backup", // V8→V9移行前のバックアップ(純血化=破壊的。必ずロールバック可能に)
  saveBackupKeyV10: "lizardColonyV10Backup", // V9→V10移行前のバックアップ(純血化の追補=混入個体の再掃除。ロールバック可能に)
  saveBackupKeyV11: "lizardColonyV11Backup", // V10→V11移行前のバックアップ(賢者の石追加=非破壊だが方針どおり退避)
  saveBackupKeyV12: "lizardColonyV12Backup", // V11→V12移行前のバックアップ(シェルター撤廃+Gold払戻。方針どおり退避=ロールバック可)
  saveBackupKeyV13: "lizardColonyV13Backup", // V12→V13移行前のバックアップ(餌場/繁殖撤廃+効果を巣へ統合+Gold払戻。ロールバック可)
  saveBackupKeyV14: "lizardColonyV14Backup", // V13→V14移行前のバックアップ(Phase6 惑星味方への旧味方Lv移送。ロールバック可)
  saveBackupKeyV15: "lizardColonyV15Backup", // V14→V15移行前のバックアップ(Phase10 再純血化=自動移行汚染の除去+空惑星再配置。ロールバック可)
  startCoins: 500,
  startStones: 0,           // 賢者の石(四重スリット装置のレア報酬・保有のみ・用途は後日)。新規は0

  startCrickets: 20,
  startGems: 3,
  cricketCost: 10,          // コオロギ1匹の価格
  feedXp: 10,               // 餌1匹あたりのXP
  babyXpToAdult: 50,        // ベビー→アダルトに必要なXP
  adultXpPerLevel: 100,     // アダルトのレベルアップ必要XP
  levelAtkMult: 0.15,       // レベルごとの攻撃倍率
  levelIncomeMult: 0.12,    // レベルごとの収益倍率
  eggSlots: 3,
  hatchBasePerStar: 45,     // 孵化秒数 = これ × 種族の星
  breedBaseCost: 100,       // 繁殖コスト = これ × 高い方の星
  breedCooldown: 90,        // 繁殖クールダウン(秒)
  capacityBase: 10,
  capacityPerRank: 2,
  raidInterval: 120,        // 襲撃周期(秒)
  raidDuration: 45,         // 蛇が諦めるまでの秒数
  biteIntervalBase: 8,      // 蛇の噛みつき間隔(秒)
  injuryTime: 60,           // 負傷回復までの秒数(尾の再生もこの時間で完了=§9.1)
  autoTailSec: 3.5,         // §9.1 切り離された尾が地面でくねって消えるまでの秒数
  autoPanicSec: 1.4,        // §9.1 自切直後の逃走ダッシュ秒数(以後は負傷で鈍足)
  centerNoticeSec: 1.6,     // §9-C4 中央の軽い通知の表示秒数(短く・実機で調整可)
  centerNoticeQueue: 1,     // §9-C4 中央通知の待ち行列上限(超過分は古いものを捨てる=トースト化させない)
  planetTravelSec: 3.0,     // ⑥ 惑星移動の演出秒数(スキップ不可=待ち時間そのものが宇宙の広さの表現。旧1.4は近すぎた)。実機で調整
  planetTravelReducedSec: 1.2, // reduced-motion時(星流の演出なし=短縮するが即0にはしない)
  bossEvery: 5,             // n回撃退ごとにボス
  bossCallPerDay: 3,        // 3.11.3: 「今すぐ呼ぶ」の1日あたり回数(端末ローカル日付で回復)
  bossHpMult: 1.0,          // 3.11.5: ボスHPの一時調整枠(味方削除の難化はまず等倍で。きつければ下げる)
  mutationSpeciesChance: 0.05, // 上位種族への突然変異率
  mutationMorphChance: 0.08,   // モーフ突然変異率
  offlineCapHours: 24,      // オフライン進行の上限(V3 §3.4。研究で延長)
  offlineRate: 0.5,         // オフライン収益倍率(ブラウザを閉じていた時間・ロード時一括精算)
  awayStageIncomeRate: 1.0, // V5: 留守コロニーの常時生産倍率(1=フル。インフレ調整は支出側で)
  feedGoldCost: 10,         // V5.1: 給餌1回のGoldコスト(旧: コオロギ1匹=10Gと等価)。V5.2ではコオロギ切れ時のGold換算補充単価に流用
  // ---- V5.2: コオロギ給餌の復活(Phase 3.9) ----
  reviveCrickets: 300,      // v6→v7移行で付与する初期在庫(払戻Goldは据置=資産プラスのみ・帰還後Ric調整)
  cricketLotBase: 50,       // 購入ロット(まとめ買い)の基準数。表示は常に1項目=このロット×ランク係数
  cricketLotPerRank: 10,    // ランクごとにロット数へ加算(項目数は増やさず数値だけ変化=ルーレット位置安定)
  cricketLowWarn: 100,      // 切れ時トグルOFF+オート中に在庫がこれ未満で警告ランプ点灯(2-5)

  // ---- 遺伝子ルーレット(roulette.md §7 v3.1・物理決定型パチンコ・全CFG化。手触りは実機で最終調整) ----
  // 空間・球(単位=シム座標。表現層はこれを画面へスケール)
  roulW: 150,               // 基準空間 幅
  roulH: 290,               // 基準空間 高さ
  roulBallR: 6.5,           // 球半径(v3: しっかりした球体。落下/跳ねが目で追える大きさ・#1)
  roulMaxBalls: 60,         // 同時飛行の球数上限(性能)
  // 物理(決定論・固定dtアキュムレータ積分)
  roulFixedDt: 0.008,       // 物理積分の固定タイムステップ(秒)。フレーム非依存=決定論
  roulGravity: 900,         // 重力加速度(単位/秒^2)。自由落下は加速する(§1.3トレードオフ)
  roulRestitution: 0.5,     // 釘との反発係数(0=吸収 1=完全弾性)
  roulWallRestitution: 0.55,// 左右壁の反発係数
  roulNailJit: 6,           // 釘反射時に接線方向へ加える微小ジッタ(単位/秒・カオスの源。単一シード)
  // 発射(上部中央付近・初速に単一シードのばらつき)
  roulLaunchXf: 0.5,        // 発射x(W比・中央)
  roulLaunchXJitf: 0.05,    // 発射xの左右ばらつき(W比)
  roulInitVy: 18,           // 初速(下向き・単位/秒)
  roulInitVxJit: 16,        // 初速の横ばらつき(±・単位/秒)
  // レール区間(導入部・roulette_rules.md §1): 可視の溝(ファネル状シュート)を球が沿って走る→解放点でフリーフォール
  roulRailEndYf: 0.24,      // レール終端=解放点(H比)。ここまではシュート壁で反射しながら加速
  roulChuteTopHalff: 0.30,  // シュート上端の半幅(W比・広い=発射を受け止める)
  roulChuteBotHalff: 0.085, // シュート下端の半幅(W比・狭い=中央へ送り出す)
  roulChuteRestitution: 0.4,// シュート壁の反発(球が壁沿いに走る手触り)
  // 釘(千鳥格子・控えめ/球が主役・#設計2)
  roulNailTopf: 0.30,       // 釘場の上端(H比)
  roulNailBotf: 0.78,       // 釘場の下端(H比)
  roulNailRows: 7,          // 釘の行数
  roulNailCols: 6,          // 釘の列数(奇数行は半ピッチずらす=千鳥)
  roulNailR: 2.0,           // 釘半径(小さめ=控えめ)
  roulNailMarginf: 0.12,    // 釘場の左右マージン(W比)
  // 着地と穴(中央=極細の虹穴、その左右を景品穴が挟む・#設計1)
  roulLandYf: 0.90,         // 着地ライン(H比)。ここで着地xを判定
  roulHoleCenterf: 0.5,     // 穴群の中心x(W比・中央)
  roulRainbowHalfWf: 0.06,  // 虹穴の半幅(W比)。中央±この幅=大当たり(新種)。Phase3.13報酬文脈MC: 0.06で虹2.59%(1/39)
  roulPrizeOuterf: 0.215,   // 景品帯の外側|dx|(W比)。虹穴の外〜ここまで=卵、外側はハズレ。Phase3.13報酬文脈MC: 0.215で卵28.2%(1/3.5)
  roulSplitNailAbove: true, // 虹穴の真上に振り分け釘を1本置く(球を左右へ弾く=ニアミス多発)
  // 受け皿(roulette_rules.md §2): 入賞球はコトンと収まる/ハズレは受け皿なし=流れて消える
  roulCupDepthf: 0.055,     // 受け皿の深さ(H比・landYの下に描く器)
  roulSettleT: 0.34,        // 入賞球が受け皿に収まって留まる秒数(コトンの間→onEgg発火)
  roulSettleDamp: 0.6,      // 収まり時の速度減衰(跳ねを抑えて器へ沈める)
  // ── 三層の関門(roulette.md §1.2.3拡張): 中央ステージ(谷型棚+摩擦+中央スリット+開放端)+ワープ穴 ──
  // 谷の復元力=重力の分力。摩擦で減速し、中央スリット落下(=中央ポケット)or 端から転落(=脇/ハズレ)を
  // 物理的必然で決める(結果の事前確定なし・見えている落下がそのまま真実)。値はMCで追い込む初期値
  roulStageOn: true,        // 三層の関門を使うか(false=旧・landing直判定に戻せる安全弁)
  roulStageYf: 0.80,        // ステージ棚の高さ(H比・釘の海の下0.78〜landY0.90の間)
  roulStageHalfWf: 0.10,    // 棚の半幅(W比・これ以内に達した球が棚に乗る=第一関門)
  roulStageValley: 0.9,     // 谷の復元加速度係数(中央へ戻す力・大=強い谷=中央に集めやすい)
  roulStageFriction: 0.2,  // 棚上の摩擦(/秒・大=速く減衰=早く落ち着く=中央寄り)
  roulStageSlotHalff: 0.018,// 中央スリットの半幅(W比・これ以内かつ低速で落下=中央ポケット)
  roulStageSlotVmax: 7,    // スリットから落ちる速度上限(単位/秒・これ以下で通過中なら落ちる)
  roulStageMaxT: 6.0,       // 棚上滞在の最大秒(安全弁・超過で中央へ落とす=stuck防止)
  roulWarpYf: 0.50,         // ワープ穴の高さ(H比・釘の海の中ほど)
  roulWarpXf: 0.17,         // ワープ穴の中心x(cx±これ・W比)
  roulWarpHalfWf: 0.0015,    // ワープ穴の半幅(W比・小=滅多に入らない)
  // Phase3.13: ルーレットはボス討伐後の報酬(給餌連動の常時発射は撤廃・roulette.md §1.2 v4)
  roulRewardEmitInterval: 0.35, // 報酬モードの球射出間隔(秒・長押し/スキップの自動発射ペース)
  roulRewardBalls: { 0: 8, 1: 10, 2: 16, 3: 22, 4: 28, 5: 34, 6: 40 }, // ボスTier別の報酬球数(見届けた強敵ほど厚い)
  roulRewardEliteBonus: 12, // Phase10.3: 大ボス(elite)は出球が増える(報酬が厚い)。★たたき台=Ric調整可
  // R2-1(2026-07-25): 景品=鉱物テーブル(★たたき台=Ric調整)。旧卵系キー(OverflowGold/RareMorphChance/RareEggBonusLv)は退役=git記録
  roulPrizeNormal: { win: { gems: 1 }, rainbow: { amethyst: 1 } },   // 通常ボス: 景品帯=◇ダイヤ / 虹=⬡アメジスト
  roulPrizeElite: { win: { amethyst: 1 }, rainbow: { stones: 1 } },  // 大ボス: 景品帯=⬡ / 虹=●賢者の石
  // §1.2.2 中央ポケットの景品(盤geometryは共通・景品のみボス格で差替): 通常ボス=レア卵 / 大ボス(elite)=虹(新種)
  // C2演出(ヒーローオーバーレイ): 撃破の余韻→間→せり上がり→撃つ→集計→退場
  roulRewardDelaySec: 1.5,  // ボス撃破→報酬盤せり上がりまでの「間」(余韻・実機で1.2〜1.8を詰める)
  roulRewardTallySec: 0.5,  // §9.2: 全球落下後の余韻(内部の状態遷移用・短縮)
  roulAutoCloseSec: 1.0,    // 裁定②: 報酬確定(付与+集計完了)→自動クローズまでの猶予(0=即時・猶予中タップで即閉)。旧roulResultSec(3.0)を置換
  // §1.2.3 モーダル内クランクの射出間隔 低/中/高(秒)。長押し連射・オート射出で共通。
  // 「見ていられる速さ」を守る(給餌のdialRates高=0.15sは速すぎるので別値)。レートで手触りを変える
  roulRewardRateInterval: [0.7, 0.5, 0.32],

  // ── 四重スリット実験的瞬間遺伝決定装置(roulette.md §9・左メニュー下部・クランク稼働で作動) ──
  // 同心円レール(外→内)+基準角に整列した入れ子スリット(外ほど広く内ほど狭い narrowing corridor)。
  // 外縁の360°ランダム位置から中心へ放射状に射出。角度が各円のスリット内なら通過、外れた最外円で消滅。
  // 全通過=中心到達=成功(賢者の石)。結果は射出角θ(単一シード)と幾何から創発(事前確定なし)。
  slitRings: 4,             // 円の数(§Q1: 2-3=緊張短い/5-6=高揚長い。4=バランス)
  slitRadiif: [0.92, 0.68, 0.44, 0.2], // 各円の半径(装置半径比・外→内)
  // 各円は独立回転する(§9.1/§9.5食)。回転で全スリット同時整列が必要=通過は各円ほぼ独立→成功≈∏(半角/180)。
  slitHalfDeg: [54, 28, 16, 10],       // 各円の切れ目の半角(度)。外=54(通過30%=70%弾き)。内へ急に狭め、成功を"食"級に稀少化(§9.5)。
                                       // 回転MC確定(N=60万): 成功≈1/3900・弾かれ ring1:70/ring2:25/ring3:4/ring4:0.4・ring2到達30%/ring3到達4.7%/ring4到達0.4%(奥ほど減=惜しさ保持)
  // 回転速度は【無理数比 1:√2:√3:√5】で設計(§9.5)=完全整列の周期が事実上無限・同じ並びを二度繰り返さない
  // ("理論上は必ず起こるが事実上ほとんど起こらない"=食)。時間の純関数で決定論(固定dt累積)・ウォールクロック非依存。
  slitSpinDeg: [3.3, -4.667, 5.716, -7.379], // =3.3×[1, -√2, √3, -√5]。目立たない低速(1周49〜109秒)・向き混在。
  slitFixedDt: 0.008,      // 回転/前進の固定積分ステップ(秒)=フレーム非依存の決定論
  slitBaseAngleDeg: 90,    // スリットの基準角(度・t=0の位置)。将来は惑星別も可
  slitBallSpeedf: 2.2,     // 球の内向き速度(装置半径/秒・ほぼレーザー。約0.5秒で決着)
  slitCooldownSec: 1.2,    // クランク稼働時の作動クールダウン(§9.5: 頻度を大幅up=待つ間もよく撃つ。1発の主張は控えめ)
  // 失敗球の張り付き寿命=到達の深さに比例(§④・レーン別・秒)。index=弾かれた円(0=最外)。0=記録しない(即消滅)。
  // lane1(0)即消滅 / lane2(1)1秒→点滅消滅 / lane3(2)10秒 / lane4(3)1分。奥ほど価値ある記録=長く残る=殿堂の純度up
  slitStickSec: [0, 1, 10, 60],
  // 初期位相のランダム化(S-SLIT-R・Ric承認 2026-07-27)。従来は reset() で _time=0 =「切れ目が完全整列した同じ盤面」から
  //   必ず始まり、直後の成功率が定常の約240倍だった(惑星往復で石を稼げる不公平な経路)。開始を軌道上のランダムな一点にして是正。
  //   確率は装置本来の設計値 ∏(2*slitHalfDeg/360)=1/4339 へ揃う。false で従来挙動(_time=0)へ即復帰できる。
  slitStartPhaseRandom: true,
  slitStartPhaseMaxSec: 3600, // 初期位相の範囲(秒)。回転比が無理数比のため、この幅で相対配置は十分に混ざる
  // ===== C2 シネマティック HOLO BRIEFING =====================================================
  //   本部システムの起動ブリーフィング。様式の正本=docs/design/hq-holo-command-poc.html。
  //   C1(切り絵2D)の禁止事項は本アークに非適用: stroke/発光/グラデーションはHUDの必須語彙(§2-0)。
  //   唯一の禁則=「立体的な陰影で物体をリアルに見せる」用途に使わない。
  holoOn: true,
  holoGridSec: 0.4,          // ★リズムグリッド。カットの切替は必ずこの倍数に置く(§3-4)
  holoSkippable: true,       // ★クリック/タップ/キーで即時中断(確認を挟まない)
  holoGlitchRate: 0.10,      // ★グリッチの発生率(決定論・バケット判定)
  holoPal: { void: "#04060a", amber: "#ffb547", crim: "#d2384a", pale: "#dfe9ee" }, // 色は3色+虚空に厳しく制限
  holoFuseVariant: "beam",   // ★導火線の様式(C2改訂でRic採用=beam): "core"=深紅の芯線が走る / "beam"=走査ビームが横断する
  holoViewSpeeds: [1, 0.5, 0.25], // ★検分ビューア(?tune=1#opening)の再生速度。3.2秒は等速だと判定しづらいため低速を用意
  holoBeamTailF: 0.18,       // ★ビームが横断完了後に減衰して消える尾の割合(基準カットの欠陥=右端に留まる、の是正)
  // ---- C2 フェーズ2 オープニング「バガー暴走からの飛び立ち」(物語軸) ----
  //   前版の9ノード予告モンタージュは破棄。カットの切替は必ず 0.4秒グリッド上に置く(§3-4)。
  //   grid=そのノードが始まるグリッド番号(×holoGridSec 秒)。**尺の唯一の真実**=この表だけを直せば間合いが変わる。
  //   全8ノード+暗転2箇所(3→4の間 / 6の直後)。カット長(グリッド数)は 5,5,7,1,2 | 4,4,1,5,3 =
  //   同じ長さを3連続させない(§3-4 単調さの回避)。終端37=14.8秒は holoOpenMaxSec(15) の内側かつグリッド上。
  holoOpenNodes: [
    { id: "calm", grid: 0 },       // 1 静穏: 故郷が静かに回る。平常運転のテレメトリ
    { id: "anomaly", grid: 5 },    // 2 異常: 深紅の点が灯り、テレメトリが乱れ、警告が1つずつ増える
    { id: "rampage", grid: 10 },   // 3 暴走: 侵食が球面を走り覆う(案a=深紅の芯線の語彙を転用) / CONTAINMENT FAILED
    { id: "blackout", grid: 17 },  //   暗転(溜め・3→4の間)
    { id: "bagger", grid: 18 },    // 4 ヌシ・バガーの影(0.4秒=1グリッドだけ。長く見せない)
    { id: "decision", grid: 20 },  // 5 決断: HUDが退避計画へ切替。積載リスト(実データ)が高速で流れる
    { id: "launch", grid: 24 },    // 6 飛び立ち: ロケットが離れ、深紅に覆われた故郷が遠ざかり小さくなる
    { id: "blackout2", grid: 28 }, //   暗転(溜め・6の直後)
    { id: "route", grid: 29 },     // 7 航路: 十の星のワイヤーフレーム球(フェーズ1の惑星表示語彙を流用)
    { id: "title", grid: 34 },     // 8 題: トカゲコロニー / LIZARD COLONY → システム起動へ繋ぐ
    { id: "end", grid: 37 },       // 全編の終端(=14.8秒)
  ],
  holoOpenMaxSec: 15,        // ★全編の尺の上限(恒久テストのガード)。超える表を書いてもクランプされる
  holoOpenBaggerGrids: 1,    // ★バガーの露出グリッド数(1=0.4秒)。長く見せない
  // ---- 本編組み込み(初回起動時の自動再生・2026-08-01 Ric指示) ----
  //   false にすると自動再生だけが止まり、設定からの再視聴は残る=完全に可逆。
  //   再生済みフラグは dial(往復する器)の中。詳細は Game.migrateOpeningSeen / HANDOFF §5x-C2.5。
  openingAutoPlay: true,
  //   reduced-motion: 動かさず「最終画」(題+SYSTEM ONLINE)だけを静止表示する秒数。
  //   0だと1フレームで消えて何も伝わらないため、読める長さだけ保持する(スキップは即時のまま)。
  holoOpenReducedHoldSec: 3.0,
  // ---- C2改訂 フェーズ1: 惑星移動トランジション(頻発する導線=摩擦にしない) ----
  //   OFF(false)にすると従来の宇宙船トランジション(planetTravelSec)へ完全復帰する=可逆。
  holoTravelOn: true,
  holoTravelMaxSec: 1.2,     // ★尺の上限(恒久テストのガード)。これを超える値を下に書いてもクランプされる
  holoTravelFullSec: 1.10,   // ★初訪(惑星名・固有種2種・脅威型を表示)。実測の壁時計は+0.03秒前後→上限1.2sに余裕を残す
  holoTravelShortSec: 0.80,  // ★既訪(ビームの走査+惑星名のみ)
  holoTravelReducedSec: 0.45,// ★reduced-motion(静止画・情報は残す)
  holoTravelFullOnUnpioneered: true, // ★初回/既訪のしきい値: 未開拓(=初めて訪れる)なら情報表示ありの長い版。false=常に長い版
  // ===== W1 動的環境演出(天候) =====================================================================
  //   骨格=共通1つ / 意匠=惑星別。表示層のみ(経済・生産・繁殖・戦闘・確率・純血・魂・セーブに非接触)。
  //   サイクル: weatherCycleSec ごとに weatherChance の確率で1回だけ発生し、rise→hold→fall で終息する。
  //   決定論: 発生の有無・開始位置は hash(惑星id, バケット) で決まる(乱数不使用)=同一条件で同一の天候。
  //   D7(常時の漂う粒子)とは棲み分け: 天候中はD7を強度kに比例して減衰し、最盛時は完全停止=二重に降らない。
  weatherOn: true,          // ★天候システム全体のON/OFF
  weatherCycleSec: 150,     // ★1周期(秒)。この中で最大1回だけ天候が起きる
  weatherChance: 0.35,      // ★周期あたりの発生確率(既定)。惑星別に上書き可。控えめ=常時降らせない
  weatherRiseSec: 6,        // ★発生(強度0→1)
  weatherHoldSec: 20,       // ★継続(強度1)
  weatherFallSec: 8,        // ★終息(強度1→0)。合計34秒/150秒×0.35 ≒ 稼働率8%
  weatherMaxParticles: 90,  // ★粒子数の上限(負荷の天井。惑星別のnがこれを超えても切り詰める)
  weatherDefault: { n: 40, vy: 120, vx: 0, windAmp: 0, windSec: 7, rMin: 1, rMax: 2, alpha: 0.5, shape: "dot", haze: 0, str: 1,
    react: { look: 0, follow: 0, huddle: 0, relaxMult: 1 } },
  //   意匠パラメータ: n=粒子数 / vy=落下速度(負=上昇) / vx=基本風 / windAmp,windSec=風の強弱の時間変化
  //     shape= dot(砂・灰・埃) | line(雨) | flake(雪) | bubble(気泡) | beam(光条)
  //     tint=[r,g,b,a] 空の色味の上乗せ / haze=遠景の霞の濃さ / hazeCol=霞の色
  //     react: look=見上げる確率 / follow=降下物を目で追う確率 / huddle=巣口へ避難する割合 / relaxMult=くつろぎ率の倍率
  weatherByStage: {
    1:  { kind: "砂嵐",           n: 70, vy: 40,  vx: 260, windAmp: 120, windSec: 5.5, rMin: 0.8, rMax: 2.0, alpha: 0.52, shape: "dot",
          col: "rgba(250,238,206,1)", tint: [128, 92, 46, 0.26], haze: 0.26, hazeCol: [198, 162, 104], chance: 0.38,
          react: { look: 0.35, follow: 0.15, huddle: 0.45, relaxMult: 0.25 } },
    2:  { kind: "酸性雨",         n: 62, vy: 420, vx: 70,  windAmp: 40,  windSec: 6,   rMin: 0.9, rMax: 1.6, alpha: 0.40, len: 16, shape: "line",
          col: "rgba(150,230,235,1)", tint: [30, 60, 90, 0.24], haze: 0.10, hazeCol: [90, 150, 175],
          react: { look: 0.45, follow: 0.40, huddle: 0.55, relaxMult: 0.20 } },
    3:  { kind: "霧と木漏れ日",   n: 7,  vy: 6,   vx: 16,  windAmp: 8,   windSec: 11,  alpha: 0.22, shape: "beam", beamW: 30, beamSkew: 70,
          col: "rgba(252,255,226,1)", tint: [178, 200, 158, 0.18], haze: 0.30, hazeCol: [214, 226, 206], chance: 0.30,
          react: { look: 0.05, follow: 0, huddle: 0, relaxMult: 1.25 } },
    4:  { kind: "黄砂",           n: 66, vy: 55,  vx: 190, windAmp: 80,  windSec: 6.5, rMin: 0.7, rMax: 1.5, alpha: 0.34, shape: "dot",
          col: "rgba(246,230,182,1)", tint: [130, 100, 50, 0.22], haze: 0.30, hazeCol: [196, 166, 106],
          react: { look: 0.25, follow: 0.10, huddle: 0.35, relaxMult: 0.40 } },
    5:  { kind: "降灰と火の粉",   n: 54, vy: 46,  vx: 40,  windAmp: 34,  windSec: 8,   rMin: 0.9, rMax: 2.2, alpha: 0.44, shape: "dot",
          col: "rgba(198,190,182,1)", tint: [96, 34, 20, 0.24], haze: 0.16, hazeCol: [150, 96, 74],
          emberEvery: 9, emberCol: "rgba(255,150,60,1)",
          react: { look: 0.40, follow: 0.35, huddle: 0.50, relaxMult: 0.25 } },
    6:  { kind: "豪雨(スコール)", n: 82, vy: 520, vx: 110, windAmp: 60,  windSec: 4.5, rMin: 1.0, rMax: 1.8, alpha: 0.44, len: 22, shape: "line",
          col: "rgba(190,220,225,1)", tint: [20, 45, 40, 0.28], haze: 0.14, hazeCol: [120, 160, 150], chance: 0.42,
          react: { look: 0.50, follow: 0.45, huddle: 0.70, relaxMult: 0.15 } },
    7:  { kind: "気泡の上昇流",   n: 46, vy: -70, vx: 18,  windAmp: 14,  windSec: 9,   rMin: 1.2, rMax: 3.4, alpha: 0.34, shape: "bubble",
          col: "rgba(228,252,250,1)", tint: [36, 92, 104, 0.16], haze: 0.12, hazeCol: [140, 200, 200], chance: 0.32,
          react: { look: 0.30, follow: 0.50, huddle: 0, relaxMult: 1.10 } },
    8:  { kind: "吹雪",           n: 78, vy: 130, vx: 300, windAmp: 150, windSec: 4,   rMin: 1.0, rMax: 2.2, alpha: 0.72, shape: "flake",
          col: "rgba(255,255,255,1)", tint: [104, 138, 186, 0.30], haze: 0.30, hazeCol: [156, 184, 220], chance: 0.40,
          react: { look: 0.30, follow: 0.20, huddle: 0.75, relaxMult: 0.15 } },
    9:  { kind: "冷たい灰と放射霧", n: 40, vy: 34, vx: 26,  windAmp: 18,  windSec: 10,  rMin: 0.8, rMax: 1.8, alpha: 0.32, shape: "dot",
          col: "rgba(214,224,214,1)", tint: [46, 80, 66, 0.24], haze: 0.30, hazeCol: [120, 168, 146], chance: 0.34,
          react: { look: 0.15, follow: 0.10, huddle: 0.40, relaxMult: 0.35 } },
    10: { kind: "光の柱と舞う埃", n: 9,  vy: 10,  vx: 12,  windAmp: 6,   windSec: 12,  alpha: 0.20, shape: "beam", beamW: 22, beamSkew: 46,
          col: "rgba(255,244,206,1)", tint: [128, 100, 56, 0.16], haze: 0.18, hazeCol: [206, 176, 124], chance: 0.30,
          react: { look: 0.55, follow: 0.05, huddle: 0, relaxMult: 1.30 } },
  },
  weatherHuddleK: 0.55,     // ★この強度を超えると避難(巣口へ寄る)が発生する
  weatherLookSec: 2.2,      // ★見上げの持続(秒)
  weatherLookBucketSec: 5,  // ★見上げ/目追いの判定バケット(秒)
  weatherSpotLookMult: 0.6,   // ★居場所に居る個体の見上げ確率倍率(spotの向き指定は壊さず姿勢だけ)
  weatherHuddleSpeedMult: 1.8, // ★避難時の歩行速度倍率(ボス避難のnestFleeSpeedMultとは別枠=軽い急ぎ)
  // 中心=球の着地点/賢者の石の生成点。ここは常に最も明瞭であること(意匠の合格条件4)。
  slitCenterCoreF: 0.028,  // 中心コアの半径(装置半径R比)。表示そのもの。
  slitCenterClearF: 2.5,   // 中心の確保余白 = コア半径×この係数。全リングの描画はこの内側へ侵入してはならない(姿形QAが全惑星×全リングで実測)。
  slitStickMax: 12,        // 同時に残せる最大数(寿命が主限=実測平均5・稀なバースト最大18のみ抑制。超過は外側=浅い/古い順で消し内側優先)
  // 四重スリットの意匠パレット(惑星別・描画層のみ=物理/確率/石生成の聖域には非接触)。骨格(リング/縞/タイミング)は不変。
  //   色=[r,g,b]。rail=同心円レール/glow=整列予告の光条/center=中心の到達点/trace=失敗痕/traceRing=最内記録の環/laser=飛行球/bloom=成功の中心ブルーム。
  //   shape=リングの姿形。★合格条件1(Ric裁定): 輪郭そのものが円でないこと(線種・点線化・二重化で円をなぞるのは不可)。
  //     "ring"=円(原型) / "poly"=多角形(sides) / "organic"=有機曲線(wobAmp,wobLobes,wobAmp2,wobLobes2)
  //     "star"=星形(points,innerF=谷の半径比。直線的なくさびもこれで作る) / "gear"=歯車環(teeth,toothDepth,toothFrac,flankStripe=警戒縞を歯の側面に)
  //     "reuleaux"=ルーロー三角形(定幅曲線=回転しても隙間の読みが安定)。
  //     ※"segment"(分節)/"double"(二重)/"sign"(破線標識)/"trefoil"(重なる円の三葉)は**輪郭が真円のまま**のため却下・撤去済み。復活させないこと。
  //     いずれの形状も切れ目は「角度」で飛ばす=物理の角度窓(slit.js: 固定半径跨ぎ時に角度のみ照合)と厳密一致=見た目の隙間=粒子が通れる角度。
  //   rings=[r0,r1,r2,r3] でリング別に形状/色を指定(未指定なら惑星単位の単一shape)。4基に異なる幾何を割り当てると、
  //     異速度・逆回転で重なりが刻々と組み変わる=「回転しあう幾何」の本質(合格条件3)。複雑性は①=単一の円 → ⑩=最大複雑へ進行(合格条件2)。
  //     lwMul=線の太さ倍率。骨格(半径/切れ目角/回転)は不変=意匠のみ。合格条件4(中心の確保余白)は slitCenterCoreF/slitCenterClearF。
  slitSkinDefault: { shape: "ring", rail: [170, 214, 236], glow: [214, 236, 255], center: [226, 168, 192], trace: [205, 232, 246], traceRing: [230, 165, 190], laser: [220, 245, 255], bloom: [255, 215, 190] }, // 現行=青白の星図調・円環(原型)
  slitSkinByStage: {
    // 全10惑星の姿形+色(基準カット3惑星=②④⑧をRic承認→残り7惑星をバッチA/B/Cで展開)。
    1: { shape: "ring", rail: [214, 186, 134], glow: [214, 236, 255], center: [226, 240, 255], trace: [226, 200, 150], traceRing: [210, 232, 250], laser: [230, 244, 255], bloom: [236, 208, 156] }, // アリド=A環(原型として位置づけ)。暖砂×青白
    2: { shape: "poly", sides: 4, rail: [95, 211, 224], glow: [217, 87, 176], center: [217, 87, 176], trace: [140, 214, 232], traceRing: [230, 120, 200], laser: [180, 245, 255], bloom: [220, 100, 190] }, // 摩天楼スラム=四角(街区の矩形枠が入れ子で回転・看板の途切れ=切れ目)。ネオン(シアン管/マゼンタ看板)
    3: { shape: "organic", wobAmp: 0.075, wobLobes: 9, wobAmp2: 0.03, wobLobes2: 23, rail: [126, 196, 124], glow: [226, 244, 178], center: [232, 246, 184], trace: [160, 210, 146], traceRing: [220, 240, 170], laser: [232, 248, 196], bloom: [214, 240, 168] }, // シルヴァ=D有機(葉脈・細かな脈=切れ目は葉の裂け目)。翠緑×胞子光
    4: { shape: "poly", sides: 3, rail: [182, 150, 96], glow: [230, 200, 126], center: [236, 210, 140], trace: [196, 170, 112], traceRing: [226, 198, 128], laser: [240, 222, 150], bloom: [236, 206, 150] }, // 古墳=三角(三角縁神獣鏡・三角が入れ子で逆回転=「三角の幾何が回転しあう」本命)。青銅×玄室金
    // ⑤イグニス「噴出と冷えた殻」: 外2=星形五角(鋭い頂点が外へ突き出す=噴出のスパイク・熔岩橙) / 内2=六角の黒殻(重く鈍い)。逆回転で「殻を破って噴き出す」
    5: {
      rail: [178, 110, 76], glow: [255, 150, 60], center: [255, 172, 82], trace: [206, 124, 78], traceRing: [255, 160, 70], laser: [255, 192, 112], bloom: [255, 140, 60],
      rings: [
        { shape: "star", points: 5, innerF: 0.44, rail: [255, 146, 58], lwMul: 1.15 },
        { shape: "star", points: 5, innerF: 0.48, rail: [246, 128, 52], lwMul: 1.15 },
        { shape: "poly", sides: 6, rail: [132, 90, 76], lwMul: 1.8 },
        { shape: "poly", sides: 6, rail: [120, 80, 68], lwMul: 1.8 },
      ],
    },
    6: { shape: "organic", wobAmp: 0.115, wobLobes: 5, wobAmp2: 0.048, wobLobes2: 11, lwMul: 1.3, rail: [86, 150, 96], glow: [110, 214, 180], center: [110, 214, 180], trace: [120, 176, 122], traceRing: [124, 220, 186], laser: [150, 232, 200], bloom: [116, 208, 172] }, // ユンガ=D有機(絡まる蔓・太く粗い揺らぎ=切れ目は蔓の途切れ)。深緑×翡翠の露
    // ⑦メアリス「構造と気泡」: 外2=八角(海底ドームの構造フレーム=人工の直線) / 内2=ルーロー三角形(定幅曲線=気泡の丸み)。人工の直線と自然の曲面の対比
    7: {
      rail: [140, 208, 200], glow: [200, 240, 236], center: [180, 232, 224], trace: [160, 214, 206], traceRing: [190, 236, 228], laser: [216, 248, 244], bloom: [176, 230, 220],
      rings: [
        { shape: "poly", sides: 8, rail: [150, 214, 208], lwMul: 1.35 },
        { shape: "poly", sides: 8, rail: [138, 202, 198], lwMul: 1.35 },
        { shape: "reuleaux", rail: [196, 240, 232] },
        { shape: "reuleaux", rail: [212, 246, 240] },
      ],
    },
    8: { shape: "poly", sides: 6, rail: [200, 224, 240], glow: [232, 244, 255], center: [150, 214, 236], trace: [220, 238, 248], traceRing: [176, 214, 232], laser: [240, 250, 255], bloom: [205, 235, 245] }, // 氷の前線=六角(雪片の霜枠)。霜白×氷青(冷たい静けさ)
    // ⑨ヴォルタ「炉心と制御棒」: 外2=歯車環(内向きの歯=停止したタービン・鈍色/警戒縞は歯の側面に=合格部分を維持)
    //   内2=角ばった三葉(直線的なくさび3枚・頂点が鋭く外を向く)。谷の落ち込みは浅く抑えて輪郭をリングとして成立させ、中心に円形の空隙を残す。
    //   くさびが外向きに配置されることで中心の炉心を「囲んで指し示す」構図に。歯車(外)と三葉(内)は逆回転=止まったはずの炉が今も回っている。
    9: {
      rail: [150, 158, 166], glow: [130, 225, 190], center: [140, 232, 198], trace: [170, 178, 186], traceRing: [140, 228, 194], laser: [188, 244, 222], bloom: [140, 232, 198],
      rings: [
        { shape: "gear", teeth: 18, toothDepth: 0.15, toothFrac: 0.45, flankStripe: true, rail: [166, 174, 182], lwMul: 1.15 },
        { shape: "gear", teeth: 13, toothDepth: 0.18, toothFrac: 0.45, flankStripe: true, rail: [150, 158, 166], lwMul: 1.15 },
        { shape: "star", points: 3, innerF: 0.32, rail: [132, 226, 192], lwMul: 1.35 }, // 谷=0.44*0.32=0.141R(中心余白0.070Rを確保)。くさびを鋭く
        { shape: "star", points: 3, innerF: 0.45, rail: [150, 236, 204], lwMul: 1.35 }, // 谷=0.20*0.45=0.090R(同上)。最内リングは余白の制約でここまで
      ],
    },
    // ⑩オリジン「重なる古代図形」=最終惑星・最大複雑。4リングすべて異なる幾何が異速度で回り、重なりが刻々と組み変わる(魔法陣/星図が生成され続ける)。
    //   ①の円・②の四角・④の三角が集約し、固有の七芒星{7/3}が加わる=「起源」に全惑星の幾何が集まる。
    10: {
      rail: [196, 150, 96], glow: [230, 180, 110], center: [240, 200, 130], trace: [202, 162, 110], traceRing: [235, 190, 120], laser: [245, 210, 150], bloom: [230, 176, 106],
      rings: [
        { shape: "star", points: 7, innerF: 0.357, rail: [236, 192, 118], lwMul: 1.1 },  // 七芒星{7/3}(外接=物理半径・谷=cos(3π/7)/cos(2π/7))
        { shape: "poly", sides: 4, rail: [206, 160, 102], lwMul: 1.25 },                  // ②の四角
        { shape: "poly", sides: 3, rail: [224, 178, 110], lwMul: 1.25 },                  // ④の三角
        { shape: "ring", rail: [240, 206, 140], lwMul: 1.15 },                            // ①の円(原型)
      ],
    },
  },

  xpPopupAutoHighEvery: 10, // V5 3.5: オート高のXPポップ間引き(N回に1回だけ表示)
  xpPopupAutoHighSmall: true, // V5 3.5: オート高のXPポップを小さく表示
  // 3.11-6: オート給餌中のポップアップ抑制(オート全体で。手動は現状のまま)。実機調整用にCFG化
  autoFeedXpPopup: false,     // オート時のXPポップを出すか(false=非表示=最もうるさいので既定オフ)
  autoFeedLevelPopSmall: true, // オート時のLvアップポップを小さく表示(意味のある進行なので残すが控えめ)
  autoFeedLevelPopSize: 10,    // オート時のLvアップポップのフォントpx(手動=17px固定・オートのみ縮小。実機で最終調整)
  autoFeedLevelPopMax: 5,      // オート時のLvアップポップの同時表示上限(大量個体の同時Lvアップで画面を埋めない・超過分は間引く)
  // 長押しオートリピート (GameExpansion_v2 ④)
  holdDelay: 0.4,           // 連続実行が始まるまでの秒数
  holdStart: 0.15,          // 初期実行間隔(秒)
  holdMin: 0.05,            // 最短実行間隔(秒)
  holdAccel: 0.005,         // 1回ごとの間隔短縮(秒)
  // 自動補給 (GameExpansion_v2 ⑤ / R100解禁)
  autoSupplyRank: 100,
  autoSupplyThreshold: 1000, // コオロギ在庫がこれを下回ると毎秒自動購入
  // Phase2: ボス・状態異常・味方 (GameExpansion_v2 ①②⑩)
  bossEveryRank: 30,        // このランク以降は毎回ボス
  poisonTime: 20,           // サソリ毒の持続秒(水場Lvで短縮)
  poisonAtkMult: 0.5,       // 毒中の攻撃力倍率
  hawkHideTime: 45,         // 鷹にさらわれた個体が戻るまでの秒数
  hawkGrabLimit: 2,         // 鷹はこの回数さらうと去る
  hawkTapToScare: 3,        // 急降下予告中にこの回数タップで追い払える
  webSlow: 0.45,            // ウェブ上の移動速度倍率
  webDpsPenalty: 0.1,       // 有効ウェブ1つごとの与ダメ低下
  webHp: 3,                 // ウェブを除去するのに必要なタップ数 // index=tier-1(T1〜T6)。Tier無し(R30未満)は1.0
  // 特性の遺伝(S4・trait_system §9/§16)。genesis限定=繁殖は両親の"組み替え"のみ(血統外の新特性は繁殖では出ない=賢者の石だけ)。
  //   各特性が独立確率p(内部tierに反比例)で発現→複数同時継承は各pの積で指数的に困難(=やり込み)。★緩めに開始=Ric実機調整。
  // ★遺伝=極小確率のガチャ(設計確定・§コンセプト): 単一特性の継承率を3〜5%帯へ。掛け合わせの射幸心/やり込み指標を核にする。
  //   繁殖自体は容易(CDは長いが実行は簡単)=難しさは「確率」でなく「何回産めば出るか」に置く。到達保証はS5賢者の石(固定化=p→1.0)。
  traitInheritBase: 0.05,   // tier1(最も普及)=5%(序盤の体験を守る上限)
  traitTierPenalty: 0.005,  // tierが1上がるごとに-0.5%(希少ほど遺伝しにくい=射幸心)。tier3ミミカクシ=4.0%
  traitInheritFloor: 0.03,  // 下限=3%(最も希少な特性を保証)
  traitMaxPerLizard: 3,     // 1個体が持てる特性数の上限(§16 ③)
  // S5 賢者の石の用途(§16 ④ 案III=創世+固定化)。石は四重スリット成功で+1(1/85=希少)=precious。★全て たたき台=Ric実機で石ペースを見て調整。
  stoneGenesisBase: 1,      // (内部API genesisTrait用に残置=テスト/合成検証フィクスチャ。プレイヤー導線はR5-aでランダム化)
  stoneGenesisRandCost: 4,  // R5-a: ランダム創世の一律コスト(結果を知らずに払う=定額・現行期待値近似)★[A]調整
  stoneFixBase: 4,          // S5-b 固定化コスト = これ + tier×stoneFixPerTier(tier1=6…tier5=14個)。両親固定で2枚持ち確定=601回の錬金ショートカット
  stoneFixPerTier: 2,
  // 本部=研究施設(hq_lab)の設備tier閾値(全て既存stateからの派生=セーブ非接触・★たたき台=Ric調整)
  labTankTiers: [20, 40, 60], // 実験用水槽: HQ Lv(=hqLevel)でT2/T3/T4。V6-P1-2で駆動源を解読済みレシピ数から変更
  labShelfTiers: [8, 18, 28], // 標本棚: 図鑑登録数でT2/T3/T4(ロケットはrocket状態から直接導出)
  labRoomTiers: [1, 2],       // 部屋の密度tier(T1開設/T2稼働/T3過密): labInvest(鉱石投資)がこの回数以上でT2/T3。★たたき台
  // デスク群=鉱石投資で育つ(hq_lab v2.0 §5.3案B・投資1回=1段T1→T4)。★コストは全てたたき台=Ric実機調整
  labInvestCosts: {
    desks: [
      { titaniumOre: 2, amber: 2 },       // T1→T2
      { orichalcum: 2, titaniumOre: 4 },  // T2→T3
      { amethyst: 1, orichalcum: 4 },     // T3→T4
    ],
  },
  // 本部v5 HOLO COMMAND(2026-07-25採用・意匠原本=docs/design/hq-holo-command-poc.html)。旧v2〜v4系CFGは退役=git記録。
  holoBootOn: true,           // 起動シーケンス(開くたび再生)。false=スキップ(即・全点灯)
  holoBootSpeed: 1.0,         // 起動シーケンスの速度倍率(2=2倍速で短縮)
  holoTrackSec: 5,            // 個体追跡ロックオンの巡回間隔(秒・決定論=乱数不使用)
  amethystCdResetCost: 2,     // R3: 繁殖CDリセット1回のアメジスト消費(★[A]調整)
  // 本部右メニュー(UISkills §14・表示のみ・★Ric調整)
  // R1(2026-07-25承認): 繁殖UI=種×モーフタイル+A/Bスロット。実行/CD/確率/遺伝は不変
  //   ★2026-07-29 Ric裁定: クイック繁殖と希少スコア(breedScoreW / breedScoreUpMut)は撤廃。
  //     選出はスコアでなく id 昇順の安定順序。自動選出の再実装禁止。
  breedTileMinW: 150,         // 種×モーフタイルの最小幅(px)
  breedSlotMinH: 92,          // A/Bスロットの最小高(px)
  breedCountBadge: true,      // タイルの所持数/繁殖可バッジ表示
  hqMenuWidth: 200,           // 右メニュー幅(px・広幅時)。裁定=フォント拡大に合わせ拡幅
  hqMenuFontScale: 1.0,       // 裁定①: フォント係数(和名16px/サブ10.5px×これ・アイコン比例)
  hqMenuLayout: "spread",     // 裁定①: "spread"=ヘッダ下〜ティッカー上に均等分布(既定)/"stack"=上詰め(温存)
  hqMenuGap: 12,              // タブ間隔(stack時・px)
  hqMenuPadY: 96,             // spread時の上下マージン(ヘッダ罫線/ティッカーとの呼吸・px)
  hqMenuWidthNarrow: 52,      // 縮退時(<900px)=アイコンのみ
  hqMenuItems: [              // 項目順・ラベル(action: panel=openLabPanel / dex=openDex)
    { key: "desks", jp: "研究デスク", en: "RESEARCH DESK", icon: "hq" },
    { key: "tank", jp: "錬成", en: "ALCHEMY", icon: "bio" },
    { key: "shelf", jp: "標本棚", en: "ARCHIVE ROOM", icon: "scroll" },
    { key: "rocket", jp: "宇宙港", en: "SPACEPORT", icon: "rocket" },
    { key: "dex", jp: "図鑑", en: "SPECIMEN DEX", icon: "dex" },
  ],
  // 研究デスクパネル(UISkills §13 R4改訂・統一書式の色/文言・★Ric調整)
  planCurColor: "#ecc35a",    // 充足の琥珀
  planLackColor: "#d8404e",   // 不足「あと◯」の深紅
  planLackWord: "あと",       // 不足文言
  planDimOpacity: 0.62,       // 不足行・沈みボタンの明度
  labTileScale: 2.0,          // 本部のタイル+設備の一体倍率(大きさ)。★Ric実機調整
  labFacScale: 1.0,           // 設備のみの追加倍率(比較用・既定1=一体拡大方式)
  traitGenesisT6Weight: 0.3,  // ★V6-P1-2: 乱択創世での tier6(旧・合成専用6種)の重み。他は1。小さいほど希少。★[A]調整
  genesisFxT6Mult: 1.6,       // ★tier6を引いた瞬間だけ錬成Fxを厚くする(演出の種類は増やさない)
  genesisFxSec: 1.5,        // 創世エフェクトの尺(深紅の錬成)
  // R5-b シズミマチ基準(方向(i)沈んだ都市の窓灯り・★全てRic実機判定)
  shizuWinRows: 3,          // 窓灯りの段数
  shizuWinCols: 9,          // 窓灯りの列数(奇数段は-1)
  shizuGlow: 5,             // 灯の滲み量(shadowBlur px)
  shizuDim: 0.28,           // 消えた窓の率(街の沈黙)
  shizuHalo: 0.16,          // 街明かりの滲み(胴中央の面光・遠景で格を出す。0=無効)
  shizuBlinkOn: true,       // ごく一部の窓の明滅(false=完全静止でも成立)
  shizuBlinkSpeed: 0.5,     // 明滅速度倍率
  // R5-b B1(シンカイ/ネオン/ヨウガン/ヒョウガ・★全てRic実機判定)
  shinkaiDepth: 0.55,       // 水圧面の沈み(深青の濃さ)
  shinkaiLampR: 0.05,       // 提灯の光半径(体長比)
  shinkaiSnow: 7,           // マリンスノーの粒数
  shinkaiPulseOn: true,     // 提灯の脈動(false=静止でも成立)
  neonSigns: 3,             // 縦看板の枚数
  neonRain: 0.30,           // 雨に滲む反射の濃さ
  neonBlinkOn: true,        // 末尾看板の明滅(壊れかけ・false=常灯)
  neonBlinkSpeed: 0.7,      // 明滅速度倍率
  youganCracks: 5,          // 亀裂の本数
  youganGlow: 4,            // 亀裂の熱グロー(shadowBlur px)
  youganPulseOn: true,      // 熱の脈動(false=静止でも成立)
  hyogaLayers: 4,           // 氷の層理の本数
  hyogaFrost: 0.30,         // 氷結面の濃さ
  hyogaSpikes: 6,           // 背縁の霜棘の数
  // R5-b B2(クロノ/アミダグラ/トライアド/オウゴンヅカ・★全てRic実機判定)
  chronoDialR: 0.058,       // 文字盤の半径(体長比)
  chronoGears: 2,           // 噛み合う歯車の数
  chronoTickOn: true,       // 分針の刻み(false=止まった時刻)
  amidaRails: 5,            // あみだの縦桟の本数
  amidaGlow: 3,             // 灯の滲み(shadowBlur px)
  amidaWalkOn: true,        // 灯が路を下る(false=路の途中で止まった灯)
  triadSize: 0.036,         // 三連紋の大きさ(体長比)
  triadSplat: 6,            // 顔料の飛沫の総数
  ougonLeaf: 7,             // 金箔片の枚数
  ougonShade: 0.34,         // 玄室の影の濃さ
  // R5-b B3(チェレンコ/ハガネ/ムメイ・★全てRic実機判定)
  cherenkoGlow: 0.05,       // 輪郭の臨界光の滲み(体長比)
  cherenkoCaustics: 3,      // 光条(コースティクス)の本数
  cherenkoFloor: 0.20,      // 水底からの照り返しの濃さ
  haganeBandW: 0.052,       // 鋼帯の幅(体長比)
  haganeHamon: 0.012,       // 刃文の波の振幅(体長比)
  haganeHeat: 0.30,         // 焼き残りの熱(橙)の濃さ
  mumeiPatch: 2,            // 体の白抜けの枚数
  mumeiFade: 0.35,          // 消し痕(体色の透け)の濃さ
  // R5-b B4(コンテンギ/ホウカン/リンカイ・★全てRic実機判定)
  kontengiTeeth: 9,         // 軌道環に刻む歯車の歯数
  kontengiOrbitOn: true,    // 星が天球を巡る(false=止まった天球)
  houkanSize: 1.0,          // 冠の大きさ倍率
  houkanGlow: 0.22,         // 玄室の光暈の濃さ
  rinkaiGlow: 0.07,         // 輪郭の臨界光の滲み(体長比)
  rinkaiRays: 4,            // 臨界点へ収束する光条の本数
  rinkaiPulseOn: true,      // 臨界点の呼吸(false=完全静止でも成立)
  // V6-P2 新規特性 基準=ドクシルシ(⑥密林・毒蛙の文法・★全てRic実機判定)
  dokuThroat: 0.42,         // 喉〜胸の毒腺の沈み(墨色の濃さ)
  dokuSpots: 7,             // 警告斑の数(主斑を除く)
  dokuSpotR: 0.030,         // 警告斑の大きさ(体長比・主斑は1.6倍)
  dokuRing: 0.55,           // 斑を締める暗環の濃さ(明るい地でも潰れない・0=無効)
  dokuSheen: 0.18,          // 主斑の湿った照り(毒の鮮度・0=無効)
  // V6-P2 バッチ(ホシワタリ/コケムシロ/スアミ・★全てRic実機判定)
  hoshiStars: 8,            // 星屑の点数(等星2つを含む)
  hoshiNight: 0.30,         // 腹側の夜藍の沈み(星の下地=暗さが先・基準の同系色文法)
  hoshiLine: 0.35,          // 等星を結ぶ航路線の濃さ(0=無効)
  kokePatches: 3,           // 苔斑の枚数
  kokeSize: 0.05,           // 苔斑の大きさ(体長比)
  kokeFuzz: 9,              // 絨毛の照り点の数(全斑の合計)
  suamiRings: 3,            // 尾の結節環の本数
  suamiNodeR: 0.011,        // 結節点(巣の灯)の大きさ(体長比)
  suamiThread: 0.50,        // 結節を渡る網糸の濃さ(0=無効)
  suamiGlow: 3,             // 結節の灯の滲み(shadowBlur px)
  // V5M モーション語彙 第1バッチ(⑦①②⑧⑫・★全てRic実機判定=[A]②へ登録予定)
  // ★M2-EX再調律(2026-07-26): 目標を「5分で6〜10回の『お、』」へ引き上げ。尾・身震いは振幅up/キョロは間を長く頻度↓。
  motDashOn: true,          // ⑦静→動ダッシュ
  motDashRate: 0.055,       // 徘徊再設定ごとの発生率(再調律 0.03→0.055・約3.6/分)
  motDashDist: 96,          // 走る距離px(±30%は決定論ゆらぎ・やや伸ばす)
  motDashSpeedMult: 2.8,    // 疾走の速度倍率(通常45px/s基準・静→動をより鋭く)
  motDashRestSec: 5,        // 走った直後の静止秒(静→動→静)
  motTailOn: true,          // ①尾のアイドルゆらぎ
  motTailRate: 0.30,        // 8秒窓ごとの発生率(再調律 0.20→0.30)
  motTailAmp: 3.4,          // ゆらぎ中の尾振幅倍率(再調律 2.2→3.4=気づける水準へ)
  motTongueOn: true,        // ②舌出し(ちろちろ)
  motTongueWin: 32,         // 1回/この秒数(再調律 45→32・生の気配を増やす)
  motTongueDur: 0.5,        // 舌が出ている秒
  motLookOn: true,          // ⑧キョロキョロ(到着時=じっと見る間→2回だけ向きを変える)
  motLookRate: 0.055,       // 到着ごとの発生率(G最終化 0.07→0.055=頭bob等の視線系と競合を均す)
  motLookDwell: 3.2,        // 見る間の長さ秒(再調律で新設・freeze→ゆっくり2反転)
  motMeetOn: true,          // ⑫見合い(すれ違いの一瞥)
  motMeetRate: 0.11,        // 近接すれ違いごとの発生率(再調律 0.07→0.11)
  motMeetSec: 1.0,          // 向き合って止まる秒(0.8→1.0=間を持たせる)
  motMeetCdSec: 45,         // 個体ごとの再発クールダウン秒(60→45)
  // V5M 第2バッチ(④⑮⑰・★全てRic実機判定)
  motPerchOn: true,         // ④岩上の見張り(背景の大岩スポット)
  motPerchMax: 3,           // 使う岩の数(大きい順)
  motRareOn: true,          // ⑮レア個体の引力
  motRareWin: 50,           // 判定窓(秒・60→50)
  motRareRate: 0.12,        // 窓ごとの発生率(再調律 0.08→0.12)
  motRareDwell: 5,          // 傍で眺める滞在秒
  motEnvOn: true,           // ⑰惑星の環境反応
  motEnvWin: 70,            // 個体ごとの発生窓(秒・90→70)
  motEnvRate: 0.6,          // 窓ごとの発生率(0.5→0.6)
  motEnvShiverPx: 3,        // 震えの振幅px(再調律 2→3=気づける)
  motEnvLiftPx: 5,          // 頭上げの浮きpx(再調律 3→5=気づける)
  motEnvColdStages: [7, 8], // 震える惑星(水中都市/氷の前線)
  motEnvHotStages: [5, 9],  // 頭を上げる惑星(火山/廃原子炉)
  // V5M 第3バッチ(⑬⑤⑩・⑱はスキップ=前提の動的環境演出が現行に無い・★全てRic実機判定)
  motFollowOn: true,        // ⑬ベビー追従
  motFollowWin: 24,         // 判定窓(秒・30→24)
  motFollowRate: 0.18,      // 窓ごとの発生率(再調律 0.12→0.18)
  motFollowSec: 6,          // 追従する秒
  motShedOn: true,          // ⑤脱皮の気配
  motShedWin: 1800,         // 発生窓(秒・約30分に1回の稀さが価値)
  motShedRate: 0.6,         // 窓ごとの発生率
  motShedDur: 8,            // 岩に擦る秒
  motShedRubPx: 2,          // 擦りの振幅px
  motDigOn: true,           // ⑩砂掘り
  motDigStages: [1, 10],    // 掘る惑星(乾燥地帯/古代遺跡)
  motDigRate: 0.05,         // 8秒窓ごとの発生率(G最終化 0.055→0.05・乾燥惑星で突出しないよう抑制)
  motDigDur: 3,             // 掻いている秒
  // V5M 第4バッチ(⑥・C=形状変形の初適用・変形はbask中の背骨w/y変調のみ・★Ric実機判定)
  motFlatOn: true,          // ⑥日光浴フラット化
  motFlatWin: 26,           // 発生窓(秒・bask滞在中・30→26)
  motFlatRate: 0.42,        // 窓ごとの発生率(再調律 0.3→0.42)
  motFlatDur: 10,           // 伏せている秒(前後2秒はなだらかに補間)
  motFlatWiden: 0.10,       // 幅の広がり(+10%)
  motFlatLower: 0.08,       // 高さの沈み(-8%)
  // ★M2-EX パートB: 見送り6種の解禁(③⑨⑪⑭⑯⑲・★全てRic実機判定)
  motBlinkOn: true,         // ③まばたき(閉眼の気配)
  motBlinkWin: 9,           // 1回/この秒数(個体位相分散)
  motBlinkDur: 0.12,        // 閉じている秒(1〜2フレームの気配)
  motStretchOn: true,       // ⑨伸び(C=形状変形・非スポット静止中の背アーチ)
  motStretchWin: 55,        // 発生窓(秒)
  motStretchRate: 0.3,      // 窓ごとの発生率
  motStretchDur: 1.6,       // 伸びている秒
  motStretchArch: 0.10,     // 中背の持ち上げ量(体長比)
  motTiltOn: true,          // ⑪首かしげ(全身の小さな傾き=配置回転)
  motTiltWin: 40,           // 発生窓(秒)
  motTiltRate: 0.35,        // 窓ごとの発生率
  motTiltDur: 1.4,          // 傾けている秒
  motTiltDeg: 4,            // 傾き角(度)
  motGatherOn: true,        // ⑭勝利の集い(撃破地点へ寄る)
  motGatherMax: 4,          // 集まる最大匹数
  motGatherRadius: 360,     // この距離内から集める
  motGatherSec: 4,          // 集まって留まる秒
  motGazeOn: true,          // ⑯ルーレット球の目線(報酬盤へ向く)
  motRippleOn: true,        // ⑲波紋への注目(飲む個体を一瞥)
  motRippleRate: 0.3,       // 6秒窓ごとの発生率
  motRippleRadius: 110,     // この距離内の飲む個体に反応
  // ★M2-EX パートC: 既存行動の多段化(水飲み/暖取り/巣出入り/見上げ・★全てRic実機判定)
  drinkCycleSec: 4.5,       // 水飲みの1周期秒(頭下げ→見上げ)
  drinkRippleOn: true,      // 水飲みの波紋(頭下げ中の水面の輪)
  drinkDipOn: true,         // 調査O: 水飲みの頭下げ(首/頭を実際に下げる=飲む動きが視認可能)
  drinkDipDepth: 0.22,      // 頭下げの深さ(体長比・鼻先が下がる量)。★Ric実機で自然さ調整
  leopaTailFat: 1.55,       // 調査P: レオパ(ヒョウモントカゲモドキ)の脂肪尾の太さ倍率。1.8=尾基部が腰を超え瘤/1.55=腰≈尾基部の自然な太尾。★Ric調整
  motEmergeLookOn: true,    // 巣から出た直後の見回し(⑧キョロ接続)
  motEmergeLookRate: 0.6,   // 出巣時の見回し発生率
  motPeekOn: true,          // 入巣前に一瞬振り返る(名残)
  motPeekRate: 0.4,         // 入口手前での振り返り発生率
  motPeekBand: 34,          // 入口手前この距離帯で判定
  motPeekSec: 0.6,          // 振り返って外を見る秒
  // ★M2-EX パートD: 新語彙 第2波(D1あくび/D2頭プッシュアップ/D3尾フリック/D4群れ警戒/D5向き替え/D6まどろみ/D7漂う粒子/D8地面味見・★全てRic実機判定)
  motYawnOn: true,          // D1あくび→E2で真の顎開口へ格上げ(gape)
  motYawnWin: 55,           // 発生窓(秒)
  motYawnRate: 0.3,         // 窓ごとの発生率
  motYawnDur: 1.0,          // 開いている秒
  motYawnAngle: 0.5,        // E2 下顎の開口角(rad・0.5≒29度)
  motHeadbobOn: true,       // D2頭のプッシュアップ表示(トカゲ固有の腕立て)
  motHeadbobWin: 34,        // 発生窓(秒)
  motHeadbobRate: 0.24,     // 窓ごとの発生率(G最終化 0.3→0.24=視線系の突出を均す)
  motHeadbobDur: 1.4,       // 表示の秒
  motHeadbobCount: 3,       // 上下の回数
  motHeadbobPx: 4,          // 跳ねる高さpx
  motTailFlickOn: true,     // D3尾フリック(鋭い一振り)
  motTailFlickWin: 26,      // 発生窓(秒)
  motTailFlickRate: 0.25,   // 窓ごとの発生率
  motTailFlickDur: 0.45,    // 一振りの秒
  motTailFlickAmp: 6,       // 振りの尾振幅倍率(①ゆらぎより鋭く大きい)
  motHerdOn: true,          // D4群れの同期・警戒(近くのダッシュに反応)
  motHerdRadius: 200,       // この距離内のダッシュに反応
  motHerdAlertSec: 1.2,     // 警戒静止の秒
  motTurnOn: true,          // D5向き替えの多様化(単発の反転)
  motTurnWin: 14,           // 発生窓(秒)
  motTurnRate: 0.15,        // 窓ごとの発生率(G最終化 0.18→0.15=視線系を均す)
  motDrowsyOn: true,        // D6まどろみ(眼の半閉じ)
  motDrowsyWin: 40,         // 発生窓(秒)
  motDrowsyRate: 0.3,       // 窓ごとの発生率
  motDrowsyDur: 2.5,        // 半閉じの秒
  motTasteOn: true,         // D8地面の味見(舌を下へ)
  motTasteWin: 70,          // 発生窓(秒)
  motTasteRate: 0.4,        // 窓ごとの発生率
  motTasteDur: 0.7,         // 味見の秒
  motMotesOn: true,         // D7漂う環境粒子(背景装飾)
  motMotesCount: 6,         // 同時に漂う粒の数
  // 惑星別の粒子(嘘のない環境要素のみ・該当惑星だけ設定):森林/密林=胞子, 氷=雪片, 火山/廃炉=灰
  motMotesByStage: {
    3: { color: "rgba(220,240,180,0.5)", r: 2, drift: 10, alpha: 0.5, halo: true },   // 森林=光る胞子
    5: { color: "rgba(90,80,78,0.55)", r: 2, drift: 16, alpha: 0.5 },                   // 火山=舞う灰
    6: { color: "rgba(210,235,170,0.5)", r: 2, drift: 9, alpha: 0.5, halo: true },     // 密林=胞子
    8: { color: "rgba(240,248,255,0.7)", r: 2, drift: 12, alpha: 0.6 },                 // 氷の前線=雪片
    9: { color: "rgba(120,110,90,0.5)", r: 2, drift: 18, alpha: 0.45 },                 // 廃原子炉=塵灰
  },
  // ★M2-EX2 パートE: C方式追加3種(E1片足上げ/E2真のあくび顎開口/E3脱皮後ぶるっと・★全てRic実機判定)
  motFootLiftOn: true,      // E1片足上げ体温調整(手前前脚を持ち上げる・C=脚ジオメトリ変形)
  motFootLiftWin: 40,       // 発生窓(秒)
  motFootLiftRate: 0.2,     // 窓ごとの発生率(基準)
  motFootLiftHotMult: 2.2,  // 熱い惑星/暖取りspotでの発生率倍率(熱源回避=文脈自然)
  motFootLiftDur: 2.0,      // 上げている秒
  motShakeOn: true,         // E3脱皮後の全身ぶるっと(C=多パーツ横揺れ・⑤直後のみ)
  motShakeDur: 0.6,         // ぶるっとの秒
  motShakeSpeed: 34,        // 揺れの速さ
  motShakeAmp: 0.02,        // 横揺れ振幅(体長比)
  // 群衆対策(表示のみ・収益/戦闘は全個体が対象のまま)
  maxVisibleLizards: 70,    // フィールドに同時表示する上限。超過分は巣穴で休憩
  restSwapPerSec: 3,        // 平常時に毎秒この匹数まで休憩⇔活動を入れ替え(漸進=ちらつき防止)
  crowdShrinkStart: 40,     // この表示数から縮小開始
  crowdShrinkPer: 0.005,    // 1匹ごとの縮小率
  crowdScaleFloor: 0.7,     // 縮小の下限
  // 3.12.2: 飼育槽の"表示"を固定数に(表示のみの制限・ロジックは全個体に作用)
  displayCap: 20,           // 飼育槽に同時表示する上限(安全弁。§8.13で実質は種×モーフ×dispPerType=~20に決まる)
  dispPerType: 2,           // §8.13: 同じ種×モーフはフィールドに最大この数まで(弱い順に出る/強個体は巣に籠る)。惑星10種(モーフ含む)×2≒20
  nestWalkSpeed: 54,        // §8.14: 巣へ戻る/巣から出る歩行速度(px/秒)。ワープ禁止=物理的に歩いて出入りする
  nestArriveR: 16,          // §8.14: 巣口へこの距離まで歩いたら巣に入る(表示から外れる)。到達で消える=瞬間消滅にしない
  // 裁定③(2026-07-25): ボス戦時の巣口混雑の解消(見た目・判定基準・戦闘ロジック非接触=速度と到達点のみ)
  nestEntryRadius: 44,      // 出入り判定半径(拡大・複数個体が別々の到達点で同時入巣=1点集中の解消)。★Ric調整
  nestFleeSpeedMult: 3.5,   // ボス登場時の弱個体の帰巣速度倍率(通常時の出入り速度は不変)。★たたき台3〜4倍
  // 裁定F(2026-07-26): 巣口すり抜けの根治=出入り中の個体は相互回避を無効化(互いをすり抜ける)
  nestPassthroughOn: true,  // 巣へ向かう/出る個体の押し合いを無効化(団子の根治)
  nestThruSec: 1.5,         // 出巣直後にすり抜け続ける秒(入口を離れるまで)
  // ★M2-EX3 パートH: 設備tier連動の遊びモーション(投資が景色になる・発生tier閾値もCFG=Ricが解禁段階を[A]調整)
  motWaterPlayOn: true,     // 水遊び(水場が大湖tierで解禁)
  motWaterPlayTier: 4,      // 解禁tier(水場4=大湖)
  motWaterPlaySec: 5,       // 遊びの1変種の秒(沈む/跳ねる/涼むを順に)
  motBeamFloatOn: true,     // UFO光ビーム下の浮遊(保温がビームtierで解禁)
  motBeamFloatTier: 3,      // 解禁tier(保温3=空中ライト)
  motBeamFloatWin: 12,      // 浮遊の発生窓(秒)
  motBeamFloatRate: 0.5,    // 窓ごとの発生率
  motBeamFloatPx: 5,        // 浮上の高さpx
  motBeamFloatSpeed: 0.6,   // 浮遊の上下速さ
  motObsScanOn: true,       // 観測デッキの空見渡し(展望台が観測施設群tierで解禁)
  motObsScanTier: 3,        // 解禁tier(展望台3=観測施設群)
  motObsScanPx: 2,          // 首振りの横振幅px
  motObsScanSpeed: 0.35,    // 首振りの速さ
  // ★M2-EX3 パートI: 水場の足跡波紋(水の演出限定・水tierで規模拡大)
  motFootRippleOn: true,    // 水場を歩く個体の足跡波紋
  motFootRippleAlpha: 0.4,  // 波紋の濃さ
  motFootRippleTierGain: 0.35, // 水tier1段ごとの波紋規模増(大湖ほど大きい)
  // ★パートK: くつろぎ語彙(眺めの安らぎは"留まり"から・約半分が休息・★全てRic実機判定)
  motRelaxOn: true,         // くつろぎ状態(半数が休息)
  motRelaxRatio: 0.5,       // くつろぎ中の個体比率(0.5=約半分)
  motRelaxCycle: 44,        // くつろぎ↔活動の1周期秒(id位相分散で全員同時にならない)
  motRelaxSpotBonus: 0.2,   // 快適な場所(暖spot/観測デッキ)でのくつろぎ率上乗せ
  // モーション(§8.5): 可視個体の一部が設備の居場所(スポット)へ歩き、留まって姿勢をとる純装飾。数値には無影響。★Ric実機で手触り調整
  spotVisitChance: 0.35,    // 徘徊の再設定時に居場所へ向かう確率(残りは従来の縄張り徘徊)
  spotVisitChanceRelax: 0.75, // 調査M: くつろぎ個体は快適な場所を探して"そこで"休む(水/暖の利用率up=水飲みが見える)
  spotRotateSec: 18,          // 調査N: spot選好が変わる周期秒(id固定バインドの罠を解消=全個体が時々水場も訪れる)
  spotDwellMin: 3,          // 居場所に留まる最短秒
  spotDwellMax: 8,          // 居場所に留まる最長秒
  spotTravelSec: 14,        // 調査J根治: スポットへ道中を保持して到達させる上限秒(遠い水場等に辿り着けるように)
  poseBobPx: 3,             // 居場所での姿勢の揺れ幅(px・整数bob=魂ピクセル不変)。reduced-motionで停止
  poseBobSpeed: 1.2,        // 姿勢アニメの速さ(基準・posture別に係数)
  restReevalSec: 3.5,       // 平常時の表示メンバー再選抜の間隔(秒・長めでちらつき防止)
  displayHysteresis: 0.6,   // 交代のヒステリシス(攻撃力差がこれ未満なら交代しない=境界の揺れを無視)
  emergeSwapPerSec: 4,      // ボス時に巣から這い出す速度(低め=次々に湧き出す時間差演出)
  combatDrawCap: 20,        // 戦闘時の描画上限(3.12: 60→20。計算は全数参加)
  // V3: 巣収納 (GameExpansion_V3 §4) — 旧nestOut枠はdisplayCapに集約(下記visibleAdultCap)
  nestOutBase: 8,
  nestOutPerLv: 1,
  nestOutMax: 15,
  nestLvMax: 8,
  nestLvBaseCost: 5000,     // 巣Lvアップ費用 = これ × 3^(Lv-1)
  // V4.1: 巣ネットワーク (§3 完全放置・自動解放)
  nestSurpriseChance: 0.02, // 繁殖成功時の確率先行解放(サプライズ)
  nestNearThreshold: 0.7,   // 「解放間近」表示の進捗しきい値
  // V4.1: バガー侵食率 (§6 1日1ログイン最適・可逆)
  erosionRisePerHour: 0.5,  // 自然上昇(/時)
  erosionFrontierAdd: 0.1,  // フロンティア保有による微増(/時)
  erosionLoginDown: 40,     // デイリーログイン時の低下
  erosionBuggerDown: 8,     // バガー撃破での低下
  erosionT1: 40, erosionT2: 70, // 影響しきい値
  erosionIncome1: 0.95, erosionIncome2: 0.9,   // 生産係数
  erosionBreed1: 1.15, erosionBreed2: 1.3,     // 繁殖CD係数
  erosionBoss1: 1.1, erosionBoss2: 1.2,        // ボスHP係数
  // V4.1: HQ拡張 (§7)
  rocketStages: [20, 40, 80, 160, 320],  // 段階ごとの必要イリジウム
  geneAmberCost: 5,         // 遺伝子解析1回の琥珀
  meteoriteLegendChance: 0.1, // 隕石から伝説が出る確率
  forgeTitaniumCost: 3,     // 設備の上限突破1回のチタン鉱
  amethystLegendCost: 10,   // アメジスト→始祖の卵
  // V3: 開拓 (GameExpansion_V3 §9.2)
  pioneerCrickets: 100,     // 開拓支給コオロギ(+HQ Lv×20)
  pioneerCoins: 5000,       // 開拓資金(+HQ Lv×2000)
  founderCount: 2,          // 任意で連れて行ける創始者の数(V4 §2.1-C: 任意ボーナス)
  nativeCount: 3,           // 現地生物の初期生息数(V4 §2.1-A: 0匹が原理的に起きない)
  // V4: 資源(フロー型 §3.3)。アイテムとして拾わず、運営から生まれ消費される
  resBioPerFeed: 0.2,       // 餌やり1回の生態データ
  resBioPerHatch: 2,        // 孵化1回
  resBioPerBreed: 1,        // 繁殖1回
  resBioPerDex: 10,         // 図鑑新規登録
  resFoodPerFeederLv: 0.05, // 巣Lvごとの食料供給(/秒)。§8.12で餌場から巣へ統合(定数名は歴史的に据置)
  resEnergyPerDevLv: 0.02,  // 惑星開発Lvごとのエネルギー(/秒)
  autoFeedFoodCost: 0.02,   // 【撤廃済・Ric裁定 2026-07-24 §5nnn】巣の自動給餌は機構ごと撤廃(コード参照なし・記録として残置)
  // §8.12: 餌場・繁殖施設を撤廃し効果を巣(nest.lv)へ統合。天井維持=nest上限Lv8で旧施設の最大相当。
  nestBreedCdPerLv: 0.075,    // 繁殖CD -7.5%/Lv (旧 繁殖施設 -4%×15=-60% → 巣Lv8で-60%)
  nestSpeciesMutPerLv: 0.0075,// 上位種変異 +0.75%/Lv (旧 +0.4%×15=6% → Lv8で6%)
  nestMorphMutPerLv: 0.015,   // モーフ変異 +1.5%/Lv (旧 +0.8%×15=12% → Lv8で12%)
  nestLegendPerLv: 0.0013,    // 伝説 +0.13%/Lv (旧 +0.07%×15≈1.05% → Lv8で≈1.04%)
  nestCricketPerLv: 0.625,    // コオロギ自然湧き +0.625/秒/Lv (旧 餌場 +0.5×10=5/秒 → Lv8で5/秒)
  nestAutoFeedPerLv: 1.25,    // 【撤廃済・Ric裁定 2026-07-24 §5nnn】給餌の自動化はクランク経路のみ(コード参照なし・記録として残置)
  nestOmenLv: 3,              // 卵のレア予兆を出す巣Lv閾値(旧 繁殖施設Lv3)
  nestReserveLv: 5,           // 【撤廃済・Ric裁定 2026-07-29】繁殖予約の解禁巣Lv(コード参照なし・記録として残置)
  sciencePerDepth: 1,       // 探索の深層(6層以降)1層ごとの研究力
  goldToFoodRate: 100,      // 100G → 食料1
  goldToEnergyRate: 150,    // 150G → エネルギー1
  bioToScienceRate: 10,     // 生態データ10 → 研究力1
  convertBatch: 50,         // 変換ボタン1回の取得量
  mutateBioCost: 50,        // 突然変異に使う生態データ(旧: 変異素材3)
  // Phase6 ボスHPの惑星別たたき台(味方が全惑星に入った分の調整枠)。★全てたたき台=Ric実機で最終調整。既定=1.0倍(未指定は1)。
  bossHpMultByStage: { 1: 1.0, 2: 1.05, 3: 1.0476, 4: 1.05, 5: 1.0476, 6: 1.15, 7: 1.055, 8: 1.1, 9: 1.1, 10: 1.0952 },
  // Phase6 署名ボス出現率: ボス選定時、この確率でその惑星の署名脅威型(=固有ボス)にする。残りは汎用脅威型で変化(毒/強奪/妨害等)。
  //   ★たたき台=Ric実機で最終調整(1.0=毎回署名 / 0=従来の重み抽選)。署名脅威型がrank未達の惑星は従来抽選へフォールバック。
  sigBossChance: 1.0,       // Phase6: 署名ボスが実質100%(汎用の姿はフィールドに出さない)。minRank縛りは撤廃=その惑星の主は常に主。★変化を戻すなら<1に
  // V4: フロンティア誘導 (§2.2)
  frontierIncomeMult: 1.5,  // 最新惑星の生産倍率
  frontierRaidMult: 1.5,    // 最新惑星の襲撃報酬倍率
  frontierXpMult: 1.25,     // 最新惑星のランクXP倍率
  xpTierFloor: 0.3,         // 旧惑星XP寄与の下限(ソフトキャップ)
  // V4: 惑星開発(Goldシンク §2.3-3)
  devCostBase: 50000,
  devCostMult: 1.5,
  devMaxLv: 50,
  devIncomePerLv: 0.02,     // 開発Lvごとの生産+(その惑星のみ)
  // V4: 侵略圧 (§3.5.3・演出寄り)
  invasionRiseFrontier: 3,  // フロンティアの上昇(/時)
  invasionRiseOther: 1,     // その他の惑星(/時)
  invasionRaidWin: 5,       // 撃退での減少
  invasionBuggerWin: 10,    // バガー撃破での減少
  invasionRaidAccel: 0.002, // 1ptごとの襲撃間隔短縮率(最大0.2)
  // V4: 繁殖予約(QoL §3.1.3)【撤廃済・Ric裁定 2026-07-29: 繁殖の自動化は作らない】
  autoBreedInterval: 6,     // 自動繁殖の試行間隔(秒)。コード参照なし・記録として残置
  dialRates: [4, 1, 0.15],  // 給餌間隔(秒) 低/中/高。高=旧・長押し一括餌やり速度(v2.1 §1.4)
  dialSpinSec: [5, 1.6, 0.4], // オート回転の1周秒数(視覚)。レートに同期(v2.1 §1.4)
  crankFxLevel: 1,          // 機構スキンのエフェクト量(0=最小/1=標準。Crank_Deepening)
  crankCheapLevel: 1,       // ID9ジャンク機構のチープさ(0=控えめ/1=あからさま。crank.md §3.4)
  bugSweepSpawnSec: 4.5,    // ID8小バガーの出現間隔(平均秒・±50%ゆらぎ。純演出・絶え間なく)
  bugSweepMax: 7,           // ID8小バガーの同時最大数(溜まる不安の上限)
  bugSweepLockSec: 0.3,     // 一掃中の照準ロック(秒・高速)
  bugSweepBeamSec: 0.12,    // レーザー照射時間(秒)
  bugSweepEverySec: 24,     // 一掃までの溜め時間(秒。熱暴走ゲージと同じ緊張構造)
  bugSweepMinPurge: 4,      // 一掃を開始する最低の溜まり数
  bugSweepScale: 1.35,      // 小バガーの表示スケール(1=旧サイズ。気配が主張に変わらない範囲で調整)
  // Brushup V2 Phase3: ボス脅威表現(描画のみ・戦闘ロジック不変)
  bossScaleBoss: 1.45,      // ボス級(tier/boss/elite)の基本拡大率
  bossScaleTier: 0.06,      // ティア1ごとの追加拡大
  bossScaleSnake: 1.1,      // 序盤の通常襲来(=下位個体)の控えめな拡大
  minionScale: 0.78,        // ★下位個体(幼体)の追加縮小(案C・2026-08-01)。主より明らかに小さく見せる。★Ric実機で調整可
  bossBreath: 0.035,        // 呼吸(拡縮)の振幅
  bossApproach: 1.3,        // 迫り(未到着シルエット)の追加拡大
  eliteScale: 1.15,         // Phase6: 大ボス(elite)は一回り大きい(通常/eliteの描き分け)。★CFG調整可
  eliteAuraR: 168,          // 大ボスの脅威色オーラ半径
  eliteAuraA: 0.34,         // 大ボスの脅威色オーラの濃さ(脈動の基準)
  // Phase4: 終盤コンテンツ (GameExpansion_v2 ⑨)
  legendChance: 0.004,      // 繁殖時の伝説変異率(祭壇 +0.2%/Lv)
  luckyEggInterval: 300,    // ラッキー卵の抽選間隔(秒)
  luckyEggChance: 0.25,
  eventInterval: 420,       // 定期イベントの抽選間隔(秒)
  eventChance: 0.55,
  eventMinRank: 30,
};

// 称号 (⑨-1)。cond は Game.state を受け取る
const TITLES = [
  { id: "hatch5",   name: "駆け出しブリーダー", hint: "卵を5個孵化",         cond: (s) => s.stats.hatched >= 5 },
  { id: "win25",    name: "コロニーの盾",       hint: "襲撃を25回撃退",       cond: (s) => s.stats.raidsWon >= 25 },
  { id: "win100",   name: "百戦の守護者",       hint: "襲撃を100回撃退",      cond: (s) => s.stats.raidsWon >= 100 },
  { id: "boss30",   name: "ボスバスター",       hint: "ボスを30回撃破",       cond: (s) => s.stats.bossWon >= 30 },
  { id: "dex50",    name: "図鑑学者",           hint: "図鑑コンプ率50%",      cond: (s) => Game.dexRate() >= 0.5 },
  { id: "dex100",   name: "生ける図鑑",         hint: "図鑑コンプリート",     cond: (s) => Game.dexRate() >= 1 },
  { id: "rank50",   name: "コロニーの主",       hint: "ランク50到達",         cond: (s) => s.rank >= 50 },
  { id: "rank100",  name: "伝説のコロニー王",   hint: "ランク100到達",        cond: (s) => s.rank >= 100 },
  { id: "legend",   name: "始祖の血族",         hint: "伝説個体を図鑑に登録", cond: (s) => Object.keys(s.dex).some((k) => k.endsWith(":legendary")) },
  { id: "allies6",  name: "百獣の盟主",         hint: "10惑星すべての主を撃退", cond: (s) => STAGES.every((st) => (s.stats.bossPlanets || {})[st.id]) },
  { id: "rich",     name: "黄金コロニー",       hint: "所持金100M",           cond: (s) => s.coins >= 100e6 },
  { id: "breed100", name: "愛の伝道師",         hint: "繁殖100回",            cond: (s) => s.stats.bred >= 100 },
];

// 定期イベント (⑨-13〜15: 既存数値の一時変化+ご褒美)
const EVENTS = [
  { id: "festival", name: "豊穣祭",         icon: "spark", dur: 60, incomeMult: 2,   desc: "コイン生産2倍のお祭り!" },
  { id: "swarm",    name: "コオロギ大発生", icon: "cricket", dur: 60, cricketRate: 3,  desc: "コオロギが大量に湧く!" },
  { id: "storm",    name: "嵐",             icon: "warn", dur: 45, incomeMult: 0.5, endGems: 4, desc: "生産半減…耐え切ればジェム4個" },
  { id: "heatwave", name: "猛暑日",         icon: "heat", dur: 60, xpMult: 1.5,     desc: "代謝が上がり餌のXP+50%" },
];

// ショップ進化: ランクに応じて購入単位が繰り上がる (GameExpansion_v2 ⑤)
const SHOP_TIERS = [
  { rank: 0,  units: [10, 100] },
  { rank: 30, units: [100, 1000] },
  { rank: 60, units: [1000, 10000] },
];
const shopUnitsFor = (rank) => {
  let u = SHOP_TIERS[0].units;
  for (const t of SHOP_TIERS) if (rank >= t.rank) u = t.units;
  return u;
};

// 種族マスタ (hue/sat/light は基準体色)。stage6〜10は各ステージ専用レア個体
const SPECIES = [
  { id: "kanahebi",    name: "ニホンカナヘビ",        stars: 1, stage: 1, atk: 2,  income: 0.5, sell: 40,   size: 0.75, hue: 35,  sat: 55, light: 45 },
  { id: "nihontokage", name: "ニホントカゲ",          stars: 1, stage: 1, atk: 3,  income: 0.6, sell: 55,   size: 0.80, hue: 210, sat: 45, light: 45 },
  { id: "leopa",       name: "ヒョウモントカゲモドキ", stars: 2, stage: 2, atk: 5,  income: 1.2, sell: 160,  size: 0.85, hue: 48,  sat: 85, light: 55 },
  { id: "futoago",     name: "フトアゴヒゲトカゲ",    stars: 2, stage: 2, atk: 7,  income: 1.5, sell: 220,  size: 1.00, hue: 28,  sat: 60, light: 50 },
  { id: "aojita",      name: "アオジタトカゲ",        stars: 3, stage: 3, atk: 11, income: 3.0, sell: 550,  size: 1.05, hue: 18,  sat: 40, light: 48 },
  { id: "erimaki",     name: "エリマキトカゲ",        stars: 3, stage: 3, atk: 13, income: 3.5, sell: 650,  size: 0.95, hue: 25,  sat: 50, light: 40 },
  { id: "tegu",        name: "テグー",                stars: 4, stage: 4, atk: 22, income: 7.0, sell: 1600, size: 1.20, hue: 0,   sat: 12, light: 35 },
  { id: "komodo",      name: "コモドドラゴン",        stars: 5, stage: 5, atk: 45, income: 15,  sell: 5500, size: 1.40, hue: 80,  sat: 18, light: 33 },
  { id: "emerald",     name: "エメラルドモニター",    stars: 4, stage: 6, atk: 30, income: 10,  sell: 2600, size: 1.15, hue: 150, sat: 65, light: 42 },
  { id: "blackdragon", name: "ブラックドラゴン",      stars: 4, stage: 7, atk: 36, income: 12,  sell: 3200, size: 1.25, hue: 270, sat: 15, light: 16 },
  { id: "hakugin",     name: "ハクギンモニター",      stars: 5, stage: 8, atk: 48, income: 18,  sell: 7000, size: 1.30, hue: 210, sat: 8,  light: 82 },
  { id: "glow",        name: "ヒカリトカゲ",          stars: 5, stage: 9, atk: 55, income: 24,  sell: 9000, size: 1.00, hue: 175, sat: 80, light: 60, glow: true },
  { id: "ancient",     name: "シソリュウ(始祖竜)",    stars: 5, stage: 10, atk: 80, income: 40, sell: 20000, size: 1.50, hue: 45, sat: 75, light: 50, glow: true },
  // V3 Phase5: Stage固有種の増強(各ステージの生態系)
  { id: "mizuoo",      name: "ミズオオトカゲ",        stars: 3, stage: 4, atk: 14, income: 4.0, sell: 750,  size: 1.10, hue: 190, sat: 35, light: 35 },
  { id: "yougan",      name: "ヨウガンヤモリ",        stars: 4, stage: 5, atk: 28, income: 9,   sell: 2400, size: 0.95, hue: 15,  sat: 85, light: 45, glow: true },
  { id: "jade",        name: "ジェイドゲッコー",      stars: 4, stage: 6, atk: 26, income: 9,   sell: 2300, size: 0.90, hue: 130, sat: 55, light: 50 },
  { id: "dokuyubi",    name: "ドクユビヤモリ",        stars: 4, stage: 7, atk: 32, income: 11,  sell: 2900, size: 0.95, hue: 290, sat: 45, light: 40 },
  { id: "yukikana",    name: "ユキカナヘビ",          stars: 4, stage: 8, atk: 34, income: 12,  sell: 3100, size: 0.85, hue: 200, sat: 12, light: 88 },
  { id: "menashi",     name: "メナシトカゲ",          stars: 4, stage: 9, atk: 38, income: 14,  sell: 3600, size: 1.00, hue: 260, sat: 20, light: 68 },
  { id: "ishigami",    name: "イシガミトカゲ",        stars: 5, stage: 10, atk: 60, income: 28, sell: 12000, size: 1.30, hue: 40, sat: 20, light: 55 },
];

// モーフ(色変異)マスタ。recolor で遺伝色を上書き加工する
// legendary は通常のモーフ変異では出ず、専用抽選のみ(Phase4 ⑨-6 伝説個体)
const MORPHS = [
  { id: "normal",     name: "ノーマル",         mult: 1.0, recolor: (h, s, l) => [h, s, l] },
  { id: "albino",     name: "アルビノ",         mult: 1.5, recolor: (h, s, l) => [40, 32, 80] },
  { id: "melanistic", name: "メラニスティック", mult: 1.5, recolor: (h, s, l) => [h, Math.round(s * 0.35), 17] },
  { id: "golden",     name: "ゴールデン",       mult: 2.0, recolor: (h, s, l) => [47, 92, 55] },
  { id: "legendary",  name: "レジェンダリー",   mult: 3.0, recolor: (h, s, l) => [h, 90, 60], legendary: true },
];

const PATTERNS = ["none", "stripe", "spots", "bands"];

// 設備マスタ (V4 §3.1: 26種→10種へ統廃合。tab="norm"通常/"def"防衛。深いLvカーブ=Goldシンク)
const FACILITIES = [
  // --- 通常設備(育成・繁殖・QoL) ---
  { id: "water",       name: "水場",     icon: "water", tab: "norm", unlock: 0,  max: 20, baseCost: 300,    costMult: 1.5,
    desc: "生産 +7%/Lv・毒の持続 -5%/Lv(給水塔・高級水槽を統合)" },
  { id: "heat",        name: "保温設備", icon: "heat", tab: "norm", unlock: 0,  max: 20, baseCost: 350,    costMult: 1.5,
    desc: "餌XP +6%/Lv・負傷回復 +4%/Lv・孵化 -2.5%/Lv(ライト・保温器・温室を統合)" },
  { id: "observatory", name: "展望台",   icon: "observatory", tab: "norm", unlock: 25, max: 10, baseCost: 30000,  costMult: 1.6,
    desc: "先制 +0.8秒/Lv・図鑑コンプ率×4%/Lvぶん生産(展望岩・標本棚・研究所を統合)" },
  // --- 防衛設備(ボス対策専用) ---
  { id: "fence",       name: "フェンス", icon: "fence", tab: "def", unlock: 0,  max: 10, baseCost: 500,    costMult: 1.6,
    desc: "先制攻撃時間 +2秒/Lv・敵の攻撃間隔 +1秒/Lv" },
  { id: "watchtower",  name: "監視塔",   icon: "watchtower", tab: "def", unlock: 40, max: 10, baseCost: 100000, costMult: 1.7,
    desc: "迎撃の総攻撃力 +4%/Lv" },
  { id: "trap",        name: "罠設備",   icon: "trap", tab: "def", unlock: 45, max: 15, baseCost: 200000, costMult: 1.6,
    desc: "侵入時ダメージ +1.2%/Lv・毒軽減 +2.5%/Lv・急降下妨害 +3.5%/Lv。Lv3:ウェブ自動焼却(罠+薬草園+反射板+篝火を統合)" },
];

// シナジー示唆 (V2⑥継承・統合後版): 効果が自然に重なるだけで成立
const FACILITY_SYNERGIES = [
  { ids: ["water", "trap"],              name: "毒無効化",       desc: "オオサソリの毒がほぼ機能しなくなる" },
  { ids: ["fence", "trap", "watchtower"], name: "対侵入要塞",    desc: "遅延+侵入ダメージ+迎撃強化で守り切る" },
];

// ステージ(コロニーランクで進行)。rock/pebble は地面テクスチャ用の対比色
// env=環境ギミック / bosses=このステージで出やすい専用敵(抽選重み×2) / envText=UI表示
const STAGES = [
  { id: 1, name: "乾燥地帯", rank: 1,  icon: "p-desert", mat: "乾いた砂",   nest: "地下巣穴",     sky: "#c9a86a", sky2: "#8f7440", ground: "#b28e5a", ground2: "#8a6b40", accent: "#6d5432", rock: "#8a7355", pebble: "#cbb083",
    env: {}, bosses: ["snake"], envText: "はじまりの地" },
  { id: 2, name: "摩天楼スラム", rank: 5, icon: "p-city", mat: "廃材", nest: "排水管の巣", sky: "#2a3352", sky2: "#12162b", ground: "#3f3f4c", ground2: "#2a2a35", accent: "#1e1e2a", rock: "#4d4d5e", pebble: "#62627a",
    env: {}, bosses: ["scorpion"], envText: "ネオンの光と、届かない光の街" },
  { id: 3, name: "森林",     rank: 10, icon: "p-forest", mat: "樹液",       nest: "巨木の樹上巣", sky: "#5f8a5a", sky2: "#39573a", ground: "#4c7040", ground2: "#37522e", accent: "#263a20", rock: "#63614f", pebble: "#8c866a",
    env: {}, bosses: ["snake"], envText: "木漏れ日の森" },
  { id: 4, name: "古代古墳", rank: 18, icon: "p-kofun", mat: "金鈴片",     nest: "周濠の巣",     sky: "#6a9a8a", sky2: "#40655c", ground: "#5a7a62", ground2: "#405a48", accent: "#2c4034", rock: "#5f6a5e", pebble: "#83907f",
    env: {}, bosses: ["monitor"], envText: "水鏡に王墓が浮かぶ、悼みの地" },
  { id: 5, name: "火山",     rank: 28, icon: "p-volcano", mat: "黒曜石",     nest: "火山洞窟",     sky: "#8a4a3a", sky2: "#4a241c", ground: "#6e4234", ground2: "#4a2a21", accent: "#301a14", rock: "#6a544a", pebble: "#96624c",
    env: { burnWebs: true }, bosses: ["snake"], envText: "熱でクモのウェブが焼ける" },
  { id: 6, name: "密林",     rank: 50, icon: "p-jungle", mat: "供花",       nest: "神木の樹上巣", sky: "#4f7a46", sky2: "#2e4c2c", ground: "#3e5c33", ground2: "#2a4024", accent: "#1c2e18", rock: "#55604a", pebble: "#75885e",
    env: { crickets: 0.3 }, bosses: ["spider", "crow", "monitor"], envText: "食料神の恵み満ちる祭祀の森。コオロギが自然に湧く(+0.3/秒)" },
  { id: 7, name: "水中都市", rank: 60, icon: "p-abyss", mat: "真珠母",     nest: "水底の巣",     sky: "#3d6b82", sky2: "#16334a", ground: "#3d5a5e", ground2: "#28444a", accent: "#1c333c", rock: "#4a6468", pebble: "#6e8a8a",
    env: { poisonMult: 0.7, incomeMult: 1.05 }, bosses: ["scorpion", "crow", "snake"], envText: "水底に安らう静かな都。浄水の循環が毒を洗い流し(-30%)、都市の恵みで生産+5%" },
  { id: 8, name: "氷の前線", rank: 70, icon: "p-sentry", mat: "氷晶",     nest: "氷穴",         sky: "#a8c4e0", sky2: "#5f7fa5", ground: "#dde8f2", ground2: "#aebfd2", accent: "#8fa5bf", rock: "#8a95a5", pebble: "#c3ccd9",
    env: { recoveryMult: 0.5, heatBoost: 2 }, bosses: ["hawk", "monitor", "bugger"], envText: "機械が巡回する氷の前線。低温で回復半減・保温設備2倍。誰がこの技術を与えたのかは、誰も知らない" },
  { id: 9, name: "廃原子炉", rank: 80, icon: "p-reactor", mat: "予備部品", nest: "冷却管の巣", sky: "#333c46", sky2: "#181e24", ground: "#3c4146", ground2: "#282c30", accent: "#20242a", rock: "#4e565e", pebble: "#69727c",
    env: { capMult: 0.92, morphBonus: 0.03 }, bosses: ["spider", "scorpion"], envText: "文明がもがいた廃炉の静寂。立入制限で収容-8%、残留放射線で変異率+3%" },
  { id: 10, name: "古代遺跡", rank: 90, icon: "p-ruins", mat: "遺物片",    nest: "遺跡地下墓所", sky: "#c9924f", sky2: "#7a4f33", ground: "#8a7355", ground2: "#5f4c38", accent: "#46362a", rock: "#7d7468", pebble: "#a89a83",
    env: { relic: true }, bosses: ["snake", "hawk", "crow", "monitor", "scorpion", "spider"], envText: "遺物ボーナス: 撃退数×0.1%の生産増(最大+20%)" },
];
const stageById = (id) => STAGES.find((s) => s.id === id);

// V4 §3.2: Stage→惑星。各ステージに惑星名を付与(概念はV3のStageDataを継承)
const PLANET_NAMES = {
  1: "アリド", 2: "ネオヴェルデ", 3: "シルヴァ", 4: "パルス", 5: "イグニス",
  6: "ユンガ", 7: "メアリス", 8: "グラキス", 9: "ヴォルタ", 10: "オリジン",
};
for (const st of STAGES) st.pname = `惑星${PLANET_NAMES[st.id]}`;

// V4 §3.3: 資源定義(フロー型・4種でスタート)
const RES = [
  { id: "bio",     name: "生態データ", icon: "bio", hint: "育成・繁殖・図鑑から生まれる" },
  { id: "food",    name: "食料供給",   icon: "food", hint: "餌場やGold変換で確保。自動給餌の燃料" },
  { id: "energy",  name: "エネルギー", icon: "energy", hint: "惑星開発やGold変換で確保" },
  { id: "science", name: "研究力",     icon: "science", hint: "探索の深層・生態データ変換で得る" },
];
const resById = (id) => RES.find((r) => r.id === id);

// V4 §3.5: Lore(世界観エントリ。遊ぶうちに解放されるコレクション)
const LORE = [
  { id: "intro",    name: "惑星レプタイル",     cond: () => true,
    text: "高度な文明を築いたトカゲたちの母星レプタイル。近隣惑星で行われた虫養殖実験が暴走し、圧倒的繁殖力を持つ実験生命体「バガー」が誕生。母星は侵食され、文明は複数の惑星へと散った。" },
  { id: "hq",       name: "本部ネットワーク",   cond: (s) => s.rank >= 10,
    text: "生き残った文明は各惑星を本部(HQ)のネットワークで接続した。研究も、資源も、想いも——その回線の上を、トカゲたちの未来が流れていく。" },
  { id: "cricket",  name: "コオロギと文明",     cond: (s) => s.stats.fed >= 500,
    text: "コオロギは文明の食の柱。だが忘れてはならない——バガーもまた、同じ虫の実験から生まれた。養うか、暴走させるか。その境界は薄い。" },
  { id: "native",   name: "現地生物との共存",   cond: () => Game.pioneeredCount() >= 2,
    text: "新しい惑星は無人ではない。そこには既に野生のトカゲたちが暮らしている。移住者は侵略者ではなく、隣人として迎えられた。" },
  { id: "bugger",   name: "実験生命体バガー",   cond: (s) => (s.stats.buggerWon || 0) >= 1,
    text: "甲殻に覆われた侵略者。彼らは宇宙を越えて卵を飛ばし、緑の惑星を喰らい尽くす。だが今日はじめて、私たちは一体を押し返した。" },
  { id: "frontier", name: "最前線",             cond: (s) => s.rank >= 50,
    text: "侵略は常にフロンティアで最も激しい。最新の入植地こそが、戦いの——そして成長の——最前線となる。" },
  { id: "exodus",   name: "大移住",             cond: () => Game.pioneeredCount() >= 4,
    text: "4つ目のコロニーに灯がともった夜、通信網に古い歌が流れた。母星で歌われた、卵をあたためる歌だという。" },
  { id: "legend",   name: "始祖の記憶",         cond: (s) => Object.keys(s.dex).some((k) => k.endsWith(":legendary")),
    text: "虹色に輝く個体は「始祖の血」と呼ばれる。文明が生まれるより前、最初の卵を守った竜の色だと伝えられている。" },
  { id: "origin",   name: "遺跡惑星オリジン",   cond: (s) => s.rank >= 90,
    text: "苔むした石柱の碑文はこう読める——『我らは去る。だが卵は残す』。この星こそが、すべての始まりの星だったのかもしれない。" },
  { id: "push",     name: "押し返す光",         cond: (s) => s.stats.raidsWon >= 200,
    text: "200度の防衛。侵略度の計器が、初めて全惑星で下向きに振れた。終わりはまだ遠い。だが確かに、光は押し返している。" },
  { id: "rocket",   name: "新天地へ",           cond: (s) => !!(s.rocket && s.rocket.done),
    text: "巣ネットワークが運んだ鉱石で、ロケットは完成した。発射の朝、全惑星のトカゲが空を見上げた。バガーに奪われた星々の先へ——卵は、また旅をする。" },
];

// ============================================================
// V4.1: 希少鉱石(§5 巣ノード報酬・フロー資源とは別ウォレット)
// ============================================================
const ORES = [
  { id: "amethyst",    name: "アメジスト",   icon: "amethyst", hint: "最上位の貴重鉱石。やり込みの証" },
  { id: "iridium",     name: "イリジウム",   icon: "iridium", hint: "ロケット建造の燃料。惑星移住計画へ" },
  { id: "amber",       name: "琥珀",         icon: "amber", hint: "太古の遺伝子を封じた樹脂。遺伝子解析に" },
  { id: "meteorite",   name: "隕石",         icon: "meteorite", hint: "中身が未確定の鉱塊。割ると希少個体が…" },
  { id: "orichalcum",  name: "オリハルコン", icon: "orichalcum", hint: "伝説の金属。HQ上位研究の鍵" },
  { id: "titaniumOre", name: "チタン鉱",     icon: "titanium", hint: "設備を\"化けさせる\"特殊鉱石(上限突破)" },
];
const oreById = (id) => ORES.find((o) => o.id === id);

// ============================================================
// V4.1: 巣ネットワーク(§3 蜘蛛の巣状・完全放置・閲覧専用)
// 中心+5リング(8/12/16/20/24)=81ノード。条件は既存の累計値のみ=新ルールなし
// ============================================================
const NESTWEB_RINGS = [8, 12, 16, 20, 24];
const NEST_CONDS = [
  { type: "bred",    name: "繁殖",        base: 15,  icon: "breed" },
  { type: "hatched", name: "孵化",        base: 12,  icon: "egg" },
  { type: "species", name: "発見種族",    base: 4,   icon: "lizard" },
  { type: "morphs",  name: "レアモーフ",  base: 3,   icon: "spark" },
  { type: "dexRate", name: "図鑑率",      base: 10,  icon: "dex" },
  { type: "wins",    name: "撃退",        base: 20,  icon: "shield" },
];
const NEST_ORES_BY_RING = [
  ["amber", "titaniumOre"],
  ["iridium", "amber"],
  ["meteorite", "titaniumOre"],
  ["orichalcum", "iridium"],
  ["amethyst", "orichalcum"],
];
const NEST_GROWTH = { bred: 2.6, hatched: 2.6, species: 0, morphs: 0, dexRate: 0, wins: 2.4 };

// ノード生成(定義は保存しない・解放IDのみセーブ)
function buildNestWeb() {
  const nodes = [{ id: "core", ring: -1, angle: 0, conds: [], reward: null, name: "巣の中心" }];
  for (let r = 0; r < NESTWEB_RINGS.length; r++) {
    const n = NESTWEB_RINGS[r];
    for (let i = 0; i < n; i++) {
      const c = NEST_CONDS[(i + r) % NEST_CONDS.length];
      const jitter = 0.8 + 0.4 * ((i % 3) / 2);
      let need;
      if (c.type === "species") need = Math.min(20, Math.round((c.base + r * 3) * jitter));
      else if (c.type === "morphs") need = Math.round((c.base + r * 5) * jitter);
      else if (c.type === "dexRate") need = Math.min(95, Math.round((c.base + r * 17) * jitter));
      else need = Math.round(c.base * Math.pow(NEST_GROWTH[c.type], r) * jitter);
      const conds = [{ type: c.type, need }];
      // 深部(リング4=index3以降)は複合条件 (§3.2)
      if (r >= 3) {
        const c2 = NEST_CONDS[(i + r + 2) % NEST_CONDS.length];
        let need2;
        if (c2.type === "species") need2 = Math.min(20, Math.round((c2.base + r * 3) * 0.8));
        else if (c2.type === "morphs") need2 = Math.round((c2.base + r * 5) * 0.8);
        else if (c2.type === "dexRate") need2 = Math.min(90, Math.round((c2.base + r * 15) * 0.8));
        else need2 = Math.round(c2.base * Math.pow(NEST_GROWTH[c2.type], r) * 0.8);
        conds.push({ type: c2.type, need: need2 });
      }
      const ore = NEST_ORES_BY_RING[r][i % 2];
      const amount = ore === "amethyst" ? 1 + (i % 2) : 1 + (i % 3) + (r >= 3 ? 1 : 0);
      nodes.push({
        id: `n${r}-${i}`, ring: r,
        angle: (i / n) * Math.PI * 2 + r * 0.35,
        conds,
        reward: { ore, n: amount },
        name: `${c.name}の糸 ${["I", "II", "III", "IV", "V"][r]}`,
        icon: c.icon,
      });
    }
  }
  return nodes;
}

// ============================================================
// V3: 本部研究(全Stage共通の恒久ツリー / §9.3)
// ============================================================
// V4: 研究コスト=研究力+Gold(素材廃止・Goldシンク §2.3-4)
const RESEARCH = [
  { id: "prod1",    name: "生産効率 I",    cost: { science: 5,  coins: 100000 },  eff: { income: 0.05 },  desc: "全惑星のコイン生産+5%" },
  { id: "prod2",    name: "生産効率 II",   cost: { science: 15, coins: 400000 },  eff: { income: 0.10 },  req: "prod1", desc: "さらに生産+10%" },
  { id: "prod3",    name: "生産効率 III",  cost: { science: 40, coins: 1500000 }, eff: { income: 0.15 },  req: "prod2", desc: "さらに生産+15%" },
  { id: "explore1", name: "探索技術 I",    cost: { science: 5,  coins: 100000 },  eff: { explore: 0.10 }, desc: "探索速度+10%" },
  { id: "explore2", name: "探索技術 II",   cost: { science: 15, coins: 400000 },  eff: { explore: 0.15 }, req: "explore1", desc: "さらに探索速度+15%" },
  { id: "hatch1",   name: "孵化学 I",      cost: { science: 8,  coins: 150000 },  eff: { hatch: 0.10 },   desc: "孵化時間-10%" },
  { id: "hatch2",   name: "孵化学 II",     cost: { science: 20, coins: 600000 },  eff: { hatch: 0.15 },   req: "hatch1", desc: "さらに孵化時間-15%" },
  { id: "war1",     name: "迎撃戦術 I",    cost: { science: 8,  coins: 150000 },  eff: { atk: 0.05 },     desc: "迎撃攻撃力+5%" },
  { id: "war2",     name: "迎撃戦術 II",   cost: { science: 20, coins: 600000 },  eff: { atk: 0.10 },     req: "war1", desc: "さらに攻撃力+10%" },
  { id: "offline1", name: "留守番体制 I",  cost: { science: 10, coins: 250000 },  eff: { offlineH: 12 },  desc: "オフライン進行上限+12時間" },
  { id: "offline2", name: "留守番体制 II", cost: { science: 25, coins: 800000 },  eff: { offlineH: 12 },  req: "offline1", desc: "さらに+12時間(計48h)" },
  { id: "legend1",  name: "始祖の知恵",    cost: { science: 60, coins: 5000000 }, eff: { legend: 0.004 }, desc: "伝説変異率+0.4%" },
  // V4.1 §6.2: 侵食抑制技術(オリハルコンを要求する上位研究)
  { id: "erosion1", name: "侵食抑制 I",    cost: { science: 20, coins: 500000, orichalcum: 3 },  eff: { erosionSlow: 0.25, erosionDown: 10 }, desc: "侵食の自然上昇-25%・ログイン低下+10" },
  { id: "erosion2", name: "侵食抑制 II",   cost: { science: 50, coins: 2000000, orichalcum: 8 }, eff: { erosionSlow: 0.25, erosionDown: 15 }, req: "erosion1", desc: "さらに上昇-25%・低下+15" },
];
const researchById = (id) => RESEARCH.find((r) => r.id === id);

// ミッション(実績型)。check は Game.state を受け取る
const MISSIONS = [
  { id: "pop10",   name: "トカゲを10匹にする",       reward: { gems: 2 },              check: (s) => s.lizards.length >= 10 },
  { id: "pop25",   name: "トカゲを25匹にする",       reward: { gems: 5 },              check: (s) => s.lizards.length >= 25 },
  { id: "feed50",  name: "餌やり50回",               reward: { coins: 800 },           check: (s) => s.stats.fed >= 50 },
  { id: "feed500", name: "餌やり500回",              reward: { gems: 4 },              check: (s) => s.stats.fed >= 500 },
  { id: "hatch5",  name: "卵を5個孵化させる",        reward: { gems: 2 },              check: (s) => s.stats.hatched >= 5 },
  { id: "hatch30", name: "卵を30個孵化させる",       reward: { gems: 6 },              check: (s) => s.stats.hatched >= 30 },
  { id: "win5",    name: "襲来を5回撃退する",          reward: { gems: 3 },              check: (s) => s.stats.raidsWon >= 5 },
  { id: "win20",   name: "襲来を20回撃退する",         reward: { gems: 8 },              check: (s) => s.stats.raidsWon >= 20 },
  { id: "boss1",   name: "惑星の主を撃退する",         reward: { gems: 5 },              check: (s) => s.stats.bossWon >= 1 },
  { id: "rank10",  name: "コロニーランク10に到達",   reward: { gems: 5 },              check: (s) => s.rank >= 10 },
  { id: "dex25",   name: "図鑑コンプ率25%",          reward: { gems: 3 },              check: (s) => Game.dexRate() >= 0.25 },
  { id: "dex50",   name: "図鑑コンプ率50%",          reward: { gems: 6 },              check: (s) => Game.dexRate() >= 0.50 },
  { id: "dex100",  name: "図鑑コンプリート!",        reward: { gems: 50, coins: 100000 }, check: (s) => Game.dexRate() >= 1.0 },
  // Phase4 追加実績 (⑨-2)
  { id: "win50",   name: "襲来を50回撃退する",         reward: { gems: 5 },              check: (s) => s.stats.raidsWon >= 50 },
  { id: "win200",  name: "襲来を200回撃退する",      reward: { gems: 12 },             check: (s) => s.stats.raidsWon >= 200 },
  { id: "boss30",  name: "ボスを30回撃破する",       reward: { gems: 8 },              check: (s) => s.stats.bossWon >= 30 },
  { id: "bred100", name: "繁殖100回",                reward: { gems: 6 },              check: (s) => s.stats.bred >= 100 },
  { id: "sold50",  name: "トカゲを50匹売却する",     reward: { coins: 50000 },         check: (s) => s.stats.sold >= 50 },
  { id: "rank50",  name: "コロニーランク50に到達",   reward: { gems: 6 },              check: (s) => s.rank >= 50 },
  { id: "stage10", name: "古代遺跡に到達する",       reward: { gems: 10 },             check: (s) => s.rank >= 90 },
  { id: "allies6", name: "5つの惑星で主を撃退する",  reward: { gems: 10 },             check: (s) => Object.keys(s.stats.bossPlanets || {}).length >= 5 },
  { id: "legend1", name: "伝説個体を図鑑に登録する", reward: { gems: 20 },             check: (s) => Object.keys(s.dex).some((k) => k.endsWith(":legendary")) },
];

// ボスティア (GameExpansion_v2 ①)。HP基礎値が既に総攻撃力へ同期しているため、
// hpMult は「撃退所要時間の相対圧」として控えめに設定(§6 KPI: 所要時間は概ね一定)
// V3 Phase8: 中盤=歯応え。対策(設備/味方/研究)を怠ると撃退が間に合わない水準
const BOSS_TIERS = [
  { tier: 1, minRank: 30, hpMult: 1.4286, atkMult: 1.0, cutin: false },
  { tier: 2, minRank: 40, hpMult: 2.7273, atkMult: 1.6, cutin: true },
  { tier: 3, minRank: 50, hpMult: 2.9825, atkMult: 2.0, cutin: true, aura: "#9ad0ff" },
  { tier: 4, minRank: 60, hpMult: 3.2203, atkMult: 2.5, cutin: true, aura: "#ffb347" },
  { tier: 5, minRank: 70, hpMult: 3.4426, atkMult: 3.0, cutin: true, aura: "#ff5540", enrage: true },
  { tier: 6, minRank: 80, hpMult: 3.6508, atkMult: 3.5, cutin: true, aura: "#ffd700", enrage: true },
];
const bossTierFor = (rank) => {
  if (rank < CFG.bossEveryRank) return null;
  let t = BOSS_TIERS[0];
  for (const b of BOSS_TIERS) if (rank >= b.minRank) t = b;
  return t;
};

// ================= 特性(Trait)システム — trait_system.md / V5別スプリント =================
// レア度(縦の序列)を撤廃し"個性"を横に足す(皆違って皆良い)。種族×モーフの上に乗る第3軸。
//   S1(現段階)=見た目試作のみ・付与なし・セーブ非接触。通常個体は traits を持たない(§8.2 方針A)。
//   tier=内部レア度(非表示・出現率/遺伝難度の管理用・§8.1)。draw=Render のメソッド名(データ駆動・PLANET_ALLIES.drawと同型)。
//   ★命名/色/tier は全て仮=Ric最終確認(§16 ⑥)。descは特性カード(§12)の"簡単な紹介"用。
const TRAITS = {
  mimikakushi: {
    key: "mimikakushi", name: "ミミカクシ", // ★仮称
    color: "#3b4a6b",        // 特性カード地の色(藍/鈍色)
    rim: "#7c93d4",          // 明るい藍=徴/カードのアクセント/ロゴ色(暗背景で可読)
    icon: "trait-mask",      // 特性カードのSVGロゴ(ICONS・§9絵文字禁止)
    tier: 3,                 // 内部レア度(1..5・非表示)
    draw: "traitMimikakushi",
    desc: "眼から頬を仮面状の帯で覆う。素顔を隠す個体。",
  },
  // ロスター拡張(trait_system v2.0 §3.2・★命名は全て仮=Ric最終語感)。主題の呼応は意匠で語る(説明しない)。
  neon: {
    key: "neon", name: "ネオン", // ★仮称・主題=②摩天楼スラム
    color: "#4a1d3a", rim: "#D957B0", // rim=UISkills §1.5 摩天楼スラムのアクセント(ネオン)
    icon: "trait-neon", tier: 1, draw: "traitNeon",
    desc: "四肢に細い蛍光の線が走る。眠らない街の光。",
  },
  hakushi: {
    key: "hakushi", name: "ハクシ", // ★仮称・主題=⑩記録以前
    color: "#55524a", rim: "#EFE8DA", // rim=無垢の白(paper系)
    icon: "trait-hakushi", tier: 1, draw: "traitHakushi",
    desc: "体色が一部だけ抜け落ちた、無垢の白斑。まだ何も書かれていない。",
  },
  hoshiwatari: {
    key: "hoshiwatari", name: "ホシワタリ", // ★仮称・主題=空/宇宙港(C2の物語・惑星に紐づかない・V6-P2)
    color: "#232b42", rim: "#E3E9F7", // rim=星明かりの白(惑星アクセント外・夜藍の地に星白)
    icon: "trait-hoshi", tier: 1, draw: "traitHoshiwatari",
    desc: "腹に星屑がまばらに散る。渡ってきた空を覚えている。",
  },
  kokemushiro: {
    key: "kokemushiro", name: "コケムシロ", // ★仮称・主題=③森林(V6-P2)
    color: "#2c3a22", rim: "#7FB856", // rim=UISkills §1.5 若草(絨毛の照り。斑の地は苔緑#6E8C4A)
    icon: "trait-koke", tier: 1, draw: "traitKokemushiro",
    desc: "背に森が住み着いた。急がない生き方の色。",
  },
  triad: {
    key: "triad", name: "トライアド", // ★仮称・主題=①原初の紋
    color: "#59421f", rim: "#D9A441", // rim=UISkills §1.5 砂漠のアクセント(砂金)
    icon: "trait-triad", tier: 2, draw: "traitTriad",
    desc: "背に三連の紋。始まりの星が最初に刻んだ徴。",
  },
  ougon: {
    key: "ougon", name: "オウゴンヅカ", // ★仮称・主題=④玄室の金
    color: "#5a4514", rim: "#C9A227", // rim=UISkills 黄昏金(amber-500)
    icon: "trait-ougon", tier: 2, draw: "traitOugon",
    desc: "眼のまわりを金が縁取る。玄室に眠っていた輝き。",
  },
  shinkai: {
    key: "shinkai", name: "シンカイ", // ★仮称・主題=⑦深海の灯
    color: "#1f3a4a", rim: "#5FA8C9", // rim=UISkills 深海光
    icon: "trait-shinkai", tier: 2, draw: "traitShinkai",
    desc: "体側に生体発光の点が連なる。暗い水の底で交わした合図。",
  },
  hyoga: {
    key: "hyoga", name: "ヒョウガ", // ★仮称・主題=⑧氷の前線
    color: "#2e4a56", rim: "#7FC7DE", // rim=UISkills 氷水
    icon: "trait-hyoga", tier: 2, draw: "traitHyoga",
    desc: "鱗の縁が霜のように白む。前線を越えて生き延びた証。",
  },
  dokushirushi: {
    key: "dokushirushi", name: "ドクシルシ", // ★仮称・主題=⑥密林(V6-P2 基準カット・空白惑星を埋める)
    color: "#1f4034", rim: "#2FA98A", // rim=UISkills §1.5 密林のアクセント(翡翠)
    icon: "trait-doku", tier: 2, draw: "traitDokushirushi",
    desc: "喉に毒々しい警告の斑。触れるなと、身体が先に言っている。",
  },
  yougan: {
    key: "yougan", name: "ヨウガン", // ★仮称・主題=⑤高炉の火
    color: "#5a241a", rim: "#E0533B", // rim=UISkills 熔岩(boss-500と同値だが意味は惑星アクセント)
    icon: "trait-yougan", tier: 3, draw: "traitYougan",
    desc: "背の亀裂から熱色が覗く。冷えても消えない炉の記憶。",
  },
  amidagura: {
    key: "amidagura", name: "アミダグラ", // ★仮称・主題=上位存在の紋
    color: "#43305e", rim: "#9B6BD6", // rim=UISkills アメジスト(最上位鉱石=上位存在の色)
    icon: "trait-amidagura", tier: 3, draw: "traitAmidagura",
    desc: "体表に幾何学の網目。回路とも、籤(くじ)ともつかない。",
  },
  suami: {
    key: "suami", name: "スアミ", // ★仮称・主題=巣ネットワーク(nestWeb・惑星に紐づかない新層の第1号・V6-P2)
    color: "#3d3322", rim: "#D8B36A", // rim=巣網の灯(惑星アクセント外。nestWebの視覚言語=結節・網を先行定義、P2完成後に追随可)
    icon: "trait-suami", tier: 3, draw: "traitSuami",
    desc: "尾に網の結び目。どの巣とも繋がっている印。",
  },
  chrono: {
    key: "chrono", name: "クロノ", // ★仮称・主題=③からくり時計
    color: "#4e3a1c", rim: "#B8955A", // rim=真鍮(SIG_PAL chronoMantisの真鍮と同系・惑星アクセント外)
    icon: "trait-chrono", tier: 4, draw: "traitChrono",
    desc: "尾が秒針めいて分節する。時を刻んでいた頃の癖。",
  },
  cherenko: {
    key: "cherenko", name: "チェレンコ", // ★仮称・主題=⑨臨界の青
    color: "#274a44", rim: "#6FB8A0", // rim=UISkills チェレンコフ光
    icon: "trait-cherenko", tier: 4, draw: "traitCherenko",
    desc: "輪郭が淡く青く滲む。深い水の底で光っていた何かの名残。",
  },
  void: {
    key: "void", name: "ヴォイド", // ★仮称・主題=モノリス/次元の外
    color: "#241b33", rim: "#8a76b8", // rim=沈んだ菫(輪郭の淡い残光・判別の徴)
    icon: "trait-void", tier: 5, draw: "traitVoid",
    desc: "光を吸う黒。輪郭だけが、辛うじてこちら側に残っている。",
  },
  // ---- 合成専用特性(§8・synth=genesis不可・tier6=遺伝はfloor3%・共通の格=深紅の芯線#8E1826) ----
  hagane: {
    key: "hagane", name: "ハガネ", // ★仮称・レシピ=ヨウガン+ヒョウガ
    color: "#3c4a54", rim: "#9FB2C0", // 鋼青灰
    icon: "trait-hagane", tier: 6, draw: "traitHagane",
    desc: "熱と急冷が鍛えた鋼の帯。裂け目は継がれ、霜は刃文になった。",
  },
  kontengi: {
    key: "kontengi", name: "コンテンギ", // ★仮称・レシピ=クロノ+アミダグラ
    color: "#463317", rim: "#D4AF5E", // 明るい真鍮(クロノより一段明るい=格)
    icon: "trait-kontengi", tier: 6, draw: "traitKontengi",
    desc: "体を巡る渾天の環。節輪は軌道になり、網目の灯は星になった。",
  },
  mumei: {
    key: "mumei", name: "ムメイ", // ★仮称・レシピ=ミミカクシ+ハクシ
    color: "#4a4a48", rim: "#F3EFE6", // 無垢の白(ハクシより純度が高い=格)
    icon: "trait-mumei", tier: 6, draw: "traitMumei",
    desc: "白い仮面と薄れる輪郭。藍は白へ反転し、白斑は存在の際まで広がった。",
  },
  houkan: {
    key: "houkan", name: "ホウカン", // ★仮称・レシピ=オウゴンヅカ+トライアド
    color: "#5a4514", rim: "#E4BC3A", // 明るい金(オウゴンヅカより一段明るい=格)
    icon: "trait-houkan", tier: 6, draw: "traitHoukan",
    desc: "頭に三尖の宝冠。眼の金は冠へ昇り、三つの紋は頂の宝石になった。",
  },
  shizumimachi: {
    key: "shizumimachi", name: "シズミマチ", // ★仮称・レシピ=シンカイ+ネオン(旧リンコウ=音の衝突で改名)
    color: "#23384a", rim: "#79C3E0", // 水面ごしの街灯り
    icon: "trait-shizumimachi", tier: 6, draw: "traitShizumimachi",
    desc: "体側に窓灯の格子。深海の点は街の窓になり、蛍光は灯に混ざった。",
  },
  rinkai: {
    key: "rinkai", name: "リンカイ", // ★仮称・レシピ=ヴォイド+チェレンコ(最上位=最深)
    color: "#0d1f1c", rim: "#8FE8CC", // 強いチェレンコフ光(チェレンコより一段強い=格)
    icon: "trait-rinkai", tier: 6, draw: "traitRinkai",
    desc: "光を吸う黒に、輪郭だけが臨界の青で燃える。体の奥に一点、静かな芯。",
  },
};

// 合成レシピ(§8.2・データ駆動・レシピ追加=データ追加のみ)。
// 【恒久制約§8.1】完全マッチング=基本12特性が各ちょうど1回。ロスター増は「2種+レシピ1本」の規律。
// ボス種 (GameExpansion_v2 ②)。minRank 到達で抽選プールに加入
const BOSS_TYPES = [
  { id: "snake",    name: "ダイジャ",       icon: "snake", minRank: 0,  weight: 3, flying: false, dur: 45, threat: "噛みつきで負傷" },
  { id: "hawk",     name: "オオタカ",       icon: "hawk", minRank: 40, weight: 2, flying: true,  dur: 40, threat: "レア個体をさらう" },
  { id: "crow",     name: "オオガラス",     icon: "crow", minRank: 40, weight: 2, flying: true,  dur: 35, threat: "卵を盗む" },
  { id: "monitor",  name: "ヌシオオトカゲ", icon: "monitor", minRank: 45, weight: 2, flying: false, dur: 60, threat: "生産と繁殖を妨害" },
  { id: "scorpion", name: "オオサソリ",     icon: "scorpion", minRank: 48, weight: 2, flying: false, dur: 45, threat: "毒で攻撃力低下" },
  { id: "spider",   name: "オオグモ",       icon: "spider", minRank: 52, weight: 2, flying: false, dur: 50, threat: "ウェブで拘束" },
  // V4 §3.5.3: バガー(侵略の意味づけ。既存ティア構造に乗る=新ループなし)
  { id: "bugger",   name: "バガー",         icon: "bugger", minRank: 30, weight: 3, flying: false, dur: 45, threat: "惑星を侵食する外来種", bugger: true },
];
const bossTypeById = (id) => BOSS_TYPES.find((b) => b.id === id);

// Phase6 惑星署名ボス(単一の真実): stageId -> { threat: 既存脅威型, draw: render.jsの描画メソッド名 }。
//   roll(game.js rollNextRaid)=ボスをこの署名脅威型にする / 描画(render.js planetBossDraw)=署名脅威型の姿に差替。
//   脅威メカニクス(勝敗ロジック)自体は既存のまま=描画と"どの脅威型をボスに選ぶか"のみ。惑星ごとに1エントリ+1描画メソッド。
//   name(2026-07-29 Ric裁定・Phase6「署名ボス10」の完了): 表示名。**単独名のみ**を出す。
//     異名(泥沼蟲・電脳蠍・墳王・贄蛇・熔鮫・親個体・臨界獣・守墓像)は設定資料としてコメントに残すだけで表示しない
//     (気配だけ見せて説明しない)。名前の解決は Game.bossDisplayName() が単一の窓口(姿の Render.bossDrawName と対)。
//     BOSS_TYPES は温存=非ボスの通常襲来は従来どおり汎用名(ダイジャ/アオダイショウ等)のまま。
const PLANET_BOSS = {
  1: { threat: "snake", draw: "drawDoronumaWorm", name: "ドロヌマ・ワーム", minion: "幼体ドロヌマ・ワーム" },       // アリド。異名=泥沼蟲
  2: { threat: "scorpion", draw: "drawCyberScorpio", name: "サイバー・スコルピオ", minion: "幼体サイバー・スコルピオ" }, // ネオヴェルデ。異名=電脳蠍
  3: { threat: "hawk", draw: "drawChronoMantis", name: "クロノ・マンティス", minion: "幼体クロノ・マンティス" },      // シルヴァ(飛翔し鎌で獲物をさらう=hawk)
  4: { threat: "monitor", draw: "drawHaniwaGolem", name: "ハニワ・ゴーレム", minion: "小型ハニワ・ゴーレム" },      // パルス。異名=墳王
  5: { threat: "snake", draw: "drawSlagHydra", name: "スラグ・ヒドラ", minion: "幼体スラグ・ヒドラ" },            // イグニス。異名=鉱滓の多頭竜
  6: { threat: "spider", draw: "drawSkullAnaconda", name: "ドクロ・アナコンダ", minion: "幼体ドクロ・アナコンダ" },   // ユンガ。異名=贄蛇(締め付け=拘束=spider・webは蔓/翡翠紐へリスキン)
  7: { threat: "snake", draw: "drawMagmaShark", name: "マグマ・シャーク", minion: "幼体マグマ・シャーク" },         // メアリス。異名=熔鮫
  8: { threat: "bugger", draw: "drawBaggerParent", name: "ヌシ・バガー", minion: "幼体ヌシ・バガー" },          // グラキス。異名=親個体(既存bagger流用のelite変種)
  9: { threat: "scorpion", draw: "drawMeltGolem", name: "メルト・ゴーレム", minion: "小型メルト・ゴーレム" },       // ヴォルタ。異名=臨界獣
  10: { threat: "crow", draw: "drawRelicSphinx", name: "レリック・スフィンクス", minion: "小型レリック・スフィンクス" },  // オリジン。異名=守墓像(有翼が卵=系譜を博物館へ収蔵=crow)
};

// Phase6 署名生成物(敵ボス/惑星味方)の調整可パレット＝Ricが濃さ/視認性を実機で詰める単一の真実(描画専用・魂/確率/物理に無影響)。
// 惑星背景に沈まないよう明度と縁(edge=シルエットのリム光)を持たせる。1体ずつ修正するたびにここへエントリを足す。
const SIG_PAL = {
  // ID2 ネオヴェルデ(暗い青紫の夜景=最優先の視認性): 明度up＋シアンのリム縁＋主張するレティクル
  cyberScorpio: { body: "#433f68", plate: "#5a5690", head: "#4b4775", cyan: "#8bf0fb", edge: "#a6f4ff", edgeW: 2.4, red: "#ff5f7c", reticleR: 12, reticleW: 2.6, visorGlow: 8, rim: 0.5 },
  falcon: { body: "#5f7391", edge: "#a6f4ff", cyan: "#9df2fd", glow: 0.26, glowR: 27, eyeR: 1.5 },
  // ID8 グラキス バガー親個体: ガラスのヒビは槽面(右壁)へ・親個体の証=卵嚢(brood sac)
  baggerParent: { crack: "220,228,240", crackAlpha: 0.34, sac: "#6a4a86", sacEgg: "#c9a8e6", sacGlow: "#b070e0" },
  // ID1 アリド ドロヌマ・ワーム: 桃色寄り→土気色へ濁す＋スケール増で"巨大な脅威"を立てる
  doronumaWorm: { skin: "#7a6647", skinDk: "#4e3d28", band: "#94805c", saddle: "#ad9c7e", sand: "#8f7850", maw: "#2e1d10", bossScale: 1.72, girth: 19 },
  // ID3 シルヴァ クロノ・マンティス: 緑複眼が森林背景と同色域→琥珀へ(殺気=わずかに発光)
  chronoMantis: { eye: "#eca63a", eyeGlow: 5 },
  // ID9 ヴォルタ 廃炉山椒魚(ラクーンから差し替え): 被曝白化の再生両生類(ウーパールーパー系)。役割/引き継ぎ(gecko)は不変=姿のみ
  hairoSalamander: { body: "#e6e0d6", bodyL: "#f2eee6", belly: "#f0dcd8", gill: "#e2909a", gillL: "#f0b0b6", tape: "#d8c828", glow: "#8fe0c0", regen: "rgba(232,226,216,.5)" },
};

// 蛇の階級(コロニーランクに同期して見た目と強さが変化)
const SNAKE_TIERS = [
  { minRank: 1,  name: "アオダイショウ",   hue: 95,  sat: 38, light: 38, scale: 1.0 },
  { minRank: 10, name: "マムシ",           hue: 28,  sat: 48, light: 34, scale: 1.2 },
  { minRank: 25, name: "アカダイジャ",     hue: 6,   sat: 52, light: 33, scale: 1.4 },
  { minRank: 45, name: "ヤミヘビ",         hue: 275, sat: 30, light: 26, scale: 1.6 },
  { minRank: 70, name: "オウゴンダイジャ", hue: 44,  sat: 68, light: 42, scale: 1.85 },
];
const snakeTierFor = (rank) => {
  let t = SNAKE_TIERS[0];
  for (const s of SNAKE_TIERS) if (rank >= s.minRank) t = s;
  return t;
};

// ---- 参照ヘルパ ----
const speciesById = (id) => SPECIES.find((s) => s.id === id);
const morphById = (id) => MORPHS.find((m) => m.id === id);
const facilityById = (id) => FACILITIES.find((f) => f.id === id);
