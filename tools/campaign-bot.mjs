import { EQUIPMENT } from '../src/content.js';
import { isWalkable, navigationTarget } from '../src/world.js';

const priority = ['siphon', 'edge', 'ember', 'ward', 'fury', 'heart', 'renewal', 'critical', 'reach', 'flask', 'step', 'thorns'];
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rank = item => { const index = priority.indexOf(item.id); return index < 0 ? priority.length : index; };
const direction = (from, to) => {
  const length = distance(from, to);
  return length > .1 ? { moveX: (to.x - from.x) / length, moveZ: (to.z - from.z) / length } : { moveX: 0, moveZ: 0 };
};

// This driver reads real state and returns player actions. It never changes HP,
// damage, speed, coordinates, enemy lists, spawn rules, RNG or simulation time.
// It knows all visible warnings and enemies, so it does not model human skill.
export function createCampaignBot(game, { collectPoi = true } = {}) {
  let held = {}, release = false;
  const warnings = new Set();
  const navigate = target => navigationTarget(game.player, target, game.player.radius, game._allowedSurfaces, game.world.navPoints);
  function evade(marks) {
    const p = game.player;
    const ring = marks.find(mark => mark.type === 'ring' && distance(mark, p) <= mark.radius + .8);
    if (ring && distance(ring, p) < (ring.innerRadius + ring.radius) / 2) return navigate(ring);
    const danger = marks.filter(mark => mark.type === 'ring'
      ? distance(mark, p) > mark.innerRadius - .5 && distance(mark, p) < mark.radius + .6
      : distance(mark, p) < mark.radius + (mark.type === 'circle' ? .6 : .3));
    if (!danger.length) return null;
    // Several surge circles may overlap. Choose a reachable direction that
    // clears all of them rather than fleeing one warning into the other.
    let best = null, score = -Infinity;
    for (let i = 0; i < 16; i++) {
      const angle = Math.PI * 2 * i / 16;
      const target = { x: p.x + Math.cos(angle) * 4.5, z: p.z + Math.sin(angle) * 4.5 };
      if (!isWalkable(target.x, target.z, p.radius, game._allowedSurfaces)) continue;
      const value = Math.min(...danger.map(mark => mark.type === 'ring'
        ? Math.max(mark.innerRadius - distance(target, mark), distance(target, mark) - mark.radius)
        : distance(target, mark) - mark.radius));
      if (value > score) { best = target; score = value; }
    }
    return best ? navigate(best) : navigate(game.rooms[game.roomIndex].center);
  }
  return {
    warnings,
    next() {
      const p = game.player;
      if (game.status === 'upgrade') {
        const index = game.choices.reduce((a, item, i) => rank(item) < rank(game.choices[a]) ? i : a, 0);
        release = true;
        return { type: 'upgrade', index };
      }
      if (game.status !== 'playing') return { type: 'finished', status: game.status };
      if (release) { release = false; held = {}; return { type: 'tick', input: {} }; }
      const upgrade = EQUIPMENT.find(item => item.element === game.weapon.element && item.tier === 2 && game.inventory.includes(item.id));
      if (upgrade && game.weapon.tier === 1) return { type: 'equip', id: upgrade.id };

      let target = null;
      const input = {};
      if (game.roomCleared) {
        const point = collectPoi && game.interestPoints.find(item => item.available && !item.completed && item.zoneIndex <= game.roomIndex);
        if (point) {
          if (game.nearestInteraction?.id === point.id) {
            input.interact = !!game.interactionChannel || !held.interact;
          } else target = navigate(point);
        } else if (game.rewardReady) {
          input.interact = !held.interact;
        } else target = game.nextWaypoint;
      } else {
        const stats = game.combatStats;
        const enemy = game.enemies.reduce((best, item) => !best || distance(item, p) < distance(best, p) ? item : best, null);
        const d = enemy ? distance(enemy, p) : Infinity;
        input.aimX = enemy ? enemy.x - p.x : 0;
        input.aimZ = enemy ? enemy.z - p.z : -1;
        input.attack = !!enemy && d < stats.attackRange + enemy.radius;
        input.skill = !!enemy && d < stats.skillRadius + enemy.radius && !held.skill;
        const marks = game.telegraphs.filter(mark => ['circle', 'cone', 'ring'].includes(mark.type));
        for (const mark of marks) warnings.add(mark.hazardId ? 'pressure' : mark.type);
        const dodge = evade(marks);
        if (dodge) {
          target = dodge;
          input.dash = !held.dash && p.dashCd <= 0 && distance(p, dodge) > 1;
        } else if (enemy) target = d > stats.attackRange * .75 ? navigate(enemy)
          : { x: p.x - input.aimZ / (d || 1) * 1.6, z: p.z + input.aimX / (d || 1) * 1.6 };
        input.potion = p.hp < p.maxHp * .52 && !held.potion;
      }
      Object.assign(input, target ? direction(p, target) : { moveX: 0, moveZ: 0 });
      held = input;
      return { type: 'tick', input };
    },
  };
}

/** Node/diagnostic convenience wrapper; browser integration uses next() actions. */
export function playCampaignRun(game, { store, maxFrames = 30000, stop = () => false, collectPoi = true, onStep } = {}) {
  const bot = createCampaignBot(game, { collectPoi }), events = [];
  let nextSave = 15, checkpoints = 0, frames = 0, channelFrames = 0;
  for (; frames < maxFrames && !['won', 'dead'].includes(game.status) && !stop(game); frames++) {
    const action = bot.next();
    if (action.type === 'upgrade') {
      if (!game.chooseUpgrade(action.index)) throw Error('Cannot select the offered blessing');
    } else if (action.type === 'equip') {
      if (!game.equipWeapon(action.id)) throw Error('Cannot equip an owned weapon');
    } else if (action.type === 'tick') game.update(1 / 30, action.input);
    else break;
    if (game.interactionChannel) channelFrames++;
    events.push(...game.drainEvents());
    if (store && game.time >= nextSave && ['playing', 'upgrade'].includes(game.status)) {
      const saved = store.checkpointRun(game.runId, game.runSummary);
      if (!saved.ok) throw Error(`Checkpoint failed: ${saved.error}`);
      checkpoints++; nextSave += 15;
    }
    onStep?.({ game, action, frames });
  }
  return { status: game.status, frames, time: game.time, kills: game.kills, checkpoints, channelFrames,
    warnings: [...bot.warnings], pois: [...game.completedPoiIds], events };
}
