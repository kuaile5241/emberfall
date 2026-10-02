import { createCampaignBot } from './campaign-bot.mjs';

/**
 * Input-only campaign driver for build acceptance. Combat geometry, enemy
 * behaviour, health, stats and coordinates are exclusively owned by Game.
 * The driver knows visible enemies and warnings, so this is not a human
 * difficulty or performance benchmark.
 */
export function createBuildBot(game, options = {}) {
  const campaign = createCampaignBot(game, options);
  return { warnings: campaign.warnings, next: () => campaign.next() };
}

export function playBuildRun(game, { store, maxFrames = 30000, collectPoi = true, onStep } = {}) {
  const bot = createBuildBot(game, { collectPoi });
  const events = [], casts = [];
  let frames = 0, nextSave = 15, checkpoints = 0, channelFrames = 0;
  let peakEffects = 0, peakAreas = 0, peakProjectiles = 0;
  for (; frames < maxFrames && !['won', 'dead'].includes(game.status); frames++) {
    const action = bot.next();
    if (action.type === 'upgrade') {
      if (!game.chooseUpgrade(action.index)) throw Error('Cannot select the offered blessing');
    } else if (action.type === 'equip') {
      if (!game.equipWeapon(action.id)) throw Error('Cannot equip an owned weapon');
    } else if (action.type === 'tick') {
      game.update(1 / 30, action.input);
    } else break;
    if (game.interactionChannel) channelFrames++;
    const emitted = game.drainEvents();
    events.push(...emitted);
    casts.push(...emitted.filter(event => event.type === 'skill'));
    peakEffects = Math.max(peakEffects, game.skillEffects?.length || 0);
    peakAreas = Math.max(peakAreas, game.areas?.length || 0);
    peakProjectiles = Math.max(peakProjectiles, game.projectiles?.length || 0);
    if (store && game.time >= nextSave && ['playing', 'upgrade'].includes(game.status)) {
      const saved = store.checkpointRun(game.runId, game.runSummary);
      if (!saved.ok) throw Error(`Checkpoint failed: ${saved.error}`);
      checkpoints++; nextSave += 15;
    }
    onStep?.({ game, action, frames, emitted });
  }
  return { status: game.status, frames, time: game.time, kills: game.kills,
    checkpoints, channelFrames, warnings: [...bot.warnings],
    pois: [...game.completedPoiIds], casts, events,
    peakEffects, peakAreas, peakProjectiles };
}
