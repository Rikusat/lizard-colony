"use strict";
// ============================================================
// トカゲコロニー: マスターデータ / バランス定数
// ============================================================

const SAVE_VERSION = 6; // V5.1: コオロギ廃止→Gold消費給餌(在庫は全額Gold払い戻し)

const CFG = {
  saveKey: "lizardColonySaveV1",
  saveBackupKey: "lizardColonyV1Backup",   // V2以前→V3移行前のバックアップ
  saveBackupKeyV3: "lizardColonyV3Backup", // V3→V4移行前のバックアップ
  saveBackupKeyV4: "lizardColonyV4Backup", // V4→V4.1移行前のバックアップ(ロールバック用)
  saveBackupKeyV5: "lizardColonyV5Backup", // V4.1→V5移行前のバックアップ(コオロギ共通化)
  saveBackupKeyV6: "lizardColonyV6Backup", // V5→V6移行前のバックアップ(コオロギ→Gold払い戻し)
  startCoins: 500,
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
  injuryTime: 60,           // 負傷回復までの秒数
  bossEvery: 5,             // n回撃退ごとにボス
  mutationSpeciesChance: 0.05, // 上位種族への突然変異率
  mutationMorphChance: 0.08,   // モーフ突然変異率
  offlineCapHours: 24,      // オフライン進行の上限(V3 §3.4。研究で延長)
  offlineRate: 0.5,         // オフライン収益倍率(ブラウザを閉じていた時間・ロード時一括精算)
  awayStageIncomeRate: 1.0, // V5: 留守コロニーの常時生産倍率(1=フル。インフレ調整は支出側で)
  feedGoldCost: 10,         // V5.1: 給餌1回のGoldコスト(旧: コオロギ1匹=10Gと等価)

  // ---- 遺伝子ルーレット(roulette.md §7・全パラメータCFG化。反復で追い込む初期値) ----
  roulDt: 0.0083,           // 固定タイムステップ(秒・約120Hz)。決定論の要
  roulW: 150,               // シム空間の幅(単位・段階3で拡幅=カオス空間+レインボー帯)
  roulH: 210,               // シム空間の高さ(単位)
  roulBallRestitution: 0.86,// 球同士の反発係数(カオスの活き。0=くっつく/1=完全弾性)
  roulRainbowX0: 0.0,       // レインボー帯の左端(幅比・far-left=自然には落ちない場所)
  roulRainbowX1: 0.14,      // レインボー帯の右端(幅比)
  roulGravity: 340,         // 重力(単位/秒^2)
  roulRestitution: 0.5,     // 壁の反発係数(0=無反発/1=完全弾性)
  roulWallDamp: 0.96,       // 壁反射時の接線減衰
  roulEmitX: 0.08,          // 放出位置X(幅比・左下)
  roulEmitY: 0.94,          // 放出位置Y(高さ比・左下)
  roulEmitSpeed: 165,       // 放出初速(単位/秒)
  roulEmitSpeedVar: 0.28,   // 初速のばらつき(±比)
  roulEmitAngle: -63,       // 放出角(度・右上向き。0=右/-90=上)
  roulEmitAngleVar: 22,     // 放出角のばらつき(±度)
  roulBallR: 4.2,           // 球半径(単位)
  roulMaxBalls: 64,         // 同時球数上限(性能・カオス上限)
  roulBallTtl: 7,           // 球の寿命(秒・着地しない球の掃除)
  roulEggChance: 0.12,      // 床到達(回収)1球あたりの卵生成確率(シードRNG・反復で調整)
  roulLane1Ratio: 0.42,     // レーン1(上部)の高さ比(残りがレーン2)

  xpPopupAutoHighEvery: 10, // V5 3.5: オート高のXPポップ間引き(N回に1回だけ表示)
  xpPopupAutoHighSmall: true, // V5 3.5: オート高のXPポップを小さく表示
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
  webHp: 3,                 // ウェブを除去するのに必要なタップ数
  allyMaxLv: 5,
  allyLvCostPerLv: 3,       // 味方Lvアップの素材コスト = 現Lv×これ
  // 群衆対策(表示のみ・収益/戦闘は全個体が対象のまま)
  maxVisibleLizards: 70,    // フィールドに同時表示する上限。超過分は巣穴で休憩
  restSwapPerSec: 3,        // 毎秒この匹数まで休憩⇔活動を入れ替え
  crowdShrinkStart: 40,     // この表示数から縮小開始
  crowdShrinkPer: 0.005,    // 1匹ごとの縮小率
  crowdScaleFloor: 0.7,     // 縮小の下限
  // V3: 巣収納 (GameExpansion_V3 §4)
  nestOutBase: 8,           // 平時の外出枠(アダルト)
  nestOutPerLv: 1,          // 巣Lvごとの外出枠+
  nestOutMax: 15,           // 外出枠の上限
  combatDrawCap: 60,        // 戦闘時の描画上限(計算は全数参加)
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
  resFoodPerFeederLv: 0.05, // 餌場Lvごとの食料供給(/秒)
  resEnergyPerDevLv: 0.02,  // 惑星開発Lvごとのエネルギー(/秒)
  autoFeedFoodCost: 0.02,   // 自動給餌1回の食料消費
  sciencePerDepth: 1,       // 探索の深層(6層以降)1層ごとの研究力
  goldToFoodRate: 100,      // 100G → 食料1
  goldToEnergyRate: 150,    // 150G → エネルギー1
  bioToScienceRate: 10,     // 生態データ10 → 研究力1
  convertBatch: 50,         // 変換ボタン1回の取得量
  mutateBioCost: 50,        // 突然変異に使う生態データ(旧: 変異素材3)
  allyLvBioCost: 20,        // 味方Lvアップ = 現Lv×これ の生態データ(旧: ボス素材)
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
  // V4: 繁殖予約(QoL §3.1.3)
  autoBreedInterval: 6,     // 自動繁殖の試行間隔(秒)
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
  bossScaleSnake: 1.1,      // 序盤の通常蛇の控えめな拡大
  bossBreath: 0.035,        // 呼吸(拡縮)の振幅
  bossApproach: 1.3,        // 迫り(未到着シルエット)の追加拡大
  // Phase4: 終盤コンテンツ (GameExpansion_v2 ⑨)
  legendChance: 0.004,      // 繁殖時の伝説変異率(祭壇 +0.2%/Lv)
  merchantIntervalMin: 300, // 放浪商人の来訪間隔(秒)
  merchantIntervalMax: 600,
  merchantStay: 90,         // 滞在秒数
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
  { id: "allies6",  name: "百獣の盟主",         hint: "味方6体すべてと出会う", cond: (s) => ALLIES.every((a) => s.allies[a.id]) },
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
  { id: "feeder",      name: "餌場",     icon: "feeder", tab: "norm", unlock: 10, max: 10, baseCost: 5000,   costMult: 1.6,
    desc: "コオロギ湧き +0.5/秒/Lv・食料供給 +0.05/秒/Lv・毎秒Lv匹へ自動給餌(食料を消費)" },
  { id: "breedfac",    name: "繁殖施設", icon: "breedfac", tab: "norm", unlock: 20, max: 15, baseCost: 20000,  costMult: 1.6,
    desc: "繁殖CD -4%/Lv・モーフ変異 +0.8%/Lv・伝説 +0.07%/Lv。Lv3:卵のレア予兆 / Lv5:繁殖予約" },
  { id: "observatory", name: "展望台",   icon: "observatory", tab: "norm", unlock: 25, max: 10, baseCost: 30000,  costMult: 1.6,
    desc: "先制 +0.8秒/Lv・図鑑コンプ率×4%/Lvぶん生産(展望岩・標本棚・研究所を統合)" },
  // --- 防衛設備(ボス対策専用) ---
  { id: "fence",       name: "フェンス", icon: "fence", tab: "def", unlock: 0,  max: 10, baseCost: 500,    costMult: 1.6,
    desc: "先制攻撃時間 +2秒/Lv・敵の攻撃間隔 +1秒/Lv" },
  { id: "shelter",     name: "シェルター", icon: "shelter", tab: "def", unlock: 0, max: 10, baseCost: 400,   costMult: 1.6,
    desc: "ベビーを保護・攻撃回避 +6%/Lv" },
  { id: "watchtower",  name: "監視塔",   icon: "watchtower", tab: "def", unlock: 40, max: 10, baseCost: 100000, costMult: 1.7,
    desc: "迎撃の総攻撃力 +4%/Lv" },
  { id: "trap",        name: "罠設備",   icon: "trap", tab: "def", unlock: 45, max: 15, baseCost: 200000, costMult: 1.6,
    desc: "侵入時ダメージ +1.2%/Lv・毒軽減 +2.5%/Lv・急降下妨害 +3.5%/Lv。Lv3:ウェブ自動焼却(罠+薬草園+反射板+篝火を統合)" },
];

// シナジー示唆 (V2⑥継承・統合後版): 効果が自然に重なるだけで成立
const FACILITY_SYNERGIES = [
  { ids: ["heat", "shelter"],            name: "バスキング特化", desc: "回復と保護が両立。雪惑星で真価" },
  { ids: ["feeder", "water"],            name: "全自動生活圏",   desc: "湧く・食べる・潤うが自動で回る" },
  { ids: ["water", "trap"],              name: "毒無効化",       desc: "オオサソリの毒がほぼ機能しなくなる" },
  { ids: ["fence", "trap", "watchtower"], name: "対侵入要塞",    desc: "遅延+侵入ダメージ+迎撃強化で守り切る" },
  { ids: ["breedfac", "heat"],           name: "繁殖ラボ",       desc: "回転の速い孵化と変異率でレア量産" },
];

// ステージ(コロニーランクで進行)。rock/pebble は地面テクスチャ用の対比色
// env=環境ギミック / bosses=このステージで出やすい専用敵(抽選重み×2) / envText=UI表示
const STAGES = [
  { id: 1, name: "乾燥地帯", rank: 1,  icon: "p-desert", mat: "乾いた砂",   nest: "地下巣穴",     sky: "#c9a86a", sky2: "#8f7440", ground: "#b28e5a", ground2: "#8a6b40", accent: "#6d5432", rock: "#8a7355", pebble: "#cbb083",
    env: {}, bosses: [], envText: "はじまりの地" },
  { id: 2, name: "摩天楼スラム", rank: 5, icon: "p-city", mat: "廃材", nest: "排水管の巣", sky: "#2a3352", sky2: "#12162b", ground: "#3f3f4c", ground2: "#2a2a35", accent: "#1e1e2a", rock: "#4d4d5e", pebble: "#62627a",
    env: {}, bosses: [], envText: "ネオンの光と、届かない光の街" },
  { id: 3, name: "森林",     rank: 10, icon: "p-forest", mat: "樹液",       nest: "巨木の樹上巣", sky: "#5f8a5a", sky2: "#39573a", ground: "#4c7040", ground2: "#37522e", accent: "#263a20", rock: "#63614f", pebble: "#8c866a",
    env: {}, bosses: [], envText: "木漏れ日の森" },
  { id: 4, name: "古代古墳", rank: 18, icon: "p-kofun", mat: "金鈴片",     nest: "周濠の巣",     sky: "#6a9a8a", sky2: "#40655c", ground: "#5a7a62", ground2: "#405a48", accent: "#2c4034", rock: "#5f6a5e", pebble: "#83907f",
    env: {}, bosses: [], envText: "水鏡に王墓が浮かぶ、悼みの地" },
  { id: 5, name: "火山",     rank: 28, icon: "p-volcano", mat: "黒曜石",     nest: "火山洞窟",     sky: "#8a4a3a", sky2: "#4a241c", ground: "#6e4234", ground2: "#4a2a21", accent: "#301a14", rock: "#6a544a", pebble: "#96624c",
    env: { burnWebs: true }, bosses: [], envText: "熱でクモのウェブが焼ける" },
  { id: 6, name: "密林",     rank: 50, icon: "p-jungle", mat: "供花",       nest: "神木の樹上巣", sky: "#4f7a46", sky2: "#2e4c2c", ground: "#3e5c33", ground2: "#2a4024", accent: "#1c2e18", rock: "#55604a", pebble: "#75885e",
    env: { crickets: 0.3 }, bosses: ["spider", "crow"], envText: "食料神の恵み満ちる祭祀の森。コオロギが自然に湧く(+0.3/秒)" },
  { id: 7, name: "水中都市", rank: 60, icon: "p-abyss", mat: "真珠母",     nest: "水底の巣",     sky: "#3d6b82", sky2: "#16334a", ground: "#3d5a5e", ground2: "#28444a", accent: "#1c333c", rock: "#4a6468", pebble: "#6e8a8a",
    env: { poisonMult: 0.7, incomeMult: 1.05 }, bosses: ["scorpion", "crow"], envText: "水底に安らう静かな都。浄水の循環が毒を洗い流し(-30%)、都市の恵みで生産+5%" },
  { id: 8, name: "氷の前線", rank: 70, icon: "p-sentry", mat: "氷晶",     nest: "氷穴",         sky: "#a8c4e0", sky2: "#5f7fa5", ground: "#dde8f2", ground2: "#aebfd2", accent: "#8fa5bf", rock: "#8a95a5", pebble: "#c3ccd9",
    env: { recoveryMult: 0.5, heatBoost: 2 }, bosses: ["hawk", "monitor"], envText: "機械が巡回する氷の前線。低温で回復半減・保温設備2倍。誰がこの技術を与えたのかは、誰も知らない" },
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
  { id: "win5",    name: "蛇を5回撃退する",          reward: { gems: 3 },              check: (s) => s.stats.raidsWon >= 5 },
  { id: "win20",   name: "蛇を20回撃退する",         reward: { gems: 8 },              check: (s) => s.stats.raidsWon >= 20 },
  { id: "boss1",   name: "ボス蛇を撃退する",         reward: { gems: 5 },              check: (s) => s.stats.bossWon >= 1 },
  { id: "rank10",  name: "コロニーランク10に到達",   reward: { gems: 5 },              check: (s) => s.rank >= 10 },
  { id: "dex25",   name: "図鑑コンプ率25%",          reward: { gems: 3 },              check: (s) => Game.dexRate() >= 0.25 },
  { id: "dex50",   name: "図鑑コンプ率50%",          reward: { gems: 6 },              check: (s) => Game.dexRate() >= 0.50 },
  { id: "dex100",  name: "図鑑コンプリート!",        reward: { gems: 50, coins: 100000 }, check: (s) => Game.dexRate() >= 1.0 },
  // Phase4 追加実績 (⑨-2)
  { id: "win50",   name: "蛇を50回撃退する",         reward: { gems: 5 },              check: (s) => s.stats.raidsWon >= 50 },
  { id: "win200",  name: "襲撃を200回撃退する",      reward: { gems: 12 },             check: (s) => s.stats.raidsWon >= 200 },
  { id: "boss30",  name: "ボスを30回撃破する",       reward: { gems: 8 },              check: (s) => s.stats.bossWon >= 30 },
  { id: "bred100", name: "繁殖100回",                reward: { gems: 6 },              check: (s) => s.stats.bred >= 100 },
  { id: "sold50",  name: "トカゲを50匹売却する",     reward: { coins: 50000 },         check: (s) => s.stats.sold >= 50 },
  { id: "rank50",  name: "コロニーランク50に到達",   reward: { gems: 6 },              check: (s) => s.rank >= 50 },
  { id: "stage10", name: "古代遺跡に到達する",       reward: { gems: 10 },             check: (s) => s.rank >= 90 },
  { id: "allies6", name: "味方6体すべてと出会う",    reward: { gems: 10 },             check: (s) => ALLIES.every((a) => s.allies[a.id]) },
  { id: "legend1", name: "伝説個体を図鑑に登録する", reward: { gems: 20 },             check: (s) => Object.keys(s.dex).some((k) => k.endsWith(":legendary")) },
];

// ボスティア (GameExpansion_v2 ①)。HP基礎値が既に総攻撃力へ同期しているため、
// hpMult は「撃退所要時間の相対圧」として控えめに設定(§6 KPI: 所要時間は概ね一定)
// V3 Phase8: 中盤=歯応え。対策(設備/味方/研究)を怠ると撃退が間に合わない水準
const BOSS_TIERS = [
  { tier: 1, minRank: 30, hpMult: 1.5, atkMult: 1.0, cutin: false },
  { tier: 2, minRank: 40, hpMult: 3.0, atkMult: 1.6, cutin: true },
  { tier: 3, minRank: 50, hpMult: 3.4, atkMult: 2.0, cutin: true, aura: "#9ad0ff" },
  { tier: 4, minRank: 60, hpMult: 3.8, atkMult: 2.5, cutin: true, aura: "#ffb347" },
  { tier: 5, minRank: 70, hpMult: 4.2, atkMult: 3.0, cutin: true, aura: "#ff5540", enrage: true },
  { tier: 6, minRank: 80, hpMult: 4.6, atkMult: 3.5, cutin: true, aura: "#ffd700", enrage: true },
];
const bossTierFor = (rank) => {
  if (rank < CFG.bossEveryRank) return null;
  let t = BOSS_TIERS[0];
  for (const b of BOSS_TIERS) if (rank >= b.minRank) t = b;
  return t;
};

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

// 味方 (GameExpansion_v2 ⑩) — 繁殖不可・常駐・素材でLvアップ
const ALLIES = [
  { id: "turtle",  name: "カメ",           icon: "turtle", unlock: { rank: 45 }, unlockText: "ランク45到達",
    desc: "高耐久の盾。噛みつきを確率で肩代わり(25%+5%/Lv)。ヌシの生産妨害を半減" },
  { id: "gecko",   name: "ヤモリ",         icon: "gecko", unlock: { rank: 52 }, unlockText: "ランク52到達",
    desc: "オオグモのウェブを自動切除(Lvで加速)。コオロギ拾い +0.1/秒/Lv" },
  { id: "owl",     name: "フクロウ",       icon: "owl", unlock: { rank: 58 }, unlockText: "ランク58到達",
    desc: "オオガラスの逃走を減速(-20%-5%/Lv)。夜目の早期警戒" },
  { id: "meerkat", name: "ミーアキャット", icon: "meerkat", unlock: { wins: 60 }, unlockText: "撃退数60回",
    desc: "見張りで先制時間 +1.5秒/Lv。ヌシの居座り時間 -5秒/Lv" },
  { id: "ferret",  name: "フェレット",     icon: "ferret", unlock: { rank: 65 }, unlockText: "ランク65到達",
    desc: "オオサソリへの与ダメ +16%+4%/Lv。回収屋: 撃退報酬 +5%+1%/Lv" },
  { id: "eagle",   name: "ワシ",           icon: "eagle", unlock: { rank: 70 }, unlockText: "ランク70到達",
    desc: "上空を制圧しオオタカの急降下を妨害(20%+5%/Lv)" },
];
const allyById = (id) => ALLIES.find((a) => a.id === id);

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
