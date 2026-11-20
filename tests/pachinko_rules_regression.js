"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const storage = new Map();
const context = vm.createContext({
  console,
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
  setTimeout: () => {},
  UI: { toast() {} },
  Icon: { svg: () => "" },
});
const source = ["data.js", "game.js"].map((file) => fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8")).join("\n");
const { CFG, Game, MISSIONS, SAVE_VERSION } = vm.runInContext(`${source}\n;({ CFG, Game, MISSIONS, SAVE_VERSION })`, context);
const { pachinko: config } = CFG;
const plain = (data) => JSON.parse(JSON.stringify(data));
const parents = () => Array.from(Game.state.lizards, ({ id }) => id);
const saved = () => JSON.parse(storage.get(CFG.saveKey));
const shotGrade = (tier) => Game.pachinkoBoard().tiers.indexOf(tier);

Game.newGame();
const old = plain(Game.toWorld());
delete old.collection.pachinko;
Game.applyWorld(old);
const baseline = Game.pachinkoStatus();
assert.equal(baseline.total, 0);
assert.equal(baseline.untilChance, config.chanceLimit);
assert.equal(baseline.fever, 0);
assert.equal(baseline.rushShots, 0);
assert.equal(baseline.cost, config.cost);
assert.ok(Game.pachinkoStatus([], 1).rareChance > Game.pachinkoStatus([], -1).rareChance);
const tenBallMission = MISSIONS.find(({ id }) => id === "pachi10");
assert.equal(tenBallMission.check(Game.state), false);

const board = Game.pachinkoBoard();
assert.equal(board.pegs.length, config.rows * (config.rows + 1) / 2);
for (let seed = 1230001; seed < 1231001; seed++) {
  const trajectory = Game.pachinkoDrop(seed, 1, 0.51, true);
  assert.ok(trajectory.index >= shotGrade("rare"));
  assert.equal(trajectory.points[0].x, 0.5 + board.aimSpread);
  assert.equal(trajectory.points.at(-1).x, (trajectory.index + 0.5) / board.tiers.length);
  for (let row = 1; row <= config.rows; row++) {
    const { x, y } = trajectory.points[row];
    assert.ok(board.pegs.some((peg) => x === peg.x && y === peg.y));
  }
}

Game.pachinkoSeed = () => 8374;
const coinStart = Game.state.coins, cricketStart = Game.state.crickets;
const result = Game.playPachinko(1, 10, []);
assert.equal(result.shots.length, 10);
assert.equal(result.cost, baseline.cost * 10);
assert.equal(result.egg, null);
assert.equal(Game.state.coins, coinStart - result.cost + result.total.coins);
assert.equal(Game.state.crickets, cricketStart + result.total.crickets);
assert.equal(Game.state.eggs.length, 0);
assert.equal(Game.pachinkoStatus().total, 10);
assert.equal(tenBallMission.check(Game.state), true);
assert.equal(saved().version, SAVE_VERSION);
assert.equal(saved().collection.pachinko.total, 10);
assert.equal(saved().wallet.coins, Game.state.coins);

// Results and resource settlement depend on the saved starting state and seed.
Game.applyWorld(plain(old));
assert.deepEqual(plain(Game.playPachinko(1, 10)), plain(result));
assert.equal(Game.pachinkoStatus().total, 10);

Game.applyWorld(plain(old));
const pair = parents();
const startingPrice = Game.pachinkoStatus(pair).fee;
assert.equal(startingPrice, CFG.breedBaseCost);
const stock = Game.state.coins;
Game.state.coins = baseline.cost + startingPrice - 1;
assert.ok(Game.playPachinko(0, 1, pair).error);
assert.ok(Game.playPachinko(0, 2, []).error);
assert.ok(Game.playPachinko(0, 1, [pair[0], pair[0]]).error);
assert.equal(Game.pachinkoStatus().total, 0);
assert.equal(Game.state.eggs.length, 0);
assert.ok(Game.state.lizards.every(({ breedCd }) => breedCd === 0));

Game.state.coins = stock;
Game.pachinkoProgress().dry = config.chanceLimit - 1;
Game.pachinkoProgress().fever = config.feverChargeMax - 1;
assert.equal(Game.pachinkoStatus(pair).rareChance, 100);
assert.equal(Game.pachinkoStatus(pair).chanceReady, true);
const br = Game.playPachinko(0, 10, pair);
assert.equal(br.cost, baseline.cost * 10 + startingPrice);
assert.equal(Game.state.coins, stock - br.cost + br.total.coins);
assert.equal(Game.state.eggs.length, 1);
assert.equal(Game.state.stats.bred, 1);
assert.equal(br.egg, Game.state.eggs[0]);
assert.ok(Game.state.lizards.every(({ breedCd }) => breedCd > 0));
assert.ok(Game.endemicSpecies(1).includes(br.egg.speciesId));
assert.ok(["golden", "legendary"].includes(br.egg.morphId));
assert.equal(br.shots[0].chance, true);
assert.equal(br.shots[0].feverStarted, true);
assert.ok(br.shots.slice(1, 1 + config.feverLength).every(({ fever }) => fever));
assert.equal(br.shots[1 + config.feverLength].fever, false);
assert.equal(saved().planets[0].eggs.length, 1);
assert.ok(Game.playPachinko(0, 1, pair).error);
assert.equal(Game.pachinkoStatus().total, 10);

// A full incubator does not prevent parentless play or consume a selected pair's funds.
Game.applyWorld(plain(old));
Game.state.eggs = Array(Game.eggSlotCap()).fill(br.egg);
assert.ok(Game.playPachinko(0, 1, parents()).error);
assert.equal(Game.state.coins, stock);
assert.equal(Game.playPachinko(0, 1).shots.length, 1);
assert.equal(Game.state.eggs.length, Game.eggSlotCap());

// Spend one attack charge per completed raid, but only a live boss victory grants RUSH.
Game.applyWorld(plain(old));
Game.pachinkoProgress().guard = 2;
Game.startRaid();
assert.equal(Game.raid.pachinkoGuard, true);
const boostedDps = Game.raidDps();
Game.raid.pachinkoGuard = false;
assert.equal(boostedDps, Game.raidDps() * (1 + config.guardAttackBonus));
Game.raid.pachinkoGuard = true;
assert.ok(Game.playPachinko(0, 1).error);
assert.equal(Game.pachinkoStatus().guard, 2);
Game.endRaid(true);
assert.equal(Game.pachinkoStatus().guard, 1);
assert.equal(Game.pachinkoStatus().rushShots, 0);
Game.state.stageWins = CFG.bossEvery - 1;
Game.rollNextRaid();
Game.startRaid();
assert.equal(Game.raid.boss, true);
Game.endRaid(false);
assert.equal(Game.pachinkoStatus().rushShots, 0);
Game.startRaid();
Game.endRaid(true);
assert.equal(Game.pachinkoStatus().rushShots, config.rushBoss);
assert.equal(saved().collection.pachinko.rushShots, config.rushBoss);
Game.applyWorld(saved());
assert.equal(Game.pachinkoStatus().rushShots, config.rushBoss);
assert.equal(Game.playPachinko(0, 1).shots[0].rush, true);
assert.equal(Game.pachinkoStatus().rushShots, config.rushBoss - 1);

console.log("Pachinko: launch, geometry, save, breeding, FEVER, CHANCE, defense and RUSH passed");
