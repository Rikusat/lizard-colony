"use strict";
// V7: visible physics decides breeding loci. A separate Roulette instance keeps
// the boss-reward simulation and its golden physics tests unchanged.
// A pairing is charged only once, after all three balls have physically landed.
const GenePachinko = {
  loci: [
    { id: "species", name: "血統", hint: "親A / 親B または上位種への変異" },
    { id: "morph", name: "モーフ", hint: "変異ポケット / 中央V入賞で伝説" },
    { id: "pattern", name: "模様", hint: "着地した側の親から継承" },
  ],
  _session: null, onLand: null, onFinish: null,
  active() { return !!this._session; },
  session() { return this._session; },
  begin(aId, bId, seed) {
    if (this.active() || typeof Roulette === "undefined" || !Game || !Game.state || Game.raid) return false;
    if (typeof UI !== "undefined" && (UI._bossRewardOpen || UI._brOpenTimer)) return false;
    const a = Game.state.lizards.find(l => l.id === aId), b = Game.state.lizards.find(l => l.id === bId);
    if (!a || !b || a === b || !Game.canBreed(a) || !Game.canBreed(b)
        || Game.state.eggs.length >= Game.eggSlotCap() || Game.state.coins < Game.breedCost(a, b)) return false;
    const physics = Object.create(Roulette);
    physics.balls = []; physics.nails = []; physics.events = [];
    physics.reward = null; physics.onEgg = null; physics.canAcceptEgg = () => true;
    const actualSeed = seed == null ? ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0) : (seed >>> 0);
    physics.reset(actualSeed);
    this._session = { seed: actualSeed, aId, bId, physics, locus: 0,
      drops: [], pause: 0, flash: 0, justLanded: null, phase: "falling" };
    physics.emit(null);
    return true;
  },
  advance(realDt) {
    const s = this._session;
    if (!s) return;
    const dt = Math.max(0, Math.min(realDt || 0, 0.1));
    s.flash = Math.max(0, s.flash - dt);
    if (s.phase === "gap") {
      s.pause -= dt;
      if (s.pause > 0) return;
      if (s.locus >= this.loci.length) return this._commit();
      s.phase = "falling"; s.justLanded = null; s.physics.emit(null);
    }
    if (s.phase !== "falling") return;
    s.physics.advance(dt);
    for (const e of s.physics.drainEvents()) {
      if (e.type !== "BallLanded" || s.drops.length !== s.locus) continue;
      const drop = { x: e.x, win: !!e.win, rainbow: !!e.rainbow,
        side: e.x < CFG.roulHoleCenterf * CFG.roulW ? "a" : "b" };
      s.drops.push(drop); s.justLanded = drop;
      s.flash = drop.rainbow ? 1.0 : drop.win ? 0.5 : 0.12;
      if (this.onLand) this.onLand(this.loci[s.locus], drop);
    }
    if (s.drops.length === s.locus + 1 && s.physics.balls.length === 0) {
      s.locus++; s.pause = CFG.gpLocusGapSec || 0.2; s.phase = "gap";
    }
  },
  decision(s, a, b, pool, morphs) {
    if (!s || s.drops.length !== this.loci.length) return null;
    const rand = () => s.physics._rng();
    const inheritSide = (x, y, drop) => drop.side === "a" ? x : y;
    let speciesId = inheritSide(a.speciesId, b.speciesId, s.drops[0]);
    if (s.drops[0].win) {
      const base = speciesById(speciesId);
      const candidates = pool.filter(sp => sp.stars > base.stars);
      if (candidates.length) speciesId = candidates[Math.floor(rand() * candidates.length)].id;
    }
    let morphId = inheritSide(a.morphId, b.morphId, s.drops[1]);
    if (s.drops[1].rainbow) morphId = "legendary";
    else if (s.drops[1].win) {
      const candidates = morphs.filter(m => !m.legendary && m.id !== morphId);
      if (candidates.length) morphId = candidates[Math.floor(rand() * candidates.length)].id;
    }
    return { speciesId, morphId, pattern: inheritSide(a.pattern, b.pattern, s.drops[2]) };
  },
  _commit() {
    const s = this._session;
    if (!s || s.drops.length !== this.loci.length) return false;
    this._session = null;
    const a = Game.state.lizards.find(l => l.id === s.aId), b = Game.state.lizards.find(l => l.id === s.bId);
    const decision = a && b ? this.decision(s, a, b, Game.breedablePool(), MORPHS) : null;
    const success = !!(decision && Game.breed(s.aId, s.bId, false, decision, () => s.physics._rng()));
    if (this.onFinish) this.onFinish({ success, decision, seed: s.seed, drops: s.drops });
    return success;
  },
  finishInstant() {
    let guard = 0;
    while (this.active() && guard++ < 4000) this.advance(0.1);
    if (this.active()) { this._session = null; throw new Error("GenePachinko: unresolved physics"); }
    return true;
  },
  cancel() { this._session = null; }
};
if (typeof module !== "undefined" && module.exports) module.exports = { GenePachinko };
