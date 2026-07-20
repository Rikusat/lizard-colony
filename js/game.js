"use strict";
// ============================================================
// トカゲコロニー: ゲーム状態・ロジック
// ============================================================

const W = 1280, H = 720;                     // Canvas 内部解像度
const FIELD = { x1: 80, y1: 240, x2: 1200, y2: 660 }; // トカゲの行動範囲
const SNAKE_HOME = { x: 850, y: 470 };        // 蛇が居座る位置

const Game = {
  state: null,
  world: null,           // WorldData (V3: 全Stageのルート)
  raid: null,            // 進行中の襲撃 (セーブしない)
  selectedId: null,      // 選択中トカゲ
  popups: [],            // ダメージ・獲得ポップアップ
  slowmo: 0,             // 撃破スローモーション残り秒
  flashT: 0,             // 伝説誕生などの画面フラッシュ残り秒
  event: null,           // 進行中の定期イベント (セーブしない)
  foreground: true,      // 3.11.3: 画面がフォアグラウンド(visible)か。falseでボス到来/戦闘を一時停止(セーブしない)
  _idSeq: 1,

  // ---------------- 初期化 ----------------
  init() {
    if (!this.load()) this.newGame();
    // 実行時フィールドの補完(旧セーブ・孵化直後対策)
    for (const lz of this.state.lizards) this.ensureRuntime(lz);
    this.checkDaily();
    setInterval(() => this.save(), 10000);
    window.addEventListener("beforeunload", () => this.save());
  },

  // デイリーボーナス (⑨-27): ログイン日数で報酬・連続でブースト
  checkDaily() {
    const s = this.state;
    const today = new Date().toISOString().slice(0, 10);
    if (s.daily.last === today) return;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    s.daily.streak = s.daily.last === yesterday ? s.daily.streak + 1 : 1;
    s.daily.last = today;
    const streak = Math.min(7, s.daily.streak);
    const coins = Math.max(1000, Math.floor(this.incomePerSec() * 120 * streak));
    const gems = 1 + Math.floor(streak / 2);
    s.coins += coins;
    s.gems += gems;
    this.erosionLoginRelief(); // V4.1 §6: 定期ログインで侵食が下がる
    setTimeout(() => UI.toast(`デイリーボーナス! ${s.daily.streak}日連続 → +${fmt(coins)}G +ジェム${gems}`), 800);
  },

  newGame() {
    this.state = {
      coins: CFG.startCoins,
      crickets: CFG.startCrickets, // V5.2: コオロギ給餌の復活(初期在庫)
      gems: CFG.startGems,
      stones: CFG.startStones, // 賢者の石(v11・四重スリット装置のレア報酬・保有のみ)
      rank: 1,
      rankXp: 0,
      lizards: [],
      eggs: [],
      facilities: Object.fromEntries(FACILITIES.map((f) => [f.id, 0])),
      dex: {},
      stats: { fed: 0, hatched: 0, raidsWon: 0, bossWon: 0, bred: 0, sold: 0 },
      missionsClaimed: {},
      raidTimer: CFG.raidInterval,
      autoSupply: false,
      allies: {},          // { allyId: { lv } }
      nextRaid: null,      // 次の襲撃の予告情報
      stageSel: null,      // 手動選択ステージ(null=常に最新)
      titles: {},          // 獲得済み称号 { titleId: true }
      titleSel: null,      // 表示中の称号
      daily: { last: "", streak: 0 }, // デイリーボーナス
      // V3 Phase1+ / V4
      res: { bio: 0, food: 0, energy: 0, science: 0 }, // V4: 資源フロー
      lore: { intro: true }, // V4: Lore(導入は最初から読める)
      devLv: 0,            // V4: 惑星開発Lv
      // V4.1
      nestWeb: { nodes: {}, surprises: 0 }, // 巣ネットワーク(全惑星共通)
      rare: { amethyst: 0, iridium: 0, amber: 0, meteorite: 0, orichalcum: 0, titaniumOre: 0 },
      erosion: 0,          // バガー侵食率(全惑星共通)
      rocket: { stage: 0, invested: 0, done: false },
      forged: {},          // チタン鉱による設備の上限突破
      autoBreed: false,    // V4: 繁殖予約
      dial: { auto: false, rate: 1, supply: false }, // Brushup V2: 給餌ダイヤル
      stageWins: 0,        // この惑星での撃退数(Elite周期用)
      nest: { lv: 1, pins: [] }, // すみか(住居)Lv・ピン留め個体
      research: {},        // HQ研究
      savedAt: Date.now(),
    };
    this.rollNextRaid();
    this.world = this.toWorld();
    // 初期トカゲ: ニホンカナヘビのアダルト2匹
    for (let i = 0; i < 2; i++) {
      const sp = speciesById("kanahebi");
      this.addLizard(this.makeLizard("kanahebi", "normal", {
        hue: sp.hue + rnd(-10, 10), sat: sp.sat, light: sp.light, pattern: "stripe",
      }, "adult"), true);
    }
  },

  // ---------------- トカゲ生成 ----------------
  makeLizard(speciesId, morphId, genes, stage) {
    return {
      id: this._idSeq++,
      speciesId, morphId,
      hue: Math.round(genes.hue), sat: Math.round(genes.sat), light: Math.round(genes.light),
      pattern: genes.pattern,
      stage,                      // 'baby' | 'adult'
      xp: 0, level: 1,
      injuredT: 0,                // 残り負傷秒
      breedCd: 0,                 // 残り繁殖クールダウン秒
    };
  },

  ensureRuntime(lz) {
    if (lz.x === undefined) {
      lz.x = rnd(FIELD.x1, FIELD.x2);
      lz.y = rnd(FIELD.y1, FIELD.y2);
    }
    // 縄張り: 各個体はこの点の周辺だけを徘徊する(全体に一様分布させて偏りを防ぐ)
    if (lz.homeX === undefined) {
      lz.homeX = rnd(FIELD.x1 + 40, FIELD.x2 - 40);
      lz.homeY = rnd(FIELD.y1 + 20, FIELD.y2 - 20);
    }
    if (lz.tx === undefined) { lz.tx = lz.x; lz.ty = lz.y; }
    if (lz.angle === undefined) lz.angle = 0;
    if (lz.wanderT === undefined) lz.wanderT = rnd(0, 3);
  },

  addLizard(lz, silent) {
    this.ensureRuntime(lz);
    this.state.lizards.push(lz);
    this.registerDex(lz.speciesId, lz.morphId, silent);
  },

  // ---------------- 派生値 ----------------
  capacity() {
    const capMult = this.currentStage().env.capMult || 1;
    return Math.floor((CFG.capacityBase + this.state.rank * CFG.capacityPerRank) * capMult);
  },
  facLv(id) { return this.state.facilities[id] || 0; },
  nestLv() { return (this.state.nest && this.state.nest.lv) || 1; }, // §8.12: 巣Lv(繁殖/給餌効果の統合先。最低1)
  // 3.11.5: 汎用味方は削除(Phase 6で惑星固有味方を新設)。効果・戦闘計算からは常に0で外す。
  // ただし state.allies のLvデータは消さず休眠保持=Phase 6で資産として振替する(残骸ではない)
  allyLv() { return 0; },
  allyLvRaw(id) { return (this.state.allies[id] && this.state.allies[id].lv) || 0; }, // Phase6資産参照用
  isHidden(lz) { return lz.hiddenT > 0; }, // 鷹にさらわれて一時不在
  isAway(lz) { return lz.hiddenT > 0; }, // フィールド外(鷹にさらわれ一時不在)。V5.2: 探索(exploring)はV4.1で撤去済のため参照しない(残留フラグで個体が永久away=給餌/emit不能になるバグ根治)
  isVisible(lz) { return !this.isAway(lz) && !lz.resting; }, // フィールドに描画される個体

  // 群衆スケール: 表示数が増えるほど個体を縮小して見通しを確保(フレームごとに再計算)
  refreshCrowdScale() {
    const visible = this.state.lizards.filter((l) => this.isVisible(l)).length;
    this._crowdScale = clamp(1 - Math.max(0, visible - CFG.crowdShrinkStart) * CFG.crowdShrinkPer, CFG.crowdScaleFloor, 1);
  },
  crowdScale() { return this._crowdScale || 1; },

  // ---------------- V3 Phase3 / §8.13: 巣収納(Nest Retreat) ----------------
  // 平時: 攻撃力の弱い個体がフィールドに出る(強個体は巣に籠る)。§8.13: 同じ種×モーフは最大 dispPerType(=2)体まで。
  //   これによりフィールド上限は実質「種×モーフ数 × 2」≒20。ベビーも対象=ボス時は弱い個体(ベビー)が巣へ逃げる(§8.12の対比)。
  // 表示は"見た目"のみの制限=収入/給餌/XP/繁殖/コオロギ消費などのロジックは籠り個体を含む全個体に従来どおり作用。
  visibleAdultCap() {
    return CFG.displayCap; // 安全弁(§8.13の種×モーフ上限と併用)
  },

  // §8.13: 種×モーフのキー(同種判定=種×モーフ)
  dispKey(l) { return l.speciesId + "|" + l.morphId; },

  // §8.13: いまフィールドに"出しておくべき"個体のSet。displayScore降順に、種×モーフごと dispPerType まで採用。
  //   ピン/選択中は種上限を無視して必ず採用。鷹にさらわれ不在(hidden)は対象外。全体上限 displayCap も安全弁で併用。
  desiredShown() {
    const pins = (this.state.nest && this.state.nest.pins) || [];
    const all = this.state.lizards.filter((l) => !this.isHidden(l));
    all.sort((a, b) => (this.displayScore(b) - this.displayScore(a)) || (a.id - b.id)); // 安定ソート(同点はidで固定=ちらつき防止)
    const byType = {}; const shown = new Set();
    for (const l of all) {
      const forced = l.id === this.selectedId || pins.includes(l.id);
      const k = this.dispKey(l);
      if (forced) { shown.add(l.id); byType[k] = (byType[k] || 0) + 1; continue; }
      if ((byType[k] || 0) < CFG.dispPerType && shown.size < CFG.displayCap) {
        shown.add(l.id); byType[k] = (byType[k] || 0) + 1;
      }
    }
    return shown;
  },

  lizardPrio(l) {
    const pins = (this.state.nest && this.state.nest.pins) || [];
    return (l.id === this.selectedId ? 1e6 : 0)
      + (pins.includes(l.id) ? 1e5 : 0)
      + (l.founder ? 500 : 0)
      + morphById(l.morphId).mult * 10
      + speciesById(l.speciesId).stars * 2;
  },

  // 3.12.2: 飼育槽に"表示"される優先度(高いほど表示)。ピン/選択中は最優先。
  //   平常時=攻撃力の弱い個体を表示(強個体は巣に籠る) / ボス時=攻撃力の強い個体が這い出す
  displayScore(l) {
    const pins = (this.state.nest && this.state.nest.pins) || [];
    if (l.id === this.selectedId) return 1e7;   // 選択中は必ず表示(プレイヤー意図優先)
    if (pins.includes(l.id)) return 1e6;        // ピン留めも必ず表示
    const atk = this.lizardAtk(l);
    return this.raid ? atk : -atk;              // ボス=強い順 / 平常=弱い順
  },

  // §8.13: 表示メンバーを"即座に"確定(ロード/新規/惑星切替時)。desiredShown(種×モーフ×2)へ一括収束=fps安定。
  // resting/restedAtは派生状態(保存しない)なので現況(攻撃力・平常/ボス)から毎回再構築する
  settleDisplay() {
    const show = this.desiredShown();
    for (const l of this.state.lizards) {
      if (this.isHidden(l)) continue; // 鷹に不在の個体は据え置き
      l.resting = !show.has(l.id);
      if (l.resting) l.restedAt = Date.now();
    }
    this.refreshCrowdScale();
  },

  // §8.13: desiredShown(平常=弱/ボス=強・種×モーフ×2・ピン/選択優先)へ表示メンバーを漸進的に寄せる。
  // 安定ソート(id同点固定)で境界の揺れを抑制。表示は見た目のみ=ロジックは全個体不変。
  updateResting(dt) {
    const s = this.state;
    this._restT = (this._restT || 0) + dt;
    const interval = this.raid ? 0.4 : CFG.restReevalSec; // ボスは速く再選抜/平常はゆっくり(ちらつき防止)
    if (this._restT < interval) return;
    this._restT = 0;
    const show = this.desiredShown();
    const toEmerge = [], toRetreat = [];
    for (const l of s.lizards) {
      if (this.isHidden(l)) continue;
      const shouldShow = show.has(l.id);
      if (shouldShow && l.resting) toEmerge.push(l);
      else if (!shouldShow && !l.resting) toRetreat.push(l);
    }
    if (!toEmerge.length && !toRetreat.length) return;
    toEmerge.sort((a, b) => this.displayScore(b) - this.displayScore(a));   // 出る=スコア高い順
    toRetreat.sort((a, b) => this.displayScore(a) - this.displayScore(b));  // 籠る=スコア低い順
    const swap = this.raid ? CFG.emergeSwapPerSec : CFG.restSwapPerSec;
    const rate = Math.max(swap, Math.ceil((toEmerge.length + toRetreat.length) / 6)); // 大差は加速して即収束
    for (let i = 0; i < Math.min(rate, toEmerge.length); i++) this.emergeFromNest(toEmerge[i]);
    for (let i = 0; i < Math.min(rate, toRetreat.length); i++) this.retreatToNest(toRetreat[i]);
  },

  // §8.14(準備): 巣穴の座標(描画側FAC_POS.burrowと共有・実行時参照)。無ければ従来値にフォールバック
  nestXY() {
    return (typeof FAC_POS !== "undefined" && FAC_POS.burrow) ? FAC_POS.burrow : { x: 185, y: 322 };
  },
  emergeFromNest(lz) {
    lz.resting = false;
    const n = this.nestXY();
    lz.x = n.x + rnd(-24, 24); lz.y = n.y + rnd(6, 20); // 巣口から出てくる(§8.12で巣は左へ移動)
    lz.tx = lz.homeX; lz.ty = lz.homeY;
    lz.restedAt = Date.now();
  },
  retreatToNest(lz) {
    lz.resting = true; // §8.13: 表示から外す(§8.14で歩いて巣へ戻る動作に置換予定)
    lz.restedAt = Date.now();
  },

  // 3.12.2: ボス襲来=強者が巣穴から「次々に湧き出す」(一斉でなく時間差)。
  // 実際の入れ替えは updateResting がボス時レート(emergeSwapPerSec)で漸進実行=湧き出す演出。
  // ここは即座に再選抜を促し、合図を出すだけ(戦闘計算は従来どおり全個体参加)。
  combatSurge() {
    this._restT = 999; // 次tickで即 updateResting が走る
    const n = this.nestXY();
    this.popup(n.x, n.y - 20, "強者、出撃!!", "#ffd24c");
  },

  nestLvUpCost() {
    const lv = (this.state.nest && this.state.nest.lv) || 1;
    return Math.floor(CFG.nestLvBaseCost * Math.pow(3, lv - 1));
  },
  nestLvUp() {
    const s = this.state;
    const lv = (s.nest && s.nest.lv) || 1;
    if (lv >= CFG.nestLvMax) return false;
    const cost = this.nestLvUpCost();
    if (s.coins < cost) { UI.toast("コインが足りない!", true); return false; }
    s.coins -= cost;
    s.nest.lv = lv + 1;
    UI.toast(`巣が Lv${s.nest.lv} に! 外出枠+1・隊列枠が拡張`);
    return true;
  },

  // ---------------- V4.1 §3: 巣ネットワーク(完全放置・自動解放) ----------------
  // プレイヤー操作は一切ない。繁殖などの累計値が条件を満たすと自動でノードが開き、
  // 希少鉱石が付与される。巣は「眺めるもの」。
  ensureNestWeb() {
    if (!this.state.nestWeb) this.state.nestWeb = { nodes: {}, surprises: 0 };
    return this.state.nestWeb;
  },

  nestMetric(type) {
    const s = this.state;
    switch (type) {
      case "bred": return s.stats.bred;
      case "hatched": return s.stats.hatched;
      case "wins": return s.stats.raidsWon;
      case "species": { // 発見済みの種族数(図鑑ベース)
        const set = new Set();
        for (const k of Object.keys(s.dex)) set.add(k.split(":")[0]);
        return set.size;
      }
      case "morphs": // レアモーフの図鑑登録数(ノーマル以外)
        return Object.keys(s.dex).filter((k) => !k.endsWith(":normal")).length;
      case "dexRate": return this.dexRate() * 100;
      default: return 0;
    }
  },

  // ノード進捗(0..1)。複合条件は最小値
  nestProgress(node) {
    if (!node.conds.length) return 1;
    let p = 1;
    for (const c of node.conds) p = Math.min(p, this.nestMetric(c.type) / c.need);
    return Math.min(1, p);
  },

  // 自動解放エンジン(§3.2/§3.3)。操作ゼロ。戻り値=今回解放されたノード
  checkNestWeb(silent) {
    const web = this.ensureNestWeb();
    const opened = [];
    for (const node of buildNestWeb()) {
      if (node.id === "core" || web.nodes[node.id]) continue;
      if (this.nestProgress(node) >= 1) {
        web.nodes[node.id] = true;
        if (node.reward) this.addOre(node.reward.ore, node.reward.n);
        opened.push(node);
      }
    }
    if (!silent && opened.length) {
      if (UI.heroNestReveal) {
        UI.heroNestReveal(opened); // ヒーロー演出(§6: 中庸・複数は1回に合算)
      } else {
        for (const node of opened) {
          const o = oreById(node.reward.ore);
          UI.toast(`巣ノード解放!「${node.name}」 → ${Icon.svg(o.icon)}${o.name}+${node.reward.n}`);
        }
      }
    }
    return opened;
  },

  // 確率先行解放(§3.3-2): 繁殖成功時の嬉しいサプライズ。ハズレ演出はしない
  nestSurprise() {
    if (Math.random() >= CFG.nestSurpriseChance) return null;
    const web = this.ensureNestWeb();
    const locked = buildNestWeb().filter((n) => n.id !== "core" && !web.nodes[n.id]);
    if (!locked.length) return null;
    const node = locked[Math.floor(Math.random() * locked.length)];
    web.nodes[node.id] = true;
    web.surprises = (web.surprises || 0) + 1;
    if (node.reward) this.addOre(node.reward.ore, node.reward.n);
    const o = oreById(node.reward.ore);
    this.flashT = 0.3;
    if (UI.heroNestReveal) UI.heroNestReveal([node], true); // サプライズ版(少し特別)
    else UI.toast(`予想外のノードが解放された!!「${node.name}」 → ${Icon.svg(o.icon)}${o.name}+${node.reward.n}`);
    return node;
  },

  nestWebCounts() {
    const web = this.ensureNestWeb();
    const all = buildNestWeb().filter((n) => n.id !== "core");
    const open = all.filter((n) => web.nodes[n.id]).length;
    return { open, total: all.length };
  },

  // ---------------- V4.1 §5: 希少鉱石(別ウォレット) ----------------
  ore(id) { return (this.state.rare && this.state.rare[id]) || 0; },
  addOre(id, n) {
    if (!this.state.rare) this.state.rare = {};
    this.state.rare[id] = Math.max(0, (this.state.rare[id] || 0) + n);
  },
  // 賢者の石(v11・四重スリット装置のレア報酬・保有のみ)。負値も可(将来の消費用)
  addStone(n) {
    this.state.stones = Math.max(0, (this.state.stones || 0) + n);
  },
  spendOre(id, n) {
    if (this.ore(id) < n) return false;
    this.addOre(id, -n);
    return true;
  },

  // 隕石を割る: 希少個体(レアモーフ確定・低確率で伝説)の卵が出る
  crackMeteorite() {
    if (this.ore("meteorite") < 1) { UI.toast("隕石がない(巣ネットワークで手に入る)", true); return false; }
    if (this.state.eggs.length >= this.eggSlotCap()) { UI.toast("卵スロットがいっぱい!", true); return false; }
    this.addOre("meteorite", -1);
    const rare = this.breedablePool().filter((sp) => sp.stars >= 2);
    const pool = rare.length ? rare : this.breedablePool(); // 純血: 現惑星の固有種のみ(希少枠が無ければ固有種から)
    const sp = pool[Math.floor(Math.random() * pool.length)] || speciesById("kanahebi");
    const morphId = Math.random() < CFG.meteoriteLegendChance ? "legendary"
      : ["albino", "melanistic", "golden"][Math.floor(Math.random() * 3)];
    this.state.eggs.push({
      speciesId: sp.id, morphId,
      hue: sp.hue + rnd(-10, 10), sat: sp.sat, light: sp.light,
      pattern: PATTERNS[Math.floor(Math.random() * 4)],
      t: 25, total: 25, lucky: true,
    });
    this.flashT = 0.5;
    const egg = this.state.eggs[this.state.eggs.length - 1];
    if (UI.heroMeteorite) UI.heroMeteorite(sp, morphById(morphId), egg); // 中〜重(§6)
    else UI.toast(`隕石を割った!! 中から${morphId === "legendary" ? "伝説の" : "希少な"}卵が…!`);
    return true;
  },

  // 遺伝子解析: 琥珀から未発見の図鑑エントリを1つ解析し、その卵を得る
  geneAnalyze() {
    if (this.ore("amber") < CFG.geneAmberCost) { UI.toast(`琥珀が${CFG.geneAmberCost}個必要`, true); return false; }
    if (this.state.eggs.length >= this.eggSlotCap()) { UI.toast("卵スロットがいっぱい!", true); return false; }
    const pick = this.pickUnownedDexEntry(null); // 未所持dexエントリ抽選を共通化(重複解消)
    if (!pick) { UI.toast("解析できる未発見の遺伝子がない(図鑑が充実している!)", true); return false; }
    this.addOre("amber", -CFG.geneAmberCost);
    const sp = pick[0], mo = pick[1];
    this.state.eggs.push({
      speciesId: sp.id, morphId: mo.id,
      hue: sp.hue + rnd(-10, 10), sat: sp.sat, light: sp.light,
      pattern: PATTERNS[Math.floor(Math.random() * 4)],
      t: 30, total: 30, lucky: true,
    });
    UI.toast(`琥珀の遺伝子を解析! 未発見の「${mo.name} ${sp.name}」の卵が生成された`);
    return true;
  },

  // チタン鍛造: 設備を"化けさせる"(Lv上限+1。設備は増やさず深くする)
  facMax(f) { return f.max + ((this.state.forged && this.state.forged[f.id]) || 0); },
  forgeFacility(id) {
    const f = facilityById(id);
    if (!f) return false;
    if (!this.spendOre("titaniumOre", CFG.forgeTitaniumCost)) { UI.toast(`チタン鉱が${CFG.forgeTitaniumCost}個必要`, true); return false; }
    if (!this.state.forged) this.state.forged = {};
    this.state.forged[id] = (this.state.forged[id] || 0) + 1;
    UI.toast(`${f.name}が化けた! Lv上限+1(現在 上限${this.facMax(f)})`);
    return true;
  },

  // アメジスト: やり込みの証 → 始祖の卵(伝説確定)
  amethystEgg() {
    if (this.ore("amethyst") < CFG.amethystLegendCost) { UI.toast(`アメジストが${CFG.amethystLegendCost}個必要`, true); return false; }
    if (this.state.eggs.length >= this.eggSlotCap()) { UI.toast("卵スロットがいっぱい!", true); return false; }
    this.addOre("amethyst", -CFG.amethystLegendCost);
    const pool = this.breedablePool(); // 純血: 現惑星の固有種のみ(その中の最上位星を伝説に)
    const sp = pool.sort((a, b) => b.stars - a.stars)[0] || speciesById("kanahebi");
    this.state.eggs.push({
      speciesId: sp.id, morphId: "legendary",
      hue: sp.hue, sat: sp.sat, light: sp.light,
      pattern: PATTERNS[Math.floor(Math.random() * 4)],
      t: 30, total: 30, lucky: true,
    });
    this.flashT = 0.6;
    UI.toast("アメジストが共鳴し、始祖の卵が姿を現した…!");
    return true;
  },

  // ---------------- V4.1 §7: ロケット建造(長期目標) ----------------
  ensureRocket() {
    if (!this.state.rocket) this.state.rocket = { stage: 0, invested: 0, done: false };
    return this.state.rocket;
  },
  rocketStageNeed() {
    const r = this.ensureRocket();
    return r.stage < CFG.rocketStages.length ? CFG.rocketStages[r.stage] : 0;
  },
  investRocket(n) {
    const r = this.ensureRocket();
    if (r.done) return false;
    const amount = Math.min(n, this.ore("iridium"), this.rocketStageNeed() - r.invested);
    if (amount <= 0) { UI.toast("イリジウムが足りない(巣ネットワークで手に入る)", true); return false; }
    this.addOre("iridium", -amount);
    r.invested += amount;
    if (r.invested >= this.rocketStageNeed()) {
      r.stage++;
      r.invested = 0;
      if (r.stage >= CFG.rocketStages.length) {
        r.done = true;
        this.addOre("amethyst", 20);
        this.state.lore.rocket = true;
        this.flashT = 1;
        this.slowmo = 1;
        if (UI.heroRocketLaunch) UI.heroRocketLaunch(); // 一生に数回級(§6)
        else UI.toast("ロケット完成!!! トカゲ文明は再び星の海へ — アメジスト+20 / 全惑星の生産+10%(恒久)");
      } else {
        UI.toast(`ロケット建造 第${r.stage}段階が完了! (全${CFG.rocketStages.length}段階)`);
      }
    } else {
      UI.toast(`イリジウム${amount}を投入(${r.invested}/${this.rocketStageNeed()})`);
    }
    return true;
  },

  // ---------------- V4.1 §6: バガー侵食率(全惑星共通・可逆な圧) ----------------
  erosionStage() {
    const v = this.state.erosion || 0;
    return v >= CFG.erosionT2 ? 2 : v >= CFG.erosionT1 ? 1 : 0;
  },
  erosionIncomeMult() { return [1, CFG.erosionIncome1, CFG.erosionIncome2][this.erosionStage()]; },
  erosionBreedMult() { return [1, CFG.erosionBreed1, CFG.erosionBreed2][this.erosionStage()]; },
  erosionBossMult() { return [1, CFG.erosionBoss1, CFG.erosionBoss2][this.erosionStage()]; },
  erosionRise(dtSec) {
    const slow = 1 - Math.min(0.9, this.researchBonus("erosionSlow"));
    const perHour = (CFG.erosionRisePerHour + CFG.erosionFrontierAdd) * slow;
    this.state.erosion = clamp((this.state.erosion || 0) + (perHour / 3600) * dtSec, 0, 100);
  },
  erosionLoginRelief() {
    const down = CFG.erosionLoginDown + this.researchBonus("erosionDown");
    const before = this.state.erosion || 0;
    this.state.erosion = Math.max(0, before - down);
    if (before >= CFG.erosionT1) {
      UI.toast(`ログインでバガー侵食率が回復した(${Math.round(before)}%→${Math.round(this.state.erosion)}%)`);
    }
  },

  // ---------------- V4 §3.3: 資源(フロー型)の中核 ----------------
  res(id) { return (this.state.res && this.state.res[id]) || 0; },
  addRes(id, n) {
    if (!this.state.res) this.state.res = { bio: 0, food: 0, energy: 0, science: 0 };
    this.state.res[id] = Math.max(0, (this.state.res[id] || 0) + n);
  },
  spendRes(cost) {
    for (const k in cost) if (this.res(k) < cost[k]) return false;
    for (const k in cost) this.addRes(k, -cost[k]);
    return true;
  },
  // Gold→資源変換(Goldの恒常的な出口 §2.3-1)
  convertGold(kind) {
    const rate = kind === "food" ? CFG.goldToFoodRate : CFG.goldToEnergyRate;
    const cost = rate * CFG.convertBatch;
    if (this.state.coins < cost) { UI.toast("コインが足りない!", true); return false; }
    this.state.coins -= cost;
    this.addRes(kind, CFG.convertBatch);
    UI.toast(`${fmt(cost)}G → ${Icon.svg(resById(kind).icon)}${resById(kind).name}+${CFG.convertBatch} に変換した`);
    return true;
  },
  // 生態データ→研究力変換
  convertBio() {
    const need = CFG.bioToScienceRate * CFG.convertBatch;
    if (this.res("bio") < need) { UI.toast(`生態データが${fmt(need)}必要`, true); return false; }
    this.addRes("bio", -need);
    this.addRes("science", CFG.convertBatch);
    UI.toast(`生態データ${fmt(need)} → 研究力+${CFG.convertBatch} に変換した`);
    return true;
  },

  // ---------------- V4 §2.3-3: 惑星開発(Goldシンク) ----------------
  devCost() {
    return Math.floor(CFG.devCostBase * Math.pow(CFG.devCostMult, this.state.devLv || 0));
  },
  buyDev() {
    const s = this.state;
    if ((s.devLv || 0) >= CFG.devMaxLv) return false;
    const cost = this.devCost();
    if (s.coins < cost) { UI.toast("コインが足りない!", true); return false; }
    s.coins -= cost;
    s.devLv = (s.devLv || 0) + 1;
    UI.toast(`惑星開発 Lv${s.devLv}! この惑星の生産+2%・エネルギー産出が増えた`);
    return true;
  },

  // ---------------- V4 §2.2: フロンティア誘導 ----------------
  frontierId() {
    const un = this.unlockedStages();
    return un[un.length - 1].id;
  },
  isFrontier() { return this.currentStage().id === this.frontierId(); },
  // 旧惑星のランクXP寄与はティア比で逓減(ソフトキャップ)。フロンティアはボーナス
  planetXpMult() {
    const F = this.frontierId(), t = this.currentStage().id;
    if (t === F) return CFG.frontierXpMult;
    return clamp(CFG.xpTierFloor + (1 - CFG.xpTierFloor) * (t / F), CFG.xpTierFloor, 1);
  },
  pioneeredCount() {
    if (!this.world) return 1;
    return this.world.stages.filter((st) => st.pioneered || st.lizards.length > 0).length;
  },

  // ---------------- V3 Phase5: 突然変異(V4: 生態データ消費に変更) ----------------
  stageSpecificSpecies() {
    const id = this.currentStage().id;
    return SPECIES.filter((sp) => sp.stage === id && sp.stage >= 6);
  },

  // Phase 4準備: 惑星の固有種2種(stage=惑星id)。純血化で「残す」対象
  endemicSpecies(stageId) { return SPECIES.filter((sp) => sp.stage === stageId).map((sp) => sp.id); },

  // Phase 4: 純血化の非破壊プレビュー(読み取り専用・診断)。各惑星で残る/消える個体を数える。
  // Ric承認前に「何がどれだけ失われるか」を実測するための関数。実際の削除は行わない。
  purifyPreview() {
    const w = this.toWorld(); // 現在地(state.lizards)も反映した全惑星スナップショット
    const out = { totalKeep: 0, totalLose: 0, planets: [] };
    for (const st of (w.stages || [])) {
      const stage = stageById(st.stageId) || { name: "?", pname: "?" };
      const endemic = this.endemicSpecies(st.stageId);
      const keepBy = {}, loseBy = {};
      let keep = 0, lose = 0;
      for (const lz of (st.lizards || [])) {
        const sid = lz.speciesId;
        if (endemic.includes(sid)) { keep++; keepBy[sid] = (keepBy[sid] || 0) + 1; }
        else { lose++; loseBy[sid] = (loseBy[sid] || 0) + 1; }
      }
      out.totalKeep += keep; out.totalLose += lose;
      const nm = (o) => Object.entries(o).map(([k, v]) => `${(speciesById(k) || { name: k }).name}×${v}`).join(", ") || "(なし)";
      out.planets.push({ id: st.stageId, planet: `${stage.pname || ""} ${stage.name}`.trim(),
        total: (st.lizards || []).length, keep, lose,
        endemic: endemic.map((id) => (speciesById(id) || { name: id }).name).join("/"),
        残る: nm(keepBy), 消える: nm(loseBy) });
    }
    if (typeof console !== "undefined") { console.log("=== 純血化プレビュー(非破壊) ==="); console.table(out.planets); console.log(`合計: 残る${out.totalKeep} / 消える${out.totalLose}`); }
    return out;
  },
  mutateLizard(lz) {
    const pool = this.stageSpecificSpecies();
    if (!pool.length) { UI.toast("この惑星には固有種がいない", true); return false; }
    if (this.res("bio") < CFG.mutateBioCost) {
      UI.toast(`生態データが${CFG.mutateBioCost}必要(育成・探索で貯まる)`, true);
      return false;
    }
    this.addRes("bio", -CFG.mutateBioCost);
    const sp = pool[Math.floor(Math.random() * pool.length)];
    lz.speciesId = sp.id;
    lz.hue = sp.hue + rnd(-10, 10); lz.sat = sp.sat; lz.light = sp.light;
    this.registerDex(lz.speciesId, lz.morphId);
    this.flashT = 0.4;
    UI.toast(`生態データ 突然変異!! ${this.lizardName(lz)} へ姿を変えた!`);
    return true;
  },

  lizardAtk(lz) {
    const sp = speciesById(lz.speciesId), mo = morphById(lz.morphId);
    const stageMult = lz.stage === "adult" ? 1 : 0.25;
    let v = sp.atk * mo.mult * stageMult * (1 + (lz.level - 1) * CFG.levelAtkMult);
    if (lz.poisonT > 0) v *= Math.min(1, CFG.poisonAtkMult + this.facLv("trap") * 0.025); // 毒(罠設備で軽減)
    return v;
  },
  // 毒の持続倍率: 水場(統合)/湿原環境で短縮
  poisonDurMult() {
    let m = (1 - this.facLv("water") * 0.05)
      * (this.currentStage().env.poisonMult || 1);
    return Math.max(0.15, m);
  },
  lizardIncome(lz) {
    if (lz.stage !== "adult" || lz.injuredT > 0 || this.isAway(lz)) return 0;
    const sp = speciesById(lz.speciesId), mo = morphById(lz.morphId);
    return sp.income * mo.mult * (1 + (lz.level - 1) * CFG.levelIncomeMult);
  },
  lizardSellPrice(lz) {
    const sp = speciesById(lz.speciesId), mo = morphById(lz.morphId);
    const stageMult = lz.stage === "adult" ? 1 : 0.5;
    return Math.floor(sp.sell * mo.mult * stageMult * (1 + (lz.level - 1) * 0.1));
  },
  // V5 Phase3: 留守ステージの生産/秒(書き戻し時にStageData.incomeRateへキャッシュ)
  stageIncomeRate(st) {
    if (!st || !st.lizards || !st.lizards.length) return 0;
    return st.lizards.reduce((a, lz) => lz.stage === "adult"
      ? a + speciesById(lz.speciesId).income * morphById(lz.morphId).mult * (1 + (lz.level - 1) * CFG.levelIncomeMult)
      : a, 0) * (1 + ((st.facilities && st.facilities.water) || 0) * 0.07);
  },
  // 留守コロニー合算の生産/秒(解放済みステージ数に応じて増える=V5の合算収入)
  awayIncomePerSec() {
    if (!this.world || !this.world.stages) return 0;
    const cur = this.currentStage().id;
    let t = 0;
    for (const st of this.world.stages) if (st.stageId !== cur) t += st.incomeRate || 0;
    return t * CFG.awayStageIncomeRate;
  },
  totalIncomePerSec() { return this.incomePerSec() + this.awayIncomePerSec(); },

  incomePerSec() {
    const env = this.currentStage().env;
    let t = 0;
    for (const lz of this.state.lizards) t += this.lizardIncome(lz);
    t *= 1 + this.facLv("water") * 0.07                    // 水場(統合)
      + this.dexRate() * 0.04 * this.facLv("observatory")  // 展望台: 収集の報酬化
      + this.dexCompBonus()                                // 図鑑コンプ報酬(恒久バフ)
      + this.researchBonus("income")                       // HQ研究(全惑星恒久)
      + this.hqLevel() * 0.002                             // HQ Lvバフ
      + (this.state.devLv || 0) * CFG.devIncomePerLv;      // 惑星開発(この惑星のみ)
    if (this.isFrontier()) t *= CFG.frontierIncomeMult;    // フロンティア・ボーナス(§2.2)
    if (env.incomeMult) t *= env.incomeMult;               // 大湿原
    if (env.relic) t *= 1 + Math.min(0.2, this.state.stats.raidsWon * 0.001); // 遺物ボーナス
    if (this.event && this.event.def.incomeMult) t *= this.event.def.incomeMult; // イベント
    t *= this.erosionIncomeMult();                         // V4.1: 侵食で設備効率が落ちる
    if (this.state.rocket && this.state.rocket.done) t *= 1.1; // ロケット完成の恒久ボーナス
    // ヌシオオトカゲの威嚇: 居座り中は生産低下(カメがいれば半減)
    if (this.raid && this.raid.typeId === "monitor" && this.raid.snake.arrived) {
      t *= this.allyLv("turtle") ? 0.7 : 0.4;
    }
    return t;
  },

  unlockedStages() {
    return STAGES.filter((st) => this.state.rank >= st.rank);
  },
  currentStage() {
    // 手動選択があればそれ、なければ解放済みの最新ステージ
    if (this.state.stageSel) {
      const sel = STAGES.find((st) => st.id === this.state.stageSel);
      if (sel && this.state.rank >= sel.rank) return sel;
    }
    let st = STAGES[0];
    for (const s of STAGES) if (this.state.rank >= s.rank) st = s;
    return st;
  },
  // ---------------- V3 Phase2: Stage独立コロニーの切替 ----------------
  // 「引っ越し」ではなく「拠点を増やす」: 各Stageは独立コロニーとして併存する
  stageData(id) {
    return this.world && this.world.stages.find((st) => st.stageId === id);
  },

  // HQ Level: プレイヤーの真の進行度(V4 §2.2-4: rankをHQ Levelへ一本化)
  hqLevel() {
    return this.state.rank;
  },

  // 本部研究の恒久ボーナス (§9.3)
  researchBonus(key) {
    let v = 0;
    for (const id in this.state.research) {
      const r = researchById(id);
      if (r && r.eff[key]) v += r.eff[key];
    }
    return v;
  },

  selectStage(id, founderIds) {
    const s = this.state;
    const target = STAGES.find((x) => x.id === id);
    if (!target || s.rank < target.rank) return false;
    if (this.currentStage().id === id) return false;
    // 単一ID/配列どちらでも受ける(後方互換)
    const fids = founderIds == null ? [] : (Array.isArray(founderIds) ? founderIds : [founderIds]);

    // 進行中の襲撃は破棄(切替=そのStageの現地対応から離れる)
    if (this.raid) { this.raid = null; s.raidTimer = CFG.raidInterval; }
    this.event = null; this.selectedId = null;

    // 現コロニーをworldへ書き戻し
    const active = this.activeStageData();
    const idx = this.world.stages.findIndex((st) => st.stageId === active.stageId);
    if (idx >= 0) this.world.stages[idx] = active;
    else this.world.stages.push(active);

    // 切替先(なければ新規開拓地として生成)
    let tgt = this.stageData(id);
    if (!tgt) { tgt = this.emptyStageData(id); this.world.stages.push(tgt); }
    let pioneered = false;
    let returnGift = false;
    if (!tgt.pioneered) {
      // Phase4(純血・引き連れなし): 新ステージは固有種#1の純血ペア2匹のみ(創始者の持ち込みは廃止)
      this.applyStarterPack(tgt);
      this.spawnPurePair(tgt, id);
      tgt.pioneered = true;
      pioneered = true;
    } else if (!tgt.gotReturnGift) {
      // Phase4: 過去ステージ(クリア済)へ復帰の初回=固有種#2の卵を報酬(特別孵化演出)。無限ループ防止=一度だけ
      returnGift = this.grantReturnGift(tgt, id);
      if (returnGift) tgt.gotReturnGift = true;
    }
    void fids; // Phase4: 引き連れ(創始者ID)は不使用へ

    // オフライン進行(留守中のコロニーが生きていた証)
    const report = this.simulateOffline(tgt);

    // ランタイムへ切替
    this.world.currentStageId = id;
    s.stageSel = id;
    s.lizards = tgt.lizards; s.eggs = tgt.eggs; s.facilities = tgt.facilities;
    s.gotReturnGift = !!tgt.gotReturnGift; // Phase4: 復帰報酬の受領済みフラグをランタイムへ(書き戻しで保持)
    // V5: コオロギは共通在庫(入れ替えない)
    s.raidTimer = tgt.boss.raidTimer; s.nextRaid = tgt.boss.nextRaid;
    s.stageWins = tgt.boss.wins || 0;
    s.nest = tgt.nest || { lv: 1, pins: [] };
    s.exploration = tgt.exploration || null;
    for (const f of FACILITIES) if (s.facilities[f.id] === undefined) s.facilities[f.id] = 0;
    for (const lz of s.lizards) this.ensureRuntime(lz);
    if (!s.nextRaid) this.rollNextRaid();
    this.settleDisplay(); // 3.12.2: 惑星切替で表示20を即確定(移動先が大コロニーでもfps安定)

    UI.toast(`${Icon.svg(target.icon)} コロニー「${target.name}」へ移動 — ${target.envText}`);
    if (pioneered) {
      const puresp = SPECIES.filter((sp) => sp.stage === id)[0];
      UI.toast(`開拓ボーナス! 本部Lv${this.hqLevel()}の支援: コオロギ+${fmt(CFG.pioneerCrickets + this.hqLevel() * 20)}・開拓資金+${fmt(CFG.pioneerCoins + this.hqLevel() * 2000)}G・水場とシェルターを無償設置`);
      UI.toast(`この惑星の固有種「${puresp ? puresp.name : ""}」の純血ペア2匹から始まる(純血設計)`);
    } else if (returnGift) {
      const gsp = SPECIES.filter((sp) => sp.stage === id)[1] || SPECIES.filter((sp) => sp.stage === id)[0];
      UI.toast(`${Icon.svg("egg")} 里帰りの祝福! 固有種「${gsp ? gsp.name : ""}」の卵が贈られた(孵化を見届けよう)`);
    }
    // V5: 到着時の留守精算トーストは廃止(収入は常時合算・違和感の根治)
    void report;
    this.save();
    return true;
  },

  // 創始者にできるか: 惑星固有種(6+)は自惑星以外へ持ち出せない
  canFound(lz, targetStageId) {
    const sp = speciesById(lz.speciesId);
    return lz.stage === "adult" && (sp.stage <= 5 || sp.stage === targetStageId);
  },

  // V4 §2.1-A/B: 現地生物の初期生息(NativeSpeciesSpawner)
  // その惑星の種を nativeCount 匹生成。うち2匹はアダルト保証(繁殖の床)
  spawnNatives(tgt, stageId) {
    const pool = SPECIES.filter((sp) => sp.stage === stageId);
    if (!pool.length) pool.push(speciesById("kanahebi"));
    let n = 0;
    for (let i = 0; i < CFG.nativeCount; i++) {
      const sp = pool[Math.floor(Math.random() * pool.length)];
      const lz = this.makeLizard(sp.id, "normal", {
        hue: sp.hue + rnd(-12, 12), sat: sp.sat, light: sp.light,
        pattern: PATTERNS[Math.floor(Math.random() * 4)],
      }, i < 2 ? "adult" : "baby"); // 2匹はアダルト保証(§2.1-B)
      lz.level = 1 + Math.floor(rnd(0, 3));
      lz.native = true; // 現地生物マーク
      tgt.lizards.push(lz);
      if (this.state) this.registerDex(sp.id, "normal", true);
      n++;
    }
    return n;
  },

  // Phase4: 新ステージは固有種#1の純血ペア2匹(アダルト)のみ。引き連れなし
  spawnPurePair(tgt, stageId) {
    const endemic = SPECIES.filter((sp) => sp.stage === stageId);
    const sp = endemic[0] || speciesById("kanahebi"); // 固有種#1
    for (let i = 0; i < 2; i++) {
      const lz = this.makeLizard(sp.id, "normal", {
        hue: sp.hue + rnd(-8, 8), sat: sp.sat, light: sp.light,
        pattern: PATTERNS[Math.floor(Math.random() * 4)],
      }, "adult");
      lz.level = 1; lz.native = true;
      tgt.lizards.push(lz);
      if (this.state) this.registerDex(sp.id, "normal", true);
    }
    return 2;
  },

  // Phase4: 過去ステージ復帰の報酬=固有種#2の卵(特別孵化)。一度だけ(呼び出し側でgotReturnGift管理)=無限ループなし
  grantReturnGift(tgt, stageId) {
    const endemic = SPECIES.filter((sp) => sp.stage === stageId);
    const sp = endemic[1] || endemic[0]; // 固有種#2(無ければ#1)
    if (!sp) return false;
    const nl = (tgt.nest && tgt.nest.lv) || 1;
    const hatchMult = Math.max(0.2, 1 - (nl - 1) * 0.03);
    const total = CFG.hatchBasePerStar * sp.stars * hatchMult;
    tgt.eggs.push({
      speciesId: sp.id, morphId: "normal",
      hue: sp.hue + rnd(-8, 8), sat: sp.sat, light: sp.light,
      pattern: PATTERNS[Math.floor(Math.random() * 4)],
      t: total, total, gift: true, // gift=特別孵化演出フラグ
    });
    return true;
  },

  // 開拓ボーナス (§9.2): 本部Lvが高いほど厚い支給
  applyStarterPack(tgt) {
    const lvl = this.hqLevel();
    this.state.crickets += CFG.pioneerCrickets + lvl * 20; // V5.2: コオロギ支給を復活(共通在庫へ)
    tgt.facilities.water = Math.max(tgt.facilities.water || 0, 1);
    this.state.coins += CFG.pioneerCoins + lvl * 2000;
  },

  // ---------------- V3: オフライン簡易シミュレーション (§3.4) ----------------
  simulateOffline(st) {
    const now = Date.now();
    const dtSec = Math.min(Math.max(0, (now - (st.lastTickAt || now)) / 1000), this.offlineCapSec());
    st.lastTickAt = now;
    if (dtSec < 60) return null;
    // V5 Phase3: 生産コインの到着時/ロード時の個別精算は廃止——収入は常時のtotalIncomePerSecと
    // ロード時の全コロニー一括精算(load内)へ移行。ここでは卵・回復・撃退カウントだけを進める
    const report = { hours: dtSec / 3600, wins: 0 };

    if (st.lizards.length > 0) {
      // 3.11.3: 留守中の襲撃自動撃退・撃退報酬・撃退数加算は撤廃(見届けた者のみ報酬)。
      // ボスは画面を開いている時のみ到来・討伐される。留守中は襲撃が進行しない。
      // 状態異常は帰還時に全快(留守中の細かい管理は要求しない・報酬ではないQoLなので存置)
      for (const lz of st.lizards) { lz.injuredT = 0; lz.poisonT = 0; lz.hiddenT = 0; }
    }
    // 卵の孵化進行
    for (const egg of st.eggs) egg.t = Math.max(0, egg.t - dtSec);
    return report;
  },

  // 背景タブ復帰/ラグで空いた時間をまとめて精算(RAFが止まっても生産を止めない)
  catchUp(sec) {
    // 戦闘中はライブで進める(まとめ精算しない)
    if (this.raid) { this.tick(Math.min(sec, 0.1)); return; }
    const total = Math.min(sec, this.offlineCapSec());
    const before = this.state.coins;
    // ボスのいないクリーンな状態でまとめ精算(生産・卵・探索・状態回復を一括)
    this.bulkAdvance(total);
    // まとまった時間が経っていれば「おかえり」通知
    if (total > 60) {
      const gained = Math.max(0, Math.floor(this.state.coins - before));
      UI.toast(`おかえり! 離席中(${fmtDur(total)})も稼働 — 生産+${fmt(gained)}G`);
    }
  },

  // 一括精算: 生産・コオロギ湧き・卵孵化・状態回復・探索を経過秒ぶん進める
  bulkAdvance(sec) {
    const s = this.state;
    const env = this.currentStage().env;
    // まず状態異常・クールダウンを回復(短い負傷は離席中に治るので、生産は復帰後の実効レートで計上)
    const recMult = (1 + this.facLv("heat") * 0.04 * (env.heatBoost || 1)) * (env.recoveryMult || 1);
    for (const lz of s.lizards) {
      if (lz.breedCd > 0) lz.breedCd = Math.max(0, lz.breedCd - sec);
      if (lz.injuredT > 0) lz.injuredT = Math.max(0, lz.injuredT - sec * recMult);
      if (lz.poisonT > 0) lz.poisonT = Math.max(0, lz.poisonT - sec);
      if (lz.hiddenT > 0) lz.hiddenT = Math.max(0, lz.hiddenT - sec);
    }
    // 生産(離席中もフルレートで稼働。上限は offlineCapSec)
    s.coins += this.totalIncomePerSec() * sec; // V5: 合算収入で離席分を精算
    // §8.12: コオロギの自然湧き(巣+環境の恵み)を共通在庫へ。餌場→巣へ統合
    const spawn = this.nestLv() * CFG.nestCricketPerLv + (env.crickets || 0);
    if (spawn > 0) s.crickets = (s.crickets || 0) + spawn * sec;
    // V4: 資源のフロー生産と侵略圧も離席中に進む(食料供給も巣Lv駆動)
    this.addRes("food", this.nestLv() * CFG.resFoodPerFeederLv * sec);
    this.addRes("energy", (s.devLv || 0) * CFG.resEnergyPerDevLv * sec);
    this.erosionRise(sec); // V4.1: 離席中も侵食はゆっくり進む
    // V5.1: 自動補給はGold消費給餌により不要(撤廃)
    // 卵の孵化タイマー(次の通常tickで孵化する)
    for (const egg of s.eggs) egg.t = Math.max(0, egg.t - sec);
    // 3.11.3: 留守中はボス到来タイマーを進めない(画面を開いている時のみ到来)。timerは据え置き
    s.raidTimer = Math.max(3, s.raidTimer || CFG.raidInterval);
    s.savedAt = Date.now();
  },

  toastOfflineReport(stage, r) {
    if (r.coins <= 0 && r.wins <= 0) return;
    const parts = [];
    if (r.coins > 0) parts.push(`生産+${fmt(r.coins)}G`);
    if (r.wins > 0) parts.push(`襲撃${r.wins}回撃退`);
    UI.toast(`${Icon.svg(stage.icon)}${stage.name}の留守中: ${parts.join(" / ")}`);
  },

  // Stage切替バー用のバッジ (§10.1)
  stageBadges(st) {
    const b = [];
    if (!st) return b;
    const elapsed = (Date.now() - (st.lastTickAt || Date.now())) / 1000;
    if (st.eggs && st.eggs.some((e) => e.t - elapsed <= 0)) b.push(Icon.svg("egg"));
    if (st.boss && st.lizards.length > 0 && elapsed > (st.boss.raidTimer || CFG.raidInterval)) b.push(Icon.svg("snake"));
    // V5.2: コオロギは共通在庫。切れ警告は現在地タブにのみ出す
    if (st.lizards.length > 0 && st.stageId === (this.world ? this.world.currentStageId : 0) && Math.floor(this.state.crickets || 0) <= 0) b.push(Icon.svg("warn"));
    return b;
  },
  // V5.2 Phase4(純血設計): 生成(繁殖・上位変異・ルーレット景品/遺伝子解析・隕石/アメジスト/ラッキー卵)で
  // 使える種は「現在の惑星の固有種2種」のみ。これを唯一の生成プールにすることで、他惑星種を作らず
  // 生態系の純血を守る(旧unlockedSpeciesはstage1〜5種を全惑星で含み混入の構造的原因だったため撤去)。
  breedablePool() {
    return this.endemicSpecies(this.currentStage().id).map((id) => speciesById(id)).filter(Boolean);
  },
  eggSlotCap() {
    const nl = (this.state.nest && this.state.nest.lv) || 1;
    return CFG.eggSlots + (nl >= 2 ? 1 : 0) + (nl >= 6 ? 1 : 0);
  },

  dexRate() {
    return Object.keys(this.state.dex).length / (SPECIES.length * MORPHS.length);
  },
  registerDex(speciesId, morphId, silent) {
    const key = speciesId + ":" + morphId;
    if (this.state.dex[key]) return;
    this.state.dex[key] = true;
    this.addRes("bio", CFG.resBioPerDex);
    const sp = speciesById(speciesId), mo = morphById(morphId);
    const gems = sp.stars;
    this.state.gems += gems;
    if (!silent) UI.toast(`図鑑に新登録! ${sp.name}(${mo.name}) +ジェム${gems}`);
  },

  // ---------------- 経済・育成 ----------------
  // V5.2: コオロギ購入(まとめ買い)を復活。共通在庫へ。左メニューは cricketLot() の1ロット固定表示
  buyCrickets(n, silent) {
    n = n || this.cricketLot();
    const cost = n * CFG.cricketCost;
    if (this.state.coins < cost) {
      if (!silent) UI.toast("Goldが足りない!", true);
      return false;
    }
    this.state.coins -= cost;
    this.state.crickets = (this.state.crickets || 0) + n;
    if (!silent) UI.toast(`コオロギを${fmt(n)}匹購入した`);
    return true;
  },
  // 購入ロット数=そのランクで買える最大ロット(表示は常に1項目・数値だけランクで増える)
  cricketLot() { return CFG.cricketLotBase + (this.state.rank || 1) * CFG.cricketLotPerRank; },

  // 1回の給餌に必要な「餌」を確保。コオロギ在庫を優先し、切れたら切れ時トグルに従う:
  //   stopOnEmpty=ON → 確保できず給餌停止(安全装置) / OFF → Gold換算で1匹補充して継続
  acquireFeedUnit(silent) {
    if ((this.state.crickets || 0) >= 1) { this.state.crickets -= 1; return true; }
    const d = this.ensureDial();
    if (d.stopOnEmpty || this.state.coins < CFG.feedGoldCost) {
      if (!silent) UI.toast(d.stopOnEmpty ? "コオロギ切れ(自動停止中)。購入するか切れ時トグルをOFFに" : "Goldが足りない!", true);
      return false;
    }
    this.state.coins -= CFG.feedGoldCost; // OFF: Gold換算補充(在庫±0で1匹ぶん消費)
    return true;
  },

  feed(lz, silent) {
    if (lz.injuredT > 0) {
      if (!silent) UI.toast("負傷中は食べられない…", true);
      return false;
    }
    if (!this.acquireFeedUnit(silent)) return false; // V5.2: コオロギ(or 切れ時Gold換算)を1消費
    this.state.stats.fed++;
    // v2ルーレット: 球放出はfeed(個体ごと)でなくfeedAll(給餌1回=クランク1動作)単位で1発(§7.1)
    this.addRes("bio", CFG.resBioPerFeed); // V4: 育成から生態データが生まれる
    let xp = CFG.feedXp * (1 + this.facLv("heat") * 0.06);
    if (this.event && this.event.def.xpMult) xp *= this.event.def.xpMult;
    lz.xp += xp;
    this.addRankXp(2);
    // V5 3.5: オート高では表示が洪水になるためN回に1回だけ・小さく(高限定)
    // 3.11-6: オート給餌中はポップアップを抑制(XP=非表示・Lv=小型化)。手動は現状のまま
    const auto = !!(this.state.dial && this.state.dial.auto);
    if (!auto || CFG.autoFeedXpPopup) {
      this.popup(lz.x, lz.y - 20, "+" + Math.round(xp) + "xp", "#9fe07a");
    }
    // 成長処理
    if (lz.stage === "baby" && lz.xp >= CFG.babyXpToAdult) {
      lz.stage = "adult"; lz.xp = 0; lz.level = 1;
      UI.toast(`${this.lizardName(lz)} がアダルトに成長!`);
    } else if (lz.stage === "adult" && lz.xp >= CFG.adultXpPerLevel) {
      lz.xp -= CFG.adultXpPerLevel; lz.level++;
      const smallLv = auto && CFG.autoFeedLevelPopSmall;
      // オートの大量同時Lvアップで画面が埋まらないよう、控えめLvポップは同時表示数を上限で間引く(手動は常に表示)
      if (!smallLv || this.popups.filter((p) => p.small).length < CFG.autoFeedLevelPopMax) {
        this.popup(lz.x, lz.y - 34, "Lv" + lz.level + "!", "#ffd24c", false, smallLv);
      }
    }
    return true;
  },

  ensureDial() {
    if (!this.state.dial) this.state.dial = { auto: false, rate: 1, stopOnEmpty: false };
    if (this.state.dial.stopOnEmpty === undefined) this.state.dial.stopOnEmpty = false; // V5.2: 既定OFF=Gold補充
    return this.state.dial;
  },

  // 給餌ダイヤルのオート(Brushup V2 Phase1)。効果は既存feedAllの再利用・通知は出さない
  dialTick(dt) {
    const d = this.ensureDial();
    if (!d.auto) return;
    // 3.11.3: ボス襲来中は自動給餌停止。3.13: 報酬モーダル中もクランクは球射出に転用=自動給餌しない
    if (this.raid || (typeof UI !== "undefined" && UI._bossRewardOpen)) return;
    this._dialT = (this._dialT || 0) + dt;
    const interval = CFG.dialRates[d.rate] || CFG.dialRates[1];
    if (this._dialT < interval) return;
    this._dialT = 0;
    // V5.2: 自動給餌はコオロギ在庫を消費。切れ時トグルON=停止/OFF=Gold換算補充(feedAll内で処理)
    const ok = this.feedAll(true);
    if (ok && typeof Slit !== "undefined") Slit.onCrank(); // §9: オートのクランク稼働でも作動(クールダウン内蔵)
  },

  feedAll(silent) {
    if (this.raid) { if (!silent) UI.toast("ボス襲来中は給餌できない! ボス戦に集中しろ", true); return false; } // 3.11.3
    let fed = 0, repGene = null, stopped = false;
    for (const lz of this.state.lizards) {
      if (lz.injuredT > 0 || this.isAway(lz)) continue;
      if (!this.feed(lz, true)) { stopped = true; break; } // 餌切れ(停止 or Gold尽き)=資源理由でのみ止まる
      if (!repGene && lz.stage === "adult") repGene = lz; // 代表個体(球の遺伝)
      fed++;
    }
    if (fed === 0 && !silent) {
      const d = this.ensureDial();
      UI.toast(stopped ? (d.stopOnEmpty ? "コオロギ切れ(自動停止中)" : "Goldが足りない!") : "餌をあげられるトカゲがいない…", true);
    }
    // v3.1: 球の射出は feedAll から切り離す(給餌1回=球1発ではない)。単発=クランクclick / オート=間隔発射
    return fed > 0;
  },

  // v3.1ルーレット: 球に乗せる代表個体の遺伝(卵の内容)。アダルト優先→先頭→null
  rouletteRepGene() {
    const s = this.state;
    let g = s.lizards.find((l) => l.stage === "adult" && !this.isAway(l)) || s.lizards[0];
    return g ? { hue: g.hue, sat: g.sat, light: g.light, speciesId: g.speciesId, morphId: g.morphId } : null;
  },
  // Phase3.13 v4: ルーレットはボス討伐後の報酬。tier(0-6)に応じた球数で報酬セッションを開始しUI(C2)へ通知。
  // 給餌連動の常時発射(旧rouletteEmitOne/canFeedNow/rouletteEmitInterval)は撤廃(給餌はGold消費育成へ純化)。
  beginBossReward(tier, isElite) {
    if (typeof Roulette === "undefined" || !Roulette.startReward) return false;
    const t = tier | 0;
    const count = (CFG.roulRewardBalls && CFG.roulRewardBalls[t]) || CFG.roulRewardBalls[0];
    // §1.2.2: 大ボス(elite)=虹レアポケット(新種) / 通常ボス=レアポケット(レア卵)。盤geometryは共通
    const mode = isElite ? "rainbow" : "rare";
    Roulette.startReward(count, this.rouletteRepGene(), mode);
    this.bossReward = { tier: t, count, mode, eggs: 0, rares: 0, rainbows: 0 }; // 演出/集計用(非保存・runtime)
    if (typeof UI !== "undefined" && UI.openBossReward) UI.openBossReward(this.bossReward);
    return true;
  },

  // 3.11.1: トカゲ売却は廃止(倫理観)。lizardSellPriceは価値評価としてのみ残す(捕食対象の選定等)

  healWithGem(lz) {
    if (this.state.gems < 1) return UI.toast("ジェムが足りない!", true);
    if (lz.injuredT <= 0) return;
    this.state.gems--;
    lz.injuredT = 0;
    UI.toast(`${this.lizardName(lz)} が回復した!`);
  },

  lizardName(lz) {
    const sp = speciesById(lz.speciesId), mo = morphById(lz.morphId);
    return (mo.id !== "normal" ? mo.name + " " : "") + sp.name;
  },

  // ---------------- 繁殖・遺伝 ----------------
  canBreed(lz) {
    return lz.stage === "adult" && lz.injuredT <= 0 && lz.breedCd <= 0 && !this.isAway(lz);
  },

  breedCost(a, b) {
    const stars = Math.max(speciesById(a.speciesId).stars, speciesById(b.speciesId).stars);
    return CFG.breedBaseCost * stars;
  },

  breed(aId, bId, silent) {
    const a = this.state.lizards.find((x) => x.id === aId);
    const b = this.state.lizards.find((x) => x.id === bId);
    if (!a || !b || a === b) return false;
    // ヌシオオトカゲの威嚇中は繁殖できない
    if (this.raid && this.raid.typeId === "monitor" && this.raid.snake.arrived) {
      if (!silent) UI.toast("ヌシに威嚇されて繁殖できない! 先に撃退しよう", true);
      return false;
    }
    if (!this.canBreed(a) || !this.canBreed(b)) { if (!silent) UI.toast("繁殖できない状態のトカゲがいる", true); return false; }
    if (this.state.eggs.length >= this.eggSlotCap()) { if (!silent) UI.toast("卵スロットがいっぱい!", true); return false; }
    const cost = this.breedCost(a, b);
    if (this.state.coins < cost) { if (!silent) UI.toast("コインが足りない!", true); return false; }

    this.state.coins -= cost;
    const cd = CFG.breedCooldown * Math.max(0.2, 1 - this.nestLv() * CFG.nestBreedCdPerLv) * this.erosionBreedMult(); // §8.12: 繁殖CDは巣Lvで短縮(侵食で効率低下)
    a.breedCd = cd; b.breedCd = cd;
    this.state.stats.bred++;
    this.addRes("bio", CFG.resBioPerBreed);
    this.addRankXp(10);
    this.nestSurprise();      // V4.1: 確率先行解放(嬉しい驚き)
    this.checkNestWeb(false); // 繁殖直後は解放通知の理想タイミング(§3.4)

    const genes = this.inherit(a, b);
    const sp = speciesById(genes.speciesId);
    const hatchMult = Math.max(0.2, (1 - this.facLv("heat") * 0.025) * (1 - (((this.state.nest && this.state.nest.lv) || 1) - 1) * 0.03) * (1 - this.researchBonus("hatch")));
    const total = CFG.hatchBasePerStar * sp.stars * hatchMult;
    this.state.eggs.push({ ...genes, t: total, total });
    UI.toast(`卵が産まれた! (${sp.name}系)`);
    return true;
  },

  // クイック繁殖: 最善の2匹を自動選抜 (GameExpansion_v2 ⑧)
  // スコア = レア度(星×モーフ倍率)×3 + レベル。同系統ペアを優先し、次点で異系統
  quickBreedScore(lz) {
    const sp = speciesById(lz.speciesId), mo = morphById(lz.morphId);
    return sp.stars * mo.mult * 3 + lz.level;
  },
  quickBreedPick() {
    const cands = this.state.lizards.filter((lz) => this.canBreed(lz));
    if (cands.length < 2) return null;
    cands.sort((a, b) => this.quickBreedScore(b) - this.quickBreedScore(a));
    const bySp = {};
    for (const lz of cands) (bySp[lz.speciesId] = bySp[lz.speciesId] || []).push(lz);
    let best = null, bestScore = -1;
    for (const id in bySp) {
      const arr = bySp[id];
      if (arr.length >= 2) {
        const s2 = this.quickBreedScore(arr[0]) + this.quickBreedScore(arr[1]);
        if (s2 > bestScore) { bestScore = s2; best = [arr[0], arr[1]]; }
      }
    }
    return best || [cands[0], cands[1]];
  },
  quickBreed(silent) {
    const pair = this.quickBreedPick();
    if (!pair) {
      if (!silent) UI.toast("繁殖可能なペアがいない", true);
      return false;
    }
    return this.breed(pair[0].id, pair[1].id, silent);
  },

  // 遺伝: 種族50/50(低確率で上位変異)、体色は平均±ゆらぎ、モーフ突然変異
  // §8.12: 上位種変異/モーフ変異/伝説の底上げは巣(nest.lv)が担う(旧・繁殖施設から統合)。環境モーフ・研究は据置
  inherit(a, b) {
    const nLv = this.nestLv();
    let speciesId = Math.random() < 0.5 ? a.speciesId : b.speciesId;
    if (Math.random() < CFG.mutationSpeciesChance + nLv * CFG.nestSpeciesMutPerLv) {
      const base = speciesById(speciesId);
      const ups = this.breedablePool().filter((s) => s.stars > base.stars); // 純血: 上位変異も現惑星の固有種内のみ
      if (ups.length) speciesId = ups[Math.floor(Math.random() * ups.length)].id;
    }
    let morphId = Math.random() < 0.5 ? a.morphId : b.morphId;
    const morphChance = CFG.mutationMorphChance
      + nLv * CFG.nestMorphMutPerLv
      + (this.currentStage().env.morphBonus || 0)
;
    if (Math.random() < morphChance) {
      // 伝説は通常変異では出ない(専用抽選のみ)
      const others = MORPHS.filter((m) => m.id !== morphId && !m.legendary);
      morphId = others[Math.floor(Math.random() * others.length)].id;
    }
    // 伝説個体の抽選 (⑨-6): 極低確率、巣Lv/研究で微増
    if (Math.random() < CFG.legendChance + nLv * CFG.nestLegendPerLv
      + this.researchBonus("legend")) {
      morphId = "legendary";
    }
    return {
      speciesId, morphId,
      hue: clamp(((a.hue + b.hue) / 2 + rnd(-15, 15) + 360) % 360, 0, 359),
      sat: clamp((a.sat + b.sat) / 2 + rnd(-8, 8), 5, 100),
      light: clamp((a.light + b.light) / 2 + rnd(-6, 6), 12, 85),
      pattern: Math.random() < 0.5 ? a.pattern : b.pattern,
    };
  },

  // 未所持の図鑑エントリ(種×モーフ)を1つ返す。ステージ種優先(§7.5)。全所持ならnull
  pickUnownedDexEntry(preferStageId) {
    const cands = [];
    for (const sp of this.breedablePool()) { // 純血: 未所持dexも現惑星の固有種のみ(景品/遺伝子解析が他惑星種を作らない)
      for (const mo of MORPHS) {
        if (mo.legendary) continue;
        if (!this.state.dex[sp.id + ":" + mo.id]) cands.push([sp, mo]);
      }
    }
    if (!cands.length) return null;
    if (preferStageId != null) {
      const pref = cands.filter((c) => c[0].stage === preferStageId);
      if (pref.length) return pref[Math.floor(Math.random() * pref.length)];
    }
    return cands[Math.floor(Math.random() * cands.length)];
  },

  // 遺伝子ルーレット: 中央ポケット/卵帯への着地で景品を生成(§1.2.2)。
  // 中央(rainbow) × mode: "rainbow"(大ボス)=未所持の新種/コンプ後はレジェンダリー個体 / "rare"(通常ボス)=レア卵。
  // 卵帯=給餌遺伝の通常卵。どれも捨てず段階変換(スロット→収容枠まで即ベビー→Gold。虹は満杯でも必ず付与)。
  spawnRouletteEgg(outcome) {
    const center = !!(outcome && outcome.rainbow); // 中央ジャックポットポケット命中
    const mode = (outcome && outcome.mode) || "rainbow";
    const hatchMult = Math.max(0.2, (1 - this.facLv("heat") * 0.025) * (1 - (((this.state.nest && this.state.nest.lv) || 1) - 1) * 0.03) * (1 - this.researchBonus("hatch")));
    if (center && mode === "rainbow") {
      const pick = this.pickUnownedDexEntry(this.currentStage().id);
      if (pick) {
        const sp = pick[0], mo = pick[1];
        const egg = this._newSpeciesEgg(pick, hatchMult);
        this._grantRewardEgg(egg); // 虹=満杯でも必ず付与(レア保護)
        UI.toast(`${Icon.svg("spark")} レインボー! 未発見の「${mo.name} ${sp.name}」の卵が生まれた!`);
        if (UI.rouletteRainbowFx) UI.rouletteRainbowFx(sp);
        if (UI.heroSpeciesReveal) UI.heroSpeciesReveal(sp, mo, egg); // C2c 虹の最大ジュース=新種の姿を大きくお披露目
        if (this.bossReward) this.bossReward.rainbows++;
        return true;
      }
      // 全8枠コンプ=フォールバックでレジェンダリー個体(apex・§1.2.2③)。孵化時に既存のheroLegendBirth演出
      const egg = this._legendaryRewardEgg(hatchMult);
      this._grantRewardEgg(egg);
      UI.toast(`${Icon.svg("spark")} 図鑑を極めし者へ — レジェンダリー個体の卵が生まれた!`);
      if (UI.rouletteRainbowFx) UI.rouletteRainbowFx(speciesById(egg.speciesId));
      if (this.bossReward) this.bossReward.rainbows++;
      return true;
    }
    if (center && mode === "rare") {
      this._routeRewardEgg(this._rareRewardEgg(hatchMult)); // 通常ボスのレアポケット=レア卵
      if (this.bossReward) this.bossReward.rares++;
      return true;
    }
    this._routeRewardEgg(this._normalRewardEgg(outcome, hatchMult)); // 卵帯=通常卵
    if (this.bossReward) this.bossReward.eggs++;
    return true;
  },

  _eggTotal(speciesId, hatchMult) { return CFG.hatchBasePerStar * speciesById(speciesId).stars * hatchMult; },
  // 未所持の図鑑エントリ(固有種×未所持モーフ)の卵
  _newSpeciesEgg(pick, hatchMult) {
    const sp = pick[0], mo = pick[1], total = this._eggTotal(sp.id, hatchMult);
    return { speciesId: sp.id, morphId: mo.id, hue: sp.hue + rnd(-10, 10), sat: sp.sat, light: sp.light,
      pattern: PATTERNS[Math.floor(Math.random() * 4)], t: total, total };
  },
  // レジェンダリー個体(全所持フォールバック): 固有種のレジェンダリーモーフ。孵化で専用演出
  _legendaryRewardEgg(hatchMult) {
    const pool = this.breedablePool();
    const sp = pool[Math.floor(Math.random() * pool.length)] || speciesById("kanahebi");
    const total = this._eggTotal(sp.id, hatchMult);
    return { speciesId: sp.id, morphId: "legendary", hue: sp.hue, sat: 90, light: 60, pattern: "none", t: total, total };
  },
  // レア卵(通常ボスの中央): 固有種でレアモーフ優遇+初期Lvボーナス(アダルトで高Lv誕生)
  _rareRewardEgg(hatchMult) {
    const pool = this.breedablePool();
    const sp = pool[Math.floor(Math.random() * pool.length)] || speciesById("kanahebi");
    const rareMorphs = MORPHS.filter((m) => m.id !== "normal" && !m.legendary).map((m) => m.id);
    const morphId = (Math.random() < CFG.roulRareMorphChance && rareMorphs.length)
      ? rareMorphs[Math.floor(Math.random() * rareMorphs.length)] : "normal";
    const total = this._eggTotal(sp.id, hatchMult);
    return { speciesId: sp.id, morphId, hue: sp.hue + rnd(-10, 10), sat: sp.sat, light: sp.light,
      pattern: PATTERNS[Math.floor(Math.random() * 4)], t: total, total, bonusLv: CFG.roulRareEggBonusLv };
  },
  // 通常卵(卵帯): 給餌遺伝の子(inherit自己ペア再利用で変異/モーフ/色ゆらぎ二重化回避)
  _normalRewardEgg(outcome, hatchMult) {
    const g = (outcome && outcome.gene) || {};
    const fallbackSp = (this.state.lizards[0] && this.state.lizards[0].speciesId)
      || (this.breedablePool()[0] && this.breedablePool()[0].id) || "kanahebi";
    const base = { speciesId: g.speciesId || fallbackSp, morphId: g.morphId || "normal",
      hue: g.hue != null ? g.hue : 90, sat: g.sat != null ? g.sat : 60, light: g.light != null ? g.light : 55, pattern: g.pattern || "none" };
    const genes = this.inherit(base, base);
    const total = this._eggTotal(genes.speciesId, hatchMult);
    return { ...genes, t: total, total };
  },
  // 虹は満杯でも必ずスロットへ付与(レア保護)
  _grantRewardEgg(egg) { this.state.eggs.push(egg); },
  // レア/通常卵の段階変換: スロット→収容枠まで即孵化→さらに満杯ならGold。捨てない
  _routeRewardEgg(egg) {
    if (this.state.eggs.length < this.eggSlotCap()) this.state.eggs.push(egg);
    else if (this.state.lizards.length < this.capacity()) this._hatchEggObject(egg);
    else this.state.coins += CFG.roulRewardOverflowGold;
  },

  instantHatch(idx) {
    const egg = this.state.eggs[idx];
    if (!egg) return;
    if (this.state.gems < 1) return UI.toast("ジェムが足りない!", true);
    this.state.gems--;
    egg.t = 0;
  },

  hatchEgg(idx) {
    const egg = this.state.eggs[idx];
    this.state.eggs.splice(idx, 1);
    this._hatchEggObject(egg);
  },

  // 卵オブジェクトから1匹孵す(スロット孵化・報酬オーバーフロー即孵化で共有)。
  // bonusLv(レア卵)はアダルトで高Lv誕生させる。特別演出は卵のフラグで分岐
  _hatchEggObject(egg) {
    const lz = this.makeLizard(egg.speciesId, egg.morphId, egg, "baby");
    lz.x = 430 + rnd(-40, 40); lz.y = 320 + rnd(-10, 30); // 巣の近くに出現
    if (egg.bonusLv) { lz.stage = "adult"; lz.level = 1 + egg.bonusLv; } // レア卵=高品質個体
    this.addLizard(lz);
    this.state.stats.hatched++;
    this.addRes("bio", CFG.resBioPerHatch);
    this.addRankXp(20);
    if (egg.founder) {
      // 創始者 (V3 §9.4): 旧コロニーの血統を継ぐ個体
      lz.founder = true;
      this.flashT = 0.5;
      UI.toast(`創始者が誕生! ${this.lizardName(lz)} — あの子の血が新天地で続く`);
    } else if (egg.morphId === "legendary") {
      // 伝説個体の専用登場演出 (⑨-6)
      this.flashT = 0.8;
      this.slowmo = 1.2;
      this.popupBurst(lz.x, lz.y - 30);
      if (UI.heroLegendBirth) UI.heroLegendBirth(lz); // 一生に数回級(§6)
      else UI.toast(`伝説個体が誕生!! ${this.lizardName(lz)} — 唯一無二の輝き!`);
    } else if (egg.gift) {
      // Phase4: 過去ステージ復帰の固有種#2報酬=特別な孵化演出(ジュース最大充当)
      lz.founder = true; // 里帰りの祝福個体=創始者相当の血統マーク
      this.flashT = 0.9;
      this.slowmo = 1.1;
      this.popupBurst(lz.x, lz.y - 30);
      if (UI.heroReturnGift) UI.heroReturnGift(lz);
      else if (UI.heroLegendBirth) UI.heroLegendBirth(lz);
      else UI.toast(`${Icon.svg("spark")} 里帰りの祝福! この惑星の固有種「${this.lizardName(lz)}」が誕生した!`);
    } else {
      UI.toast(`${this.lizardName(lz)} が孵化した!${egg.lucky ? " (ラッキー卵!)" : ""}`);
    }
  },

  // ---------------- ランク ----------------
  rankXpNeed() { return Math.floor(100 * Math.pow(this.state.rank, 1.25)); },
  addRankXp(n) {
    const s = this.state;
    const prevStage = this.currentStage().id;
    const prevUnlocked = this.unlockedStages().length;
    s.rankXp += Math.max(1, Math.ceil(n * this.planetXpMult())); // V4 §2.2: 惑星ティア係数
    while (s.rankXp >= this.rankXpNeed()) {
      s.rankXp -= this.rankXpNeed();
      s.rank++;
      const bonus = s.rank * 100;
      s.coins += bonus;
      UI.toast(`コロニーランク ${s.rank} に上昇! ボーナス ${fmt(bonus)}G`);
      if (UI.rankUpFx) UI.rankUpFx(); // 軽(§6): 画面を占有しないその場リング
      // ショップ進化・自動補給の解禁通知 (GameExpansion_v2 ⑤)
      if (SHOP_TIERS.some((t) => t.rank === s.rank)) {
        UI.toast(`まとめ買いが解放された! 購入単位が ×${fmt(shopUnitsFor(s.rank)[1])} に育った!`);
      }
      if (s.rank === CFG.autoSupplyRank) {
        UI.toast("自動補給が解禁! ショップ欄のトグルでONにできる");
      }
    }
    if (this.currentStage().id !== prevStage) {
      UI.toast(`コロニーが「${this.currentStage().name}」へ広がった! 新種族が解放!`);
    } else if (this.unlockedStages().length > prevUnlocked) {
      // 手動選択中に新ステージが解放された場合の移住案内
      const st = this.unlockedStages().slice(-1)[0];
      UI.toast(`新ステージ「${st.name}」が解放! ステージ欄から移住できる`);
    }
  },

  // ---------------- V3 Phase7: 本部研究の購入 ----------------
  buyResearch(id) {
    const r = researchById(id);
    const s = this.state;
    if (!r || s.research[id]) return false;
    if (r.req && !s.research[r.req]) { UI.toast("前提研究が必要", true); return false; }
    if ((r.cost.science || 0) > this.res("science") || (r.cost.coins || 0) > s.coins) {
      UI.toast("研究力/コインが足りない!", true);
      return false;
    }
    if ((r.cost.orichalcum || 0) > this.ore("orichalcum")) {
      UI.toast("オリハルコンが足りない(巣ネットワークの外周で手に入る)", true);
      return false;
    }
    this.addRes("science", -(r.cost.science || 0));
    if (r.cost.orichalcum) this.addOre("orichalcum", -r.cost.orichalcum);
    s.coins -= r.cost.coins || 0;
    s.research[id] = true;
    UI.toast(`研究力 研究完了「${r.name}」— ${r.desc}(全Stage恒久)`);
    return true;
  },

  // ---------------- 味方 (GameExpansion_v2 ⑩) ----------------
  allyLvUpCost(id) { return this.allyLv(id) * CFG.allyLvBioCost; }, // V4: 生態データで育成
  allyLvUp(id) {
    const a = this.state.allies[id];
    if (!a || a.lv >= CFG.allyMaxLv) return false;
    const cost = this.allyLvUpCost(id);
    if (this.res("bio") < cost) {
      UI.toast("生態データが足りない! 育成や探索で貯まる", true);
      return false;
    }
    this.addRes("bio", -cost);
    a.lv++;
    UI.toast(`${allyById(id).name} が Lv${a.lv} に成長した!`);
    return true;
  },

  // ---------------- 設備 ----------------
  facilityCost(id) {
    const f = facilityById(id);
    return Math.floor(f.baseCost * Math.pow(f.costMult, this.facLv(id)));
  },
  buyFacility(id) {
    const f = facilityById(id);
    if (this.facLv(id) >= this.facMax(f)) return;
    const cost = this.facilityCost(id);
    if (this.state.coins < cost) return UI.toast("コインが足りない!", true);
    this.state.coins -= cost;
    this.state.facilities[id]++;
    UI.toast(`${f.name} が Lv${this.facLv(id)} になった!`);
  },

  // ---------------- 襲撃(防衛バトル / GameExpansion_v2 ①②) ----------------
  // 次の襲撃を事前決定(予告UI用)。R30未満=従来(5回に1回ボス蛇)、R30+=毎回ボス+5回に1回Elite
  rollNextRaid() {
    const s = this.state;
    const tierDef = bossTierFor(s.rank);
    const wins = s.stageWins || 0; // V3: 周期はStage別の撃退数で回す
    if (!tierDef) {
      const boss = (wins + 1) % CFG.bossEvery === 0 && wins > 0;
      s.nextRaid = { typeId: "snake", boss, elite: false, tier: 0 };
      return;
    }
    const elite = (wins + 1) % CFG.bossEvery === 0;
    // ステージの専用敵は抽選重み×2 (GameExpansion_v2 ③)
    const stBosses = this.currentStage().bosses || [];
    const pool = BOSS_TYPES.filter((b) => s.rank >= b.minRank)
      .map((b) => ({ id: b.id, w: b.weight * (stBosses.includes(b.id) ? 2 : 1) }));
    let r = Math.random() * pool.reduce((a, b) => a + b.w, 0);
    let typeId = "snake";
    for (const b of pool) { r -= b.w; if (r <= 0) { typeId = b.id; break; } }
    s.nextRaid = { typeId, boss: true, elite, tier: tierDef.tier };
  },

  startRaid() {
    const s = this.state;
    if (!s.nextRaid) this.rollNextRaid();
    const nr = s.nextRaid;
    const type = bossTypeById(nr.typeId);
    const tierDef = nr.tier ? BOSS_TIERS[nr.tier - 1] : null;

    // 強さ = ランク+総攻撃力に同期 × ティア倍率 × Elite
    let totalAtk = 0;
    for (const lz of this.fighters()) totalAtk += this.lizardAtk(lz);
    let hp = 25 + s.rank * 12 + totalAtk * 7;
    if (tierDef) hp *= tierDef.hpMult;
    else if (nr.boss) hp *= 3;                    // 従来ボス(R30未満)
    if (nr.elite) hp *= 1.5;
    if (nr.typeId === "monitor") hp *= 1.6;       // タンク
    hp *= this.erosionBossMult();                 // V4.1: 侵食が高いとボスが強い
    if (type.flying) hp *= 0.8;                   // 飛行系は柔らかめ
    hp *= CFG.bossHpMult;                         // 3.11.5: 味方削除の難化調整枠(既定1.0・CFGで即調整)

    this.raid = {
      typeId: nr.typeId, type, boss: nr.boss, elite: nr.elite,
      tier: nr.tier, tierDef,
      snakeTier: snakeTierFor(s.rank),            // 蛇の見た目階級
      snake: {
        hp: Math.floor(hp), maxHp: Math.floor(hp),
        x: W + 80, y: type.flying ? 120 : SNAKE_HOME.y,
        arrived: false, phase: rnd(0, 6),
      },
      timeLeft: type.dur + (tierDef ? tierDef.tier * 2 : (nr.boss ? 15 : 0))
        - (nr.typeId === "monitor" ? this.allyLv("meerkat") * 5 : 0),
      // フェンス先制+ミーアキャット+展望岩の早期警戒(飛行する鷹には効かない)
      stunT: nr.typeId === "hawk" ? 0 : this.facLv("fence") * 2 + this.allyLv("meerkat") * 1.5 + this.facLv("observatory") * 0.8,
      // 初回攻撃: 通常は猶予2倍、ティアボスは1.2倍(中盤=歯応え / Phase8)
      biteT: (CFG.biteIntervalBase + this.facLv("fence")) * (tierDef ? 1.2 : 2),
      shake: 0, cutinT: tierDef && tierDef.cutin ? 1.2 : 0,
      webs: [], grabs: 0, stingN: 0, enraged: false,
      dive: null, recoverT: 0, animT: 0, fleeing: false, stolenEgg: null,
    };
    const label = `${nr.elite ? "Elite " : ""}${type.name}${nr.tier ? " T" + nr.tier : ""}`;
    if (this.raid.cutinT > 0 && UI.heroBossIn && UI.heroBossIn(this.raid)) {
      this.raid.heroShown = true; // Canvasカットイン・トーストは出さない(§6: 器を一本化)
    } else {
      UI.toast(nr.boss || nr.tier ? ` BOSS襲来!! ${label} — ${type.threat}!` : ` ${this.raid.snakeTier.name}が襲来した! コロニーを守れ!`, true);
    }
    this.combatSurge(); // V3: 巣から全軍一斉出撃
  },

  fighters() {
    return this.state.lizards.filter((lz) => lz.stage === "adult" && lz.injuredT <= 0 && !this.isAway(lz));
  },

  raidDps() {
    const r = this.raid;
    let dps = 0;
    for (const lz of this.fighters()) dps += this.lizardAtk(lz);
    dps *= 1 + this.facLv("watchtower") * 0.04            // 監視塔
      + this.researchBonus("atk");                          // HQ研究
    if (r.typeId === "scorpion" && this.allyLv("ferret")) dps *= 1.16 + this.allyLv("ferret") * 0.04;
    if (r.typeId === "spider") dps *= Math.max(0.5, 1 - r.webs.filter((w) => w.hp > 0).length * CFG.webDpsPenalty);
    return dps;
  },

  applyDps(r, dt, mult) {
    const e = r.snake;
    const dps = this.raidDps() * (mult || 1);
    if (dps > 0) {
      e.hp -= dps * dt;
      r.shake = 2;
      if (r.hitT > 0) r.hitT -= dt;
      if (Math.random() < dt * 3) {
        r.hitT = 0.1; // 被弾フラッシュ(Brushup V2 §3.3・描画のみ)
        this.popup(e.x + rnd(-30, 30), e.y - 40, "-" + fmt(dps), "#ff8866", true);
      }
    }
    // Enrage (T5+): 残り20%で激昂
    if (r.tierDef && r.tierDef.enrage && !r.enraged && e.hp < e.maxHp * 0.2 && e.hp > 0) {
      r.enraged = true;
      UI.toast("敵が激昂した!! 攻撃が苛烈になる!", true);
    }
    return e.hp <= 0;
  },

  updateRaid(dt) {
    const r = this.raid;
    if (r.cutinT > 0) { r.cutinT -= dt; return; }  // カットイン中は静止
    if (r.typeId === "hawk") this.updateHawk(r, dt);
    else if (r.typeId === "crow") this.updateCrow(r, dt);
    else this.updateGroundBoss(r, dt);
  },

  // 地上ボス共通: 蛇 / ヌシ / サソリ / クモ
  updateGroundBoss(r, dt) {
    const e = r.snake;
    if (!e.arrived) {
      const spd = r.typeId === "monitor" ? 55 : r.typeId === "scorpion" ? 60 : 90;
      e.x -= spd * dt;
      if (e.x <= SNAKE_HOME.x) {
        e.x = SNAKE_HOME.x; e.arrived = true;
        // 罠フェンス: 侵入時ダメージ
        const trap = this.facLv("trap");
        if (trap > 0) {
          const dmg = Math.floor(e.maxHp * 0.012 * trap);
          e.hp -= dmg;
          this.popup(e.x, e.y - 50, `罠 -${fmt(dmg)}`, "#ffb060");
        }
        if (r.typeId === "spider") this.spawnWebs(r);
      }
      return;
    }
    r.timeLeft -= dt;
    if (this.applyDps(r, dt, 1)) return this.endRaid(true);
    if (r.stunT > 0) { r.stunT -= dt; }
    else {
      r.biteT -= dt;
      if (r.biteT <= 0) {
        const base = CFG.biteIntervalBase + this.facLv("fence") + (r.typeId === "monitor" ? 7 : 0);
        r.biteT = base * (r.enraged ? 0.7 : 1);
        this.bossAttack(r);
      }
    }
    if (r.typeId === "spider") this.updateWebs(r, dt);
    if (r.timeLeft <= 0) this.endRaid(false);
  },

  // 鷹: 上空旋回 → 急降下予告(1.5秒) → レア個体をさらう
  updateHawk(r, dt) {
    const e = r.snake;
    e.arrived = true;
    r.animT += dt;
    r.timeLeft -= dt;
    const low = !!r.dive || r.recoverT > 0;
    if (!r.dive) {
      if (r.recoverT > 0) { r.recoverT -= dt; e.y += (430 - e.y) * Math.min(1, dt * 3); }
      else {
        e.x += (W / 2 + Math.cos(r.animT * 0.7) * 330 - e.x) * Math.min(1, dt * 2);
        e.y += (115 + Math.sin(r.animT * 1.4) * 25 - e.y) * Math.min(1, dt * 2);
      }
    }
    // 低空(急降下・復帰中)は全力で殴れる。旋回中は35%
    if (this.applyDps(r, dt, low ? 1 : 0.35)) return this.endRaid(true);

    if (!r.dive && r.recoverT <= 0) {
      r.hawkT = (r.hawkT === undefined ? 4 : r.hawkT) - dt;
      if (r.hawkT <= 0) {
        // ターゲット: ゴールデン等の高価値個体を最優先
        const vis = this.state.lizards.filter((lz) => !this.isHidden(lz));
        if (vis.length) {
          vis.sort((a, b) => morphById(b.morphId).mult - morphById(a.morphId).mult || this.lizardSellPrice(b) - this.lizardSellPrice(a));
          r.dive = { targetId: vis[0].id, t: 1.5, taps: 0 };
        } else r.hawkT = 3;
      }
    } else if (r.dive) {
      r.dive.t -= dt;
      const tgt = this.state.lizards.find((l) => l.id === r.dive.targetId);
      if (!tgt || this.isHidden(tgt)) { r.dive = null; r.hawkT = 5; }
      else {
        e.x += (tgt.x - e.x) * Math.min(1, dt * 3);
        e.y += ((r.dive.t < 0.7 ? tgt.y - 30 : 140) - e.y) * Math.min(1, dt * 4);
        if (r.dive.t <= 0) {
          // ワシの妨害 / 日光反射板 / 予告リング連打で阻止
          const failP = (this.allyLv("eagle") ? 0.2 + this.allyLv("eagle") * 0.05 : 0)
            + this.facLv("trap") * 0.035
            + (r.dive.taps >= CFG.hawkTapToScare ? 1 : 0);
          if (Math.random() < failP) {
            this.popup(tgt.x, tgt.y - 30, "妨害成功!", "#8fd0ff");
          } else {
            tgt.hiddenT = CFG.hawkHideTime;
            r.grabs++;
            this.popup(tgt.x, tgt.y - 30, "さらわれた!", "#ff5544");
            UI.toast(`${this.lizardName(tgt)} がさらわれた! (${Math.round(CFG.hawkHideTime)}秒後に戻る)`, true);
          }
          r.dive = null; r.recoverT = 2.2; r.hawkT = 8;
          if (r.grabs >= CFG.hawkGrabLimit) return this.endRaid(false, "grab");
        }
      }
    }
    if (r.timeLeft <= 0) this.endRaid(false);
  },

  // カラス: 巣へ直行 → 卵を奪って逃走。撃墜すれば奪還
  updateCrow(r, dt) {
    const e = r.snake;
    r.timeLeft -= dt;
    if (this.applyDps(r, dt, 1)) return this.endRaid(true);
    if (r.fleeing) {
      const spd = 130 * (1 - (this.allyLv("owl") ? 0.15 + this.allyLv("owl") * 0.05 : 0));
      e.x += spd * dt;
      e.y = Math.max(90, e.y - 45 * dt);
      if (e.x > W + 70) return this.endRaid(false, r.stolenEgg ? "egg" : undefined);
      return;
    }
    if (!e.arrived) {
      const dx = 430 - e.x, dy = 300 - e.y, d = Math.hypot(dx, dy);
      e.x += (dx / d) * 105 * dt;
      e.y += (dy / d) * 105 * dt;
      if (d < 15) e.arrived = true;
      return;
    }
    if (r.stunT > 0) { r.stunT -= dt; }
    else {
      // 巣箱: 卵奪取までの猶予を延長
      r.grabT = (r.grabT === undefined ? 3 + (((this.state.nest && this.state.nest.lv) || 1) - 1) * 1 : r.grabT) - dt;
      if (r.grabT <= 0) {
        if (this.state.eggs.length > 0) {
          r.stolenEgg = this.state.eggs.shift();
          UI.toast("オオガラスが卵をくわえた! 逃げられる前に撃墜しろ!", true);
        } else {
          const loss = Math.floor((this.state.crickets || 0) * 0.1); // V5.2: コオロギ強奪を復活(在庫の10%)
          this.state.crickets -= loss;
          if (loss > 0) UI.toast(`卵がないのでコオロギを${fmt(loss)}匹食い荒らされた!`, true);
        }
        r.fleeing = true;
      }
    }
    if (r.timeLeft <= 0) { r.fleeing = true; }
  },

  // 攻撃(種類別): 蛇/クモ=負傷、ヌシ=威嚇の一撃、サソリ=毒
  bossAttack(r) {
    if (r.typeId === "scorpion") {
      const fs = this.fighters().filter((lz) => !(lz.poisonT > 0));
      const n = Math.min(fs.length, 2 + (r.tier || 0));
      let hit = 0;
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(Math.random() * fs.length);
        const v = fs.splice(idx, 1)[0];
        if (!v) break;
        v.poisonT = CFG.poisonTime * this.poisonDurMult();
        this.popup(v.x, v.y - 20, "毒!", "#c07ae0");
        hit++;
      }
      if (hit) UI.toast(`毒針! ${hit}匹の攻撃力が半減… (水場Lvで早く抜ける)`, true);
      r.stingN++;
      if (r.stingN % 2 === 0) this.injureLizards(1); // 2回に1回は直接負傷も
      return;
    }
    const count = r.tier
      ? Math.max(1, Math.ceil(r.tierDef.atkMult * (r.elite ? 1.2 : 1)))
      : 1 + Math.floor(this.state.rank / 25);
    this.injureLizards(r.typeId === "monitor" || r.typeId === "spider" ? 1 : count);
  },

  injureLizards(count) {
    // §8.10: ベビーは常に安全(旧シェルターのベビー保護を「巣の基本仕様」として標準化=無条件)。負傷対象はアダルトのみ
    const targets = this.state.lizards.filter((lz) => lz.injuredT <= 0 && !this.isHidden(lz) && lz.stage === "adult");
    if (targets.length === 0) return;
    let hit = 0;
    const turtleLv = this.allyLv("turtle");
    for (let i = 0; i < Math.min(count, targets.length); i++) {
      const idx = Math.floor(Math.random() * targets.length);
      const v = targets.splice(idx, 1)[0];
      if (turtleLv && Math.random() < 0.2 + turtleLv * 0.05) {
        this.popup(v.x, v.y - 20, "ブロック!", "#8fd0ff");
        continue;
      }
      v.injuredT = CFG.injuryTime;
      this.popup(v.x, v.y - 20, "負傷!", "#ff5544");
      hit++;
    }
    if (hit) UI.toast(`敵の攻撃! ${hit}匹が負傷…`, true);
  },

  // クモの巣
  spawnWebs(r) {
    r.webs = [];
    // 火山の熱 or 篝火で自然に焼ける(篝火はLvで加速)
    const bonfire = this.facLv("trap") >= 3 ? this.facLv("trap") : 0;
    const burn = !!this.currentStage().env.burnWebs || bonfire > 0;
    const burnBase = bonfire > 0 ? Math.max(3, 8 - bonfire) : 8;
    for (let i = 0; i < 3; i++) {
      r.webs.push({
        x: SNAKE_HOME.x + 140 + i * 85,
        y: SNAKE_HOME.y + (i - 1) * 105,
        hp: CFG.webHp,
        burnT: burn ? burnBase + i * 3 : 0,
      });
    }
    UI.toast("ウェブが張られた! タップ連打でほつれる" + (burn ? " (炎で自然に焼ける)" : ""), true);
  },

  updateWebs(r, dt) {
    const geckoLv = this.allyLv("gecko");
    if (geckoLv) {
      r.geckoT = (r.geckoT === undefined ? 8 - geckoLv : r.geckoT) - dt;
      if (r.geckoT <= 0) {
        r.geckoT = 8 - geckoLv;
        const w = r.webs.find((w2) => w2.hp > 0);
        if (w) { w.hp = 0; this.popup(w.x, w.y, "カット!", "#9fe07a"); }
      }
    }
    for (const w of r.webs) {
      if (w.burnT > 0 && w.hp > 0) {
        w.burnT -= dt;
        if (w.burnT <= 0) { w.hp = 0; this.popup(w.x, w.y, "焼却!", "#ffb060"); }
      }
    }
  },

  endRaid(win, reason) {
    const r = this.raid;
    const s = this.state;
    if (win) {
      let coins = Math.floor(r.snake.maxHp * 2) * (r.elite ? 2 : 1);
      if (this.allyLv("ferret")) coins = Math.floor(coins * (1.04 + this.allyLv("ferret") * 0.01));
      if (this.isFrontier()) coins = Math.floor(coins * CFG.frontierRaidMult); // フロンティア報酬(§2.2)
      s.coins += coins;
      s.stats.raidsWon++;
      s.stageWins = (s.stageWins || 0) + 1;
      // V4.1 §6: バガー撃破で侵食率が下がる
      const isBugger = r.typeId === "bugger";
      if (isBugger) s.stats.buggerWon = (s.stats.buggerWon || 0) + 1;
      s.erosion = Math.max(0, (s.erosion || 0) - (isBugger ? CFG.erosionBuggerDown : 1));
      let msg;
      if (r.tier) {
        // R30+ ボスティア報酬(V4: 素材→研究力+生態データ)
        s.stats.bossWon++;
        const gems = (1 + r.tier) * (r.elite ? 2 : 1);
        const sci = Math.ceil(r.tier / 2) + (r.elite ? 2 : 0);
        const bio = r.tier * 3;
        s.gems += gems;
        this.addRes("science", sci);
        this.addRes("bio", bio);
        msg = ` BOSS撃破! ${r.elite ? "Elite " : ""}${r.type.name} T${r.tier} / +${fmt(coins)}G +ジェム${gems} +研究力${sci} +生態データ${bio}`;
        if (isBugger) msg += " / 侵略圧を押し返した!";
        this.addRankXp(r.elite ? 120 : 60);
      } else if (r.boss) {
        s.stats.bossWon++;
        const gems = 3 + Math.floor(s.rank / 5);
        s.gems += gems;
        this.addRes("science", 1);
        msg = ` 蛇を撃退! +${fmt(coins)}G +ジェム${gems} (ボス討伐!)`;
        this.addRankXp(100);
      } else {
        msg = ` 蛇を撃退! +${fmt(coins)}G`;
        if (Math.random() < 0.2) { s.gems += 1; msg += " +ジェム1"; }
        this.addRankXp(30);
      }
      if (r.typeId === "snake" && Math.random() < 0.15) {
        const bonus = Math.floor(r.snake.maxHp * 1.5);
        s.coins += bonus;
        msg += ` / 捕獲→売却 +${fmt(bonus)}G`;
      }
      // Phase3.13 v4: ボス討伐(tier or boss)は報酬ルーレットを起動。通常の蛇(非ボス)は起動しない
      // §1.2.2: eliteは虹レアポケット(新種)、それ以外の通常ボスはレアポケット(レア卵)
      if (r.tier || r.boss) this.beginBossReward(r.tier || 0, !!r.elite);
      if (r.typeId === "hawk") {
        let rescued = 0;
        for (const lz of s.lizards) if (lz.hiddenT > 0) { lz.hiddenT = 0; rescued++; }
        if (rescued) msg += ` / さらわれた${rescued}匹を救出!`;
      }
      if (r.typeId === "crow" && r.stolenEgg) {
        s.eggs.push(r.stolenEgg);
        msg += " / 卵を取り返した!";
      }
      if (UI.heroBossDown && (r.elite || r.boss || (r.tier || 0) >= 3)) UI.heroBossDown(r, msg);
      else UI.toast(msg);
      this.popupBurst(r.snake.x, r.snake.y);
      this.slowmo = 0.6; // 撃破スローモーション
      r.dyingT = 1.15; r.hitT = 0;
      this.corpse = r; // 死に様の描画専用スナップショット(§3.3。ロジックはraid=nullで即終了)
    } else {
      if (reason === "egg") UI.toast("オオガラスに卵を奪われた…!", true);
      else if (reason === "grab") UI.toast("オオタカは仲間をさらって去った…(時間経過で戻ってくる)", true);
      else UI.toast("敵は満足して去っていった…負傷者を回復させよう", true);
    }
    this.raid = null;
    s.raidTimer = CFG.raidInterval;
    this.rollNextRaid();
  },

  popupBurst(x, y) {
    for (let i = 0; i < 12; i++) {
      this.popup(x + rnd(-70, 70), y + rnd(-40, 30), ["+G", "", "+G"][i % 3], "#ffd24c");
    }
  },

  // 3.11.3: 端末ローカル日付文字列(1日3回の日付境界)
  localDateStr() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; },
  // 「今すぐ呼ぶ」カウンタ。日付が変わったら回復
  ensureBossCall() {
    const today = this.localDateStr();
    if (!this.state.bossCall || this.state.bossCall.date !== today) this.state.bossCall = { date: today, used: 0 };
    return this.state.bossCall;
  },
  bossCallRemaining() { return Math.max(0, CFG.bossCallPerDay - this.ensureBossCall().used); },

  raidNow() {
    if (this.raid) return;
    const bc = this.ensureBossCall();
    if (bc.used >= CFG.bossCallPerDay) {
      UI.toast(`「今すぐ呼ぶ」は1日${CFG.bossCallPerDay}回まで。日付が変わると回復する`, true);
      return;
    }
    bc.used++;
    this.state.raidTimer = Math.min(this.state.raidTimer, 2);
    UI.toast(`蛇を挑発した! すぐに来るぞ… (本日あと${this.bossCallRemaining()}回)`);
  },

  // ---------------- メインループ ----------------
  tick(dt) {
    const s = this.state;
    // 収益
    s.coins += this.totalIncomePerSec() * dt; // V5: 現在地+留守コロニー合算

    // V5.1: 自動補給はGold消費給餌により不要(撤廃)

    // 負傷・繁殖CD・毒・さらわれ状態の回復
    const env = this.currentStage().env;
    // 大型保温器で回復加速(雪原では保温効果2倍だが基礎回復は半減)
    const recMult = (1 + this.facLv("heat") * 0.04 * (env.heatBoost || 1)) * (env.recoveryMult || 1);
    for (const lz of s.lizards) {
      if (lz.injuredT > 0) lz.injuredT = Math.max(0, lz.injuredT - dt * recMult);
      if (lz.breedCd > 0) lz.breedCd = Math.max(0, lz.breedCd - dt);
      if (lz.poisonT > 0) lz.poisonT = Math.max(0, lz.poisonT - dt);
      if (lz.hiddenT > 0) {
        lz.hiddenT = Math.max(0, lz.hiddenT - dt);
        if (lz.hiddenT === 0) UI.toast(`→ ${this.lizardName(lz)} が逃げ帰ってきた!`);
      }
    }

    // §8.12: コオロギの自然湧き(巣+環境の恵み)を共通在庫へ。餌場→巣へ統合
    const spawn = this.nestLv() * CFG.nestCricketPerLv + (env.crickets || 0);
    if (spawn > 0) s.crickets = (s.crickets || 0) + spawn * dt;

    // 味方のパッシブ・自動給餌・解禁チェック(毎秒)
    this._allyT = (this._allyT || 0) + dt;
    if (this._allyT >= 1) {
      this._allyT = 0;
      if (this.allyLv("gecko")) s.crickets = (s.crickets || 0) + 0.1 * this.allyLv("gecko"); // V5.2: コオロギ拾いを復活
      // §8.12: 自動給餌(巣が担う)。毎秒 巣Lv×係数 匹へ餌やり。食料供給を燃料にする(§3.1.3)
      const feedN = Math.round(this.nestLv() * CFG.nestAutoFeedPerLv);
      if (feedN > 0 && this.res("food") >= CFG.autoFeedFoodCost) {
        let n = 0;
        for (const lz of s.lizards) {
          if (n >= feedN || this.res("food") < CFG.autoFeedFoodCost) break;
          if (lz.injuredT > 0 || this.isHidden(lz)) continue;
          if (!this.feed(lz, true)) break; // 餌切れ(停止 or Gold尽き)で止まる
          this.addRes("food", -CFG.autoFeedFoodCost);
          n++;
        }
      }
      // §8.12: 繁殖予約(巣Lv5+・ONのとき自動でクイック繁殖)
      if (s.autoBreed && this.nestLv() >= CFG.nestReserveLv) {
        this._autoBreedT = (this._autoBreedT || 0) + 1;
        if (this._autoBreedT >= CFG.autoBreedInterval) {
          this._autoBreedT = 0;
          if (s.eggs.length < this.eggSlotCap()) this.quickBreed(true);
        }
      }
      for (const a of ALLIES) {
        if (s.allies[a.id]) continue;
        const u = a.unlock;
        if ((u.rank && s.rank >= u.rank) || (u.wins && s.stats.raidsWon >= u.wins)) {
          s.allies[a.id] = { lv: 1 };
          UI.toast(`味方が仲間になった! ${Icon.svg(a.icon)} ${a.name} — ${a.desc}`);
        }
      }
      this.checkTitles();
      this.checkLore();
    }

    // V4 §3.3: 資源のフロー生産(§8.12で食料は巣Lv駆動 / 惑星開発=エネルギー)
    const foodRate = this.nestLv() * CFG.resFoodPerFeederLv;
    if (foodRate > 0) this.addRes("food", foodRate * dt);
    const energyRate = (s.devLv || 0) * CFG.resEnergyPerDevLv;
    if (energyRate > 0) this.addRes("energy", energyRate * dt);

    // V4.1 §6: バガー侵食率(全惑星共通・ゆっくり上昇)
    this.erosionRise(dt);

    // 卵
    for (let i = s.eggs.length - 1; i >= 0; i--) {
      const egg = s.eggs[i];
      egg.t -= dt;
      if (egg.t <= 0) {
        if (s.lizards.length < this.capacity()) this.hatchEgg(i);
        else egg.t = 0; // スペース待ち
      }
    }

    // 襲撃タイマー(3.11.3: フォアグラウンド時のみ進行/戦闘。離席=時間も戦闘も一時停止=見届けた者のみ)
    if (this.foreground !== false) {
      if (this.raid) {
        this.updateRaid(dt);
      } else {
        s.raidTimer -= dt;
        if (s.raidTimer <= 0) this.startRaid();
      }
    }

    // Phase4: イベント・ラッキー卵・演出タイマー(放浪商人はPhase3.10で撤廃)
    this.updateEvents(dt);
    this.updateLuckyEgg(dt);
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);

    this.dialTick(dt); // 給餌ダイヤルのオート(Brushup V2)
    this.tickCorpse(dt); // 撃破の死に様(描画専用タイマー)
    // V4.1: 巣ネットワークの自動解放チェック(操作ゼロ・毎秒)
    this._nestT = (this._nestT || 0) + dt;
    if (this._nestT >= 1) {
      this._nestT = 0;
      this.checkNestWeb(false);
    }

    this.updateResting(dt);
    this.moveLizards(dt);

    // ポップアップ寿命
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.ttl -= dt; p.y -= 24 * dt;
      if (p.ttl <= 0) this.popups.splice(i, 1);
    }
  },

  moveLizards(dt) {
    const snake = this.raid && this.raid.snake.arrived && !this.raid.type?.flying ? this.raid.snake : null;
    const webs = this.raid && this.raid.typeId === "spider" ? this.raid.webs.filter((w) => w.hp > 0) : [];
    for (const lz of this.state.lizards) {
      this.ensureRuntime(lz);
      if (!this.isVisible(lz)) continue; // さらわれ中・休憩中
      lz.wanderT -= dt;
      const fighting = snake && lz.stage === "adult" && lz.injuredT <= 0;
      if (fighting) {
        if (lz.wanderT <= 0) { // 蛇の周囲に群がる
          lz.wanderT = rnd(0.4, 1.0);
          const ang = rnd(0, Math.PI * 2);
          const d = rnd(45, 90);
          lz.tx = snake.x + Math.cos(ang) * d;
          lz.ty = snake.y + Math.sin(ang) * d * 0.6;
        }
      } else if (lz.wanderT <= 0) { // 通常の徘徊: 自分の縄張り周辺をうろつく
        lz.wanderT = rnd(2.5, 7);
        if (Math.random() < 0.05) { // たまに縄張りを引っ越す
          lz.homeX = rnd(FIELD.x1 + 40, FIELD.x2 - 40);
          lz.homeY = rnd(FIELD.y1 + 20, FIELD.y2 - 20);
        }
        lz.tx = clamp(lz.homeX + rnd(-130, 130), FIELD.x1, FIELD.x2);
        lz.ty = clamp(lz.homeY + rnd(-90, 90), FIELD.y1, FIELD.y2);
      }
      const dx = lz.tx - lz.x, dy = lz.ty - lz.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 4) {
        // クモのウェブに絡まると減速
        let webMult = 1;
        for (const w of webs) {
          if (Math.hypot(lz.x - w.x, lz.y - w.y) < 60) { webMult = CFG.webSlow; break; }
        }
        const spd = (lz.injuredT > 0 ? 12 : fighting ? 110 : 45) * webMult * dt;
        lz.x += (dx / dist) * Math.min(spd, dist);
        lz.y += (dy / dist) * Math.min(spd, dist);
        lz.angle = Math.atan2(dy, dx);
        lz.moving = true;
      } else {
        lz.moving = false;
      }
      lz.x = clamp(lz.x, 20, W - 20);
      lz.y = clamp(lz.y, FIELD.y1 - 30, H - 20);
    }

    // 分離: 重なり合いを防いで自然に分散させる(表示中の個体のみ・縮小時は距離も縮む)
    const arr = this.state.lizards.filter((l) => this.isVisible(l));
    const minD = 46 * this.crowdScale();
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      for (let j = i + 1; j < arr.length; j++) {
        const b = arr[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < minD * minD && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = ((minD - d) / d) * 22 * dt;
          a.x -= dx * push * 0.5; a.y -= dy * push * 0.5;
          b.x += dx * push * 0.5; b.y += dy * push * 0.5;
        }
      }
    }
  },

  // 死に様タイマー(描画専用)
  tickCorpse(dt) {
    if (!this.corpse) return;
    this.corpse.dyingT -= dt;
    if (this.corpse.dyingT <= 0) this.corpse = null;
  },

  popup(x, y, txt, color, big, small) {
    this.popups.push({ x, y, txt, color, big, small, ttl: small ? 0.8 : 1.2 }); // V5 3.5: small=控えめ表示
  },

  // ---------------- Phase4: 終盤コンテンツ (GameExpansion_v2 ⑨) ----------------
  // 図鑑コンプ報酬: 25/50/75/100%で生産に恒久バフ
  dexCompBonus() {
    const r = this.dexRate();
    return r >= 1 ? 0.10 : r >= 0.75 ? 0.06 : r >= 0.5 ? 0.04 : r >= 0.25 ? 0.02 : 0;
  },

  // コロニー勲章(威信値): 既存データの総合スコア
  prestige() {
    const s = this.state;
    return Math.floor(
      s.rank * 12 + s.stats.raidsWon * 5 + s.stats.bossWon * 8 + s.stats.hatched
      + Math.floor(this.dexRate() * 100) * 3
      + Object.keys(s.titles).length * 40,
    );
  },
  prestigeClass() {
    const p = this.prestige();
    const cls = p >= 30000 ? "レジェンド" : p >= 18000 ? "ダイヤ" : p >= 9000 ? "プラチナ"
      : p >= 4000 ? "ゴールド" : p >= 1500 ? "シルバー" : "ブロンズ";
    // 疑似ランキング (⑨-23): ローカル記録から推定した順位帯(演出)
    const pct = Math.max(0.01, Math.min(95, 80 * Math.exp(-p / 6000)));
    return { cls, pct: pct < 1 ? pct.toFixed(2) : Math.round(pct) };
  },

  // V4 §3.5: Loreの解放チェック(遊ぶうちに世界観が集まる)
  checkLore() {
    const s = this.state;
    if (!s.lore) s.lore = {};
    for (const L of LORE) {
      if (s.lore[L.id]) continue;
      let ok = false;
      try { ok = L.cond(s); } catch (e) { ok = false; }
      if (ok) {
        s.lore[L.id] = true;
        UI.toast(`Lore解放:「${L.name}」(図鑑のLoreタブで読める)`);
      }
    }
  },

  // 称号の獲得チェック(毎秒ブロックから呼ばれる)
  checkTitles() {
    const s = this.state;
    for (const t of TITLES) {
      if (s.titles[t.id]) continue;
      if (t.cond(s)) {
        s.titles[t.id] = true;
        if (!s.titleSel) s.titleSel = t.id;
        UI.toast(`称号を獲得! 「${t.name}」 (統計から変更できる)`);
      }
    }
  },

  // 定期イベント (⑨-13〜15)
  updateEvents(dt) {
    if (this.event) {
      this.event.t -= dt;
      if (this.event.def.cricketRate) this.state.crickets = (this.state.crickets || 0) + this.event.def.cricketRate * dt; // V5.2: コオロギ大発生を復活
      if (this.event.t <= 0) {
        if (this.event.def.endGems) {
          this.state.gems += this.event.def.endGems;
          UI.toast(`${Icon.svg(this.event.def.icon)}「${this.event.def.name}」を耐え切った! +${Icon.svg("gem")}${this.event.def.endGems}`);
        } else {
          UI.toast(`${Icon.svg(this.event.def.icon)}「${this.event.def.name}」が終わった`);
        }
        this.event = null;
      }
      return;
    }
    if (this.state.rank < CFG.eventMinRank) return;
    this._eventT = (this._eventT || CFG.eventInterval) - dt;
    if (this._eventT <= 0) {
      this._eventT = CFG.eventInterval;
      if (Math.random() < CFG.eventChance) {
        const def = EVENTS[Math.floor(Math.random() * EVENTS.length)];
        this.event = { def, t: def.dur };
        UI.toast(`${Icon.svg(def.icon)} イベント発生! 「${def.name}」 — ${def.desc}`, def.id === "storm");
      }
    }
  },

  // V5.2 Phase3.10: 放浪商人は撤廃(3.10.1・残骸を残さない)

  // ラッキー卵 (⑨-28): 稀に虹色の卵が巣に現れる
  updateLuckyEgg(dt) {
    this._luckyT = (this._luckyT === undefined ? CFG.luckyEggInterval : this._luckyT) - dt;
    if (this._luckyT > 0) return;
    this._luckyT = CFG.luckyEggInterval;
    if (Math.random() >= CFG.luckyEggChance) return;
    if (this.state.eggs.length >= this.eggSlotCap()) return;
    const rare = this.breedablePool().filter((sp) => sp.stars >= 2);
    const pool = rare.length ? rare : this.breedablePool(); // 純血: 現惑星の固有種のみ
    if (!pool.length) return;
    const sp = pool[Math.floor(Math.random() * pool.length)];
    // 中身は当たり: レアモーフ確定、5%で伝説
    const morphId = Math.random() < 0.05 ? "legendary"
      : ["albino", "melanistic", "golden"][Math.floor(Math.random() * 3)];
    this.state.eggs.push({
      speciesId: sp.id, morphId,
      hue: sp.hue + rnd(-10, 10), sat: sp.sat, light: sp.light,
      pattern: PATTERNS[Math.floor(Math.random() * 4)],
      t: 45, total: 45, lucky: true,
    });
    UI.toast("ラッキー卵が巣に現れた! 何が生まれるかはお楽しみ…");
  },

  // ---------------- セーブ / ロード (V3: WorldData形式) ----------------
  // WorldData = { version, wallet, headquarters, collection, allies, materials,
  //               autoSupply, stageSel, currentStageId, stages[] }
  // ランタイムの this.state は従来形状を維持し(既存コードを壊さない)、
  // 保存/読込の境界でのみ WorldData ⇔ state を相互変換する。

  emptyStageData(stageId) {
    return {
      stageId, unlocked: true, lastTickAt: Date.now(),
      pioneered: false,
      resources: { crickets: 0 },
      lizards: [], eggs: [],
      facilities: Object.fromEntries(FACILITIES.map((f) => [f.id, 0])),
      boss: { wins: 0, raidTimer: CFG.raidInterval, nextRaid: null },
      nest: { lv: 1, pins: [] },
      devLv: 0, // V4: 惑星開発
    };
  },

  // 現在のランタイム状態 → アクティブStageData
  activeStageData() {
    const s = this.state;
    return {
      stageId: this.currentStage().id, unlocked: true, lastTickAt: Date.now(),
      pioneered: true,
      resources: { crickets: 0 }, // V5: コオロギは共通在庫(wallet)へ
      incomeRate: this.stageIncomeRate({ lizards: s.lizards, facilities: s.facilities }),
      lizards: s.lizards, eggs: s.eggs,
      facilities: s.facilities,
      boss: { wins: s.stageWins || 0, raidTimer: s.raidTimer, nextRaid: s.nextRaid },
      nest: s.nest || { lv: 1, pins: [] },
      devLv: s.devLv || 0,
      gotReturnGift: !!s.gotReturnGift, // Phase4: 復帰報酬を受領済みか(無限ループ防止・書き戻しで保持)
    };
  },

  toWorld() {
    const s = this.state;
    const active = this.activeStageData();
    const prev = (this.world && this.world.stages) || [];
    const prevActiveId = this.world ? this.world.currentStageId : null;
    const stages = STAGES.filter((st) => s.rank >= st.rank).map((st) => {
      if (st.id === active.stageId) return active;
      const kept = prev.find((x) => x.stageId === st.id);
      // 旧アクティブ枠は(コロニーが移動したため)空き地へ戻す ※Phase2で独立化
      if (kept && st.id !== prevActiveId) return kept;
      if (kept && st.id === prevActiveId && kept.lizards.length && active.stageId !== prevActiveId) {
        return kept; // Phase2以降: 独立コロニーとして保持
      }
      return kept || this.emptyStageData(st.id);
    });
    const w = {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      idSeq: this._idSeq,
      wallet: { coins: s.coins, gems: s.gems, crickets: s.crickets || 0, stones: s.stones || 0 }, // V5.2: 共通在庫。v11: 賢者の石
      headquarters: { rank: s.rank, rankXp: s.rankXp, research: s.research || {}, rocket: s.rocket || { stage: 0, invested: 0, done: false } },
      collection: {
        dex: s.dex, stats: s.stats, missionsClaimed: s.missionsClaimed,
        titles: s.titles, titleSel: s.titleSel, daily: s.daily,
        bossCall: s.bossCall || null, // 3.11.3: 「今すぐ呼ぶ」1日3回カウンタ
      },
      allies: s.allies,
      res: s.res || { bio: 0, food: 0, energy: 0, science: 0 }, // V4: 資源フロー
      nestWeb: s.nestWeb || { nodes: {}, surprises: 0 },         // V4.1: 巣(WorldData直下・全惑星共通)
      dial: s.dial || { auto: false, rate: 1, supply: false },   // Brushup V2: 給餌ダイヤル
      rareWallet: s.rare || {},                                  // V4.1: 希少鉱石
      erosion: s.erosion || 0,                                   // V4.1: 侵食率
      forged: s.forged || {},
      lore: s.lore || {},
      autoSupply: s.autoSupply,
      autoBreed: !!s.autoBreed,
      stageSel: s.stageSel,
      currentStageId: active.stageId,
      planets: stages, // V4 §5: stages[] → planets[] 改名
    };
    w.stages = w.planets; // メモリ内の互換エイリアス(保存時はplanetsのみ書く)
    return w;
  },

  // WorldData → ランタイムstate(従来形状)
  // V5 Phase3: コオロギをステージ別在庫→共通ウォレットへ統合(全ステージ合計=資産厳密保存)。
  // バージョンゲートで冪等。各ステージのincomeRateもここでキャッシュ
  migrateV4to5(w) {
    if ((w.version || 0) >= 5) return w;
    const stages = w.planets || w.stages || [];
    let sum = 0;
    for (const st of stages) {
      sum += (st.resources && st.resources.crickets) || 0;
      if (st.resources) st.resources.crickets = 0;
      st.incomeRate = this.stageIncomeRate(st);
    }
    w.wallet = w.wallet || { coins: 0, gems: 0 };
    w.wallet.crickets = sum;
    w.planets = stages; w.stages = stages; // エイリアス統一(手編集等で両配列が分裂したセーブへの保険)
    w.version = 5;
    return w;
  },

  // V5.1: コオロギ在庫を全額Gold換算で払い戻し(1匹=CFG.cricketCost)。資産は消さず増やす方向のみ。
  // バージョンゲートで冪等
  migrateV5to6(w) {
    if ((w.version || 0) >= 6) return w;
    const cr = (w.wallet && w.wallet.crickets) || 0;
    const refund = Math.ceil(cr * CFG.cricketCost);
    w.wallet = w.wallet || { coins: 0, gems: 0 };
    w.wallet.coins = (w.wallet.coins || 0) + refund;
    delete w.wallet.crickets;
    w._refundV6 = { crickets: cr, gold: refund }; // 通知用(保存されない)
    w.version = 6;
    return w;
  },

  // V5.2: コオロギ給餌の復活。v6で払い戻したGoldは据置(利便性として残す)＋在庫を付与=資産プラスのみ。
  // 切れ時トグルは既定OFF(=Gold換算補充)でv6の連続給餌挙動を継続。バージョンゲートで冪等
  migrateV6to7(w) {
    if ((w.version || 0) >= 7) return w;
    w.wallet = w.wallet || { coins: 0, gems: 0 };
    w.wallet.crickets = (w.wallet.crickets || 0) + CFG.reviveCrickets;
    w.dial = w.dial || { auto: false, rate: 1 };
    if (w.dial.stopOnEmpty === undefined) w.dial.stopOnEmpty = false; // OFF=Gold補充(v6と同じ連続給餌)
    delete w.dial.supply; // 旧「控えめな補給」トグルは廃止(機能は切れ時トグルへ統合)
    w._reviveV7 = { crickets: CFG.reviveCrickets }; // 通知用(保存されない)
    w.version = 7;
    return w;
  },

  // 3.11.3: ボス見届け化。「今すぐ呼ぶ」1日カウンタ(bossCall)を追加。既存の保留ボス状態(nextRaid/raidTimer)は
  // StageData側に保持されるので触らない。バージョンゲートで冪等
  migrateV7to8(w) {
    if ((w.version || 0) >= 8) return w;
    w.collection = w.collection || {};
    if (w.collection.bossCall === undefined) w.collection.bossCall = null; // ロード時にensureBossCallが当日値を生成
    w.version = 8;
    return w;
  },

  // V5.2 Phase4: 純血化(案B・破壊的)。各惑星はその惑星の固有種(stage=惑星id)のみを残し、他惑星の種を削除。
  // 卵も同様(他惑星種の卵は孵化すると純血が崩れるため)。バージョンゲートで一度だけ・冪等。実行前バックアップはload側で退避。
  // 純血フィルタ(共有・冪等): 各ステージから固有種(stage=惑星id)以外の個体/卵を除去し、除去数を返す。
  // migrateV8to9(初回純血化)と migrateV9to10(混入バグの再掃除)が同一ロジックを共有(揺らぎ防止)。
  _purifyStages(stages) {
    let lizRemoved = 0, eggRemoved = 0; const detail = [];
    for (const st of (stages || [])) {
      const endemic = SPECIES.filter((sp) => sp.stage === st.stageId).map((sp) => sp.id);
      const rl = {}, re = {};
      st.lizards = (st.lizards || []).filter((lz) => { if (endemic.includes(lz.speciesId)) return true; rl[lz.speciesId] = (rl[lz.speciesId] || 0) + 1; lizRemoved++; return false; });
      st.eggs = (st.eggs || []).filter((e) => { if (endemic.includes(e.speciesId)) return true; re[e.speciesId] = (re[e.speciesId] || 0) + 1; eggRemoved++; return false; });
      if (Object.keys(rl).length || Object.keys(re).length) detail.push({ stage: st.stageId, lizards: rl, eggs: re });
    }
    return { lizards: lizRemoved, eggs: eggRemoved, detail }; // detail=惑星別・種別の除去内訳(監査ログ用)
  },
  migrateV8to9(w) {
    if ((w.version || 0) >= 9) return w;
    const stages = w.planets || w.stages || [];
    w._purifyV9 = this._purifyStages(stages); // 通知用(保存されない)
    w.planets = stages; w.stages = stages;
    w.version = 9;
    return w;
  },
  // V5.2 Phase4追補: 生成経路のバグ(全生成が他惑星種を作りうる=旧unlockedSpecies)で純血化後も混入した
  // 個体/卵を、生成側の根治(breedablePool)と同時に冪等で再掃除。以後は再混入しない。バックアップはload側で退避。
  migrateV9to10(w) {
    if ((w.version || 0) >= 10) return w;
    const stages = w.planets || w.stages || [];
    w._purifyV10 = this._purifyStages(stages); // 通知用(保存されない)
    w.planets = stages; w.stages = stages;
    w.version = 10;
    return w;
  },

  // v10→v11: 賢者の石(四重スリット装置のレア報酬)をwalletへ追加。加算のみ=非破壊・冪等
  migrateV10to11(w) {
    if ((w.version || 0) >= 11) return w;
    w.wallet = w.wallet || { coins: 0, gems: 0 };
    if (w.wallet.stones == null) w.wallet.stones = 0;
    w.version = 11;
    return w;
  },

  // v11→v12: シェルター撤廃(§8.10)。ベビー安全は巣の基本仕様へ標準化(injureLizardsで無条件保護)、
  // ガード回避は廃止。投資済みシェルターLvを全惑星でGold全額払戻(V5「損失感ゼロ」・コオロギ廃止と同じ扱い)し
  // shelterキーを削除。旧コスト(baseCost400/costMult1.6)は撤廃済み定義に依存せぬよう定数固定。
  // バージョンゲート+キー削除で冪等(再実行しても shelter が無いので二重返金しない)。
  migrateV11to12(w) {
    if ((w.version || 0) >= 12) return w;
    const planets = w.planets || w.stages || [];
    let refund = 0, lvSum = 0;
    for (const p of planets) {
      if (!p.facilities) continue;
      const lv = p.facilities.shelter || 0;
      for (let k = 0; k < lv; k++) refund += Math.floor(400 * Math.pow(1.6, k));
      lvSum += lv;
      delete p.facilities.shelter;
    }
    w.planets = planets; w.stages = planets; // 掃除済み配列で再エイリアス(planets/stages分裂時の削除漏れ・二重返金を防ぐ・既存migrationと同型)
    w.wallet = w.wallet || { coins: 0, gems: 0 };
    w.wallet.coins = (w.wallet.coins || 0) + refund;
    w._refundV12 = { shelterLvTotal: lvSum, gold: refund }; // 通知用(保存されない)
    w.version = 12;
    return w;
  },

  // v12→v13: 餌場・繁殖施設を撤廃し効果を巣(nest.lv)へ統合(§8.12)。投資済みLvを全惑星でGold全額払戻し
  // feeder/breedfacキーを削除。旧コスト(feeder 5000/1.6・breedfac 20000/1.6)は撤廃済み定義に依存せぬよう定数固定。
  // バージョンゲート+キー削除+掃除済み配列の再エイリアスで冪等(二重返金しない)。
  migrateV12to13(w) {
    if ((w.version || 0) >= 13) return w;
    const planets = w.planets || w.stages || [];
    const RATES = { feeder: [5000, 1.6], breedfac: [20000, 1.6] };
    let refund = 0; const lvSum = { feeder: 0, breedfac: 0 };
    for (const p of planets) {
      if (!p.facilities) continue;
      for (const id of ["feeder", "breedfac"]) {
        const lv = p.facilities[id] || 0, base = RATES[id][0], mult = RATES[id][1];
        for (let k = 0; k < lv; k++) refund += Math.floor(base * Math.pow(mult, k));
        lvSum[id] += lv;
        delete p.facilities[id];
      }
    }
    w.planets = planets; w.stages = planets; // 掃除済み配列で再エイリアス(分裂時の削除漏れ・二重返金を防ぐ)
    w.wallet = w.wallet || { coins: 0, gems: 0 };
    w.wallet.coins = (w.wallet.coins || 0) + refund;
    w._refundV13 = { feederLv: lvSum.feeder, breedfacLv: lvSum.breedfac, gold: refund }; // 通知用(保存されない)
    w.version = 13;
    return w;
  },

  applyWorld(w) {
    if (w.planets && !w.stages) w.stages = w.planets; // V4改名の互換
    if (w.stages && !w.planets) w.planets = w.stages;
    this.world = w;
    this._idSeq = w.idSeq || 1000;
    let active = w.stages.find((st) => st.stageId === w.currentStageId);
    if (!active) active = w.stages[w.stages.length - 1] || this.emptyStageData(1);
    this.state = {
      coins: w.wallet.coins, gems: w.wallet.gems,
      stones: w.wallet.stones || 0, // v11: 賢者の石(旧セーブは既定0で後方互換)
      crickets: w.wallet.crickets || 0, // V5.2: コオロギ給餌の復活(全コロニー共通在庫)
      rank: w.headquarters.rank, rankXp: w.headquarters.rankXp,
      research: w.headquarters.research || {},
      lizards: active.lizards, eggs: active.eggs,
      facilities: active.facilities,
      res: w.res || { bio: 0, food: 0, energy: 0, science: 0 },
      nestWeb: w.nestWeb || { nodes: {}, surprises: 0 },
      dial: w.dial || { auto: false, rate: 1, stopOnEmpty: false },
      rare: w.rareWallet || { amethyst: 0, iridium: 0, amber: 0, meteorite: 0, orichalcum: 0, titaniumOre: 0 },
      erosion: w.erosion || 0,
      rocket: (w.headquarters && w.headquarters.rocket) || { stage: 0, invested: 0, done: false },
      forged: w.forged || {},
      lore: w.lore || {},
      dex: w.collection.dex, stats: w.collection.stats,
      missionsClaimed: w.collection.missionsClaimed,
      titles: w.collection.titles || {}, titleSel: w.collection.titleSel || null,
      daily: w.collection.daily || { last: "", streak: 0 },
      bossCall: w.collection.bossCall || null, // 3.11.3: 今すぐ呼ぶ1日カウンタ
      allies: w.allies || {},
      autoSupply: !!w.autoSupply,
      autoBreed: !!w.autoBreed,
      stageSel: active.stageId, // アクティブコロニー=表示惑星
      raidTimer: active.boss.raidTimer,
      nextRaid: active.boss.nextRaid,
      stageWins: active.boss.wins || 0,
      nest: active.nest || { lv: 1, pins: [] },
      devLv: active.devLv || 0,
      gotReturnGift: !!active.gotReturnGift, // Phase4: 復帰報酬の受領済み(ランタイムへ)
      savedAt: w.savedAt,
    };
    // 補完
    for (const f of FACILITIES) if (this.state.facilities[f.id] === undefined) this.state.facilities[f.id] = 0;
    // V5.2: 探索(V4.1撤去)の残留フラグを掃除。残るとisAway誤判定で個体が永久に給餌/emit不能になった(冪等)
    for (const lz of this.state.lizards) if ("exploring" in lz) delete lz.exploring;
    if (!this.state.nextRaid) this.rollNextRaid();
    this.settleDisplay(); // 3.12.2: ロード直後に表示20を即確定(大コロニーでもfps安定・restingは派生なので再構築)
  },

  // 旧形式 {state, idSeq} → WorldData v2 (Migration)
  migrateV1(data) {
    const s = data.state || {};
    const rank = s.rank || 1;
    // 現行コロニーは到達済みの表示ステージへ丸ごと移設
    let stageId = 1;
    for (const st of STAGES) if (rank >= st.rank) stageId = st.id;
    if (s.stageSel && STAGES.find((x) => x.id === s.stageSel && rank >= x.rank)) stageId = s.stageSel;
    const active = {
      stageId, unlocked: true, lastTickAt: s.savedAt || Date.now(),
      pioneered: true,
      resources: { crickets: s.crickets || 0 },
      lizards: s.lizards || [], eggs: s.eggs || [],
      facilities: s.facilities || {},
      boss: {
        wins: (s.stats && s.stats.raidsWon) || 0,
        raidTimer: s.raidTimer || CFG.raidInterval,
        nextRaid: s.nextRaid || null,
      },
      nest: { lv: 1, pins: [] },
      exploration: null,
    };
    const stages = STAGES.filter((st) => rank >= st.rank)
      .map((st) => (st.id === stageId ? active : this.emptyStageData(st.id)));
    return {
      version: 2, // v2形状で返し、続けて migrateV2to3 に通す
      savedAt: s.savedAt || Date.now(),
      idSeq: data.idSeq || 1000,
      wallet: { coins: s.coins || 0, gems: s.gems || 0 },
      headquarters: { rank, rankXp: s.rankXp || 0, research: {} },
      collection: {
        dex: s.dex || {},
        stats: s.stats || { fed: 0, hatched: 0, raidsWon: 0, bossWon: 0, bred: 0, sold: 0 },
        missionsClaimed: s.missionsClaimed || {},
        titles: s.titles || {}, titleSel: s.titleSel || null,
        daily: s.daily || { last: "", streak: 0 },
      },
      allies: s.allies || {},
      materials: s.materials || 0,
      mats: {},
      mutMats: 0,
      autoSupply: !!s.autoSupply,
      stageSel: stageId,
      currentStageId: stageId,
      stages,
    };
  },

  // V3(v2) → V4(v3) Migration: 素材の払い戻し・設備統廃合・0匹惑星の救済
  migrateV2to3(w) {
    // (1) 素材・アイテムの払い戻し(§5: 損失感ゼロ)
    const matsTotal = Object.values(w.mats || {}).reduce((a, b) => a + b, 0);
    const mutMats = w.mutMats || 0;
    const materials = w.materials || 0;
    const refundG = matsTotal * 200 + mutMats * 2000 + materials * 1000;
    const res = {
      bio: matsTotal * 1 + mutMats * 5,
      food: 0,
      energy: 0,
      science: materials * 2,
    };
    w.wallet.coins += refundG;
    w.res = res;
    delete w.mats;
    delete w.mutMats;
    delete w.materials;
    // (2) 設備統廃合(効果を落とさないLv換算)
    const planets = w.planets || w.stages || [];
    for (const p of planets) {
      const o = (id) => (p.facilities && p.facilities[id]) || 0;
      const nestPlus = Math.floor((o("nestbox") + o("hatchery")) / 2);
      p.facilities = {
        water: Math.min(20, o("water") + o("watertower") + o("aquarium")),
        heat: Math.min(20, o("heat") + o("light") + o("bigheat") + o("greenhouse")),
        feeder: Math.min(10, o("autofeeder") + o("cricketfarm")),
        breedfac: Math.min(15, o("nest_art") + o("pheromone") + o("rocks") + o("genelab") + o("altar")),
        observatory: Math.min(10, o("lookout") + o("specimen") + o("lab")),
        fence: Math.min(10, o("fence")),
        shelter: Math.min(10, o("shelter")),
        watchtower: Math.min(10, o("watchtower")),
        trap: Math.min(15, o("trapfence") + o("herbs") + o("reflector") + o("bonfire")),
      };
      p.nest = p.nest || { lv: 1, pins: [] };
      p.nest.lv = Math.min(CFG.nestLvMax, (p.nest.lv || 1) + nestPlus);
      p.invasion = p.invasion || 0;
      p.devLv = p.devLv || 0;
      // (3) 0匹惑星の救済: 開拓済みなのに誰もいない → 現地生物を派遣
      if (p.pioneered && p.lizards.length === 0 && p.eggs.length === 0) {
        this.spawnNatives(p, p.stageId);
      }
    }
    // (4) 改名・新フィールド
    w.planets = planets;
    w.stages = planets;
    w.lore = w.lore || { intro: true };
    w.autoBreed = false;
    w.version = 3; // 到達版数を明示(V5共通ゲートmigrateV4to5を必ず通すため。旧: SAVE_VERSION)
    w._refund = { refundG, bio: res.bio, science: res.science }; // 通知用(保存はされない値として許容)
    return w;
  },

  // V4(v3) → V4.1(v4) Migration: 旧探索の払い戻し・派遣復帰・侵食率へ統合
  migrateV3to4(w) {
    if (w.planets && !w.stages) w.stages = w.planets;
    const refund = { amber: 0, iridium: 0, meteorite: 0, orichalcum: 0 };
    let maxInv = 0;
    for (const p of (w.stages || [])) {
      const ex = p.exploration;
      if (ex) {
        refund.amber += (ex.bestDepth || 1) * 2;
        refund.iridium += Object.keys(ex.nodes || {}).length;
        refund.meteorite += ex.boxes || 0;
        if (ex.legendDone) refund.orichalcum += 5;
      }
      delete p.exploration;
      // 派遣中個体を全復帰(§2)
      for (const lz of p.lizards || []) { if (lz.exploring) lz.exploring = false; }
      maxInv = Math.max(maxInv, p.invasion || 0);
      delete p.invasion;
    }
    w.nestWeb = { nodes: {}, surprises: 0 };
    w.rareWallet = {
      amethyst: 0, iridium: refund.iridium, amber: refund.amber,
      meteorite: refund.meteorite, orichalcum: refund.orichalcum, titaniumOre: 0,
    };
    w.erosion = Math.min(100, maxInv); // 惑星別侵略圧の最大値を引き継ぐ
    w.forged = {};
    w.headquarters.rocket = { stage: 0, invested: 0, done: false };
    w.version = 4; // 到達版数を明示(V5共通ゲートを必ず通す。旧: SAVE_VERSION)
    w._refund41 = refund;
    return w;
  },

  save() {
    try {
      const w = this.toWorld();
      const out = Object.assign({}, w);
      delete out.stages; // 保存はplanetsのみ(エイリアスの二重書き込みを防ぐ)
      // 3.12.2③(fable2): resting/restedAtは派生状態(表示のみ)。保存に混入させない=セーブ形状不変。
      // ロード後は updateResting が現況(平常/ボス・攻撃力)から再構築する
      localStorage.setItem(CFG.saveKey, JSON.stringify(out, (k, v) => (k === "resting" || k === "restedAt") ? undefined : v));
    } catch (e) { /* 容量不足などは無視 */ }
  },

  load() {
    let raw;
    try { raw = localStorage.getItem(CFG.saveKey); } catch (e) { return false; }
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      let world;
      if (data.version >= 9) {
        // v9セーブ → v10移行(混入個体の再掃除=破壊的。移行前を退避=ロールバック可能に)
        if (data.version === 9) { try { localStorage.setItem(CFG.saveBackupKeyV10, raw); } catch (e) { /* noop */ } }
        // v10セーブ → v11移行(賢者の石追加=非破壊だが方針どおり退避)
        if (data.version === 10) { try { localStorage.setItem(CFG.saveBackupKeyV11, raw); } catch (e) { /* noop */ } }
        // v11セーブ → v12移行(シェルター撤廃+Gold払戻。方針どおり退避=ロールバック可)
        if (data.version === 11) { try { localStorage.setItem(CFG.saveBackupKeyV12, raw); } catch (e) { /* noop */ } }
        // v12セーブ → v13移行(餌場/繁殖撤廃+効果を巣へ統合+Gold払戻。退避=ロールバック可)
        if (data.version === 12) { try { localStorage.setItem(CFG.saveBackupKeyV13, raw); } catch (e) { /* noop */ } }
        world = data; // 実移行は下の共通ゲートで(冪等)
      } else if (data.version === 8) {
        // V8セーブ → V9移行(純血化=破壊的。必ず全文バックアップを退避=ロールバック可能に)
        try { localStorage.setItem(CFG.saveBackupKeyV9, raw); } catch (e) { /* noop */ }
        try { localStorage.setItem(CFG.saveBackupKeyV10, raw); } catch (e) { /* noop */ }
        world = data; // 実移行は下の共通ゲートで(冪等)
      } else if (data.version === 7) {
        // V7セーブ → V8移行(ボス見届け化・1日3回カウンタ・バックアップしてから)。V9/V10バックアップも退避
        try { localStorage.setItem(CFG.saveBackupKeyV8, raw); } catch (e) { /* noop */ }
        try { localStorage.setItem(CFG.saveBackupKeyV9, raw); } catch (e) { /* noop */ }
        try { localStorage.setItem(CFG.saveBackupKeyV10, raw); } catch (e) { /* noop */ }
        world = data; // 実移行は下の共通ゲートで(冪等)
      } else if (data.version === 6) {
        // V6セーブ → V7移行(コオロギ給餌の復活・バックアップしてから)
        try { localStorage.setItem(CFG.saveBackupKeyV7, raw); } catch (e) { /* noop */ }
        world = data; // 実移行は下の共通ゲートで(冪等)
      } else if (data.version === 5) {
        // V5セーブ → V6移行(コオロギ→Gold払い戻し・バックアップしてから)
        try { localStorage.setItem(CFG.saveBackupKeyV6, raw); } catch (e) { /* noop */ }
        world = data; // 実移行は下の共通ゲートで(冪等)
      } else if (data.version === 4) {
        // V4.1セーブ → V5移行(コオロギ共通化・バックアップしてから)
        try { localStorage.setItem(CFG.saveBackupKeyV5, raw); } catch (e) { /* noop */ }
        world = data; // 実移行は下の共通ゲートで(冪等)
        setTimeout(() => UI.toast("V5アップデート! コオロギは全コロニー共通の在庫になりました(旧データはバックアップ済み)"), 900);
      } else if (data.version === 3) {
        // V4セーブ → V4.1移行(バックアップしてから)
        try { localStorage.setItem(CFG.saveBackupKeyV4, raw); } catch (e) { /* noop */ }
        world = this.migrateV3to4(data);
        const r = world._refund41;
        setTimeout(() => {
          UI.toast("Idle Nest アップデート! 巣は全惑星共通の自動成長ネットワークになりました");
          if (r && (r.amber > 0 || r.iridium > 0)) {
            UI.toast(`旧探索の払い戻し: 琥珀+${r.amber} イリジウム+${r.iridium} 隕石+${r.meteorite} オリハルコン+${r.orichalcum}`);
          }
        }, 900);
      } else if (data.version === 2) {
        // V3セーブ → V4移行(バックアップしてから)
        try { localStorage.setItem(CFG.saveBackupKeyV3, raw); } catch (e) { /* noop */ }
        world = this.migrateV3to4(this.migrateV2to3(data));
        const r = world._refund;
        setTimeout(() => {
          UI.toast("Planet Reptileアップデート! セーブをV4形式へ移行しました(旧データはバックアップ済み)");
          if (r && (r.refundG > 0 || r.bio > 0)) {
            UI.toast(`素材システム廃止にともない払い戻し: +${fmt(r.refundG)}G / 生態データ+${fmt(r.bio)} / 研究力+${fmt(r.science)}`);
          }
        }, 900);
      } else {
        // V2以前 → v2 → V4 の二段移行
        try { localStorage.setItem(CFG.saveBackupKey, raw); } catch (e) { /* noop */ }
        try { localStorage.setItem(CFG.saveBackupKeyV3, raw); } catch (e) { /* noop */ }
        world = this.migrateV3to4(this.migrateV2to3(this.migrateV1(data)));
        setTimeout(() => UI.toast("セーブを最新形式へ移行しました。旧データはバックアップ済み"), 900);
      }
      // 共通ゲート(全チェーンの最終段・各段は冪等)。v8→v9=純血化(破壊的) / v9→v10=混入個体の再掃除
      world = this.migrateV12to13(this.migrateV11to12(this.migrateV10to11(this.migrateV9to10(this.migrateV8to9(this.migrateV7to8(this.migrateV6to7(this.migrateV5to6(this.migrateV4to5(world)))))))));
      if (world._purifyV9 && (world._purifyV9.lizards > 0 || world._purifyV9.eggs > 0)) {
        const p9 = world._purifyV9;
        setTimeout(() => UI.toast(`${Icon.svg("planet")} 純血化: 各惑星は固有種のみになりました(他惑星種 ${p9.lizards}匹${p9.eggs > 0 ? "・卵" + p9.eggs : ""}が去った。設定からロールバック可)`, true), 900);
      }
      if (world._purifyV10 && (world._purifyV10.lizards > 0 || world._purifyV10.eggs > 0)) {
        const p10 = world._purifyV10;
        // 監査ログ(全走査結果): どの惑星から何の他惑星種が何匹/何卵 消えたかをコンソールへ
        try {
          console.log("=== 純血化(追補) 監査: 除去した他惑星種の内訳 ===");
          for (const d of (p10.detail || [])) {
            const st = stageById(d.stage) || {};
            const fmt2 = (o) => Object.entries(o).map(([k, v]) => `${(speciesById(k) || { name: k }).name}×${v}`).join(", ");
            console.log(`${st.pname || ""} ${st.name || ("stage" + d.stage)}: 個体[${fmt2(d.lizards) || "-"}] 卵[${fmt2(d.eggs) || "-"}]`);
          }
        } catch (e) { /* noop */ }
        setTimeout(() => UI.toast(`${Icon.svg("planet")} 純血化の追補: 混入していた他惑星種 ${p10.lizards}匹${p10.eggs > 0 ? "・卵" + p10.eggs : ""}を掃除しました(生成側も根治済み・設定からロールバック可)`, true), 950);
      }
      if (world._refundV12 && world._refundV12.gold > 0) {
        const r12 = world._refundV12;
        setTimeout(() => UI.toast(`シェルターは撤廃されました(ベビーは常に安全に)。投資分Lv${r12.shelterLvTotal}を全額払い戻し: +${fmt(r12.gold)}G(設定からロールバック可)`), 920);
      }
      if (world._refundV13 && world._refundV13.gold > 0) {
        const r13 = world._refundV13;
        setTimeout(() => UI.toast(`餌場・繁殖施設は「すみか(巣)」へ統合されました(巣Lvが給餌と繁殖を担います)。投資分(餌場Lv${r13.feederLv}/繁殖Lv${r13.breedfacLv})を全額払い戻し: +${fmt(r13.gold)}G(設定からロールバック可)`), 940);
      }
      if (world._reviveV7 && world._reviveV7.crickets > 0) {
        const r7 = world._reviveV7;
        setTimeout(() => UI.toast(`V5.2: コオロギ給餌が復活! 在庫コオロギ${fmt(r7.crickets)}匹を進呈(以前のGold払い戻しはそのまま)`), 900);
      } else if (world._refundV6 && world._refundV6.gold > 0) {
        const r6 = world._refundV6;
        setTimeout(() => UI.toast(`コオロギ在庫${fmt(Math.floor(r6.crickets))}匹を払い戻し: +${fmt(r6.gold)}G`), 900);
      }
      this.applyWorld(world);
      // V4.1: 留守中の侵食上昇(全体で1回だけ)と巣の一括解放
      const awaySec = Math.min(Math.max(0, (Date.now() - (world.savedAt || Date.now())) / 1000), this.offlineCapSec());
      if (awaySec > 60) this.erosionRise(awaySec);
      const openedOffline = this.checkNestWeb(true);
      if (openedOffline.length > 0) {
        setTimeout(() => UI.toast(`留守中に巣ノードが${openedOffline.length}個 開いていた!(巣画面で確認)`), 700);
      }
      // 全惑星のオフライン進行(卵・回復・撃退カウントのみ。生産はV5で下の一括精算)
      for (const st of world.stages) this.simulateOffline(st);
      // V5 Phase3: 閉じていた間の生産を全コロニー合算×offlineRateで一括精算(「おかえり」に一本化)
      if (awaySec > 60) {
        const cur = this.currentStage().id;
        const away = this.world.stages.reduce((a, st) => st.stageId === cur ? a : a + (st.incomeRate || 0), 0);
        const gain = Math.floor((this.incomePerSec() + away) * CFG.offlineRate * awaySec);
        if (gain > 0) {
          this.state.coins += gain;
          setTimeout(() => UI.toast(`おかえり! 留守中(${fmtDur(awaySec)})も全コロニー稼働 — 生産+${fmt(gain)}G`), 600);
        }
      }
      return true;
    } catch (e) {
      console.error("セーブ読込失敗:", e);
      return false;
    }
  },

  offlineCapSec() {
    return (CFG.offlineCapHours + this.researchBonus("offlineH")) * 3600;
  },

  restoreV4Backup() {
    let raw;
    try { raw = localStorage.getItem(CFG.saveBackupKeyV4); } catch (e) { raw = null; }
    if (!raw) { UI.toast("バックアップが見つからない", true); return false; }
    localStorage.setItem(CFG.saveKey, raw);
    location.reload();
    return true;
  },

  // Phase4: 純血化(V9)前へロールバック=消えた個体を含む移行前の状態に戻す
  restoreV9Backup() {
    let raw;
    try { raw = localStorage.getItem(CFG.saveBackupKeyV9); } catch (e) { raw = null; }
    if (!raw) { UI.toast("純血化前のバックアップが見つからない", true); return false; }
    localStorage.setItem(CFG.saveKey, raw);
    location.reload();
    return true;
  },
  restoreV10Backup() {
    let raw;
    try { raw = localStorage.getItem(CFG.saveBackupKeyV10); } catch (e) { raw = null; }
    if (!raw) { UI.toast("純血化(追補)前のバックアップが見つからない", true); return false; }
    localStorage.setItem(CFG.saveKey, raw);
    location.reload();
    return true;
  },
  // §8.10: シェルター撤廃(V12)前へロールバック=シェルターと投資Lvが戻る(払戻Goldは移行前状態のため無し)
  restoreV12Backup() {
    let raw;
    try { raw = localStorage.getItem(CFG.saveBackupKeyV12); } catch (e) { raw = null; }
    if (!raw) { UI.toast("シェルター撤廃前のバックアップが見つからない", true); return false; }
    localStorage.setItem(CFG.saveKey, raw);
    location.reload();
    return true;
  },
  // §8.12: 餌場/繁殖撤廃(V13)前へロールバック=両施設と投資Lvが戻る(払戻Goldは移行前状態のため無し)
  restoreV13Backup() {
    let raw;
    try { raw = localStorage.getItem(CFG.saveBackupKeyV13); } catch (e) { raw = null; }
    if (!raw) { UI.toast("餌場/繁殖施設 撤廃前のバックアップが見つからない", true); return false; }
    localStorage.setItem(CFG.saveKey, raw);
    location.reload();
    return true;
  },

  restoreV3Backup() {
    let raw;
    try { raw = localStorage.getItem(CFG.saveBackupKeyV3); } catch (e) { raw = null; }
    if (!raw) { UI.toast("バックアップが見つからない", true); return false; }
    localStorage.setItem(CFG.saveKey, raw);
    location.reload();
    return true;
  },

  restoreV1Backup() {
    let raw;
    try { raw = localStorage.getItem(CFG.saveBackupKey); } catch (e) { raw = null; }
    if (!raw) { UI.toast("バックアップが見つからない", true); return false; }
    localStorage.setItem(CFG.saveKey, raw);
    location.reload();
    return true;
  },

  resetSave() {
    localStorage.removeItem(CFG.saveKey);
    location.reload();
  },
};

// ---- 汎用ユーティリティ ----
function rnd(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function fmt(n) {
  n = Math.floor(n);
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e4) return (n / 1e3).toFixed(1) + "K";
  return n.toLocaleString();
}
function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}
// 離席時間などを「〇時間〇分」「〇分〇秒」で表す
function fmtDur(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h > 0) return `${h}時間${m}分`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}
