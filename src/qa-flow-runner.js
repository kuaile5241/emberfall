import { EQUIPMENT } from './content.js';
import { navigationTarget } from './world.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const priority = ['siphon', 'edge', 'ember', 'ward', 'fury', 'heart', 'renewal', 'critical', 'reach', 'flask', 'step', 'thorns'];

/** Test-only integration driver. UI uses its real listeners; combat uses the real frame pipeline. */
export async function runBrowserFlow(api, { locale = 'zh-CN', demo = false } = {}) {
  if (!api?.storageKeys?.profile.includes('.qa.flow.')) throw new Error('An isolated flow-test save is required');
  const started = performance.now();
  const report = window.__emberfallFlow = {
    status: 'running', phase: '营地整备', locale, demo, checks: [], rooms: [],
    storageKeys: api.storageKeys, limitations: 'Fixed 30 Hz input driver with real DOM handlers, event consumption, rendering and persistence. No combat attributes or enemies are modified; this is not a real-time performance or human difficulty test.',
  };
  const panel = document.createElement('section');
  panel.id = 'qa-flow-report'; panel.setAttribute('aria-label', '自动流程测试');
  panel.style.cssText = 'position:fixed;right:14px;top:90px;z-index:10000;width:290px;max-height:170px;overflow:auto;padding:12px;border:1px solid #b9a16f;background:#131317ed;color:#e9dfca;font:12px/1.6 monospace;box-shadow:0 8px 20px #0008;pointer-events:none';
  document.body.append(panel);
  const publish = () => { panel.textContent = `${report.status.toUpperCase()} · ${report.phase}\n${report.checks.length} checks · ${report.rooms.length}/6 regions\n${report.error || report.checks.at(-1)?.name || ''}`; };
  const check = (name, condition, details = null) => {
    report.checks.push({ name, passed: Boolean(condition), details }); publish();
    if (!condition) throw new Error(name + (details ? `: ${JSON.stringify(details)}` : ''));
  };
  const click = async (selector, immediate = false) => {
    const button = document.querySelector(selector);
    if (!button || button.disabled) throw new Error(`Unavailable UI action: ${selector}`);
    button.click(); await delay(demo && !immediate ? 350 : 0);
  };
  const select = (selector, value) => {
    const control = document.querySelector(selector);
    if (!control || control.disabled) throw new Error(`Unavailable select: ${selector}`);
    control.value = value; control.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const waitFor = async (predicate, name, timeout = 5000) => {
    const until = performance.now() + timeout;
    while (!predicate()) { if (performance.now() > until) throw new Error(`Timed out: ${name}`); await delay(25); }
  };
  const profile = () => api.profileStore.snapshot();
  const setLanguage = async next => { if (document.documentElement.lang !== next) await click('#language-switch'); };
  publish();
  try {
    api.setManualDrive(true);
    await setLanguage(locale);
    check('全新独立营地存档', profile().gold === 120 && profile().stats.runs === 0 && !profile().pendingRun);
    for (const [element, weapon, kind] of [['lightning', 'lightning-spear', 'Rogue_Hooded'], ['water', 'water-staff', 'Mage'], ['fire', 'fire-sword', 'Knight']]) {
      await click(`.camp-classes [data-id="${element}"]`);
      check(`营地职业切换 ${element}`, profile().loadout === weapon && api.campPreview.actors.actors.get('player')?.userData.kind === kind);
    }
    await click('#camp-tab-armory');
    const beforeInspect = JSON.stringify(profile());
    await click('[data-action="inspect-weapon"][data-id="water-scepter"]');
    check('查看锁定装备不改存档且不能装备', JSON.stringify(profile()) === beforeInspect && !document.querySelector('[data-action="weapon"][data-id="water-scepter"]'));
    await click('#camp-tab-quests'); await click('[data-action="accept"][data-id="ash-hunt"]');
    await click('#camp-tab-bag');
    for (const id of ['damage-tonic', 'ward-charm']) {
      await click(`[data-action="inspect-supply"][data-id="${id}"]`);
      await click(`[data-action="buy"][data-id="${id}"]`);
    }
    await click('[data-action="inspect-supply"][data-id="damage-tonic"]');
    await click('[data-action="supply"][data-id="damage-tonic"]');
    check('真实预算购买并携带补给', profile().gold === 40 && profile().items['damage-tonic'] === 1 && profile().items['ward-charm'] === 1 && profile().selectedSupply === 'damage-tonic');
    await setLanguage(locale === 'en' ? 'zh-CN' : 'en'); await setLanguage(locale);
    check('双语切换保留整备和委托', profile().activeQuest === 'ash-hunt' && profile().selectedSupply === 'damage-tonic');
    select('#camp-difficulty', 'normal');
    await click('.camp-start[data-action="start"]');
    check('正式出征加载真实属性并消耗一份补给', api.game.player.maxHp === 120 && api.game.player.damage === 26 && api.game.player.speed === 5 && api.game.supply === 'damage-tonic' && profile().items['damage-tonic'] === 0);
    if (!api.state().settings.muted) await click('#sound');
    await click('#pause'); select('#quality-setting', 'low');
    const pausedPosition = { ...api.game.player };
    check('暂停阻止模拟推进', api.step({ moveX: 1 }) === false && api.game.player.x === pausedPosition.x);
    await click('#pause-build'); await click('[data-equip="water-staff"]');
    check('战场装备同步模型和技能', api.game.weapon.id === 'water-staff' && api.view.actors.get('player')?.userData.kind === 'Mage');
    await click('[data-equip="fire-sword"]'); await click('#close-popup'); await click('#resume-game');
    api.setManualDrive(false);
    const keyboardBefore = { x: api.game.player.x, z: api.game.player.z };
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', bubbles: true, cancelable: true }));
    await delay(120);
    dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', bubbles: true }));
    api.setManualDrive(true);
    check('键盘事件经游戏帧产生实际位移', distance(api.game.player, keyboardBefore) > .05);

    report.phase = '六区战斗与领奖'; publish();
    let held = {}, choices = 0, checkedReward = false, checkedRace = false;
    const deadline = performance.now() + 300000;
    for (let frame = 0; frame < 30000 && !['won', 'dead'].includes(api.game.status); frame++) {
      if (performance.now() > deadline) throw new Error('Browser expedition exceeded its five-minute wall-clock limit');
      const game = api.game;
      if (game.status === 'upgrade') {
        const best = game.choices.reduce((index, choice, candidate) => priority.indexOf(choice.id) < priority.indexOf(game.choices[index].id) ? candidate : index, 0);
        const beforeCount = game.boons.reduce((sum, boon) => sum + boon.stacks, 0);
        await click(`[data-choice="${best}"]`, true);
        if (!checkedRace) {
          await click('#pause', true); await click('#resume-game', true);
          const button = document.querySelector('[data-choice="0"]');
          check('选卡动画内暂停恢复仍锁定旧卡', Boolean(button?.disabled));
          button?.click();
          dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2', bubbles: true, cancelable: true }));
          dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit2', bubbles: true }));
          checkedRace = true;
        }
        await waitFor(() => !document.getElementById('language-switch').disabled, 'blessing selection commits');
        check(`第 ${++choices} 次祝福只领取一次`, game.boons.reduce((sum, boon) => sum + boon.stacks, 0) === beforeCount + 1);
        if (game.status === 'playing' && game.roomRewardTaken && !checkedReward) {
          const before = { x: game.player.x, z: game.player.z };
          for (let i = 0; i < 10; i++) api.step({ moveX: 1, moveZ: 0 });
          check('清场领奖后解除移动锁', distance(game.player, before) > .5 && api.state().overlay === null);
          checkedReward = true;
        }
        continue;
      }
      const advanced = EQUIPMENT.find(item => item.element === game.weapon.element && item.tier === 2 && game.inventory.includes(item.id));
      if (advanced && game.weapon.tier === 1) {
        await click('#build-open'); await click(`[data-equip="${advanced.id}"]`); await click('#close-popup');
        check('战利品高级装备与真实护甲同步', game.weapon.id === advanced.id && api.view.actors.get('player')?.userData.equipmentAppearance?.weaponId === advanced.id);
      }
      if (!report.rooms.some(room => room.index === game.roomIndex)) {
        report.rooms.push({ index: game.roomIndex, name: game.roomName, time: game.time }); publish();
      }
      const input = {};
      const p = game.player, stats = game.combatStats;
      let target = game.roomCleared ? game.nextWaypoint : null;
      if (game.roomCleared && game.rewardReady) input.interact = !held.interact;
      else {
        const enemy = game.enemies.reduce((near, e) => !near || distance(e, p) < distance(near, p) ? e : near, null);
        if (enemy) {
          const d = distance(enemy, p), dx = enemy.x - p.x, dz = enemy.z - p.z;
          input.aimX = dx; input.aimZ = dz;
          input.attack = d < stats.attackRange + enemy.radius;
          input.skill = d < stats.skillRadius + enemy.radius && !held.skill;
          const warning = game.telegraphs.find(mark => ['circle', 'cone'].includes(mark.type) && distance(mark, p) < mark.radius + (mark.type === 'circle' ? .6 : .3));
          if (warning) {
            const length = distance(p, warning) || 1;
            target = { x: p.x + (p.x - warning.x) / length * 4, z: p.z + (p.z - warning.z) / length * 4 };
            input.dash = !held.dash && p.dashCd <= 0;
          } else target = d > stats.attackRange * .75 ? navigationTarget(p, enemy, p.radius, game._allowedSurfaces)
            : { x: p.x - dz / (d || 1) * 1.6, z: p.z + dx / (d || 1) * 1.6 };
        }
      }
      const length = target ? distance(target, p) : 0;
      input.moveX = length > .1 ? (target.x - p.x) / length : 0;
      input.moveZ = length > .1 ? (target.z - p.z) / length : 0;
      input.potion = p.hp < p.maxHp * .52 && !held.potion;
      checkIfStepFails(api.step(input), game);
      held = input;
      if (frame % (demo ? 3 : 12) === 0) await delay(demo ? 12 : 0);
    }
    const game = api.game;
    report.expedition = { seed: game.seed, difficulty: game.difficulty, status: game.status, seconds: game.time, kills: game.kills, bossKills: game.bossKills, gold: game.gold, hp: game.player.hp, choices };
    check('真实六区与最终 Boss 通关', game.status === 'won' && game.clearedZoneIds.size === 6 && game.bossKills === 1 && game.kills >= 280, report.expedition);
    check('结算与最深关卡纪录保存一次', api.state().overlay === 'result' && profile().stats.runs === 1 && profile().stats.wins === 1 && profile().stats.bestRoom === 6 && !profile().pendingRun);
    await click('#result-menu');
    const settledGold = profile().gold;
    await click('#camp-tab-quests'); await click('[data-action="claim"][data-id="ash-hunt"]');
    check('领取委托一次并移除领取按钮', profile().gold === settledGold + 100 && profile().quests['ash-hunt'].status === 'claimed' && !document.querySelector('[data-action="claim"][data-id="ash-hunt"]'));
    await click('#camp-tab-bag'); await click('[data-action="upgrade"]');
    check('营地强化真实扣费', profile().gold === settledGold + 100 - 120 && profile().campLevel === 1);
    await click('[data-action="inspect-supply"][data-id="ward-charm"]'); await click('[data-action="supply"][data-id="ward-charm"]');
    await click('#camp-tab-armory'); await click('[data-action="inspect-weapon"][data-id="fire-greatsword"]'); await click('[data-action="weapon"][data-id="fire-greatsword"]');
    await click('.camp-start[data-action="start"]');
    check('再次出征带新装备补给且没有旧祝福', api.game.weapon.id === 'fire-greatsword' && api.game.player.level === 1 && api.game.boons.length === 0 && api.game.activeBuffs.length === 0 && api.game.player.shield === 35 && profile().items['ward-charm'] === 0 && api.game.player.maxHp === 130);
    await click('#pause'); await click('#return-menu');
    check('再次收队回营并完成第二次结算', api.state().status === 'menu' && profile().stats.runs === 2 && !profile().pendingRun);
    report.status = 'passed'; report.phase = '整备 → 六区通关 → 领奖结算 → 再次出征：完成';
  } catch (error) {
    report.status = 'failed'; report.error = error.message;
    report.failureState = api.state();
  } finally {
    api.setManualDrive(false);
    report.elapsedSeconds = (performance.now() - started) / 1000;
    report.profile = profile(); publish();
    window.dispatchEvent(new CustomEvent('emberfall-flow-complete', { detail: report }));
  }
  return report;
}

function checkIfStepFails(ok, game) {
  if (!ok) throw new Error(`Frame did not advance: ${game.status}`);
}
