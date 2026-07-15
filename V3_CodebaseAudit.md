# V3_CodebaseAudit — コードベース全解析(Phase 0成果物)

- 作成: 2026-07-12 / 対象: GameExpansion_V3.md Phase 0
- 実測環境: ヘッドレスChrome(SwiftShader CPUラスタライズ)。実GPUではこれより高速だが、相対比較の基準として有効。

## Script一覧(実名と責務)

| 実名 | V3仮名との対応 | 責務 | 依存 |
|---|---|---|---|
| `js/data.js` | (マスターデータ全般) | CFG定数 / SPECIES / MORPHS / FACILITIES / STAGES / BOSS_TIERS / BOSS_TYPES / ALLIES / TITLES / EVENTS / MISSIONS / SHOP_TIERS | なし(最初に読込) |
| `js/game.js` | GameManager+StageManager+NestSystem+BreedingSystem+BossSystem+EquipmentSystem 相当(単一オブジェクト`Game`) | 状態保持・経済・繁殖遺伝・襲撃AI(6種)・味方・設備効果・イベント・商人・セーブ | data.js |
| `js/render.js` | (描画) | Canvas 2D描画(`Render`)。背景キャッシュ・トカゲ/ボス/味方/設備・演出 | data.js, game.js |
| `js/ui.js` | UIManager 相当(`UI`) | DOM更新(5Hz)・モーダル群・長押し入力・メインRAFループ | 全部 |
| `test-*.html` | (開発用) | lizards格子 / field再現(?boss/?rank/?n) / bench(?n/?full/?cap) | 上記 |

## グローバル状態の全列挙と「Stage単位へ降格すべきリスト」(最重要)

`Game.state`(セーブ対象)と `Game.*`(ランタイム)を全列挙し、V3での帰属を確定した。

| 状態 | 現在 | V3帰属 | 備考 |
|---|---|---|---|
| coins, gems | state | **グローバル(wallet)** | §3.2 共通ウォレット確定 |
| rank, rankXp | state | **グローバル(headquarters)** | ボスティア/種族解放の基準。本部成長の一部として扱う |
| **lizards[]** | state | **★Stageへ降格** | 個体はStage内のみ |
| **eggs[]** | state | **★Stageへ降格** | 卵スロットはStage資産 |
| **facilities{}** | state | **★Stageへ降格** | 設備LvはStage別 |
| **crickets** | state | **★Stageへ降格** | §3.2 在庫はStage別 |
| **raidTimer / nextRaid** | state | **★Stageへ降格(boss)** | 襲来周期はStage別 |
| **stats.raidsWon(Elite周期用途)** | state | **★Stageへ降格(boss.wins)** | 累計統計はグローバルに残し、周期判定のみStage値を使う |
| dex, titles, titleSel, missionsClaimed, daily, stats(累計) | state | グローバル(collection) | 実績・図鑑は永続資産 |
| allies{}, materials | state | グローバル | 味方・ボス素材はプレイヤー資産 |
| autoSupply, stageSel | state | グローバル(設定) | stageSel→currentStageIdへ |
| raid, event, merchant, slowmo, flashT, popups, selectedId | ランタイム(非セーブ) | アクティブStageのみで発生 | 切替時に破棄 |
| _idSeq | 保存 | グローバル | 個体IDは全体ユニークを維持(混線防止に有利) |

## SaveData現構造

- キー: `lizardColonySaveV1` / 形式: `JSON {state, idSeq}` / **versionフィールドなし**(→v1と判定する)
- 自動保存10秒毎+beforeunload。バックアップなし(→Phase 1で移行時バックアップ`CFG.saveBackupKey`を追加)

## LizardData 全フィールド

`id, speciesId, morphId, hue, sat, light, pattern, stage(baby|adult), xp, level, injuredT, breedCd, poisonT, hiddenT, resting, restedAt` + ランタイム `x,y,tx,ty,angle,wanderT,homeX,homeY,moving`(保存されるが再生成可能)。幸福度・満腹・渇きは**存在しない**(V3環境係数は既存値への係数として適用済みの`env`を継続使用)。

## EquipmentData

`facilities = { id: lv }` のみ。効果はデータでなく計算箇所に分散: `incomePerSec / feed / inherit / breed / startRaid / updateGroundBoss / updateHawk / updateCrow / spawnWebs / poisonDurMult / raidDps / tick(回復・湧き・給餌)`。Lv上限は `FACILITIES[].max`。

## ボス進行の保持場所

`stats.raidsWon`(Elite周期=5回毎) / `rank`(ティア=BOSS_TIERS) / `state.raidTimer`+`state.nextRaid`(次回) / `Game.raid`(進行中・非セーブ)。

## 描画実測(120匹・全設備・ステージ10)

| 条件 | 描画対象 | ms/frame(CPUラスタ) |
|---|---|---|
| 休憩なし(V2以前相当) | 120体 | **94.32** |
| 現行(休憩上限70) | 70体 | **64.21** |
| **V3目標(外出枠15)** | 15体 | **19.97 (現行比3.2倍)** |

→ Phase 3の「平時fps改善」完了条件はこの64.21→20ms級への短縮で判定する。

## UI構造

- 静的パネル(`index.html`固定DOM)を5Hzで`UI.update()`が書換え。モーダルは開くたびに`#modal-body`を全再構築(Stage切替で作り直すのはこの1枠+卵スロット+ショップラベルのみで軽い)。
- Canvasはフィールド専用。巣・卵・設備はCanvas内描画(巣タップ入口はCanvasクリック判定に追加する)。

## 未決定事項の解決(実装者判断・HANDOFF報告)

1. **Stage数**: V2実装済みの**10ステージ**(乾燥地帯/草原/森林/湿地/火山/密林/大湿原/雪原/洞窟/古代遺跡)をそのまま独立コロニー化する。V3の8Stage表は10Stageへ写像(砂漠=乾燥地帯、遺跡=古代遺跡)。
2. **共通ウォレット**: 設計どおり採用(Gold/ジェム共通、コオロギ/固有素材はStage別)。
3. **探索ツリー**: **共通テンプレート(5レーン×14列=70ノード)+Stage固有の名称・固有素材・最深部伝説ノード**で量産。参考画像(格子レーン/正方形ノード/緑枠キーノード/一括開封)に準拠。
