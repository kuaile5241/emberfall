import { createCampaignBot } from '../tools/campaign-bot.mjs';
import { STORY_NODES } from './campaign.js';
import { getLocale } from './i18n.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const ordinaryKeys = ['emberfall.profile.v4', 'emberfall.records.v1', 'emberfall.settings.v1', 'emberfall.locale.v1'];

/** QA-only: actual UI listeners and frame pipeline, with input-only combat. */
export async function runCampaignBrowserFlow(api, { locale = 'zh-CN' } = {}) {
  if (!api?.storageKeys?.profile.includes('.qa.flow.')) throw Error('Campaign QA needs an isolated save');
  const normal = Object.fromEntries(ordinaryKeys.map(key => [key, localStorage.getItem(key)]));
  const report = window.__emberfallCampaignFlow = { status: 'running', phase: 'prepare', locale, checks: [], expeditions: [], storageKeys: api.storageKeys, startedAt: new Date().toISOString() };
  const badge = document.createElement('div');
  badge.setAttribute('role', 'status');
  Object.assign(badge.style, { position: 'fixed', top: '84px', right: '18px', zIndex: '100', padding: '9px 13px', borderRadius: '8px', border: '1px solid #a99160', background: '#18181ded', color: '#dfc291', font: '11px system-ui', pointerEvents: 'none' });
  document.body.append(badge);
  const publish = () => { badge.textContent = `QA · CAMPAIGN ${locale} · ${report.status.toUpperCase()} · ${report.checks.filter(item => item.passed).length}/${report.checks.length} · ${report.phase}`; };
  publish();
  const check = (name, condition) => {
    report.checks.push({ name, passed: !!condition });
    publish();
    if (!condition) throw Error(name);
  };
  const click = async selector => {
    const node = document.querySelector(selector);
    if (!node || node.disabled) throw Error(`Unavailable UI: ${selector}`);
    node.click();
    await delay(10);
  };
  const waitFor = async (predicate, name) => {
    for (let i = 0; i < 400; i++) { if (predicate()) return; await delay(10); }
    throw Error(`Timed out: ${name}`);
  };
  const claimChapter = async id => {
    await click('[data-nav="quests"]');
    for (const node of STORY_NODES.filter(item => item.chapterId === id)) {
      const before = api.profileStore.snapshot();
      const button = document.querySelector(`[data-action="story-claim"][data-id="${node.id}"]`);
      check(`${node.id} has a real claim button`, !!button && !button.disabled);
      button.click(); button.click();
      await delay(10);
      const after = api.profileStore.snapshot();
      check(`${node.id} grants exactly one reward`, after.gold === before.gold + node.reward.gold && after.essence === before.essence + node.reward.essence && after.campaign.claimed.includes(node.id));
      check(`${node.id} journal can be reread`, !!document.querySelector(`[data-story="${node.id}"] details`));
    }
  };
  async function expedition(id) {
    report.phase = `${id}:prepare`;
    await click('[data-nav="camp"]');
    await click(`[data-action="expedition"][data-id="${id}"]`);
    await click('[data-action="start"]');
    const game = api.game;
    check(`${id} starts the selected map`, game.expeditionId === id && game.world.id === id && api.view.environment.world === game.world);
    check(`${id} uses normal difficulty`, game.difficulty === 'normal' && game.player.maxHp === 120);
    const bot = createCampaignBot(game);
    const summary = { id, seed: game.seed, rooms: [], choices: 0, channelFrames: 0, keyboardChannels: [], warningTypes: [] };
    report.expeditions.push(summary);
    const deadline = performance.now() + 300000;
    for (let frame = 0; frame < 30000 && !['won', 'dead'].includes(game.status); frame++) {
      if (performance.now() > deadline) throw Error(`${id} browser deadline`);
      report.phase = `${id}:${game.roomIndex + 1}/${game.rooms.length}`;
      if (!summary.rooms.includes(game.roomIndex)) { summary.rooms.push(game.roomIndex); publish(); }
      const action = bot.next();
      if (action.type === 'upgrade') {
        const count = game.boons.reduce((sum, boon) => sum + boon.stacks, 0);
        await click(`[data-choice="${action.index}"]`);
        await waitFor(() => !document.getElementById('language-switch').disabled, 'blessing committed');
        check(`${id} blessing ${++summary.choices} commits once`, game.boons.reduce((sum, boon) => sum + boon.stacks, 0) === count + 1);
      } else if (action.type === 'equip') {
        await click('#build-open'); await click(`[data-equip="${action.id}"]`); await click('#close-popup');
      } else if (action.type === 'tick') {
        const target = game.nearestInteraction;
        if (action.input.interact && ['story', 'mechanism'].includes(target?.kind)) {
          // Exercise main.js's held-key path and real animation frames. Passing
          // interact:true directly to Game would hide a broken keyboard adapter.
          const before = game.time;
          api.setManualDrive(false);
          dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true, cancelable: true }));
          try { await waitFor(() => game.completedPoiIds.has(target.id) || game.status === 'upgrade', 'keyboard E channel completes or blessing interrupts'); }
          finally {
            dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', key: 'e', bubbles: true }));
            api.setManualDrive(true);
          }
          if (game.completedPoiIds.has(target.id)) {
            summary.keyboardChannels.push({ id: target.id, elapsed: game.time - before });
            check(`${id} keyboard hold completes ${target.id}`, game.time - before >= 2.4 - 1e-6);
          } else {
            summary.channelInterruptions = (summary.channelInterruptions ?? 0) + 1;
            check(`${id} blessing safely interrupts the channel`, game.status === 'upgrade');
          }
        } else if (!api.step(action.input)) throw Error('Frame refused: tab must be visible and overlay closed');
      } else break;
      if (game.interactionChannel) summary.channelFrames++;
      if (frame % 20 === 0) await delay(0);
    }
    Object.assign(summary, { status: game.status, kills: game.kills, time: game.time, hp: game.player.hp, pois: [...game.completedPoiIds], warningTypes: [...bot.warnings], bossWard: game.bossWard });
    check(`${id} wins without modifying simulation state`, game.status === 'won' && game.clearedZoneIds.size === game.rooms.length && game.bossKills === 1);
    check(`${id} physically collects its story evidence`, id === 'grave' ? ['burial-relic', 'forge-sigil'].every(point => game.completedPoiIds.has(point)) : game.completedPoiIds.has('sluice-wheel') && game.bossWard === .2);
    check(`${id} held E to finish the mechanism`, summary.keyboardChannels.length === 1);
    check(`${id} settles automatically with no pending run`, !api.profileStore.snapshot().pendingRun);
    check(`${id} scene has five environment lights`, api.view.environment.lights.length === 5);
    if (id === 'aqueduct') check('water pressure and hollow tide warnings appear', bot.warnings.has('pressure') && bot.warnings.has('ring'));
    await click('#result-menu');
    await claimChapter(id);
  }
  try {
    api.setManualDrive(true);
    if (getLocale() !== locale) await click('#language-switch');
    check('language switches in the actual interface', getLocale() === locale);
    const locked = document.querySelector('[data-action="expedition"][data-id="aqueduct"]');
    check('second chapter starts locked', !!locked?.disabled);
    await click('[data-nav="bag"]');
    await click('[data-action="buy"][data-id="damage-tonic"]');
    await click('[data-action="buy"][data-id="damage-tonic"]');
    await click('[data-action="supply"][data-id="damage-tonic"]');
    await expedition('grave');
    check('first chapter unlocks the waterway', api.profileStore.snapshot().campaign.claimed.includes('bell'));
    await click('[data-action="class"][data-id="water"]');
    await expedition('aqueduct');
    const profile = api.profileStore.snapshot();
    check('seven main story nodes are claimed', profile.campaign.claimed.length === 7);
    check('both chapters have one clear', profile.campaign.clears.grave === 1 && profile.campaign.clears.aqueduct === 1);
    check('reading the saved profile preserves campaign progress', api.profileStore.load().ok && api.profileStore.snapshot().campaign.claimed.length === 7);
    await click('[data-nav="camp"]');
    check('ordinary player save and preferences are unchanged', ordinaryKeys.every(key => localStorage.getItem(key) === normal[key]));
    report.profile = api.profileStore.snapshot(); report.normalSavePreserved = true;
    report.status = 'passed'; report.phase = 'accepted'; report.finishedAt = new Date().toISOString();
    publish();
  } catch (error) {
    report.status = 'failed'; report.error = error.message; report.state = api.state();
    publish();
    report.normalSavePreserved = ordinaryKeys.every(key => localStorage.getItem(key) === normal[key]);
    console.error('Campaign browser acceptance failed:', error);
  } finally {
    // Leave the complete report and its isolated save available for inspection.
    api.setManualDrive(true);
  }
  return report;
}
