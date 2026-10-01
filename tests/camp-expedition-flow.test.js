import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfileStore } from '../src/profile.js';
import { Game } from '../src/game.js';
import { EQUIPMENT } from '../src/content.js';
import { navigationTarget } from '../src/world.js';

const key = 'emberfall.complete-flow.test';
const boonPriority = ['siphon', 'edge', 'ember', 'ward', 'fury', 'heart', 'renewal', 'critical', 'reach', 'flask', 'step', 'thorns'];
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Uses movement/attack/dodge/potion inputs and the real choice/equip/interaction
// APIs. No health, combat attributes, enemies, spawn rates or speed are changed.
// Perfect knowledge of warnings is suitable for a lifecycle regression, not a
// claim that a human player will complete a normal run this reliably.
function playExpedition(game, store) {
  let held = {}, switched = false, nextCheckpoint = 15, checkpoints = 0;
  const equipmentEvents = [], skillElements = new Set();
  for (let frame = 0; frame < 30000 && !['won', 'dead'].includes(game.status); frame++) {
    if (game.status === 'upgrade') {
      const best = game.choices.reduce((a, choice, index) => boonPriority.indexOf(choice.id) < boonPriority.indexOf(game.choices[a].id) ? index : a, 0);
      assert.equal(game.chooseUpgrade(best), true);
    } else if (game.roomCleared && game.rewardReady) {
      assert.equal(game.interact(), true);
      if (game.status === 'playing') game.update(1 / 30);
    } else {
      if (!switched && game.roomIndex >= 2) {
        assert.equal(game.equipWeapon('water-staff'), true);
        switched = true;
      }
      const advanced = EQUIPMENT.find(item => item.element === game.weapon.element && item.tier === 2 && game.inventory.includes(item.id));
      if (advanced && game.weapon.tier === 1) assert.equal(game.equipWeapon(advanced.id), true);
      const player = game.player, stats = game.combatStats;
      const enemy = game.enemies.reduce((nearest, item) => !nearest || distance(item, player) < distance(nearest, player) ? item : nearest, null);
      let target = game.roomCleared ? game.nextWaypoint : null;
      const input = { aimX: enemy ? enemy.x - player.x : 0, aimZ: enemy ? enemy.z - player.z : -1 };
      if (enemy) {
        const d = distance(enemy, player);
        input.attack = d < stats.attackRange + enemy.radius;
        input.skill = d < stats.skillRadius + enemy.radius && !held.skill;
        const warning = game.telegraphs.find(mark => ['circle', 'cone'].includes(mark.type) && distance(mark, player) < mark.radius + (mark.type === 'circle' ? .6 : .3));
        if (warning) {
          const length = distance(player, warning) || 1;
          target = { x: player.x + (player.x - warning.x) / length * 4, z: player.z + (player.z - warning.z) / length * 4 };
          input.dash = !held.dash && player.dashCd <= 0;
        } else target = d > stats.attackRange * .75 ? navigationTarget(player, enemy, player.radius, game._allowedSurfaces)
          : { x: player.x - input.aimZ / (d || 1) * 1.6, z: player.z + input.aimX / (d || 1) * 1.6 };
      }
      const length = target ? distance(target, player) : 0;
      input.moveX = length > .1 ? (target.x - player.x) / length : 0;
      input.moveZ = length > .1 ? (target.z - player.z) / length : 0;
      input.potion = player.hp < player.maxHp * .52 && !held.potion;
      game.update(1 / 30, input);
      held = input;
    }
    for (const event of game.drainEvents()) {
      if (event.type === 'equipment') equipmentEvents.push(event);
      if (event.type === 'skill') skillElements.add(event.element);
    }
    if (game.time >= nextCheckpoint && ['playing', 'upgrade'].includes(game.status)) {
      assert.equal(store.checkpointRun(game.runId, game.runSummary).ok, true);
      checkpoints++;
      nextCheckpoint += 15;
    }
  }
  return { switched, checkpoints, equipmentEvents, skillElements };
}

test('a real camp-to-six-zone victory settles and claims once, then starts a clean equipped expedition', t => {
  const values = new Map();
  let writes = 0;
  const storage = { getItem: id => values.get(id) ?? null, setItem(id, value) { writes++; values.set(id, value); } };
  const store = new ProfileStore({ storage, key });
  assert.equal(store.acceptQuest('ash-hunt').ok, true);
  assert.equal(store.selectWeapon('fire-sword').ok, true);
  assert.equal(store.buyItem('damage-tonic').ok, true);
  assert.equal(store.buyItem('ward-charm').ok, true);
  assert.equal(store.selectSupply('damage-tonic').ok, true);
  assert.equal(store.profile.gold, 40, 'all camp supplies use the actual starting budget');
  const prepared = store.prepareRun('complete-flow-first');
  assert.equal(prepared.ok, true);
  const originalPending = store.profile.pendingRun;
  const game = new Game({ ...prepared.run, seed: 913, difficulty: 'normal' }).start();
  assert.equal(game.player.hp, 120);
  assert.equal(game.player.damage, 26);
  assert.equal(game.player.speed, 5);
  assert.equal(game.supply, 'damage-tonic');
  assert.equal(store.profile.items['damage-tonic'], 0);

  // Prepare a different next profession and an owned ward during this old run.
  assert.equal(store.selectWeapon('lightning-spear').ok, true);
  assert.equal(store.selectSupply('ward-charm').ok, true);
  assert.deepEqual(store.profile.pendingRun, originalPending);
  assert.equal(store.profile.items['ward-charm'], 1);
  const evidence = playExpedition(game, store);
  t.diagnostic(`${Math.round(game.time)} game seconds, ${game.kills} kills, ${game.gold} earned gold, ${game.player.level} levels, ${game.boons.reduce((count, boon) => count + boon.stacks, 0)} blessings, ${evidence.checkpoints} checkpoints, ${Math.round(game.player.hp)} remaining HP`);
  assert.equal(game.status, 'won', `run ended in zone ${game.roomIndex + 1} at ${Math.round(game.time)}s with ${Math.round(game.player.hp)} HP`);
  assert.equal(game.clearedZoneIds.size, 6);
  assert.equal(game.bossKills, 1);
  assert.ok(game.kills >= 280);
  assert.ok(game.time < 600, 'the real navigation/combat path must not stall');
  assert.ok(game.boons.length > 0);
  assert.equal(evidence.switched, true);
  assert.deepEqual([...evidence.skillElements].sort(), ['fire', 'water']);
  assert.ok(evidence.equipmentEvents.some(event => event.weaponId === 'fire-greatsword' && event.source === 'room'));
  assert.ok(game.inventory.some(id => EQUIPMENT.find(item => item.id === id)?.tier === 2));
  assert.ok(evidence.checkpoints > 1);
  assert.ok(store.profile.pendingRun.summary.kills > 0);
  assert.ok(store.profile.pendingRun.summary.inventory.includes('fire-greatsword'));
  assert.equal(store.profile.loadout, 'lightning-spear');
  assert.equal(store.profile.selectedSupply, 'ward-charm');
  assert.equal(store.profile.pendingRun.run.weaponId, 'fire-sword');
  assert.equal(store.profile.pendingRun.run.supply.id, 'damage-tonic');
  assert.equal(store.profile.pendingRun.questId, 'ash-hunt');

  const result = store.settleRun(game.runId, game.runSummary);
  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'won');
  assert.equal(result.reward.gold, game.gold + 80);
  assert.equal(store.profile.gold, 40 + result.reward.gold);
  assert.equal(store.profile.pendingRun, null);
  assert.equal(store.profile.stats.runs, 1);
  assert.equal(store.profile.stats.wins, 1);
  assert.equal(store.profile.stats.totalKills, game.kills);
  assert.equal(store.profile.quests['ash-hunt'].status, 'completed');
  assert.equal(store.profile.loadout, 'lightning-spear');
  assert.equal(store.profile.selectedSupply, 'ward-charm');
  const settled = store.profile, previousWrites = writes;
  assert.equal(store.settleRun(game.runId, game.runSummary).duplicate, true);
  assert.deepEqual(store.profile, settled);
  assert.equal(writes, previousWrites);

  assert.equal(store.claimQuest('ash-hunt').ok, true);
  assert.equal(store.profile.gold, settled.gold + 100);
  assert.equal(store.profile.essence, settled.essence + 1);
  assert.equal(store.profile.quests['ash-hunt'].status, 'claimed');
  const claimed = store.profile;
  assert.equal(store.claimQuest('ash-hunt').error, 'quest_not_claimable');
  assert.deepEqual(store.profile, claimed);
  assert.equal(store.profile.unlockedWeapons.includes('fire-greatsword'), true);

  // Real unlocked gear is selected after victory; the saved ward is used once.
  assert.equal(store.selectWeapon('fire-greatsword').ok, true);
  const nextPrepared = store.prepareRun('complete-flow-next');
  assert.equal(nextPrepared.ok, true);
  assert.equal(nextPrepared.run.weaponId, 'fire-greatsword');
  assert.equal(nextPrepared.run.supply.id, 'ward-charm');
  assert.equal(store.profile.items['ward-charm'], 0);
  const next = new Game({ ...nextPrepared.run, seed: 914, difficulty: 'normal' }).start();
  assert.equal(next.weapon.id, 'fire-greatsword');
  assert.equal(next.player.shield, 35);
  assert.equal(next.player.level, 1);
  assert.equal(next.player.xp, 0);
  assert.equal(next.player.maxHp, 120);
  assert.equal(next.player.damage, 26);
  assert.equal(next.combatStats.damage, 26 * 1.28);
  assert.equal(next.player.lifeOnKill, 0);
  assert.equal(next.player.regen, 0);
  assert.equal(next.gold, 0);
  assert.deepEqual(next.boons, []);
  assert.deepEqual(next.activeBuffs, []);
  assert.deepEqual(next.areas, []);
  assert.deepEqual(next.skillCooldowns, { fire: 0, lightning: 0, water: 0 });
  assert.equal(store.profile.stats.runs, 1, 'preparing the next run must not settle or count it early');
  t.diagnostic(`won settlement ${result.reward.gold} gold / ${result.reward.essence} essence; quest reward 100 gold / 1 essence; next run ${next.weapon.id} + ${next.supply} with no previous blessings`);
});
