import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { EQUIPMENT, STARTER_WEAPON_IDS } from '../src/content.js';
import { navigationTarget } from '../src/world.js';

// A deterministic input-only bot exercises a full run without changing health,
// damage, enemy counts or travel speed. Its perfect knowledge of enemy positions
// and telegraphs makes this a logic/balance smoke test, not a human difficulty test.
function playNormalRun(weaponId) {
  const game = new Game({ seed: 913, weaponId, difficulty: 'normal' }).start();
  const priority = ['siphon', 'edge', 'ember', 'ward', 'fury', 'heart', 'renewal', 'critical', 'reach', 'flask', 'step', 'thorns'];
  let heldPotion = false, heldDash = false, heldSkill = false;
  for (let frame = 0; frame < 30000 && !['won', 'dead'].includes(game.status); frame++) {
    if (game.status === 'upgrade') {
      let best = 0;
      for (let i = 1; i < game.choices.length; i++) if (priority.indexOf(game.choices[i].id) < priority.indexOf(game.choices[best].id)) best = i;
      game.chooseUpgrade(best);
      continue;
    }
    const upgrade = EQUIPMENT.find(weapon => weapon.element === game.weapon.element && weapon.tier === 2 && game.inventory.includes(weapon.id));
    if (upgrade && game.weapon.tier === 1) game.equipWeapon(upgrade.id);
    const player = game.player, stats = game.combatStats;
    let target, attack = false, aimX = 0, aimZ = -1, skill = false, dash = false;
    if (game.roomCleared) {
      if (game.rewardReady) {
        game.interact();
        if (game.status === 'playing') game.update(1 / 30);
        continue;
      }
      target = game.nextWaypoint;
    } else {
      const enemy = [...game.enemies].sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0];
      if (enemy) {
        const dx = enemy.x - player.x, dz = enemy.z - player.z, distance = Math.hypot(dx, dz);
        aimX = dx; aimZ = dz;
        attack = distance < stats.attackRange + enemy.radius;
        skill = distance < stats.skillRadius + enemy.radius && !heldSkill;
        const warning = game.telegraphs.find(mark =>
          (mark.type === 'circle' && Math.hypot(mark.x - player.x, mark.z - player.z) < mark.radius + 0.6) ||
          (mark.type === 'cone' && Math.hypot(mark.x - player.x, mark.z - player.z) < mark.radius + 0.3));
        if (warning) {
          const length = Math.hypot(player.x - warning.x, player.z - warning.z) || 1;
          target = { x: player.x + (player.x - warning.x) / length * 4, z: player.z + (player.z - warning.z) / length * 4 };
          dash = !heldDash && player.dashCd <= 0;
        } else if (distance > stats.attackRange * 0.75) {
          target = navigationTarget(player, enemy, player.radius, game._allowedSurfaces);
        } else {
          target = { x: player.x - dz / (distance || 1) * 1.6, z: player.z + dx / (distance || 1) * 1.6 };
        }
      }
    }
    let moveX = target ? target.x - player.x : 0, moveZ = target ? target.z - player.z : 0;
    const length = Math.hypot(moveX, moveZ);
    if (length > 0.1) { moveX /= length; moveZ /= length; } else { moveX = 0; moveZ = 0; }
    const potion = player.hp < player.maxHp * 0.52 && !heldPotion;
    game.update(1 / 30, { moveX, moveZ, aimX, aimZ, attack, skill, dash, potion });
    heldPotion = potion; heldDash = dash; heldSkill = skill;
  }
  return game;
}

for (const weaponId of STARTER_WEAPON_IDS) {
  test(`normal attributes complete six zones with ${weaponId}, using only that element`, t => {
    const game = playNormalRun(weaponId);
    t.diagnostic(`${Math.round(game.time)}s, ${game.kills} kills, ${game.player.level} levels, best combo ${game.bestCombo}, ${Math.round(game.player.hp)} HP remaining`);
    assert.equal(game.status, 'won', `${weaponId} stopped in zone ${game.roomIndex + 1} at ${Math.round(game.time)}s`);
    assert.equal(game.clearedZoneIds.size, 6);
    assert.ok(game.kills >= 280, 'the input-only run must clear the new dense encounters');
    assert.equal(game.runSummary.outcome, 'won');
    assert.equal(Object.values(game.elementKills).reduce((sum, n) => sum + n, 0), game.kills);
    assert.equal(game.bossKills, 1);
    assert.equal(game.weapon.element, EQUIPMENT.find(item => item.id === weaponId).element);
    assert.equal(game.weapon.tier, 2);
    assert.equal(game.inventory.length, 6);
    assert.ok(game.damageDealt > 10000);
    assert.ok(game.time < 600, 'a normal run must not become a stalled chase');
  });
}
