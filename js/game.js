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
      stats: { fed: 0, hatched: 0, raidsWon: 0, bossWon: 0, bred: 0, sold: 0, bossPlanets: {} },
      missionsClaimed: {},
      raidTimer: CFG.raidInterval,
      autoSupply: false,
      allies: {},          // { allyId: { lv } }
      nextRaid: null,      // 次の襲撃の予告情報
      stageSel: 1,         // Phase10: 明示選択ステージ(既定=アリド)。★自動で最新へジャンプしない(自動移行廃止)
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
      autoBreed: false,    // V4: 繁殖予約【機能撤廃済(Ric裁定 2026-07-29)】セーブ互換のため素通しで保持するだけ=もう読まない
      dial: { auto: false, rate: 1, supply: false, stopOnEmpty: true, emptyDefaultOnV1: 1 }, // Brushup V2: 給餌ダイヤル(切れ時トグルは既定ON)
      stageWins: 0,        // この惑星での撃退数(Elite周期用)
      nest: { lv: 1 }, // すみか(住居)Lv・ピン留め個体
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
      // 特性(S2・trait_system §8): additive。既定=無印[]。genesはtraitsを持てば継承(繁殖経由)。
      //   レジェンダリーは特性の対象外(①・§16.4)=常に空。旧セーブの既存個体は traits 未定義=[]扱い(後方互換・bump不要)。
      traits: morphId === "legendary" ? [] : ((genes && genes.traits) || []),
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
  // §9-C4: 進行マイルストーンは飼育槽中央の軽い通知へ(トースト非使用)。1件・短時間・古いものは捨てる(Render側)
  notice(text, sub, accent) { if (typeof Render !== "undefined" && Render.showCenterNotice) Render.showCenterNotice(text, sub || "", accent || "info"); },
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
  //   選択中は種上限を無視して必ず採用。鷹にさらわれ不在(hidden)は対象外。全体上限 displayCap も安全弁で併用。
  desiredShown() {
    const all = this.state.lizards.filter((l) => !this.isHidden(l));
    all.sort((a, b) => (this.displayScore(b) - this.displayScore(a)) || (a.id - b.id)); // 安定ソート(同点はidで固定=ちらつき防止)
    const byType = {}; const shown = new Set();
    for (const l of all) {
      const forced = l.id === this.selectedId;
      const k = this.dispKey(l);
      if (forced) { shown.add(l.id); byType[k] = (byType[k] || 0) + 1; continue; }
      if ((byType[k] || 0) < CFG.dispPerType && shown.size < CFG.displayCap) {
        shown.add(l.id); byType[k] = (byType[k] || 0) + 1;
      }
    }
    return shown;
  },

  lizardPrio(l) {
    return (l.id === this.selectedId ? 1e6 : 0)
      + (l.founder ? 500 : 0)
      + morphById(l.morphId).mult * 10
      + speciesById(l.speciesId).stars * 2;
  },

  // 3.12.2: 飼育槽に"表示"される優先度(高いほど表示)。選択中は最優先。
  //   平常時=攻撃力の弱い個体を表示(強個体は巣に籠る) / ボス時=攻撃力の強い個体が這い出す
  displayScore(l) {
    if (l.id === this.selectedId) return 1e7;   // 選択中は必ず表示(プレイヤー意図優先)
    const atk = this.lizardAtk(l);
    return this.raid ? atk : -atk;              // ボス=強い順 / 平常=弱い順
  },

  // §8.13: 表示メンバーを"即座に"確定(ロード/新規/惑星切替時)。desiredShown(種×モーフ×2)へ一括収束=fps安定。
  // resting/restedAtは派生状態(保存しない)なので現況(攻撃力・平常/ボス)から毎回再構築する
  settleDisplay() {
    const show = this.desiredShown();
    for (const l of this.state.lizards) {
      if (this.isHidden(l)) continue; // 鷹に不在の個体は据え置き
      l.returning = false; // 即時確定=歩行途中の状態はクリア(ロード/惑星切替は瞬時に確定=fps安定)
      l.spot = null; l._toSpot = null; // モーション: 居場所滞在も即クリア(ロード後は徘徊から再割当・stale姿勢なし)
      l._dashT = 0; l._lookT = 0; l._meetCd = 0; // V5M: モーション残状態もクリア(stale姿勢なし・runtime専用=保存されない)
      l._shedT = 0; l._digT = 0; l._folT = 0; l._shedGo = false; // V5M第3バッチ分
      l._peekT = 0; l._peekedTrip = false; l._spotT = null; // V5M-EX パートC分
      l._shakeT = 0; l._spotTier = 0; l._emergeThruT = 0; l._spotTravelT = 0; l._relaxing = false; // V5M-EX2/3/K分
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
      if (shouldShow) {
        if (l.resting) toEmerge.push(l);
        else if (l.returning) l.returning = false; // §8.14: 巣へ戻る途中で復帰条件を満たした=引き返して通常徘徊へ
      } else if (!l.resting && !l.returning) {
        toRetreat.push(l); // まだ表示中で戻り開始していない個体だけ
      }
    }
    if (!toEmerge.length && !toRetreat.length) return;
    toEmerge.sort((a, b) => this.displayScore(b) - this.displayScore(a));   // 出る=スコア高い順
    toRetreat.sort((a, b) => this.displayScore(a) - this.displayScore(b));  // 籠る=スコア低い順
    const swap = this.raid ? CFG.emergeSwapPerSec : CFG.restSwapPerSec;
    const rate = Math.max(swap, Math.ceil((toEmerge.length + toRetreat.length) / 6)); // 大差は加速して即収束
    for (let i = 0; i < Math.min(rate, toEmerge.length); i++) this.emergeFromNest(toEmerge[i]);
    for (let i = 0; i < Math.min(rate, toRetreat.length); i++) this.retreatToNest(toRetreat[i]);
  },

  // §8.14: 巣穴の中心座標(描画側FAC_POS.burrowと共有・実行時参照)。無ければ従来値にフォールバック
  nestXY() {
    return (typeof FAC_POS !== "undefined" && FAC_POS.burrow) ? FAC_POS.burrow : { x: 185, y: 322 };
  },
  // §8.16: この個体が使う入口(複数の入口へ動線を分散=詰まらない)。id で安定割当。描画のRender.burrowEntrancesと共有
  nestEntryFor(lz) {
    if (typeof Render !== "undefined" && Render.burrowEntrances) {
      const ents = Render.burrowEntrances(this.nestLv());
      if (ents && ents.length) return ents[lz.id % ents.length];
    }
    return this.nestXY();
  },
  // モーション(§8.5): この個体の「居場所(スポット)」を決定論的に割当(nestEntryForの一般化)。
  // Render.facilitySpots() の capacity に比例させ id ハッシュで安定配分=同じ個体は同じスポット(ちらつき防止・決定論=Fable2/Math.random不使用)。
  // 純装飾のidle行動=生産/戦闘/繁殖の数値には一切影響しない(Fable1 表現層)。設備スポットが無ければ null(=従来どおり自由徘徊)。
  spotFor(lz) {
    if (typeof Render === "undefined" || !Render.facilitySpots) return null;
    const spots = Render.facilitySpots();
    if (!spots || !spots.length) return null;
    let total = 0; for (const s of spots) total += Math.max(1, s.capacity || 1);
    // 調査J根治: 旧 (id*2654435761)>>>0 % total は小さい連続idで偏り→fmix32(motHash)で一様化。
    // 調査N根治(2026-07-26): id固定ハッシュだと各個体が"永久に同じspot型"にバインド=可視個体が非水場idだと水場が永遠に0。
    //   時刻でローテーション(spotRotateSec毎に選好が変わる)=全個体が時々どのspotも訪れる(水飲みが必ず巡ってくる)。決定論は保つ(id+時刻バケット)。
    const rot = Math.floor((this._motClock || 0) / (CFG.spotRotateSec || 18));
    let k = Math.floor(this.motHash(lz.id, 1234 + rot) * total);
    for (const s of spots) { k -= Math.max(1, s.capacity || 1); if (k < 0) return s; }
    return spots[spots.length - 1];
  },
  emergeFromNest(lz) {
    lz.resting = false;
    const n = this.nestEntryFor(lz);
    lz.x = n.x + rnd(-18, 18); lz.y = n.y + rnd(6, 18); // 割り当て入口から這い出す(§8.12で巣は左へ)
    lz.tx = lz.homeX; lz.ty = lz.homeY;
    lz.restedAt = Date.now();
    lz._emergeThruT = CFG.nestThruSec || 1.5; // 裁定F: 出巣直後はしばらく他個体をすり抜けて入口を離れる(団子防止)
    // V5M-EX パートC(巣の出入り): 出た直後に入口で一瞬周囲をうかがう(⑧キョロ)→その後ねぐらへ。ボス湧出時は省略(急ぐ)。
    if (!this.raid && CFG.motEmergeLookOn !== false && !(typeof Motion !== "undefined" && Motion.reduced)
      && this.motHash(lz.id * 61 + 18, Math.floor((this._motClock || 0))) < (CFG.motEmergeLookRate || 0.6)) {
      lz.tx = lz.x; lz.ty = lz.y;                 // まず入口で立ち止まる
      lz._lookT = CFG.motLookDwell || 3.0; lz._lookN = 0;
      lz.wanderT = (CFG.motLookDwell || 3.0) * 0.7; // 見終えたら通常徘徊でねぐらへ
    }
  },
  retreatToNest(lz) {
    // §8.14: 瞬間消滅にしない。巣へ向かって歩き出し、到達したら巣に入る(moveLizardsで処理)
    lz.returning = true;
    lz.moving = true;
    lz._peekedTrip = false; // V5M-EX: この帰巣で入口前の「一瞬振り返る」を未実施に
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
    if (s.coins < cost) { UI.denyFlash("coins"); return false; }
    s.coins -= cost;
    s.nest.lv = lv + 1;
    this.notice(`すみか Lv${s.nest.lv}`, "外出枠+1・隊列枠が拡張"); // §9-C4
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
        for (const o of nestRewardList(node)) this.addOre(o.ore, o.n); // P2-3: 報酬は配列(単一アクセサ)
        opened.push(node);
      }
    }
    if (!silent && opened.length) {
      if (UI.nestSparkFx) UI.nestSparkFx(opened); // v2(Ric裁定): 巣ページを開いている時だけ解放の瞬間の一回性スパーク
      if (UI.heroNestReveal) {
        UI.heroNestReveal(opened); // ヒーロー演出(§6: 中庸・複数は1回に合算)
      } else {
        for (const node of opened) {
          const txt = nestRewardList(node).map((x) => { const o = oreById(x.ore); return `${Icon.svg(o.icon)}${o.name}+${x.n}`; }).join(" ");
          UI.toast(`結節が開いた!「${node.name}」 → ${txt}`);
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
    for (const o2 of nestRewardList(node)) this.addOre(o2.ore, o2.n); // P2-3: 配列
    this.flashT = 0.3;
    if (UI.heroNestReveal) UI.heroNestReveal([node], true); // サプライズ版(少し特別)
    else {
      const txt = nestRewardList(node).map((x) => { const o = oreById(x.ore); return `${Icon.svg(o.icon)}${o.name}+${x.n}`; }).join(" ");
      UI.toast(`予想外の結節が開いた!!「${node.name}」 → ${txt}`);
    }
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
  // 賢者の石(v11・四重スリット装置のレア報酬)。S5で消費(創世/固定化)。負値も可。
  stones() { return this.state.stones || 0; },
  addStone(n) {
    this.state.stones = Math.max(0, (this.state.stones || 0) + n);
  },
  // ---------------- S5-a: 賢者の石=特性の創世(genesis付与) ----------------
  // 血統に無い新特性を石で1つ創世(繁殖では生まれない=石だけが新特性の入口・§16.1)。tier連動コスト・上限3・重複なし・レジェンダリー除外。
  stoneGenesisCost(tier) { return CFG.stoneGenesisBase + (tier || 1); }, // レア特性(tier高)ほど多くの石
  hasTrait(lz, key) { return !!(lz.traits && lz.traits.some((t) => (t && t.key ? t.key : t) === key)); },
  // この個体に創世できる特性key(未所持・上限3未満・非レジェンダリー時)。石不足でも候補は返す(UIはグレー表示)。
  //   ★V6-P1-2(Ric裁定 2026-08-09): 合成の撤廃にともない、旧・合成専用6種(tier6)も**創世で到達可能**にした。
  //     除外していると「存在するのに獲得できない」が生まれる(Ricの規律に抵触)。規律が禁じたのは**到達不能**であって
  //     低確率ではないため、プールには入れたうえで**重みを極小**にして希少性を保つ(traitGenesisWeight)。
  createableTraits(lz) {
    if (!lz || lz.morphId === "legendary" || typeof TRAITS === "undefined") return [];
    if ((lz.traits || []).length >= CFG.traitMaxPerLizard) return [];
    return Object.keys(TRAITS).filter((k) => !this.hasTrait(lz, k));
  },
  // 乱択創世の重み。tier6(旧・合成専用)だけ極小=「極小確率を引き当てた証」。★CFGで[A]調整可。
  traitGenesisWeight(key) {
    const t = typeof TRAITS !== "undefined" && TRAITS[key];
    if (!t) return 0;
    return t.tier >= 6 ? (CFG.traitGenesisT6Weight != null ? CFG.traitGenesisT6Weight : 0.1) : 1;
  },
  // R5-a(2026-07-25承認): 創世のランダム化。プール=createableTraits(基本12の未所持・上限3・レジェ除外=血統重複なしの既存仕様継承)。
  // 一様抽選×正規乱数(遺伝と同じ窓口)。コスト=一律CFG.stoneGenesisRandCost(結果を知らずに払うため定額)。戻り値=宿ったkey(UIがFx完了時に開示)。
  genesisTraitRand(lz, silent) {
    const pool = this.createableTraits(lz);
    if (!pool.length) { if (!silent) UI.toast(lz && lz.morphId === "legendary" ? "レジェンダリーには特性を宿せない" : "これ以上は特性を宿せない(上限)", true); return false; }
    const cost = CFG.stoneGenesisRandCost || 4;
    if (this.stones() < cost) { if (!silent) UI.denyFlash("stones"); return false; }
    this.addStone(-cost);
    // ★重み付き抽選(V6-P1-2): tier6 は traitGenesisWeight で極小。それ以外は等価=従来の一様抽選と同じ体感。
    let wsum = 0;
    for (const k of pool) wsum += this.traitGenesisWeight(k);
    let r = Math.random() * wsum, key = pool[pool.length - 1];
    for (const k of pool) { r -= this.traitGenesisWeight(k); if (r <= 0) { key = k; break; } }
    lz.traits = lz.traits || [];
    lz.traits.push({ key });
    // 深紅の錬成(開示はUIがFx完了時に)。tier6を引いた瞬間だけ強度を上げる=格を演出で立てる(演出は増やさない)
    this.genesisFx(lz.x, lz.y, TRAITS[key] && TRAITS[key].tier >= 6 ? (CFG.genesisFxT6Mult || 1.6) : 1);
    return key;
  },
  // 指名創世(R5-aで選択UIは撤去済=プレイヤー導線なし)。テスト/検証のフィクスチャ用の内部APIとして残置。
  genesisTrait(lz, key, silent) {
    if (!lz || lz.morphId === "legendary") { if (!silent) UI.toast("レジェンダリーには特性を宿せない", true); return false; }
    if (typeof TRAITS === "undefined" || !TRAITS[key]) return false;
    lz.traits = lz.traits || [];
    if (lz.traits.length >= CFG.traitMaxPerLizard) { if (!silent) UI.toast("これ以上は特性を宿せない(上限)", true); return false; }
    if (this.hasTrait(lz, key)) return false;
    const cost = this.stoneGenesisCost(TRAITS[key].tier);
    if (this.stones() < cost) { if (!silent) UI.denyFlash("stones"); return false; }
    this.addStone(-cost);
    lz.traits.push({ key });
    this.genesisFx(lz.x, lz.y); // 創世の瞬間(深紅の錬成・§S5演出)
    return true;
  },
  // 創世/固定化の局所演出データ(表現層がdrawGenesisFxで描く。reduced-motionは描画側で即時定着=非描画)。
  //   mult=強度倍率(既定1)。tier6の創世だけ 1.6 倍(V6-P1-2)。演出の種類は増やさず既存の深紅の錬成の枠内で厚くする。
  genesisFx(x, y, mult) {
    this._genesisFx = this._genesisFx || [];
    const sec = (CFG.genesisFxSec || 1.5) * (mult || 1);
    if (this._genesisFx.length < 8) this._genesisFx.push({ x, y, t: sec, max: sec, k: mult || 1 });
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

  // R3(2026-07-25): アメジストで繁殖CDをリセット(CD残時間のクリアのみ=繁殖ロジック/確率非接触・可逆)
  amethystCdReset(lz) {
    if (!lz || !(lz.breedCd > 0)) return false;
    const cost = CFG.amethystCdResetCost || 2;
    if (this.ore("amethyst") < cost) { UI.toast(`アメジストが${cost}個必要`, true); return false; }
    this.addOre("amethyst", -cost);
    lz.breedCd = 0;
    UI.toast(`${Icon.svg("amethyst")} クールダウンが解けた — ${this.lizardName(lz)}は再び繁殖できる`);
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
    if (this.state.coins < cost) { UI.denyFlash("coins"); return false; }
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
    if (s.coins < cost) { UI.denyFlash("coins"); return false; }
    s.coins -= cost;
    s.devLv = (s.devLv || 0) + 1;
    this.notice(`惑星開発 Lv${s.devLv}`, "生産+2%・エネルギー増"); // §9-C4
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
    this.spawnFx(lz.x, lz.y, lz.hue, true); // §9: 突然変異=その場の登場エフェクト(姿が変わった個体を位置で示す)
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
      t *= 0.4;
    }
    return t;
  },

  unlockedStages() {
    return STAGES.filter((st) => this.state.rank >= st.rank);
  },
  currentStage() {
    // Phase10: 明示選択(stageSel)の惑星のみ。★自動で最新へジャンプしない(自動移行=遺伝子汚染の根源を除去)。
    //   移動はプレイヤーがマップから selectStage で行う(colony正しく入替・引き継ぎなし)。既定=アリド(STAGES[0])。
    const sel = STAGES.find((st) => st.id === this.state.stageSel);
    if (sel && this.state.rank >= sel.rank) return sel;
    return STAGES[0];
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
      if (r && r.eff && r.eff[key]) v += r.eff[key]; // effなし研究(レシピ解読等)はボーナス0(無ガードだと購入後にTypeError=§5vvv)
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
    this.corpse = null;   // 死に様も破棄: 姿は現在の惑星から解決されるため、跨いで残ると別惑星の姿で描かれる
    this.event = null; this.selectedId = null;

    // §5nnn(2026-07-24 Ric承認): 惑星切替時のルーレット球残留対策 — 旧惑星遺伝子を乗せた球が
    // 新惑星で着地し他惑星種の卵を生む混入窓(1〜2秒)を閉じる。報酬機会は失わせない(損失感ゼロ):
    // 未発射remaining+飛翔中球数を控え、切替完了後に新コロニーの代表遺伝で再セッション化して全数返却する。
    // 聖域非接触=盤の確率・幾何には触れず、放出器(startReward)を正規APIで再始動するだけ。
    let rewardBack = null;
    if (typeof Roulette !== "undefined" && Roulette.reward && typeof Roulette.reward.remaining === "number") {
      const flying = Array.isArray(Roulette.balls) ? Roulette.balls.length : 0;
      const back = (Roulette.reward.remaining || 0) + flying;
      if (back > 0) rewardBack = { back, mode: Roulette.reward.jackpotMode };
      Roulette.endReward(); // reward+飛翔球をクリア(resetはrewardを残すためendRewardを使う)
    } else if (typeof Roulette !== "undefined" && Array.isArray(Roulette.balls) && Roulette.balls.length) {
      Roulette.balls.length = 0; // 報酬外の残留球(理論上ない=発射は報酬モード専用)も念のため排出
    }

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
    s.nest = tgt.nest || { lv: 1 };
    s.exploration = tgt.exploration || null;
    for (const f of FACILITIES) if (s.facilities[f.id] === undefined) s.facilities[f.id] = 0;
    for (const lz of s.lizards) this.ensureRuntime(lz);
    if (!s.nextRaid) this.rollNextRaid();
    this.settleDisplay(); // 3.12.2: 惑星切替で表示20を即確定(移動先が大コロニーでもfps安定)

    // §5nnn: 控えた報酬機会を新コロニーの代表遺伝(=純血)で全数返却(rouletteRepGeneは空コロニーでもnull安全)
    if (rewardBack && typeof Roulette !== "undefined" && Roulette.startReward) {
      Roulette.startReward(rewardBack.back, this.rouletteRepGene(), rewardBack.mode);
      UI.toast(`${Icon.svg("spark")} 報酬の球${rewardBack.back}発はこの惑星で撃ち直せる(持ち越し)`);
    }

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
    this._badgeDex = true; // §9-C4 図鑑ボタンに新着ドット(見るまで消えない)。トーストは撤廃=新種は図鑑を開けば分かる
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
  //   cricketOnly=true(巣の自動給餌など非クランク経路): コオロギ切れならGoldを使わず停止。
  //     ★Gold換算補充は「クランク稼働時のプレイヤーの選択(切れ時トグルOFF)」のみ=自動給餌でGoldを引かない(バグ根治)
  acquireFeedUnit(silent, cricketOnly) {
    if ((this.state.crickets || 0) >= 1) { this.state.crickets -= 1; return true; }
    if (cricketOnly) return false; // 非クランク自動給餌: コオロギ切れ=Gold消費せず停止
    const d = this.ensureDial();
    if (d.stopOnEmpty || this.state.coins < CFG.feedGoldCost) {
      if (!silent) UI.toast(d.stopOnEmpty ? "コオロギ切れ(自動停止中)。購入するか切れ時トグルをOFFに" : "Goldが足りない!", true);
      return false;
    }
    this.state.coins -= CFG.feedGoldCost; // OFF: Gold換算補充(在庫±0で1匹ぶん消費)。クランク稼働時のみ
    return true;
  },

  feed(lz, silent, cricketOnly) {
    if (lz.injuredT > 0) {
      if (!silent) UI.toast("負傷中は食べられない…", true);
      return false;
    }
    if (!this.acquireFeedUnit(silent, cricketOnly)) return false; // V5.2: コオロギ(or 切れ時Gold換算=クランクのみ)を1消費
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

  // 切れ時トグル(stopOnEmpty): ON=コオロギが尽きたら給餌を止める(安全) / OFF=Goldで換算補充して継続。
  //   ★既定はON(Ric裁定 2026-07-29)。旧既定OFFでは、在庫が尽きた後もオート給餌が**無音でGoldを溶かし続けた**
  //     (実測: 在庫0・個体10匹・高レートで約500G/秒)。既定は安全側に置き、OFFは上級者の意図的な選択とする。
  //   OFFのままにしたい人は1タップで戻せる=可逆。既存セーブの一度きりの移行は migrateStopOnEmpty() が行う。
  ensureDial() {
    if (!this.state.dial) this.state.dial = { auto: false, rate: 1, stopOnEmpty: true };
    if (this.state.dial.stopOnEmpty === undefined) this.state.dial.stopOnEmpty = true;
    return this.state.dial;
  },

  // ---- オープニング(C2 HOLO BRIEFING)の再生済みフラグ ----
  //   置き場所=dial の中(§5z-3 と同じ理由: dial は toWorld/applyWorld を丸ごと往復するため、
  //   保存の追加配線なしで永続化される。ルート直下に置くと toWorld が組み直す際に脱落し、毎回流れてしまう)。
  //   ★このフラグ自体が 0→1 の単調ゲートなので、切れ時トグル(emptyDefaultOnV1)のような副フラグは要らない
  //     =「一度きり」が構造的に保証される。SAVE_VERSION は上げない(dial内キーの単調追加のみ)。
  //   保存状態の知識はルール層(ここ)だけが持つ。演出層(holo.js)はフラグを知らない。
  OPENING_SEEN_KEY: "holoPlayed",
  openingSeen() { return !!this.ensureDial()[this.OPENING_SEEN_KEY]; },
  markOpeningSeen() {
    const d = this.ensureDial();
    if (d[this.OPENING_SEEN_KEY]) return false;   // 冪等(再視聴では何も起きない)
    d[this.OPENING_SEEN_KEY] = 1;
    this.save();
    return true;
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
    let count = (CFG.roulRewardBalls && CFG.roulRewardBalls[t]) || CFG.roulRewardBalls[0];
    if (isElite) count += (CFG.roulRewardEliteBonus || 0); // Phase10.3: 大ボスは出球が増える(報酬が厚い)
    // §1.2.2: 大ボス(elite)=虹レアポケット(新種) / 通常ボス=レアポケット(レア卵)。盤geometryは共通
    const mode = isElite ? "rainbow" : "rare";
    Roulette.startReward(count, this.rouletteRepGene(), mode);
    this.bossReward = { tier: t, count, mode, gems: 0, amethyst: 0, stones: 0 }; // R2-1: 鉱物集計(演出用・非保存・runtime)
    if (typeof UI !== "undefined" && UI.openBossReward) UI.openBossReward(this.bossReward);
    return true;
  },

  // 3.11.1: トカゲ売却は廃止(倫理観)。lizardSellPriceは価値評価としてのみ残す(捕食対象の選定等)

  healWithGem(lz) {
    if (this.state.gems < 1) return UI.denyFlash("gems");
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
    if (this.state.coins < cost) { if (!silent) UI.denyFlash("coins"); return false; }

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

  // 【撤廃(Ric裁定 2026-07-29)】クイック繁殖(quickBreedScore/quickBreedPick/quickBreed)はここにあった。
  //   手動での掛け合わせがゲームUXの核につき、自動選出の機構ごと廃止。再実装禁止。実行経路は Game.breed のみ。

  // ★「敵の名前」の単一の解決口(姿の Render.bossDrawName と対・Ric裁定 2026-07-29)。
  //   r は raid / nextRaid / corpse のいずれでもよい({typeId, boss} があれば解決できる)。
  //   ボスなら現在の惑星の署名名。**姿の解決と同じ条件(bossなら常に署名)**にすることで、
  //   「姿は署名なのに名前は汎用(ダイジャ)」というズレが生まれない(pre-R30の案Bでも一致する)。
  //   ★案C(Ric裁定 2026-08-01): **非ボスの通常襲来も惑星固有**にした(その惑星の主の「幼体」)。
  //     従来は蛇の階級名(アオダイショウ等)を出しており、序盤の襲来の8割が汎用敵になっていた。
  //     判定条件は姿(Render.planetBossDraw)と**完全に同じ=その惑星に署名があるか**だけ。
  //     こうしておかないと「姿は幼体なのに名前はアオダイショウ」というズレが再発する。
  //     署名の無い惑星(将来の追加惑星)は従来の汎用名へフォールバックする。
  bossDisplayName(r) {
    if (!r) return "";
    const st = this.currentStage && this.currentStage();
    const pb = (typeof PLANET_BOSS !== "undefined") && st && PLANET_BOSS[st.id];
    if (pb) {
      if (r.boss && pb.name) return pb.name;
      if (!r.boss && pb.minion) return pb.minion;
    }
    if (r.typeId === "snake" && r.snakeTier && r.snakeTier.name) return r.snakeTier.name;
    const t = r.type || (typeof bossTypeById === "function" ? bossTypeById(r.typeId) : null);
    return (t && t.name) || "";
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
    // 特性(S4): 子がレジェンダリーなら特性なし(①・§16.4)。それ以外は両親からの組み替え(genesis限定=血統外は出さない)。
    const traits = morphId === "legendary" ? [] : this.inheritTraits(a, b);
    return {
      speciesId, morphId,
      hue: clamp(((a.hue + b.hue) / 2 + rnd(-15, 15) + 360) % 360, 0, 359),
      sat: clamp((a.sat + b.sat) / 2 + rnd(-8, 8), 5, 100),
      light: clamp((a.light + b.light) / 2 + rnd(-6, 6), 12, 85),
      pattern: Math.random() < 0.5 ? a.pattern : b.pattern,
      traits,
    };
  },

  // 特性の遺伝(S4・trait_system §9/§16 genesis限定): 子の特性は両親の特性の和集合"のみ"から選ばれる。
  //   血統に無い新特性は繁殖では発生しない(=賢者の石だけが新特性の入口・§16.1)。→ 突然変異は「石限定」を採用(繁殖ミューテーションなし)。
  //   各特性は独立確率p(内部tierに反比例=希少ほど伝わりにくい)で発現→複数同時継承は各pの積で指数的に困難(やり込み)。上限=traitMaxPerLizard。
  //   レジェンダリー親(①)は伝播元にならない(和集合に寄与しない)。乱数は単一窓口rng(既定Math.random・テストはseed注入で決定論=fable2)。
  inheritTraits(a, b, rng) {
    rng = rng || Math.random;
    const src = [], fixed = {};
    for (const parent of [a, b]) {
      if (!parent || parent.morphId === "legendary") continue; // レジェンダリーは伝播元にならない
      const has = {};
      for (const t of parent.traits || []) { const k = t && t.key ? t.key : t; if (k) { src.push(k); has[k] = 1; } }
      // S5-b 固定化: その親が"実際に持つ"固定特性のみ有効(genesis限定=無からは生めない)
      for (const k of parent.fixedTraits || []) { if (has[k]) fixed[k] = 1; }
    }
    // 和集合(keyで一意化・TRAITSに実在するもののみ=血統外/不正keyを排除)
    const seen = {}, union = [];
    for (const k of src) { if (!seen[k] && typeof TRAITS !== "undefined" && TRAITS[k]) { seen[k] = 1; union.push(k); } }
    // 固定特性は p 計算を迂回して必ず継承(100%・rng不使用=決定論)。残りは各特性を独立に確率判定(積の性質)。上限まで切り詰め(固定を優先)。
    const out = [];
    for (const k of union) if (fixed[k]) out.push({ key: k });
    for (const k of union) {
      if (fixed[k]) continue;
      const def = TRAITS[k];
      const p = clamp(CFG.traitInheritBase - ((def.tier || 1) - 1) * CFG.traitTierPenalty, CFG.traitInheritFloor, 1);
      if (rng() < p) out.push({ key: k });
    }
    return out.slice(0, CFG.traitMaxPerLizard);
  },
  // ---------------- S5-b: 賢者の石=固定化(遺伝確率p→1.0) ----------------
  // クリア後解禁の天井。個体が"持つ"特性を1つ「必ず子へ渡る」に印(fixedTraits・additive)。両親に固定→2枚持ちが確定(601回の錬金ショートカット)。
  fixUnlocked() { return !!(this.state.rocket && this.state.rocket.done); }, // ロケット完成=クリア(§終盤解禁・純血の種移動解禁と同一貫性)
  stoneFixCost(tier) { return CFG.stoneFixBase + (tier || 1) * CFG.stoneFixPerTier; },
  isFixed(lz, key) { return !!(lz.fixedTraits && lz.fixedTraits.indexOf(key) >= 0); },
  // 固定できる特性key = その個体が持つ特性のうち未固定のもの(genesis限定=持たない特性は固定できない)
  fixableTraits(lz) {
    if (!lz || lz.morphId === "legendary" || !lz.traits) return [];
    return lz.traits.map((t) => (t && t.key ? t.key : t)).filter((k) => TRAITS[k] && !this.isFixed(lz, k));
  },
  fixTrait(lz, key, silent) {
    if (!this.fixUnlocked()) { if (!silent) UI.toast("固定化はクリア後に解禁される", true); return false; }
    if (!lz || lz.morphId === "legendary" || !this.hasTrait(lz, key)) return false; // 持つ特性のみ(genesis限定)
    if (this.isFixed(lz, key)) return false;
    const cost = this.stoneFixCost(TRAITS[key].tier);
    if (this.stones() < cost) { if (!silent) UI.denyFlash("stones"); return false; }
    this.addStone(-cost);
    lz.fixedTraits = lz.fixedTraits || [];
    lz.fixedTraits.push(key);
    this.genesisFx(lz.x, lz.y); // 固定も錬成の一種(同じ深紅の演出)
    return true;
  },
  // ---------------- 本部=デスク群の鉱石投資(hq_lab v2.0 §5.3 案B・Ric承認・additive保存) ----------------
  // 「鉱石を投じるのみで設備が育つ」。labInvest={desks:n}を保存(未定義=0=後方互換・bump不要)。rankには一切触れない(禁じ手)。
  labInvestLv(key) { return (this.state.labInvest && this.state.labInvest[key]) || 0; },
  labInvestCost(key) { // 次の1段の鉱石コスト(CFG)。null=最大到達
    const table = CFG.labInvestCosts && CFG.labInvestCosts[key];
    return (table && table[this.labInvestLv(key)]) || null;
  },
  labInvestPay(key, silent) {
    const cost = this.labInvestCost(key);
    if (!cost) return false;
    for (const ore in cost) if (this.ore(ore) < cost[ore]) { if (!silent) UI.toast("鉱石が足りない(巣ネットワークが運んでくる)", true); return false; }
    for (const ore in cost) this.addOre(ore, -cost[ore]);
    this.state.labInvest = this.state.labInvest || {};
    this.state.labInvest[key] = this.labInvestLv(key) + 1;
    return true;
  },

  // ---------------- 合成=トランスミュート(§8・案B=昇華) ----------------
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

  // R2-1(2026-07-25): 遺伝子ルーレット報酬改定 — 卵撤廃・鉱物報酬へ(Ric裁定=卵の供給過多の抑制)。
  // 物理・盤面・虹確率=聖域(roulette.js非接触)。差し替えは景品「解決」層のみ。旧卵経路4本の獲得可能性は
  // R2-0監査で代替実証済(audit H節=繁殖/隕石/アメジストで全数到達・塞がりゼロ)。旧卵ヘルパー群はgit記録。
  //   通常ボス(mode"rare"):   景品帯=◇ダイヤ / 虹中央=⬡アメジスト
  //   大ボス(mode"rainbow"): 景品帯=⬡アメジスト / 虹中央=●賢者の石
  // 量=CFG.roulPrizeNormal/Elite(★たたき台)。球数=既存CFG.roulRewardBalls(tier連動)+eliteBonusを流用。
  spawnRoulettePrize(outcome) {
    const center = !!(outcome && outcome.rainbow);
    const mode = (outcome && outcome.mode) || "rare";
    const table = mode === "rainbow" ? (CFG.roulPrizeElite || { win: { amethyst: 1 }, rainbow: { stones: 1 } })
      : (CFG.roulPrizeNormal || { win: { gems: 1 }, rainbow: { amethyst: 1 } });
    const prize = center ? table.rainbow : table.win;
    if (prize.gems) this.state.gems += prize.gems;
    if (prize.amethyst) this.addOre("amethyst", prize.amethyst);
    if (prize.stones) this.addStone(prize.stones);
    if (this.bossReward) {
      this.bossReward.gems = (this.bossReward.gems || 0) + (prize.gems || 0);
      this.bossReward.amethyst = (this.bossReward.amethyst || 0) + (prize.amethyst || 0);
      this.bossReward.stones = (this.bossReward.stones || 0) + (prize.stones || 0);
    }
    if (center) { // 虹=稀な瞬間だけ静かに告げる(押し売りしない)
      UI.toast(mode === "rainbow" ? `${Icon.svg("stone")} 虹の中央 — 賢者の石を獲得!` : `${Icon.svg("amethyst")} 虹の中央 — アメジストを獲得!`);
    }
    return true;
  },


  instantHatch(idx) {
    const egg = this.state.eggs[idx];
    if (!egg) return;
    if (this.state.gems < 1) return UI.denyFlash("gems");
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
    lz.x = 400 + rnd(-46, 46); lz.y = 512 + rnd(-14, 22); // §8.12/§9: 卵の巣(NEST≈400,512)の近くに出現=どこで生まれたか位置で分かる
    if (egg.bonusLv) { lz.stage = "adult"; lz.level = 1 + egg.bonusLv; } // レア卵=高品質個体
    this.addLizard(lz);
    this.state.stats.hatched++;
    this.addRes("bio", CFG.resBioPerHatch);
    this.addRankXp(20);
    // §9-C2: 「〇〇が孵化した」テキストを撤廃し、誕生位置の登場エフェクトで見せる(どの個体がどこで生まれたか=位置で把握)
    if (egg.founder || egg.gift) {
      lz.founder = true; // 創始者/里帰りの祝福=血統マーク
      this.flashT = 0.6; this.slowmo = 1.0;
      this.popupBurst(lz.x, lz.y - 30);
      this.spawnFx(lz.x, lz.y, lz.hue, true); // 見逃さない強さ(創始者の冠は個体に恒久表示)
    } else if (egg.morphId === "legendary") {
      // §9(希望2): 伝説誕生は全画面撤廃。誕生位置に【見逃さない強さ】のエフェクト+虹色発光は永続(個体自体が恒久の見せ場)
      this.flashT = 0.9; this.slowmo = 1.2;
      this.popupBurst(lz.x, lz.y - 30);
      this.spawnFx(lz.x, lz.y, lz.hue, true);
      this.spawnFx(lz.x, lz.y, (lz.hue + 60) % 360, true); // 二重の虹リング=伝説の特別さ
    } else {
      this.spawnFx(lz.x, lz.y, lz.hue, !!egg.lucky); // 通常/ラッキー孵化=位置に登場エフェクト
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
      this.notice(`ランク ${s.rank}`, `上昇ボーナス +${fmt(bonus)}G`); // §9-C4 中央通知へ
      if (UI.rankUpFx) UI.rankUpFx(); // 軽(§6): 画面を占有しないその場リング
      // ショップ進化・自動補給の解禁 (GameExpansion_v2 ⑤)
      if (SHOP_TIERS.some((t) => t.rank === s.rank)) {
        this.notice("まとめ買い解放", `購入単位 ×${fmt(shopUnitsFor(s.rank)[1])}`);
      }
      if (s.rank === CFG.autoSupplyRank) {
        this.notice("自動補給 解禁", "ショップのトグルでON");
      }
    }
    // Phase10: 新惑星は自動移行しない。解放を通知しマップに新着バッジ(移動はプレイヤーがマップから手動)
    void prevStage;
    if (this.unlockedStages().length > prevUnlocked) {
      const st = this.unlockedStages().slice(-1)[0];
      this.notice(`新惑星「${st.name}」解放`, "マップから移住できる(自動では移動しない)", "boss");
    }
  },

  // Phase10: 未開拓の解放済み惑星があるか(マップの新着バッジ用。data駆動=常に正確・見るまで消えない)
  hasUnvisitedPlanet() {
    return this.unlockedStages().some((st) => { const d = this.stageData(st.id); return !d || !d.pioneered; });
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
    if ((r.cost.stones || 0) > this.stones()) { // §8.5: レシピ解読の後半は賢者の石を少量
      UI.toast("賢者の石が足りない(四重スリットの奇跡で手に入る)", true);
      return false;
    }
    this.addRes("science", -(r.cost.science || 0));
    if (r.cost.orichalcum) this.addOre("orichalcum", -r.cost.orichalcum);
    if (r.cost.stones) this.addStone(-r.cost.stones);
    s.coins -= r.cost.coins || 0;
    s.research[id] = true;
    this._badgeHq = true; // §9-C4 本部ボタンに新着ドット(研究完了・見るまで消えない)
    return true;
  },

  // ---------------- 味方 (GameExpansion_v2 ⑩) ----------------
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
    const stage = this.currentStage();
    let typeId = null;
    // Phase6: その惑星の署名脅威型を主役に(sigBossChance=1.0で実質100%)。minRank縛りは撤廃=その惑星の主は常に主。
    //   (pre-R30は上のtierDef無し分岐でtypeId=snake固定=案B。ここはR30+のtierボスのみ)
    const pb = (typeof PLANET_BOSS !== "undefined") && PLANET_BOSS[stage.id];
    if (pb && Math.random() < (CFG.sigBossChance != null ? CFG.sigBossChance : 1)) {
      if (bossTypeById(pb.threat)) typeId = pb.threat; // BOSS_TYPES.minRankは汎用pool専用として温存(グローバル非接触)
    }
    if (!typeId) {
      // 残りの確率 or 署名rank未達: 従来の重み抽選(汎用脅威型=毒/強奪/妨害等の変化)。ステージ専用敵は重み×2
      const stBosses = stage.bosses || [];
      const pool = BOSS_TYPES.filter((b) => s.rank >= b.minRank)
        .map((b) => ({ id: b.id, w: b.weight * (stBosses.includes(b.id) ? 2 : 1) }));
      let r = Math.random() * pool.reduce((a, b) => a + b.w, 0);
      typeId = "snake";
      for (const b of pool) { r -= b.w; if (r <= 0) { typeId = b.id; break; } }
    }
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
    hp *= CFG.bossHpMult;                         // 3.11.5: 全体調整枠(既定1.0・CFGで即調整)
    hp *= (CFG.bossHpMultByStage && CFG.bossHpMultByStage[this.currentStage().id]) || 1; // Phase6: 惑星別たたき台(味方が入った分)。★Ric実機で最終調整

    this.raid = {
      typeId: nr.typeId, type, boss: nr.boss, elite: nr.elite,
      tier: nr.tier, tierDef,
      snakeTier: snakeTierFor(s.rank),            // 蛇の見た目階級
      snake: {
        hp: Math.floor(hp), maxHp: Math.floor(hp),
        x: W + 80, y: type.flying ? 120 : SNAKE_HOME.y,
        arrived: false, phase: rnd(0, 6),
      },
      timeLeft: type.dur + (tierDef ? tierDef.tier * 2 : (nr.boss ? 15 : 0)),
      // フェンス先制+ミーアキャット+展望岩の早期警戒(飛行する鷹には効かない)
      stunT: nr.typeId === "hawk" ? 0 : this.facLv("fence") * 2 + this.facLv("observatory") * 0.8,
      // 初回攻撃: 通常は猶予2倍、ティアボスは1.2倍(中盤=歯応え / Phase8)
      biteT: (CFG.biteIntervalBase + this.facLv("fence")) * (tierDef ? 1.2 : 2),
      shake: 0, cutinT: tierDef && tierDef.cutin ? 1.2 : 0,
      webs: [], grabs: 0, stingN: 0, enraged: false,
      dive: null, recoverT: 0, animT: 0, fleeing: false, stolenEgg: null,
    };
    const label = `${nr.elite ? "Elite " : ""}${this.bossDisplayName(this.raid)}${nr.tier ? " T" + nr.tier : ""}`;
    // §9.2: ボス出現の全画面カットイン/トーストを撤廃。飼育槽中央の軽い通知のみ(タップ不要・自動フェード)
    if (typeof Render !== "undefined" && Render.showCenterNotice) {
      const boss = nr.boss || nr.tier;
      Render.showCenterNotice(boss ? `${label} 襲来` : `${this.bossDisplayName(this.raid)} 襲来`, boss ? (type.threat || "コロニーを守れ") : "コロニーを守れ", "boss");
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
      this.notice("敵が激昂!!", "攻撃が苛烈になる", "boss"); // §9-C1
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
          const failP = this.facLv("trap") * 0.035
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
      const spd = 130;
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
          this.notice("卵がさらわれる!", "逃げる前に撃墜しろ", "boss"); // §9-C1 盤上のカラス+卵は描画で見える
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
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(Math.random() * fs.length);
        const v = fs.splice(idx, 1)[0];
        if (!v) break;
        v.poisonT = CFG.poisonTime * this.poisonDurMult();
        this.popup(v.x, v.y - 20, "毒!", "#c07ae0"); // §9-C1 毒は個体の紫の明滅+この浮遊表示で見せる(トースト撤廃)
      }
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
    for (let i = 0; i < Math.min(count, targets.length); i++) {
      const idx = Math.floor(Math.random() * targets.length);
      const v = targets.splice(idx, 1)[0];
      v.injuredT = CFG.injuryTime;
      this.autotomize(v); // §9.1: テキスト通知でなく「尾を切って逃げる」で見せる(回復は尾の再生で伝わる)
    }
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
    this.notice("巣が張られた", burn ? "炎で焼ける・タップ連打でも" : "タップ連打でほつれる", "boss"); // §9-C1 ウェブは盤上に描画=軽い操作ヒントのみ
  },

  updateWebs(r, dt) {
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
        // V6-P1-1: 主を撃退した惑星を記録(称号「百獣の盟主」/ ミッションの条件。旧セーブは未定義=読み出し側でガード)
        (s.stats.bossPlanets || (s.stats.bossPlanets = {}))[this.currentStage().id] = 1;
        const gems = (1 + r.tier) * (r.elite ? 2 : 1);
        const sci = Math.ceil(r.tier / 2) + (r.elite ? 2 : 0);
        const bio = r.tier * 3;
        s.gems += gems;
        this.addRes("science", sci);
        this.addRes("bio", bio);
        msg = ` BOSS撃破! ${r.elite ? "Elite " : ""}${this.bossDisplayName(r)} T${r.tier} / +${fmt(coins)}G +ジェム${gems} +研究力${sci} +生態データ${bio}`;
        if (isBugger) msg += " / 侵略圧を押し返した!";
        this.addRankXp(r.elite ? 120 : 60);
      } else if (r.boss) {
        s.stats.bossWon++;
        const gems = 3 + Math.floor(s.rank / 5);
        s.gems += gems;
        this.addRes("science", 1);
        msg = ` 撃退! +${fmt(coins)}G +ジェム${gems} (ボス討伐!)`;
        this.addRankXp(100);
      } else {
        msg = ` 撃退! +${fmt(coins)}G`;
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
      this.notice(`${this.bossDisplayName(r)} 撃破`, msg, "boss"); // §9: 全画面撃破演出→中央の軽い通知(戦利品は報酬盤が見せる)
      this.popupBurst(r.snake.x, r.snake.y);
      this.motVictoryGather(r.snake.x, r.snake.y); // V5M-EX⑭: 撃破地点へ近くの数匹が寄る(数秒で散る)
      this.slowmo = 0.6; // 撃破スローモーション
      r.dyingT = 1.15; r.hitT = 0;
      this.corpse = r; // 死に様の描画専用スナップショット(§3.3。ロジックはraid=nullで即終了)
    } else {
      // 敵名は必ず単一の窓口を通す(署名化の追随漏れ=ID10でレリック・スフィンクスが「オオガラス」と名乗っていた)
      if (reason === "egg") this.notice("卵を奪われた", `${this.bossDisplayName(r)}が持ち去った`, "boss");
      else if (reason === "grab") this.notice("仲間がさらわれた", "時間で戻ってくる", "boss");
      else this.notice("敵は去った", "負傷者を回復させよう", "boss");
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

  // V5M-EX⑭: 勝利の集い。撃破地点(x,y)へ近くの数匹が寄って数秒で散る(イベント購読=fable1・表示のみ)。
  //   純装飾: tx/ty/wanderTの上書きのみ=既存の徘徊移動で歩いて集まり、gatherT経過で自然に散る。戦闘/経済非接触。
  motVictoryGather(x, y) {
    if (CFG.motGatherOn === false) return;
    const cands = this.state.lizards
      .filter((l) => this.isVisible(l) && !l.returning && l.injuredT <= 0 && l.stage === "adult"
        && Math.hypot(l.x - x, l.y - y) < (CFG.motGatherRadius || 360))
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))
      .slice(0, CFG.motGatherMax != null ? CFG.motGatherMax : 4);
    cands.forEach((l, i) => {
      const ang = (i / Math.max(1, cands.length)) * Math.PI * 2;
      l.spot = null; l._toSpot = null;
      l.tx = clamp(x + Math.cos(ang) * 52, FIELD.x1, FIELD.x2);
      l.ty = clamp(y + Math.sin(ang) * 30 + 12, FIELD.y1, FIELD.y2);
      l.wanderT = CFG.motGatherSec || 4;
    });
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
    UI.toast(`挑発した! すぐに来るぞ… (本日あと${this.bossCallRemaining()}回)`);
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

    // 解禁チェック(毎秒)
    this._allyT = (this._allyT || 0) + dt;
    if (this._allyT >= 1) {
      this._allyT = 0;
      // 【恒久設計方針・Ric裁定 2026-07-24(HANDOFF §5nnn)】給餌の自動化は「クランク経路(state.dial.auto→feedAll)」のみ。
      // 巣・施設・その他いかなる経路にも自動給餌を作らないこと。
      // ここには旧「§8.12 巣の自動給餌」があったが、523be66(餌場→巣統合)で駆動が nestLv()(最低1=常時ON)化し
      // 無操作でも毎秒発火する想定外の機構となったため撤廃した(ゲート復活ではなく機構ごと廃止)。再実装禁止。
      // 【恒久設計方針・Ric裁定 2026-07-29】繁殖の自動化も作らない。手動での掛け合わせがゲームUXの核であり、
      // 自動選出(クイック繁殖)と繁殖予約(autoBreed)はその体験を痩せさせるため機構ごと撤廃した。再実装禁止。
      // (旧「§8.12 繁殖予約(巣Lv5+)」がここにあった。state.autoBreed はセーブ互換のため残るが**もう読まない**)
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
    // §9.1 切り離された尾(くねって消える)の寿命
    if (this._autoTails) for (let i = this._autoTails.length - 1; i >= 0; i--) {
      this._autoTails[i].t -= dt;
      if (this._autoTails[i].t <= 0) this._autoTails.splice(i, 1);
    }
    // §9-C2 登場エフェクトの寿命
    if (this._spawnFx) for (let i = this._spawnFx.length - 1; i >= 0; i--) {
      this._spawnFx[i].t -= dt;
      if (this._spawnFx[i].t <= 0) this._spawnFx.splice(i, 1);
    }
    // S5: 創世エフェクトの寿命
    if (this._genesisFx) for (let i = this._genesisFx.length - 1; i >= 0; i--) {
      this._genesisFx[i].t -= dt;
      if (this._genesisFx[i].t <= 0) this._genesisFx.splice(i, 1);
    }
  },

  // §9-C2 登場エフェクト(孵化・誕生の位置把握・テキスト不要)。big=伝説/創始者級の見逃さない強さ
  spawnFx(x, y, hue, big) {
    this._spawnFx = this._spawnFx || [];
    if (this._spawnFx.length < 24) this._spawnFx.push({ x, y, hue: (hue == null ? 140 : hue), t: big ? 1.7 : 1.05, max: big ? 1.7 : 1.05, big: !!big, seed: Math.random() * 1000 });
  },

  // §9.1 自切: 尾を切り離す(魂の外のエフェクト=くねって注意を引き消える)+ボスと反対へ逃げる
  autotomize(v) {
    this._autoTails = this._autoTails || [];
    const dur = CFG.autoTailSec || 3.5;
    if (this._autoTails.length < 24) this._autoTails.push({ x: v.x, y: v.y - 2, hue: v.hue, sat: v.sat, light: v.light, morphId: v.morphId, t: dur, max: dur, seed: (v.id * 41) % 997 });
    const away = (this.raid && this.raid.snake && v.x >= this.raid.snake.x) ? 1 : -1; // 蛇は右=左へ逃げる
    v.tx = clamp(v.x + away * 260, FIELD.x1, FIELD.x2);
    v.ty = clamp(v.y + rnd(-24, 24), FIELD.y1, FIELD.y2);
    v.wanderT = Math.max(v.wanderT || 0, 3); v.moving = true;
    v.panicT = CFG.autoPanicSec || 1.4; // 直後は速く逃げて尾から離れる→以後は負傷で鈍足
  },

  // V5M: モーションの決定論ハッシュ(乱数不使用=スクショ/QA再現性・0..1)。
  //   fmix32(murmur3)=小さなid/バケット値でも一様(旧式は小入力で偏り実効率が名目の2倍超=実測で検出→差し替え)。
  motHash(a, b) {
    let h = (Math.imul(a, 0x9E3779B1) ^ Math.imul(b + 1, 0x85EBCA77)) >>> 0;
    h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B);
    h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  },

  // K くつろぎ状態(2026-07-26): 約半分の個体が移動を止めて休息。id+時刻で位相分散(全員が同時に動く/止まるを避ける)。
  //   快適な場所(暖spot/観測デッキ)で率up。緊急(戦闘/群れ警戒/帰巣/負傷/逃走)では休息しない=起き上がる。決定論・純装飾。
  relaxActive(lz) {
    if (CFG.motRelaxOn === false) return false;
    if (this.raid || lz.returning || lz.injuredT > 0 || lz.panicT > 0 || (lz._alertT || 0) > 0) return false;
    const cyc = CFG.motRelaxCycle || 44;
    const t = (this._motClock || 0) + (lz.id % 100) * (cyc * 0.61); // idで大きく位相をずらす(揃わない)
    const ph = (t % cyc) / cyc; // 0..1
    let ratio = CFG.motRelaxRatio != null ? CFG.motRelaxRatio : 0.5;
    if (lz.spot && (lz._spotPosture === "bask" || lz._spotPosture === "lookout")) ratio = Math.min(0.9, ratio + (CFG.motRelaxSpotBonus || 0.2)); // 快適な場所
    // W1-C4: 天候中はくつろぎ率が下がる(荒天ほど強く)。霧/光柱など穏やかな天候では逆に上がる。終息で自動復帰
    if (typeof Weather !== "undefined" && this._wx && this._wx.on) {
      const rm = (this._wx.def.react && this._wx.def.react.relaxMult != null) ? this._wx.def.react.relaxMult : 1;
      ratio = Math.max(0, Math.min(0.95, ratio * (1 + (rm - 1) * this._wx.k)));
    }
    return ph < ratio;
  },

  moveLizards(dt) {
    const snake = this.raid && this.raid.snake.arrived && !this.raid.type?.flying ? this.raid.snake : null;
    const webs = this.raid && this.raid.typeId === "spider" ? this.raid.webs.filter((w) => w.hp > 0) : [];
    // V5M: 表示クロック(モーション発生バケット用・純装飾=保存しない)。reduced-motionでは新モーションを発生させない。
    this._motClock = (this._motClock || 0) + dt;
    // W1: 表示層の天候状態(読み取り専用・保存しない)。描画/モーション接続の共通入力
    this._wx = (typeof Weather !== "undefined" && CFG.weatherOn !== false)
      ? Weather.now(this.currentStage().id, this._motClock) : null;
    const motOff = !!(typeof Motion !== "undefined" && Motion.reduced);
    for (const lz of this.state.lizards) {
      this.ensureRuntime(lz);
      if (!this.isVisible(lz)) continue; // さらわれ中・休憩中
      // §8.14: 巣へ帰還中は徘徊/戦闘を無視して巣口へ歩き、到達したら巣に入る(消える)。ワープ禁止=物理移動で入退場
      if (lz.returning) {
        lz.spot = null; lz._relaxing = false; // 帰巣中は居場所を離れる(姿勢解除・休息解除)
        lz._shedT = 0; lz._digT = 0; lz._folT = 0; lz._shedGo = false; // V5M: 帰巣は仕草より優先
        const n = this.nestEntryFor(lz); // §8.16: 割り当て入口へ歩く(動線分散)
        // 裁定③: ボス戦時の避難=①判定半径拡大(nestEntryRadius) ②避難速度別枠(nestFleeSpeedMult)
        // ③到達点分散(id決定論の横オフセット=出撃個体とすれ違わない別レーン)。通常時の出入りは従来どおり。
        const fleeing = !!this.raid;
        const arriveR = fleeing ? (CFG.nestEntryRadius || CFG.nestArriveR) : CFG.nestArriveR;
        const lane = fleeing ? (((lz.id * 7919) >>> 0) % (arriveR * 2)) - arriveR : 0;
        const dx = (n.x + lane) - lz.x, dy = (n.y + 10) - lz.y, dist = Math.hypot(dx, dy);
        // V5M-EX パートC(巣の出入り): 通常帰巣で入口の手前に来たら一瞬だけ振り返る(名残)。ボス避難時は省略(急ぐ)。
        if (!fleeing && CFG.motPeekOn !== false && !(typeof Motion !== "undefined" && Motion.reduced)) {
          if (lz._peekT > 0) {
            lz._peekT -= dt; lz.moving = false;
            lz.angle = Math.atan2(-dy, -dx); // 巣に背を向けて外を見る
            lz.x = clamp(lz.x, 20, W - 20); lz.y = clamp(lz.y, FIELD.y1 - 30, H - 20);
            continue;
          }
          if (!lz._peekedTrip && dist > arriveR && dist < arriveR + (CFG.motPeekBand || 34)
            && this.motHash(lz.id * 59 + 17, Math.floor((this._motClock || 0))) < (CFG.motPeekRate || 0.4)) {
            lz._peekedTrip = true; lz._peekT = CFG.motPeekSec || 0.6; continue;
          }
        }
        if (dist < arriveR) { lz.returning = false; lz.resting = true; lz.restedAt = Date.now(); lz.moving = false; this.refreshCrowdScale(); continue; }
        const spd = CFG.nestWalkSpeed * (fleeing ? (CFG.nestFleeSpeedMult || 3.5) : 1) * dt;
        lz.x += (dx / dist) * Math.min(spd, dist); lz.y += (dy / dist) * Math.min(spd, dist);
        lz.angle = Math.atan2(dy, dx); lz.moving = true;
        lz.x = clamp(lz.x, 20, W - 20); lz.y = clamp(lz.y, FIELD.y1 - 30, H - 20);
        continue;
      }
      if (lz.panicT > 0) lz.panicT -= dt; // §9.1 自切直後の逃走ダッシュ
      if (lz.panicT > 0 || lz.injuredT > 0) { lz.spot = null; lz._toSpot = null; } // 逃走/負傷中は居場所に留まらない
      if (lz._relaxing && !this.relaxActive(lz)) { lz._relaxing = false; lz.wanderT = Math.min(lz.wanderT, 0); } // K: 緊急(ボス/群れ警戒等)で休息を即解除→起き上がる
      if (lz._meetCd > 0) lz._meetCd -= dt; // V5M⑫: 見合いのクールダウン
      if (lz._dashT > 0) lz._dashT -= dt;   // V5M⑦: 疾走窓の残り
      if (lz._shedT > 0) { const was = lz._shedT; lz._shedT -= dt; if (lz._shedT <= 0 && was > 0 && CFG.motShakeOn !== false && !this.raid && !(typeof Motion !== "undefined" && Motion.reduced)) lz._shakeT = CFG.motShakeDur || 0.6; } // V5M⑤脱皮→E3ぶるっと(脱皮終了の瞬間に発火)
      if (lz._shakeT > 0) lz._shakeT -= dt;  // E3: 全身ぶるっとの残り
      if (lz._skyT > 0) lz._skyT -= dt;      // W1: 見上げ姿勢の残り
      if (lz._emergeThruT > 0) lz._emergeThruT -= dt; // 裁定F: 出巣直後のすり抜け窓
      if (lz._digT > 0) lz._digT -= dt;     // V5M⑩: 砂掘りの残り
      if (lz._folT > 0) lz._folT -= dt;     // V5M⑬: 追従の残り
      if (lz.panicT > 0 || lz.injuredT > 0) { lz._shedT = 0; lz._digT = 0; lz._folT = 0; lz._shakeT = 0; } // 逃走/負傷で仕草は中断
      // V5M⑬: ベビー追従の実行(対象の後方を歩いて追う・対象が消えたら解除)
      if (lz._folT > 0) {
        const tgt = this.state.lizards.find((r) => r.id === lz._folId);
        if (!tgt || !this.isVisible(tgt) || tgt.returning || this.raid) { lz._folT = 0; }
        else {
          lz.tx = clamp(tgt.x - Math.cos(tgt.angle) * 46, FIELD.x1, FIELD.x2);
          lz.ty = clamp(tgt.y - Math.sin(tgt.angle) * 26 + 12, FIELD.y1, FIELD.y2);
        }
      }
      lz.wanderT -= dt;
      if (lz._spotTravelT > 0) lz._spotTravelT -= dt;
      const fighting = snake && lz.stage === "adult" && lz.injuredT <= 0;
      if (fighting) {
        lz.spot = null; lz._toSpot = null; lz._relaxing = false; // 戦闘中は居場所より蛇へ群がる(姿勢/休息解除)
        if (lz.wanderT <= 0) { // 蛇の周囲に群がる
          lz.wanderT = rnd(0.4, 1.0);
          const ang = rnd(0, Math.PI * 2);
          const d = rnd(45, 90);
          lz.tx = snake.x + Math.cos(ang) * d;
          lz.ty = snake.y + Math.sin(ang) * d * 0.6;
        }
      } else if (lz._toSpot && lz.spot !== lz._toSpot && (lz._spotTravelT || 0) > 0 && lz.panicT <= 0) {
        // 調査J根治: スポットへ道中の個体は目的地を保持して到達させる(dwell切れの再抽選で遠い水場等へ辿り着けない問題)。
        //   到達(spot確定)まで再抽選しない。travelタイムアウトで諦め=無限追尾を防ぐ。純装飾=生産/戦闘の決定論に無影響。
        lz.wanderT = 0.5; // 次tickも道中判定へ(下の移動処理で歩き続ける)
      } else if (this._wx && this._wx.on && !this.raid && lz.stage === "adult" && (() => {
        // W1-C3: 荒天の避難。強度が weatherHuddleK を超えると、割当入口(動線分散)へ寄って身を寄せる。
        //   ボス避難(returning=true→resting)とは別枠: 巣には入らない=表示枠コントローラ(emerge/retreat)と競合しない。
        //   ボス襲来中は本分岐に入らない(戦闘の避難が最優先)。天候終息で自動的に通常徘徊へ戻る。
        const r = this._wx.def.react || {};
        if (!(r.huddle > 0) || this._wx.k < (CFG.weatherHuddleK || 0.55)) return false;
        if (this.motHash(lz.id * 83 + 41, this._wx.bucket) >= r.huddle) return false; // 個体の一部だけ(決定論)
        const n = this.nestEntryFor(lz);
        const lane = (((lz.id * 7919) >>> 0) % 60) - 30;
        lz.spot = null; lz._toSpot = null; lz._relaxing = false;
        lz.tx = n.x + lane; lz.ty = n.y + 26 + (((lz.id * 31) >>> 0) % 18);
        lz.wanderT = 0.4; lz._wxHuddle = true;
        return true;
      })()) {
        // (W1 荒天の避難=巣口へ寄る)
      } else if (lz.wanderT <= 0) { // 通常の徘徊 or 設備の居場所(スポット)へ
        // K くつろぎ(調査M改修): 休息個体は「その場凍結」でなく、まず快適なスポット(水/暖/岩)へ向かって"そこで"休む。
        //   凍結だと水飲み・設備利用が激減する(実測)→スポット誘導を優先し、届かなければ近場で留まる。設備が景色になる思想と整合。
        const relaxing = this.relaxActive(lz);
        // V5M⑦: 静→動ダッシュ(トカゲ特有の静→動)。決定論(idハッシュ+時刻バケット)・純装飾・走った後は長めの静止。
        const dashBk = Math.floor(this._motClock / 10);
        if (!relaxing && !motOff && CFG.motDashOn !== false && lz._motBk !== dashBk && this.motHash(lz.id, dashBk) < (CFG.motDashRate || 0.08)) {
          lz._relaxing = false;
          lz._motBk = dashBk;
          lz.spot = null; lz._toSpot = null;
          const da = this.motHash(lz.id * 3 + 1, dashBk) * Math.PI * 2;
          const dd = (CFG.motDashDist || 90) * (0.7 + this.motHash(lz.id * 5 + 2, dashBk) * 0.6);
          lz.tx = clamp(lz.x + Math.cos(da) * dd, FIELD.x1, FIELD.x2);
          lz.ty = clamp(lz.y + Math.sin(da) * dd * 0.6, FIELD.y1, FIELD.y2);
          lz._dashT = 2.0; // 疾走窓(到達で自然停止・余りは自然減衰)
          lz.wanderT = CFG.motDashRestSec || 5; // 走った直後はじっとする(静→動→静のリズム)
          const dx0 = lz.tx - lz.x, dy0 = lz.ty - lz.y;
          if (Math.hypot(dx0, dy0) > 4) { lz.angle = Math.atan2(dy0, dx0); }
        } else if ((() => {
          // V5M⑬: ベビー追従(決定論)。ベビーが近くのアダルトの後を数秒だけついて歩く。
          if (motOff || CFG.motFollowOn === false || lz.stage !== "baby") return false;
          const fb = Math.floor(this._motClock / (CFG.motFollowWin || 30));
          if (lz._folBk === fb || this.motHash(lz.id * 17 + 8, fb) >= (CFG.motFollowRate || 0.12)) return false;
          const ad = this.state.lizards.find((r) =>
            r !== lz && r.stage === "adult" && !r.returning && r.injuredT <= 0 && this.isVisible(r)
            && Math.hypot(r.x - lz.x, r.y - lz.y) < 300);
          if (!ad) return false;
          lz._folBk = fb;
          lz._folId = ad.id; lz._folT = CFG.motFollowSec || 6;
          lz.spot = null; lz._toSpot = null;
          lz.wanderT = lz._folT;
          return true;
        })()) {
          // (⑬の追従開始)
        } else if ((() => {
          // V5M⑤: 脱皮の気配(決定論・稀)。近くの岩の際へ歩き、到着後は体を擦る(擦り=_poseBob/皮片=状態レイヤ)。
          if (motOff || CFG.motShedOn === false) return false;
          const sbk = Math.floor((this._motClock + (lz.id % 173) * 11) / (CFG.motShedWin || 1800));
          if (lz._shedBk === sbk || this.motHash(lz.id * 23 + 9, sbk) >= (CFG.motShedRate || 0.6)) return false;
          const bls = ((typeof Render !== "undefined" && Render._stageBoulders) || [])
            .filter((b) => b.r >= 14 && b.x > FIELD.x1 + 20 && b.x < FIELD.x2 - 20 && b.y > FIELD.y1 + 10 && b.y < FIELD.y2 - 10);
          let best = null, bd = 320;
          for (const b of bls) { const d = Math.hypot(b.x - lz.x, b.y - lz.y); if (d < bd) { bd = d; best = b; } }
          if (!best) return false;
          lz._shedBk = sbk;
          const side = this.motHash(lz.id * 31 + 11, sbk) < 0.5 ? -1 : 1;
          lz.spot = null; lz._toSpot = null;
          lz.tx = clamp(best.x + side * (best.r + 12), FIELD.x1, FIELD.x2);
          lz.ty = clamp(best.y + 8, FIELD.y1, FIELD.y2);
          lz._shedGo = true;
          lz.wanderT = (CFG.motShedDur || 8) + 8; // 歩き+擦りの滞在
          return true;
        })()) {
          // (⑤の岩寄り開始)
        } else if ((() => {
          // V5M⑩: 砂掘り(決定論・乾燥系惑星のみ)。その場で前脚を掻く(脚=既存位相の流用・飛沫=状態レイヤ)。
          if (motOff || CFG.motDigOn === false) return false;
          if (!(CFG.motDigStages || [1, 10]).includes(this.state.stageSel)) return false;
          const db = Math.floor(this._motClock / 8);
          if (lz._digBk === db || this.motHash(lz.id * 29 + 10, db) >= (CFG.motDigRate || 0.05)) return false;
          lz._digBk = db;
          lz.spot = null; lz._toSpot = null;
          lz.tx = lz.x; lz.ty = lz.y;
          lz._digT = CFG.motDigDur || 3;
          lz.wanderT = (CFG.motDigDur || 3) + 1;
          return true;
        })()) {
          // (⑩の掘り開始)
        } else if ((() => {
          // V5M⑮: レア個体の引力(決定論)。無印個体が、静止中の特性持ち/レジェンダリーの傍へ寄って数秒眺める。
          if (motOff || CFG.motRareOn === false) return false;
          if ((lz.traits && lz.traits.length) || lz.morphId === "legendary") return false; // 寄るのは無印
          const rb = Math.floor(this._motClock / (CFG.motRareWin || 60));
          if (lz._rareBk === rb || this.motHash(lz.id * 7 + 4, rb) >= (CFG.motRareRate || 0.08)) return false;
          const rare = this.state.lizards.find((r) =>
            r !== lz && !r.moving && !r.returning && r.injuredT <= 0 && this.isVisible(r)
            && ((r.traits && r.traits.length) || r.morphId === "legendary")
            && Math.hypot(r.x - lz.x, r.y - lz.y) < 420);
          if (!rare) return false;
          lz._rareBk = rb;
          const side = this.motHash(lz.id * 9 + 6, rb) < 0.5 ? -1 : 1;
          lz.spot = null; lz._toSpot = null;
          lz.tx = clamp(rare.x + side * 58, FIELD.x1, FIELD.x2);
          lz.ty = clamp(rare.y + 14, FIELD.y1, FIELD.y2);
          lz.wanderT = (CFG.motRareDwell || 5) + 1.5; // 歩き+眺めの滞在
          return true;
        })()) {
          // (⑮の目的地設定はクロージャ内で完了)
        } else {
        // モーション(§8.5): 一定確率で居場所へ向かう。くつろぎ個体はスポット誘導率を上げる(快適な場所で休む)。
        const chance = relaxing ? (CFG.spotVisitChanceRelax != null ? CFG.spotVisitChanceRelax : 0.75) : (CFG.spotVisitChance || 0);
        const goSpot = Math.random() < chance ? this.spotFor(lz) : null;
        if (goSpot) {
          const off = (lz.id * 2654435761) >>> 0; // 面の中の決定論オフセット(idで分散=固まらない)
          const ang = (off % 628) / 100, rad = (goSpot.radius || 12) * (0.15 + (off % 70) / 100);
          lz.tx = clamp(goSpot.center.x + Math.cos(ang) * rad, FIELD.x1, FIELD.x2);
          lz.ty = clamp(goSpot.center.y + Math.sin(ang) * rad, FIELD.y1 - 10, FIELD.y2);
          lz._toSpot = goSpot.id; lz._spotFacing = goSpot.facing; lz._spotPosture = goSpot.posture;
          lz._spotTier = goSpot.tier || 0; // H: 設備の成長段階(遊びモーションの解禁判定・読み取り専用)
          lz._spotTravelT = CFG.spotTravelSec || 14; // 調査J: この時間内はスポットへ道中を保持して到達させる
          lz._relaxing = false; // スポットへ向かう(到達後は姿勢=drink/baskで"そこで"休む)
          lz.wanderT = rnd(CFG.spotDwellMin || 3, CFG.spotDwellMax || 8); // 到着後この間は留まる
        } else if (relaxing) { // K: スポットへ行かない休息個体は近場で留まって休む(遠くへ徘徊しない)
          lz.spot = null; lz._toSpot = null; lz._relaxing = true;
          lz.tx = lz.x; lz.ty = lz.y;
          lz._relaxPose = ["lounge", "curl", "groom"][(lz.id + Math.floor((this._motClock || 0) / (CFG.motRelaxCycle || 44))) % 3];
          lz.wanderT = rnd(2, 4);
        } else { // 通常の徘徊: 自分の縄張り周辺をうろつく
          lz.spot = null; lz._toSpot = null; lz._relaxing = false;
          lz.wanderT = rnd(2.5, 7);
          if (Math.random() < 0.05) { // たまに縄張りを引っ越す
            lz.homeX = rnd(FIELD.x1 + 40, FIELD.x2 - 40);
            lz.homeY = rnd(FIELD.y1 + 20, FIELD.y2 - 20);
          }
          lz.tx = clamp(lz.homeX + rnd(-130, 130), FIELD.x1, FIELD.x2);
          lz.ty = clamp(lz.homeY + rnd(-90, 90), FIELD.y1, FIELD.y2);
        }
        } // V5M⑦: ダッシュ分岐の閉じ
      }
      const dx = lz.tx - lz.x, dy = lz.ty - lz.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 4) {
        // クモのウェブに絡まると減速
        let webMult = 1;
        for (const w of webs) {
          if (Math.hypot(lz.x - w.x, lz.y - w.y) < 60) { webMult = CFG.webSlow; break; }
        }
        // V5M⑦: 疾走窓中は速度倍率(純装飾・戦闘/逃走/負傷の既存速度は不変)
        const spd = (lz.panicT > 0 ? 105 : lz.injuredT > 0 ? 12 : fighting ? 110 : 45 * (lz._dashT > 0 ? (CFG.motDashSpeedMult || 2.6) : 1)) * webMult * dt;
        lz.x += (dx / dist) * Math.min(spd, dist);
        lz.y += (dy / dist) * Math.min(spd, dist);
        lz.angle = Math.atan2(dy, dx);
        lz.moving = true;
      } else {
        // V5M⑤: 岩の際へ到着=擦りの開始(皮片は状態レイヤ・擦りは_poseBob)
        if (lz._shedGo && lz.moving) { lz._shedGo = false; lz._shedT = CFG.motShedDur || 8; }
        // V5M⑧: 到着の瞬間にキョロキョロ(決定論・スポット/戦闘/負傷/擦り・掘り中では出ない)
        if (lz.moving && !motOff && CFG.motLookOn !== false && !lz._toSpot && !fighting && lz.injuredT <= 0
          && (lz._shedT || 0) <= 0 && (lz._digT || 0) <= 0) {
          const lb = Math.floor(this._motClock / 4);
          if (this.motHash(lz.id * 11 + 3, lb) < (CFG.motLookRate || 0.25)) { lz._lookT = CFG.motLookDwell || 3.0; lz._lookN = 0; }
        }
        lz.moving = false;
        if (lz._toSpot) { // 居場所へ到達=姿勢に入る(C3で描画)。向きはspot.facingへ寄せる
          lz.spot = lz._toSpot;
          lz._spotT = this._motClock; // V5M-EX パートC: 到達時刻(多段の姿勢=飲む→見上げ 等の位相基準・runtime専用)
          if (lz._spotFacing === "left") lz.angle = Math.PI;
          else if (lz._spotFacing === "right") lz.angle = 0;
        }
      }
      // V5M⑧: キョロキョロの実行(静止中に向きを2回反転=周囲を見る。移動/スポット入りで即解除)
      if (lz._lookT > 0) {
        if (lz.moving || lz.spot) { lz._lookT = 0; }
        else {
          const D = CFG.motLookDwell || 3.0;
          lz._lookT -= dt;
          const ph = D - Math.max(0, lz._lookT);
          // 到着後しばらく静止(freeze)→ゆっくり2回だけ向きを変える=爬虫類の「じっと見る間」。各向きを長く保持。
          const want = ph > D * 0.60 ? 2 : ph > D * 0.28 ? 1 : 0;
          if (want !== (lz._lookN || 0)) { lz._lookN = want; lz.angle = Math.PI - lz.angle; }
        }
      }
      // W1-C1b: 居場所(spot)に居る個体も天候には反応する(頭を上げるだけ・向きは spot の指定を壊さない)。
      //   実測(パートD)で「少数個体+くつろぎON」だと全個体がspotに居て見上げが0になったため追加。
      if (!motOff && !this.raid && this._wx && this._wx.on && lz.spot && !lz.moving && (lz._skyT || 0) <= 0) {
        const r2 = this._wx.def.react || {};
        const bk2 = Math.floor(this._motClock / (CFG.weatherLookBucketSec || 5));
        const rate2 = ((this._wx.phase === "rise" ? (r2.look || 0) : (r2.follow || 0)) * this._wx.k) * (CFG.weatherSpotLookMult || 0.6);
        if (lz._wxBk !== bk2 && rate2 > 0 && this.motHash(lz.id * 97 + 13, bk2) < rate2) { lz._wxBk = bk2; lz._skyT = CFG.weatherLookSec || 2.2; }
      }
      // V5M-EX⑯/⑲ + 第2波D4/D5: 環境への視線(向きだけ・読み取り専用)。静止中のみ。優先=盤>群れ警戒>波紋>向き替え。
      if (!motOff && !lz.moving && !lz.spot && (lz._lookT || 0) <= 0 && lz.injuredT <= 0) {
        // ⑯ ルーレット球の目線: 報酬盤が出ている間、下中央(盤のせり上がる位置)へ向く
        if (CFG.motGazeOn !== false && typeof UI !== "undefined" && UI._bossRewardOpen) {
          const bx = (FIELD.x1 + FIELD.x2) / 2, by = FIELD.y2 + 40;
          lz.angle = Math.atan2(by - lz.y, bx - lz.x);
        } else if (this._wx && this._wx.on && !this.raid && CFG.weatherOn !== false && (() => {
          // W1-C1/C2: 天候への反応。発生相=空(風上)を見上げる / 継続相=降下物を目で追う。
          //   既存⑯(盤への目線)と同じ「向きだけ・静止中のみ」の仕組みを流用=新規モーションを増やさない。
          const d = this._wx.def, r = d.react || {};
          const bk = Math.floor(this._motClock / (CFG.weatherLookBucketSec || 5));
          if (lz._wxBk === bk) return false;
          const rise = this._wx.phase === "rise";
          const rate = (rise ? (r.look || 0) : (r.follow || 0)) * this._wx.k;
          if (rate <= 0 || this.motHash(lz.id * 71 + 29, bk) >= rate) return false;
          lz._wxBk = bk;
          // 風上(粒子が流れてくる側)の斜め上を向く。上昇流(vy<0)の惑星は下から昇るものを追う
          const up = (d.vy || 0) < 0 ? 1 : -1;
          lz.angle = Math.atan2(up * 0.9, -(d.vx || 0) >= 0 ? 1 : -1);
          lz._skyT = CFG.weatherLookSec || 2.2;   // 見上げ姿勢の窓(描画側が頭を上げる)
          lz._alertT = Math.max(lz._alertT || 0, (CFG.weatherLookSec || 2.2) * 0.6); // 短く静止
          return true;
        })()) {
          // (W1 天候への視線)
        } else if (CFG.motHerdOn !== false && (() => {
          // D4 群れの同期・警戒: 近くで誰かがダッシュすると、こちらも顔を上げてそちらを向く(1匹の動きが伝播)
          const dasher = this.state.lizards.find((d) => d !== lz && (d._dashT || 0) > 0
            && Math.hypot(d.x - lz.x, d.y - lz.y) < (CFG.motHerdRadius || 200));
          if (!dasher) return false;
          lz.angle = Math.atan2(dasher.y - lz.y, dasher.x - lz.x);
          if (!(lz._alertT > 0)) lz._alertT = CFG.motHerdAlertSec || 1.2; // 短く警戒静止(徘徊を少し遅らせる)
          return true;
        })()) {
          // (D4 群れ警戒=向き+警戒タイマー)
        } else if (CFG.motRippleOn !== false && (() => {
          // ⑲ 波紋への注目: 近くで水を飲む個体を、ふと一瞥する(決定論の短い窓・一度きり)
          const rb = Math.floor(this._motClock / 6);
          if (lz._rippleBk === rb || this.motHash(lz.id * 53 + 16, rb) >= (CFG.motRippleRate || 0.3)) return false;
          const drinker = this.state.lizards.find((d) => d !== lz && d.spot && d._spotPosture === "drink"
            && Math.hypot(d.x - lz.x, d.y - lz.y) < (CFG.motRippleRadius || 110));
          if (!drinker) return false;
          lz._rippleBk = rb; lz.angle = Math.atan2(drinker.y - lz.y, drinker.x - lz.x);
          return true;
        })()) {
          // (⑲ 波紋=一瞥)
        } else if (CFG.motTurnOn !== false) {
          // D5 向き替えの多様化: 長く静止する個体が、ふと向きだけ変える(単発の反転=⑧の二連とは別の"気分")
          const tb = Math.floor(this._motClock / (CFG.motTurnWin || 14));
          if (lz._turnBk !== tb && this.motHash(lz.id * 89 + 23, tb) < (CFG.motTurnRate || 0.18)) {
            lz._turnBk = tb; lz.angle = Math.PI - lz.angle;
          }
        }
      }
      if (lz._alertT > 0) lz._alertT -= dt;
      lz.x = clamp(lz.x, 20, W - 20);
      lz.y = clamp(lz.y, FIELD.y1 - 30, H - 20);
    }

    // 分離: 重なり合いを防いで自然に分散させる(表示中の個体のみ・縮小時は距離も縮む)
    // 裁定F(2026-07-26): 巣口すり抜けの根治。「巣へ向かう/巣から出る」個体は相互回避を一時無効化=互いをすり抜けて通過。
    //   平時の徘徊個体の散らばりは不変(すり抜けフラグ=returning or 出巣直後の窓のみ)。判定基準/戦闘/避難ロジックは非接触。
    const thru = (l) => CFG.nestPassthroughOn !== false && (l.returning || (l._emergeThruT || 0) > 0);
    const arr = this.state.lizards.filter((l) => this.isVisible(l));
    const minD = 46 * this.crowdScale();
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      if (thru(a)) continue; // 巣の出入り中の個体は押し合いに参加しない(誰も押さない・誰にも押されない=すり抜け)
      for (let j = i + 1; j < arr.length; j++) {
        const b = arr[j];
        if (thru(b)) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < minD * minD && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = ((minD - d) / d) * 22 * dt;
          a.x -= dx * push * 0.5; a.y -= dy * push * 0.5;
          b.x += dx * push * 0.5; b.y += dy * push * 0.5;
          // V5M⑫: 見合い(すれ違いの一瞥)。両者が歩行中の近接ペアだけ・決定論・ペア毎クールダウン。
          //   一瞬止まって向き合い、meetSec後に既存の徘徊が自然再開(wanderT経由=新しい状態機械を作らない)。
          if (!motOff && CFG.motMeetOn !== false && !snake && a.moving && b.moving
            && !a.returning && !b.returning && a.injuredT <= 0 && b.injuredT <= 0
            && (a._meetCd || 0) <= 0 && (b._meetCd || 0) <= 0) {
            const mb = Math.floor(this._motClock / 5);
            if (this.motHash(a.id * 131 + b.id * 17, mb) < (CFG.motMeetRate || 0.10)) {
              for (const [p, q] of [[a, b], [b, a]]) {
                p.tx = p.x; p.ty = p.y; p.moving = false;
                p.wanderT = CFG.motMeetSec || 0.8;
                p.angle = Math.atan2(q.y - p.y, q.x - p.x);
                p._meetCd = CFG.motMeetCdSec || 60;
                p._lookT = 0; // 見合い中はキョロキョロと重ねない
              }
            }
          }
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
        this._badgeStats = true; // §9-C4 統計ボタンに新着ドット(称号解放・見るまで消えない)
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
      nest: { lv: 1 },
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
      nest: s.nest || { lv: 1 },
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
      headquarters: { rank: s.rank, rankXp: s.rankXp, labTankFloorV1: s.labTankFloor, research: s.research || {}, rocket: s.rocket || { stage: 0, invested: 0, done: false } },
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
      labInvest: s.labInvest || {},                              // hq_lab v2.0 §5.3案B: 本部設備の鉱石投資(additive・未定義={}=後方互換)
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

  // 切れ時トグルの既定ON化(Ric裁定 2026-07-29)。**一度きり**の移行。
  //   旧既定OFFのまま保存された人は、在庫が尽きた後もオート給餌が無音でGoldを溶かし続けていた
  //   (実測: 在庫0・個体10匹・高レートで約500G/秒)。既定値の変更だけでは
  //   **明示的な false が既に永続化されている**ため救われないので、1度だけ true へ反転する。
  //   ★以後はプレイヤーの選択を尊重する: フラグが立っていれば二度と触らない(OFFにし直せばOFFのまま)。
  //   バージョンは上げず、**dial 内へのフラグの単調追加**でゲートする(移行チェーン・バックアップ鍵に影響させない)。
  //   フラグを dial に置く理由: dial オブジェクトは toWorld/applyWorld を丸ごと往復するため、
  //   保存の追加配線なしで永続化される(=「一度きり」が構造的に保証される)。
  //   移行時に通知は出さない(気配だけ見せて説明しない)。
  migrateStopOnEmpty(w) {
    w.dial = w.dial || { auto: false, rate: 1 };
    if (w.dial.emptyDefaultOnV1) return w;    // 既に適用済み=二度と反転しない
    w.dial.emptyDefaultOnV1 = 1;
    if (w.dial.stopOnEmpty !== true) w.dial.stopOnEmpty = true;
    return w;
  },

  // V6-P1-2 ④: 実験用水槽の tier 駆動源を「解読済みレシピ数」→「HQ Lv(=ランク)」へ変えた。
  //   ★解読数とランクは決定論的に結びついていない(実測: 研究力は制約にならず、効くのはコイン)ため、
  //     どんなランドしきい値を選んでも一部のプレイヤーの tier は変わってしまう。
  //     そこで「しきい値で合わせる」のをやめ、**旧ロジックで算出した tier を下限として一度だけ記録**する。
  //     表示は max(記録された旧tier, 新tier) = **誰の水槽も下がらない**(上がるのは自然な成長のみ)。
  //   置き場所=headquarters の中(toWorld/applyWorld を丸ごと往復する器)。単調追加=SAVE_VERSION 据置。
  LAB_TANK_OLD_TH: [1, 3, 5],   // 旧しきい値(解読済みレシピ数)。撤廃済みなのでここが唯一の記録
  migrateLabTankFloor(w) {
    w.headquarters = w.headquarters || {};
    if (w.headquarters.labTankFloorV1 !== undefined) return w;  // 既に記録済み=二度と触らない
    const rs = w.headquarters.research || {};
    let decoded = 0;
    for (let o = 1; o <= 6; o++) if (rs["recipe" + o]) decoded++;
    const th = this.LAB_TANK_OLD_TH;
    w.headquarters.labTankFloorV1 = decoded >= th[2] ? 4 : decoded >= th[1] ? 3 : decoded >= th[0] ? 2 : 1;
    return w;
  },

  // V6-P1-2: 合成の撤廃で「レシピ解読I〜VI」が無くなるため、購入済みの資源を**全額**払い戻す。
  //   置き場所=headquarters の中(dial と同じく toWorld/applyWorld を丸ごと往復する器)。
  //   フラグが 0→1 の単調ゲートなので「一度きり」が構造的に保証される(§5z-3 と同じ方式・SAVE_VERSIONは上げない)。
  //   撤廃済みの RESEARCH 定義はもう存在しないため、返す額は**ここに表として持つ**(唯一の真実)。
  RECIPE_REFUND: [
    { id: "recipe1", science: 10, coins: 200000, stones: 0 },
    { id: "recipe2", science: 15, coins: 350000, stones: 0 },
    { id: "recipe3", science: 20, coins: 500000, stones: 0 },
    { id: "recipe4", science: 30, coins: 800000, stones: 0 },
    { id: "recipe5", science: 45, coins: 1200000, stones: 2 },
    { id: "recipe6", science: 60, coins: 2000000, stones: 4 },
  ],
  migrateRecipeRefund(w) {
    w.headquarters = w.headquarters || {};
    if (w.headquarters.recipeRefundV1) return w;      // 既に適用済み=二度と返さない
    w.headquarters.recipeRefundV1 = 1;
    const rs = (w.headquarters && w.headquarters.research) || {};
    let sci = 0, coins = 0, stones = 0, n = 0;
    for (const r of this.RECIPE_REFUND) {
      if (!rs[r.id]) continue;
      n++; sci += r.science; coins += r.coins; stones += r.stones;
      delete rs[r.id];                                 // 撤廃済みの解読フラグを掃除
    }
    if (n > 0) w._refundRecipe = { n, sci, coins, stones };
    return w;
  },

  // オープニングの本編組み込み(2026-08-01 Ric指示)。**既存プレイヤーには流さない**。
  //   セーブが実在する=すでに遊んでいる人なので「見た」ことにして初回起動の自動再生から外す。
  //   ★load() の既存セーブ経路からのみ呼ぶ(newGame は通らない)=新規コロニーだけがフラグ未設定で始まる。
  //   フラグが 0→1 の単調ゲートである以上、この移行は冪等かつ一度きり(副フラグ不要)。
  //   通知は出さない(気配だけ見せて説明しない)。
  migrateOpeningSeen(w) {
    w.dial = w.dial || { auto: false, rate: 1 };
    if (w.dial[this.OPENING_SEEN_KEY] === undefined) w.dial[this.OPENING_SEEN_KEY] = 1;
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

  // v13→v14: Phase6 惑星固有味方への1:1移送(案A・損失ゼロ)。旧汎用味方Lvを新・惑星味方idへ読み替える。
  //   allies は world 直下のグローバル {id:{lv}}。冪等: 版ゲート+旧キー削除+Math.max(二重加算しない)。
  migrateV13to14(w) {
    if ((w.version || 0) >= 14) return w;
    const MAP = { meerkat: "armadillo", owl: "falcon", ferret: "mangoose", turtle: "octopus", eagle: "penguin", gecko: "raccoon" };
    w.allies = w.allies || {};
    const moved = {};
    for (const oldId in MAP) {
      const newId = MAP[oldId], oldA = w.allies[oldId];
      if (oldA && (oldA.lv || 0) > 0) {
        const cur = (w.allies[newId] && w.allies[newId].lv) || 0;
        w.allies[newId] = { lv: Math.max(cur, oldA.lv) }; // 冪等: 既に移送済みでも最大維持=二重加算しない
        moved[oldId] = { to: newId, lv: oldA.lv };
      }
      delete w.allies[oldId]; // 旧キー除去(冪等: 2回目は既に無い)
    }
    if (Object.keys(moved).length) w._migrV14 = { moved }; // 通知用(保存されない)
    w.version = 14;
    return w;
  },

  // v14→v15: Phase10 再純血化。自動移行バグ(stageSel=null時のcurrentStage自動ジャンプ)で
  //   各惑星のコロニーに焼き付いた「他惑星種」を除去し、空になった開拓済み惑星に固有種#1の純血ペア2匹を再配置
  //   (Phase4の初期状態=詰み回避)。固有種は1匹も失わない(その惑星の固有種は残す)。通貨/鉱石/設備/味方Lvは非接触。
  //   stageSelはアリド(既定)へ補正。冪等: 版ゲート+固有種のみ残す(再実行しても混入は既に無い)。
  migrateV14to15(w) {
    if ((w.version || 0) >= 15) return w;
    let idSeq = w.idSeq || 1000;
    let lizRemoved = 0, eggRemoved = 0, reseeded = 0; const detail = [];
    for (const st of (w.stages || [])) {
      const endemic = this.endemicSpecies(st.stageId);
      const bl = (st.lizards || []).length, be = (st.eggs || []).length;
      st.lizards = (st.lizards || []).filter((l) => endemic.includes(l.speciesId)); // 固有種のみ残す
      st.eggs = (st.eggs || []).filter((e) => endemic.includes(e.speciesId));
      const rl = bl - st.lizards.length, re = be - st.eggs.length;
      lizRemoved += rl; eggRemoved += re;
      // 空になった開拓済み惑星に固有種#1の純血ペア2匹(Phase4 spawnPurePairと同じ=正しい固有種)
      if (st.pioneered && st.lizards.length === 0) {
        const sp = SPECIES.filter((s) => s.stage === st.stageId)[0];
        if (sp) {
          for (let i = 0; i < 2; i++) st.lizards.push({ id: idSeq++, speciesId: sp.id, morphId: "normal", hue: sp.hue, sat: sp.sat, light: sp.light, pattern: "none", stage: "adult", xp: 0, level: 1, injuredT: 0, breedCd: 0, native: true });
          reseeded += 2;
        }
      }
      if (rl || re) detail.push({ stageId: st.stageId, removedLiz: rl, removedEgg: re });
    }
    w.idSeq = idSeq;
    w.stageSel = 1; w.currentStageId = 1; // Phase10: 移行後はアリド(既定・自然)に配置
    w.planets = w.stages;
    w._purifyV15 = { lizards: lizRemoved, eggs: eggRemoved, reseeded, detail }; // 通知用(保存されない)
    w.version = 15;
    return w;
  },

  // セーブ・サニタイズ(Ric承認 2026-07-25): 通貨系数値の負値/非有限を0へクランプ(非破壊・冪等)。
  // 対象=財布のみ(coins/gems/stones/crickets/res4種/rare6種)。個体・卵・確率・構造には一切触れない。
  // 由来: headless蓄積プロファイルで負コインを観測(§6R.7)。実プレイでも過去ビルド由来の破損値を読込時に自癒する安全弁。
  sanitizeWallet(w) {
    const fix = (obj, key) => {
      const v = obj[key];
      if (typeof v !== "number" || !isFinite(v) || v < 0) { if (v !== undefined) this._sanitized++; obj[key] = Math.max(0, (typeof v === "number" && isFinite(v)) ? v : 0); }
    };
    this._sanitized = 0;
    if (w.wallet) for (const k of ["coins", "gems", "crickets", "stones"]) fix(w.wallet, k);
    for (const k of ["coins", "gems", "crickets", "stones"]) if (k in w) fix(w, k);
    if (w.res) for (const k of Object.keys(w.res)) fix(w.res, k);
    if (w.rareWallet) for (const k of Object.keys(w.rareWallet)) fix(w.rareWallet, k);
    if (this._sanitized > 0) console.warn(`[sanitize] 通貨系の破損値 ${this._sanitized} 件を0へ修復(非破壊)`);
    return w;
  },
  // P2-3(2026-08-11 Ric承認・案A): 巣ロスター80→20の4:1統合移行。
  //   一度きり=nestWeb.rosterV2(単調・冪等)。器=nestWebはtoWorld/applyWorldを丸ごと往復(前例=recipeRefundV1)。
  //   解放写像=写像元4旧の1つ以上解放→新解放(鳩の巣で総解放率は非減少)。
  //   未受領分=グループ内の未解放旧ノード報酬を一括付与(解放済み分は付与済み=二重付与なし)→Σ付与≡Σ旧80(厳密保存)。
  //   旧nodesはlegacyへ監査退避。SAVE_VERSION bump不要(構造同形)。
  migrateNestRosterV2(w) {
    if (!w || !w.nestWeb || w.nestWeb.rosterV2) return;
    const legacyMap = w.nestWeb.nodes || {};
    const legacyNodes = buildNestWebLegacy();
    const grant = {};
    const nodes = {};
    for (const nn of buildNestWeb()) {
      if (nn.id === "core") continue;
      if (!nn.legacyIds.some((id) => legacyMap[id])) continue;
      nodes[nn.id] = true;
      for (const oldNode of legacyNodes) {
        if (oldNode.id === "core" || !nn.legacyIds.includes(oldNode.id) || legacyMap[oldNode.id]) continue;
        grant[oldNode.reward.ore] = (grant[oldNode.reward.ore] || 0) + oldNode.reward.n;
      }
    }
    w.rareWallet = w.rareWallet || {};
    for (const k of Object.keys(grant)) w.rareWallet[k] = (w.rareWallet[k] || 0) + grant[k];
    w.nestWeb = { nodes, surprises: w.nestWeb.surprises || 0, legacy: legacyMap, rosterV2: 1 };
    if (Object.keys(grant).length) w._nestRosterGrant = grant; // 通知用(保存されない・前例=_refundV12)
  },
  applyWorld(w) {
    this.sanitizeWallet(w); // セーブ・サニタイズ(読込境界で一度・冪等)
    this.migrateNestRosterV2(w); // P2-3: 巣ロスター統合(一度きり・冪等)
    if (w.planets && !w.stages) w.stages = w.planets; // V4改名の互換
    if (w.stages && !w.planets) w.planets = w.stages;
    for (const st of (w.stages || [])) { if (st.nest) delete st.nest.pins; } // ①ピン機能撤廃: 旧セーブの残骸を掃除(非破壊・inert field削除)
    this.world = w;
    this._idSeq = w.idSeq || 1000;
    let active = w.stages.find((st) => st.stageId === w.currentStageId);
    if (!active) active = w.stages[w.stages.length - 1] || this.emptyStageData(1);
    this.state = {
      coins: w.wallet.coins, gems: w.wallet.gems,
      stones: w.wallet.stones || 0, // v11: 賢者の石(旧セーブは既定0で後方互換)
      labInvest: w.labInvest || {}, // hq_lab v2.0: 本部投資(旧セーブは既定{}=後方互換・bump不要)
      crickets: w.wallet.crickets || 0, // V5.2: コオロギ給餌の復活(全コロニー共通在庫)
      rank: w.headquarters.rank, rankXp: w.headquarters.rankXp, labTankFloor: w.headquarters.labTankFloorV1,
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
      nest: active.nest || { lv: 1 },
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
      nest: { lv: 1 },
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
      p.nest = p.nest || { lv: 1 };
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
        // v13セーブ → v14移行(Phase6 惑星味方への旧味方Lv移送。退避=ロールバック可)
        if (data.version === 13) { try { localStorage.setItem(CFG.saveBackupKeyV14, raw); } catch (e) { /* noop */ } }
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
      // Phase10: 再純血化(v14→v15)は個体を除去しうる。混入の有無に関わらず、purify前を必ず退避(全版共通=ロールバック保証)
      if ((data.version || 0) < 15) { try { localStorage.setItem(CFG.saveBackupKeyV15, raw); } catch (e) { /* noop */ } }
      world = this.migrateV14to15(this.migrateV13to14(this.migrateV12to13(this.migrateV11to12(this.migrateV10to11(this.migrateV9to10(this.migrateV8to9(this.migrateV7to8(this.migrateV6to7(this.migrateV5to6(this.migrateV4to5(world)))))))))));
      world = this.migrateStopOnEmpty(world);   // 版に依らない一度きりの移行(専用フラグでゲート)
      world = this.migrateOpeningSeen(world);
      world = this.migrateLabTankFloor(world);   // ★払い戻しより先(解読フラグが消える前に旧tierを確定させる)
      world = this.migrateRecipeRefund(world);   // V6-P1-2: レシピ解読の撤廃にともなう全額払い戻し(一度きり)
      if (world._refundRecipe && world._refundRecipe.n > 0) {
        const rr = world._refundRecipe;
        setTimeout(() => UI.toast(`レシピ解読は撤廃されました。投じた資源を全額払い戻しました(研究力+${rr.sci} / ${fmt(rr.coins)}G${rr.stones ? " / 賢者の石+" + rr.stones : ""})`), 960);
      }   // 既存プレイヤーにはオープニングを流さない(=見たことにする)
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
      // Phase10 再純血化(v14→v15): 自動移行汚染の除去+空惑星の固有ペア再配置を報告
      if (world._purifyV15 && (world._purifyV15.lizards > 0 || world._purifyV15.eggs > 0 || world._purifyV15.reseeded > 0)) {
        const p15 = world._purifyV15;
        try {
          console.log("=== Phase10 再純血化 監査: 惑星別の除去/再配置 ===");
          for (const d of (p15.detail || [])) { const st = stageById(d.stageId) || {}; console.log(`${st.pname || ""} ${st.name || ("stage" + d.stageId)}: 除去 個体${d.removedLiz}・卵${d.removedEgg}`); }
        } catch (e) { /* noop */ }
        setTimeout(() => UI.toast(`${Icon.svg("planet")} 惑星の完全独立: 自動移行で混入した他惑星種 ${p15.lizards}匹${p15.eggs > 0 ? "・卵" + p15.eggs : ""}を掃除${p15.reseeded > 0 ? `・空いた惑星に固有種の純血ペアを${p15.reseeded}匹配置` : ""}(自動移行は根治済み・設定からロールバック可)`, true), 1000);
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
      // ★P2-3是正(2026-08-11・本番実証で検出): _nestRosterGrant は applyWorld 内の migrateNestRosterV2 が
      //   設定するため、判定は applyWorld の**後**でなければ永遠に undefined=トーストが誰にも出なかった。
      if (world._nestRosterGrant) {
        const g = world._nestRosterGrant;
        const txt = Object.keys(g).map((k) => { const o = oreById(k); return `${Icon.svg(o.icon)}${o.name}+${g[k]}`; }).join(" ");
        setTimeout(() => UI.toast(`巣の網が編み直された(80→20の統合)。未受領の報酬を受け取った: ${txt}`), 900);
      }
      // ★V6-P1-2: レシピ解読の払い戻しを**実際に付与**する。migrateRecipeRefund は集計と解読フラグの
      //   掃除までしか行わない(worldの資源の置き場所を直接いじらない)。付与は applyWorld の後に
      //   **正規の加算関数**を通す=整合性・下限・表示更新を既存ロジックに委ねる(§5www と同じ作法)。
      //   ※この付与が無いと「トーストは出るのに資源が返らない」= 本番実証で実際に検出した欠陥。
      if (world._refundRecipe && world._refundRecipe.n > 0) {
        const rr = world._refundRecipe;
        if (rr.coins) this.state.coins += rr.coins;
        if (rr.sci) this.addRes("science", rr.sci);
        if (rr.stones) this.addStone(rr.stones);
      }
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

  restoreV15Backup() {
    let raw;
    try { raw = localStorage.getItem(CFG.saveBackupKeyV15); } catch (e) { raw = null; }
    if (!raw) { UI.toast("再純血化(Phase10)前のバックアップが見つからない", true); return false; }
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
