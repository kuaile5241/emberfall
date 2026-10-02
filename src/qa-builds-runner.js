import { createBuildBot } from '../tools/build-bot.mjs';
import { STORY_NODES } from './campaign.js';
import { equipmentById } from './content.js';
import { talentBudget } from './builds.js';
import { getLocale } from './i18n.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const ordinaryKeys = ['emberfall.profile.v4', 'emberfall.records.v1', 'emberfall.settings.v1', 'emberfall.locale.v1'];
const configurations = [
  { element: 'water', form: 'water-blizzard', armor: 'glacier-robes', core: 'water-permafrost', branch: 'water-shatter', excluded: 'water-whiteout', phase: 'snow', source: 'blizzard' },
  { element: 'fire', form: 'fire-pillars', armor: 'ash-mantle', core: 'fire-kindling', branch: 'fire-aftershock', excluded: 'fire-pressure', phase: 'pillar-echo', source: 'aftershock' },
  { element: 'fire', form: 'fire-meteor', armor: 'ash-mantle', core: 'fire-kindling', branch: 'fire-aftershock', excluded: 'fire-pressure', phase: 'impact-echo', source: 'skill' },
  { element: 'water', form: 'water-torrent', armor: 'glacier-robes', core: 'water-permafrost', branch: 'water-whiteout', excluded: 'water-shatter', source: 'torrent' },
  { element: 'lightning', form: 'lightning-chain', armor: 'storm-vest', core: 'lightning-conduction', branch: 'lightning-overload', excluded: 'lightning-feedback', phase: 'overload', source: 'chain' },
  { element: 'lightning', form: 'lightning-lances', armor: 'storm-vest', core: 'lightning-conduction', branch: 'lightning-feedback', excluded: 'lightning-overload', phase: 'lances', source: 'lance' },
];

/** QA-only integration: real DOM listeners, normal economy and input-only play. */
export async function runBuildBrowserFlow(api, { locale = 'zh-CN', capture = new URLSearchParams(location.search).get('capture') === '1' } = {}) {
  if (!api?.storageKeys?.profile.includes('.qa.flow.')) throw Error('Build QA requires a unique isolated save');
  const normal = Object.fromEntries(ordinaryKeys.map(key => [key, localStorage.getItem(key)]));
  const report = window.__emberfallBuildFlow = { status: 'running', phase: 'prepare', locale, capture, checks: [], encounters: [],
    storageKeys: api.storageKeys, startedAt: new Date().toISOString(),
    limitations: 'Actual UI handlers, frame/event/render pipeline and persistence. Input-only 30 Hz driver knows visible enemies and warnings; no game attributes or currency are changed. This is not a human balance or device-performance test.' };
  const badge = document.createElement('div'); badge.setAttribute('role', 'status');
  Object.assign(badge.style, { position: 'fixed', top: '84px', right: '18px', zIndex: '100', padding: '9px 13px', borderRadius: '8px',
    border: '1px solid #a99160', background: '#18181ded', color: '#dfc291', font: '11px system-ui', pointerEvents: 'none' });
  document.body.append(badge);
  const publish = () => { badge.textContent = `QA · BUILDS ${locale} · ${report.status.toUpperCase()} · ${report.checks.filter(check => check.passed).length}/${report.checks.length} · ${report.phase}`; };
  const check = (name, condition, details) => {
    report.checks.push({ name, passed: !!condition, ...(details ? { details } : {}) }); publish();
    if (!condition) throw Error(name);
  };
  const profile = () => api.profileStore.snapshot();
  const click = async selector => {
    const node = document.querySelector(selector);
    if (!node || node.disabled) throw Error(`Unavailable UI: ${selector}`);
    node.focus({ preventScroll: true }); node.click(); await delay(10);
  };
  const waitFor = async (predicate, name, timeout = 5000) => {
    const deadline = performance.now() + timeout;
    while (!predicate()) { if (performance.now() >= deadline) throw Error(`Timed out: ${name}`); await delay(10); }
  };
  const campActor = () => api.campPreview?.actors?.actors?.get('player');
  const battleActor = () => api.view.actors.get('player');
  const activeForm = () => document.querySelector('#menu [data-active-form]')?.dataset.activeForm;
  let observation = null;
  const originalEffect = api.view.effect;
  // Read-only observation of the consumed events. The original renderer method
  // is always called and Game.drainEvents/attributes are never intercepted.
  api.view.effect = function observedEffect(event) {
    if (observation) {
      if (event.type === 'skill' && event.form) observation.casts++;
      if (event.type === 'skillshape') { observation.phases.add(event.phase); observation.forms.add(event.form); }
      if (event.type === 'freeze') observation.freezes++;
      if (event.type === 'hit' && event.target === 'enemy') observation.sources.add(event.source);
    }
    return originalEffect.call(this, event);
  };
  const snapshotObservation = summary => Object.assign(summary, {
    phases: [...summary.phases], forms: [...summary.forms], sources: [...summary.sources],
  });
  async function captureVisual(config, summary) {
    if (!capture || summary.captured) return;
    const fields = [...api.view.skillFX.fields.values()].filter(field => field.object.userData.form === config.form);
    if (!fields.length) return;
    const visible = config.form === 'fire-pillars' ? summary.phases.has('pillar') && api.view.skillFX.effects.some(({ object }) =>
      object.scale.y >= .6 && object.children.some(child => child.geometry?.type === 'ConeGeometry' && child.geometry.parameters.height >= 3))
      : config.form === 'lightning-chain' ? summary.phases.has('jump')
      : config.form === 'lightning-lances' ? summary.phases.has('lances')
      : config.form === 'fire-meteor' ? fields.some(field => field.object.getObjectByName('FallingMeteor')?.visible)
      : config.form === 'water-blizzard' ? summary.phases.has('snow') && fields.some(field => !!field.object.getObjectByName('Snowfall'))
        && api.game.skillEffects.some(effect => effect.form === config.form && effect.age >= .6)
      : fields.some(field => !!field.object.getObjectByName('WaveFront'));
    if (!visible) return;
    summary.captured = true;
    report.phase = `capture:${config.form}`;
    report.captureState = { form: config.form, time: api.game.time, room: api.game.roomIndex, fields: api.view.skillFX.fields.size };
    publish();
    // Manual drive already suspends simulation while real animation frames
    // continue rendering. Await a visible DOM action without rewriting Game.
    const button = document.createElement('button'); button.dataset.buildQaContinue = '';
    button.textContent = locale === 'en' ? 'Continue acceptance' : '继续验收';
    Object.assign(button.style, { position: 'fixed', right: '18px', top: '126px', zIndex: '101', background: '#bba071',
      color: '#17151b', border: '1px solid #e0c997', borderRadius: '8px', padding: '10px 14px', font: '12px system-ui', cursor: 'pointer' });
    document.body.append(button);
    await new Promise(resolve => button.addEventListener('click', () => { button.disabled = true; button.remove(); resolve(); }, { once: true }));
    delete report.captureState;
    report.phase = `${config.form}:${api.game.roomIndex + 1}/${api.game.rooms.length}`; publish();
  }

  async function workshop(config, { buy = true } = {}) {
    report.phase = `${config.form}:workshop`; publish();
    await click('[data-nav="camp"]');
    await click(`[data-action="class"][data-id="${config.element}"]`);
    await click('[data-nav="builds"]');
    await click(`[data-action="build-filter"][data-id="${config.element}"]`);
    for (const id of [config.form, config.armor]) if (!profile().build.ownedGear.includes(id)) {
      if (!buy) throw Error(`Not owned: ${id}`);
      const before = profile().gold;
      await click(`[data-action="build-buy"][data-id="${id}"]`);
      check(`${id} is bought from the real wallet`, profile().build.ownedGear.includes(id) && profile().gold < before);
    }
    if (profile().build.armorId !== config.armor) await click(`[data-action="build-equip"][data-slot="armor"][data-id="${config.armor}"]`);
    if (profile().build.relicId !== config.form) await click(`[data-action="build-equip"][data-slot="relic"][data-id="${config.form}"]`);
    if (profile().build.talents.length) await click('[data-action="build-reset"]');
    await click(`[data-action="build-talent"][data-id="${config.core}"]`);
    await click(`[data-action="build-talent"][data-id="${config.branch}"]`);
    check(`${config.form} equipment and talents are committed`, profile().build.armorId === config.armor
      && profile().build.relicId === config.form && profile().build.talents.join(',') === [config.core, config.branch].join(','));
    check(`${config.form} mutually exclusive branch is disabled`, !!document.querySelector(`[data-action="build-talent"][data-id="${config.excluded}"]`)?.disabled);
    check(`${config.form} workshop reports the real selected shape`, activeForm() === config.form);
    await waitFor(() => campActor()?.userData.buildAppearance?.armorId === config.armor, `${config.form} camp armor appearance`);
    check(`${config.form} camp model wears the selected armor`, campActor().userData.buildAppearance.relicId === config.form
      && campActor().userData.buildAppearance.attachments.length > 0);
  }

  async function claimGrave() {
    await click('[data-nav="quests"]');
    for (const node of STORY_NODES.filter(node => node.chapterId === 'grave')) {
      const before = profile().gold;
      await click(`[data-action="story-claim"][data-id="${node.id}"]`);
      check(`${node.id} grants one earned story reward`, profile().gold === before + node.reward.gold && profile().campaign.claimed.includes(node.id));
    }
  }

  async function encounter(config, { full = false, expeditionId = 'aqueduct' } = {}) {
    await click('[data-nav="camp"]');
    await click(`[data-action="expedition"][data-id="${expeditionId}"]`);
    await click('[data-action="start"]');
    const game = api.game;
    check(`${config.form} starts through prepareRun with normal stats`, game.activeSkill.id === config.form && game.difficulty === 'normal'
      && game.player.hp === 120 && game.player.damage === 26 && game.player.speed === 5);
    check(`${config.form} run snapshot matches camp choices`, game.buildLoadout.armorId === config.armor && game.buildLoadout.relicId === config.form
      && game.buildLoadout.talents.includes(config.branch));
    await waitFor(() => battleActor()?.userData.buildAppearance?.armorId === config.armor, `${config.form} battle armor appearance`);
    check(`${config.form} battle model and snapshot wear the same gear`, battleActor().userData.buildAppearance.relicId === config.form);
    const summary = observation = { form: config.form, expeditionId, full, seed: game.seed, casts: 0, freezes: 0,
      phases: new Set(), forms: new Set(), sources: new Set(), choices: 0, peakFields: 0, peakTemporaryEffects: 0, rooms: [] };
    report.encounters.push(summary);
    const bot = createBuildBot(game), deadline = performance.now() + 300000;
    const enough = () => summary.casts > 0 && summary.forms.has(config.form) && summary.peakFields > 0
      && summary.sources.has(config.source) && (!config.phase || summary.phases.has(config.phase));
    for (let frame = 0; frame < (full ? 30000 : 6000) && !['won', 'dead'].includes(game.status); frame++) {
      if (performance.now() > deadline) throw Error(`${config.form} browser deadline`);
      report.phase = `${config.form}:${game.roomIndex + 1}/${game.rooms.length}`;
      if (!summary.rooms.includes(game.roomIndex)) { summary.rooms.push(game.roomIndex); publish(); }
      const action = bot.next();
      if (action.type === 'upgrade') {
        const before = game.boons.reduce((sum, boon) => sum + boon.stacks, 0);
        await click(`[data-choice="${action.index}"]`);
        await waitFor(() => !document.getElementById('language-switch').disabled, 'blessing commits');
        check(`${config.form} blessing ${++summary.choices} commits once`, game.boons.reduce((sum, boon) => sum + boon.stacks, 0) === before + 1);
      } else if (action.type === 'equip') {
        await click('#build-open'); await click(`[data-equip="${action.id}"]`); await click('#close-popup');
      } else if (action.type === 'tick') {
        if (!api.step(action.input)) throw Error(`Frame refused: ${game.status}/${api.state().overlay}; keep the tab visible`);
      } else break;
      summary.peakFields = Math.max(summary.peakFields, api.view.skillFX.fields.size);
      summary.peakTemporaryEffects = Math.max(summary.peakTemporaryEffects, api.view.skillFX.effects.length);
      await captureVisual(config, summary);
      if (!full && enough() && game.status === 'playing') break;
      if (frame % 20 === 0) await delay(0);
    }
    check(`${config.form} executes its own damage and visible shape`, enough(), { casts: summary.casts,
      phases: [...summary.phases], sources: [...summary.sources], fields: summary.peakFields });
    if (config.form === 'water-blizzard') check('blizzard really accumulates chill and freezes enemies', summary.freezes > 0);
    Object.assign(summary, { status: game.status, seconds: game.time, kills: game.kills, hp: game.player.hp,
      bossKills: game.bossKills, damageDealt: game.damageDealt, damageTaken: game.damageTaken });
    if (full) {
      check('blizzard build completes all six grave zones and boss', game.status === 'won' && game.clearedZoneIds.size === 6 && game.bossKills === 1 && game.kills >= 280);
      check('the narrative mechanism is actually investigated', game.completedPoiIds.has('forge-sigil') && game.completedPoiIds.has('burial-relic'));
      check('full victory settles once before returning', !profile().pendingRun && profile().stats.wins === 1);
      await click('#result-menu');
    } else {
      check(`${config.form} encounter stays playable before retreat`, game.status === 'playing' && game.player.hp > 0);
      await click('#pause');
      const before = game.time;
      check(`${config.form} pause blocks simulation`, api.step({ moveX: 1, skill: true }) === false && game.time === before);
      await click('#return-menu');
      check(`${config.form} normal retreat settles its run`, !profile().pendingRun && api.state().status === 'menu'
        && profile().processedRuns[game.runId]?.outcome === 'retreated');
    }
    check(`${config.form} returning clears owned skill geometry`, api.view.skillFX.fields.size === 0 && api.view.skillFX.effects.length === 0
      && api.view.skillFX.root.children.length === 0);
    snapshotObservation(summary); observation = null;
  }

  publish();
  try {
    api.setManualDrive(true);
    if (getLocale() !== locale) await click('#language-switch');
    check('the real UI uses the requested language', getLocale() === locale);
    check('new save has the actual initial budget', profile().gold === 120 && talentBudget(profile()) === 3
      && profile().stats.runs === 0 && !profile().pendingRun);
    check('three starter relics are owned and unequipped', ['fire-pillars', 'water-blizzard', 'lightning-chain'].every(id => profile().build.ownedGear.includes(id))
      && profile().build.relicId === null && profile().build.armorId === null);
    await workshop(configurations[0]);
    check('armor purchase leaves the real remaining budget', profile().gold === 50);
    const expensive = document.querySelector('[data-action="build-buy"][data-id="water-torrent"]');
    const beforeDisabled = JSON.stringify(profile()); expensive?.click();
    check('unaffordable relic is disabled and cannot deduct currency', !!expensive?.disabled && JSON.stringify(profile()) === beforeDisabled);
    await click('[data-action="build-equip"][data-slot="relic"][data-id=""]');
    check('taking off the relic restores the original skill', activeForm() === equipmentById(profile().loadout).variant && profile().build.relicId === null);
    check('taking off a relic keeps keyboard focus on that relic, not the armor slot',
      document.activeElement?.closest('[data-build-gear]')?.dataset.buildGear === 'water-blizzard'
      && document.activeElement?.dataset.slot === 'relic' && profile().build.armorId === 'glacier-robes');
    await click('[data-action="build-equip"][data-slot="relic"][data-id="water-blizzard"]');
    await click('[data-nav="camp"]'); await click('[data-action="class"][data-id="fire"]'); await click('[data-nav="builds"]');
    check('a wrong-element relic falls back to the weapon skill', activeForm() === equipmentById(profile().loadout).variant
      && profile().build.relicId === 'water-blizzard');
    await click('[data-nav="camp"]'); await click('[data-action="class"][data-id="water"]'); await click('[data-nav="builds"]');
    await click('[data-action="build-filter"][data-id="water"]');
    await click('[data-action="build-talent"][data-id="water-permafrost"]');
    check('removing a prerequisite removes its selected child', profile().build.talents.length === 0
      && !!document.querySelector('[data-action="build-talent"][data-id="water-shatter"]')?.disabled);
    await click('[data-action="build-talent"][data-id="water-permafrost"]');
    await click('[data-action="build-talent"][data-id="water-shatter"]');
    await click('[data-nav="bag"]'); await click('[data-action="buy"][data-id="damage-tonic"]');
    await click('[data-action="supply"][data-id="damage-tonic"]');
    check('a bought supply uses the remaining wallet', profile().gold === 5 && profile().selectedSupply === 'damage-tonic');
    await encounter(configurations[0], { full: true, expeditionId: 'grave' });
    await claimGrave();
    check('real main-story rewards unlock the second map', profile().campaign.claimed.includes('bell') && profile().campaign.clears.grave === 1);
    check('one actual victory raises the talent budget', talentBudget(profile()) === 4 && profile().stats.wins === 1);
    for (const config of configurations.slice(1)) {
      await workshop(config);
      await encounter(config);
    }
    check('all six real shapes were exercised', report.encounters.length === 6 && report.encounters.every(summary => summary.casts > 0 && summary.peakFields > 0));
    check('the three extra shapes were bought with earned currency', ['fire-meteor', 'water-torrent', 'lightning-lances'].every(id => profile().build.ownedGear.includes(id)));
    check('one victory and five retreats are recorded exactly once', profile().stats.runs === 6 && profile().stats.wins === 1 && profile().stats.retreats === 5);
    const beforeReload = JSON.stringify(profile());
    check('reloading preserves purchases, talents and run ledger', api.profileStore.load().ok && JSON.stringify(profile()) === beforeReload);
    await workshop(configurations[0]);
    check('ordinary player save and preferences are unchanged', ordinaryKeys.every(key => localStorage.getItem(key) === normal[key]));
    report.normalSavePreserved = true; report.profile = profile();
    report.status = 'passed'; report.phase = 'accepted'; report.finishedAt = new Date().toISOString(); publish();
  } catch (error) {
    report.status = 'failed'; report.error = error.message; report.failureState = api.state();
    report.normalSavePreserved = ordinaryKeys.every(key => localStorage.getItem(key) === normal[key]);
    if (observation) snapshotObservation(observation);
    publish(); console.error('Build browser acceptance failed:', error);
  } finally {
    api.view.effect = originalEffect;
    api.setManualDrive(true);
    report.finishedAt ||= new Date().toISOString();
    window.dispatchEvent(new CustomEvent('emberfall-build-flow-complete', { detail: report }));
  }
  return report;
}
