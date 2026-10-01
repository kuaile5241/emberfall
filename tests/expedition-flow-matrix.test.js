import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfileStore } from '../src/profile.js';
import { Game } from '../src/game.js';
import { EQUIPMENT } from '../src/content.js';
import { navigationTarget } from '../src/world.js';

const priority = ['siphon', 'edge', 'ember', 'ward', 'fury', 'heart', 'renewal', 'critical', 'reach', 'flask', 'step', 'thorns'];
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function camp(weaponId, seed, supply = 'damage-tonic') {
  const key = `emberfall.flow-matrix.${weaponId}.${seed}`, values = new Map();
  const storage = {
    values, writes: 0, failRead: false,
    getItem(id) { if (this.failRead) throw Error('read denied'); return values.get(id) ?? null; },
    setItem(id, value) { this.writes++; values.set(id, value); },
  };
  const store = new ProfileStore({ storage, key });
  assert.equal(store.acceptQuest('ash-hunt').ok, true);
  assert.equal(store.selectWeapon(weaponId).ok, true);
  assert.equal(store.buyItem(supply, 2).ok, true);
  assert.equal(store.selectSupply(supply).ok, true);
  const prepared = store.prepareRun(`matrix-${weaponId}-${seed}`);
  assert.equal(prepared.ok, true);
  const game = new Game({ ...prepared.run, seed, difficulty: 'normal' }).start();
  assert.equal(game.player.maxHp, 120);
  assert.equal(game.player.damage, 26);
  assert.equal(game.player.speed, 5);
  assert.equal(store.profile.items[supply], 1);
  return { game, store, storage, key, supply };
}

// Input-only, deterministic lifecycle bot: no edits to HP, combat attributes,
// enemy lists, spawn rules, speed, coordinates or simulation clock. It knows
// warning/enemy positions, so this is not an estimate of human difficulty.
function play(game, store, stop = () => false) {
  let held = {}, nextSave = 15, checkpoints = 0;
  for (let frame = 0; frame < 30000 && !['dead', 'won'].includes(game.status) && !stop(game); frame++) {
    if (game.status === 'upgrade') {
      const best = game.choices.reduce((a, item, i) => priority.indexOf(item.id) < priority.indexOf(game.choices[a].id) ? i : a, 0);
      assert.equal(game.chooseUpgrade(best), true);
    } else if (game.roomCleared && game.rewardReady) {
      assert.equal(game.interact(), true);
      if (game.status === 'playing') game.update(1 / 30);
    } else {
      const upgrade = EQUIPMENT.find(item => item.element === game.weapon.element && item.tier === 2 && game.inventory.includes(item.id));
      if (upgrade && game.weapon.tier === 1) assert.equal(game.equipWeapon(upgrade.id), true);
      const p = game.player, stats = game.combatStats;
      const enemy = game.enemies.reduce((best, item) => !best || distance(item, p) < distance(best, p) ? item : best, null);
      const input = { aimX: enemy ? enemy.x - p.x : 0, aimZ: enemy ? enemy.z - p.z : -1 };
      let target = game.roomCleared ? game.nextWaypoint : null;
      if (enemy) {
        const d = distance(enemy, p);
        input.attack = d < stats.attackRange + enemy.radius;
        input.skill = d < stats.skillRadius + enemy.radius && !held.skill;
        const mark = game.telegraphs.find(item => ['circle', 'cone'].includes(item.type) && distance(item, p) < item.radius + (item.type === 'circle' ? .6 : .3));
        if (mark) {
          const length = distance(p, mark) || 1;
          target = { x: p.x + (p.x - mark.x) / length * 4, z: p.z + (p.z - mark.z) / length * 4 };
          input.dash = !held.dash && p.dashCd <= 0;
        } else target = d > stats.attackRange * .75 ? navigationTarget(p, enemy, p.radius, game._allowedSurfaces)
          : { x: p.x - input.aimZ / (d || 1) * 1.6, z: p.z + input.aimX / (d || 1) * 1.6 };
      }
      const length = target ? distance(target, p) : 0;
      input.moveX = length > .1 ? (target.x - p.x) / length : 0;
      input.moveZ = length > .1 ? (target.z - p.z) / length : 0;
      input.potion = p.hp < p.maxHp * .52 && !held.potion;
      game.update(1 / 30, input); held = input;
    }
    game.drainEvents();
    if (game.time >= nextSave && ['playing', 'upgrade'].includes(game.status)) {
      assert.equal(store.checkpointRun(game.runId, game.runSummary).ok, true);
      checkpoints++; nextSave += 15;
    }
  }
  return checkpoints;
}
const trace = game => `${Math.round(game.time)} game seconds, room ${game.roomIndex + 1}/6, ${game.kills} kills, ${game.gold} gold, ${Math.round(game.player.hp)} HP`;

for (const [weaponId, seed, supply] of [
  ['fire-sword', 913, 'damage-tonic'], ['fire-sword', 41, 'damage-tonic'],
  ['lightning-spear', 913, 'ward-charm'], ['lightning-spear', 1701, 'ward-charm'],
  ['water-staff', 913, 'damage-tonic'], ['water-staff', 604, 'damage-tonic'],
]) {
  test(`${weaponId} seed ${seed}: camp, six-zone victory, one settlement/quest reward, and fresh next expedition`, t => {
    const { game, store } = camp(weaponId, seed, supply);
    const checkpoints = play(game, store);
    t.diagnostic(trace(game));
    assert.equal(game.status, 'won', trace(game));
    assert.equal(game.clearedZoneIds.size, 6);
    assert.equal(game.bossKills, 1);
    assert.ok(game.kills >= 280);
    assert.ok(game.time < 600, 'normal navigation/combat cannot stall');
    assert.ok(checkpoints > 1);
    assert.ok(game.boons.length > 0);
    assert.equal(game.weapon.element, EQUIPMENT.find(item => item.id === weaponId).element);
    assert.equal(game.weapon.tier, 2);
    const before = store.profile;
    const settled = store.settleRun(game.runId, game.runSummary);
    assert.equal(settled.ok, true);
    assert.equal(settled.reward.gold, game.gold + 80);
    assert.equal(store.profile.gold, before.gold + settled.reward.gold);
    assert.equal(store.profile.stats.runs, 1);
    assert.equal(store.profile.stats.wins, 1);
    assert.equal(store.profile.stats.totalKills, game.kills);
    assert.equal(store.profile.stats.bestRoom, 6, 'a six-area victory must persist the sixth area reached');
    assert.equal(store.profile.pendingRun, null);
    assert.equal(store.profile.quests['ash-hunt'].status, 'completed');
    const settledProfile = store.profile;
    assert.equal(store.settleRun(game.runId, game.runSummary).duplicate, true);
    assert.deepEqual(store.profile, settledProfile);
    assert.equal(store.claimQuest('ash-hunt').ok, true);
    assert.equal(store.profile.gold, settledProfile.gold + 100);
    const claimed = store.profile;
    assert.equal(store.claimQuest('ash-hunt').error, 'quest_not_claimable');
    assert.deepEqual(store.profile, claimed);
    assert.equal(store.selectWeapon(game.weapon.id).ok, true);
    const nextPrepared = store.prepareRun(`${game.runId}-next`);
    assert.equal(nextPrepared.ok, true);
    assert.equal(nextPrepared.run.weaponId, game.weapon.id);
    assert.equal(nextPrepared.run.supply.id, supply);
    assert.equal(store.profile.items[supply], 0);
    const next = new Game({ ...nextPrepared.run, seed: seed + 1, difficulty: 'normal' }).start();
    assert.equal(next.player.level, 1);
    assert.equal(next.player.damage, 26);
    assert.equal(next.player.maxHp, 120);
    assert.equal(next.player.speed, 5);
    assert.equal(next.player.lifeOnKill, 0);
    assert.equal(next.player.regen, 0);
    assert.equal(next.gold, 0);
    assert.deepEqual(next.boons, []);
    assert.deepEqual(next.activeBuffs, []);
    assert.deepEqual(next.areas, []);
    assert.deepEqual(next.skillCooldowns, { fire: 0, lightning: 0, water: 0 });
    assert.equal(next.player.shield, supply === 'ward-charm' ? 35 : 0);
    assert.equal(store.profile.stats.runs, 1);
  });
}

test('natural death after the first area settles 60% once and permits a fresh expedition', t => {
  const { game, store } = camp('fire-sword', 913);
  play(game, store, current => current.roomIndex >= 1 && current.status === 'playing');
  assert.equal(game.roomIndex, 1, trace(game));
  assert.ok(game.gold > 0);
  // Stop issuing all combat and movement inputs; real enemy attacks cause death.
  for (let frame = 0; frame < 9000 && game.status === 'playing'; frame++) game.update(1 / 30, {});
  t.diagnostic(trace(game));
  assert.equal(game.status, 'dead', trace(game));
  assert.equal(game.player.hp, 0);
  const result = store.settleRun(game.runId, game.runSummary);
  assert.equal(result.ok, true);
  assert.equal(result.reward.gold, Math.floor(game.gold * .6));
  assert.equal(store.profile.stats.deaths, 1);
  assert.equal(store.profile.stats.wins, 0);
  assert.equal(store.profile.stats.bestRoom, 2, 'natural death in the second area must persist that area');
  assert.equal(store.profile.pendingRun, null);
  const snapshot = store.profile;
  assert.equal(store.settleRun(game.runId, game.runSummary).duplicate, true);
  assert.deepEqual(store.profile, snapshot);
  assert.equal(store.prepareRun('matrix-after-death').ok, true);
});

test('voluntary retreat after two real areas settles 25% and retains loot and next preparation', t => {
  const { game, store } = camp('water-staff', 913);
  play(game, store, current => current.roomIndex >= 2 && current.status === 'playing');
  t.diagnostic(trace(game));
  assert.equal(game.roomIndex, 2, trace(game));
  assert.equal(game.status, 'playing');
  assert.equal(game.clearedZoneIds.size, 2);
  assert.ok(game.inventory.includes('water-scepter'));
  assert.equal(store.selectWeapon('lightning-spear').ok, true);
  const result = store.settleRun(game.runId, { ...game.runSummary, outcome: 'retreated' });
  assert.equal(result.ok, true);
  assert.equal(result.reward.gold, Math.floor(game.gold * .25));
  assert.equal(result.reward.essence, 0);
  assert.equal(store.profile.stats.retreats, 1);
  assert.equal(store.profile.stats.bestRoom, 3, 'retreat after entering the third area must persist that area');
  assert.equal(store.profile.unlockedWeapons.includes('water-scepter'), true);
  assert.equal(store.profile.loadout, 'lightning-spear');
  const settled = store.profile;
  assert.equal(store.settleRun(game.runId, { ...game.runSummary, outcome: 'retreated' }).duplicate, true);
  assert.deepEqual(store.profile, settled);
  const next = store.prepareRun('matrix-after-retreat');
  assert.equal(next.ok, true);
  assert.equal(next.run.weaponId, 'lightning-spear');
  assert.equal(next.run.supply.id, 'damage-tonic');
});

test('cross-page conflict and read failure preserve the run, external bytes and spending until safe sync', t => {
  const { game, store, storage, key } = camp('lightning-spear', 1701, 'ward-charm');
  for (let frame = 0; frame < 150; frame++) game.update(1 / 30, {});
  assert.equal(game.status, 'playing');
  const other = new ProfileStore({ storage, key });
  assert.equal(other.selectWeapon('water-staff').ok, true);
  const memory = store.profile, external = storage.getItem(key), writes = storage.writes;
  assert.equal(store.checkpointRun(game.runId, game.runSummary).error, 'storage_conflict');
  assert.deepEqual(store.profile, memory);
  assert.equal(storage.getItem(key), external);
  assert.equal(storage.writes, writes);
  storage.failRead = true;
  assert.equal(store.sync({ runId: game.runId }).error, 'storage_unavailable');
  assert.equal(store.settleRun(game.runId, { ...game.runSummary, outcome: 'retreated' }).error, 'save_failed');
  assert.deepEqual(store.profile, memory);
  assert.equal(storage.values.get(key), external);
  assert.equal(storage.writes, writes);
  storage.failRead = false;
  assert.equal(store.sync({ runId: game.runId }).ok, true);
  assert.equal(store.profile.loadout, 'water-staff');
  assert.equal(store.profile.pendingRun.run.weaponId, 'lightning-spear');
  assert.equal(store.profile.items['ward-charm'], 1);
  assert.equal(store.checkpointRun(game.runId, game.runSummary).ok, true);
  assert.equal(store.settleRun(game.runId, { ...game.runSummary, outcome: 'retreated' }).ok, true);
  assert.equal(store.profile.loadout, 'water-staff');
  assert.equal(store.profile.items['ward-charm'], 1, 'failed attempts cannot consume or refund another ward');
  assert.equal(store.profile.stats.runs, 1);
  t.diagnostic(`${trace(game)}; conflict/read failure performed zero writes and safe recovery settled once`);
});
