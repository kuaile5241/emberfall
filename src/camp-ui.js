import { EQUIPMENT, ELEMENTS, DEFAULT_WEAPON_ID } from './content.js';
import { SUPPLIES, CAMP_LEVELS, QUESTS } from './profile.js';
import { skillIcon, campIcon, boonIcon } from './icons.js';
import { t, getLocale, onLocaleChange } from './i18n.js';
import { ZONES } from './world.js';
import { renderArmory, renderBag, normalizeArmorySelection, normalizeBagSelection, weaponForClass } from './camp-inventory.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const text = (key, params) => escape(t(key, params));
const number = value => Math.max(0, Number(value) || 0);
const weaponById = id => EQUIPMENT.find(weapon => weapon.id === id) || EQUIPMENT.find(weapon => weapon.id === DEFAULT_WEAPON_ID);
const tabs = [{ id: 'camp', label: '营地', icon: 'camp' }, { id: 'armory', label: '军械', icon: 'armory' }, { id: 'bag', label: '行囊', icon: 'bag' }, { id: 'quests', label: '委托', icon: 'quest' }];

function supplyArt(item) {
  return item?.id === 'damage-tonic' ? skillIcon('heal') : `<span class="camp-ward-amulet">${boonIcon('shield')}</span>`;
}

/**
 * Persistent menu controller. The canvas is created once and survives render/tab changes.
 * onStart({weaponId,difficulty}) owns prepareRun and returns true/false.
 * onChange(profile,{action,result}) runs only after a successful saved mutation.
 * onRender({portraitCanvas,weaponId,tab}) lets the host refresh its live model preview.
 */
export function createCampUI({ root, profileStore, onStart = () => false, onHelp = () => {}, onChange = () => {}, onRender = () => {} }) {
  if (!root || !profileStore) throw new Error('createCampUI requires root and profileStore');
  let tab = 'camp', difficulty = 'normal', noticeTimer = 0, destroyed = false, noticeMessage = '';
  let inventoryState = { selectedWeaponId: null, elementFilter: 'all', selectedItemId: null };
  const shell = document.createElement('div');
  shell.className = 'camp-shell camp-v6';
  shell.innerHTML = `<header class="camp-header">
    <div class="camp-brand">${campIcon('camp')}<div><strong data-camp-label="余烬地牢"></strong><small data-camp-label="钟下墓城"></small></div></div>
    <div class="camp-header-status">${campIcon('flame')}<span data-camp-label="守夜人营地"></span><i></i><span class="camp-header-level"></span></div>
    <div class="camp-wallet" data-camp-aria="营地资金"></div>
  </header>
  <div class="camp-main">
    <aside class="camp-sidebar"><nav class="camp-nav" data-camp-aria="营地功能" role="tablist">${tabs.map((item, index) => `<button id="camp-tab-${item.id}" role="tab" aria-controls="camp-panel" aria-selected="${item.id === tab}" data-nav="${item.id}">${campIcon(item.icon)}<span data-camp-label="${item.label}"></span><small>0${index+1}</small></button>`).join('')}</nav><div class="camp-nav-seal" aria-hidden="true">${campIcon('flame')}<span>EF</span></div></aside>
    <section class="camp-portrait-space" data-camp-aria="当前角色与武器">
      <div class="camp-portrait-heading"><span data-camp-label="出征角色"></span><span class="camp-portrait-tag"></span></div>
      <div class="camp-portrait-window"><canvas id="camp-portrait" data-camp-aria="角色三维预览"></canvas></div>
      <div class="camp-portrait-hint">${campIcon('arrow')}<span data-camp-label="拖动旋转角色"></span></div>
      <div class="camp-classes" data-camp-aria="切换职业"></div><div class="camp-character"></div>
      <div class="camp-portrait-kit"></div>
    </section>
    <section id="camp-panel" class="camp-pane" role="tabpanel" aria-labelledby="camp-tab-camp"></section>
  </div>
  <footer class="camp-footer"><div class="camp-footer-left"><button data-action="help">${campIcon('help')}<span data-camp-label="操作"></span></button><span>v0.6.1</span></div><div class="camp-footer-center"><span class="camp-departure-note"></span><button class="camp-start" data-action="start"><span data-camp-label="出征"></span>${campIcon('arrow')}</button></div><div class="camp-footer-right"><span data-camp-label="难度"></span><select id="camp-difficulty" data-camp-aria="出征难度"><option value="story" data-camp-label="轻松"></option><option value="normal" selected data-camp-label="标准"></option><option value="hard" data-camp-label="困难"></option></select></div></footer>
  <div class="camp-notice" role="status" aria-live="polite"></div>`;
  root.replaceChildren(shell);
  const portraitCanvas = shell.querySelector('#camp-portrait');
  const pane = shell.querySelector('.camp-pane');
  const snapshot = () => profileStore.snapshot ? profileStore.snapshot() : profileStore.profile;

  function notify(message, kind = 'normal') {
    if (destroyed || !message) return;
    clearTimeout(noticeTimer);
    const notice = shell.querySelector('.camp-notice');
    noticeMessage = message;
    notice.textContent = typeof message === 'function' ? message() : t(message);
    notice.dataset.kind = kind;
    notice.classList.add('is-visible');
    noticeTimer = setTimeout(() => { notice.classList.remove('is-visible'); notice.textContent = ''; noticeMessage = ''; }, 3300);
  }

  function questState(profile, quest) {
    const saved = profile.quests?.[quest.id] || {};
    return { status: saved.status || 'available', progress: Math.min(quest.target, number(saved.progress)) };
  }

  function rewardMarkup(quest) {
    const reward = quest.reward;
    return `${campIcon('coin')}${reward.gold}${reward.essence ? ` <span>· ${text('{essence} 精华', { essence: reward.essence })}</span>` : ''}${reward.weaponId ? `<span class="camp-reward-weapon">${text(weaponById(reward.weaponId).name)}</span>` : ''}`;
  }

  function pendingMarkup(profile) {
    if (!profile.pendingRun) return '';
    return `<div class="camp-pending"><strong>${text('上次出征尚未结算')}</strong><p>${text('可先更换职业、装备与携带补给；结算后再出征。')}</p><p>${text('带回 25% 已记录金币及已记录装备，无法恢复战场。')}</p><button class="camp-claim" data-action="settle">${text('结束上次出征')}</button></div>`;
  }

  function campMarkup(profile) {
    const weapon = weaponById(profile.loadout);
    const selectedSupply = SUPPLIES.find(item => item.id === profile.selectedSupply);
    const active = QUESTS.filter(quest => ['active', 'completed'].includes(questState(profile, quest).status));
    const currentLevel = CAMP_LEVELS.find(level => level.level === profile.campLevel);
    const questCards = active.length ? active.map(quest => {
      const state = questState(profile, quest);
      return `<button class="camp-contract-preview" data-nav="quests">${campIcon(state.status === 'completed' ? 'check' : 'quest')}<div><strong>${text(quest.name)}</strong><small>${state.status === 'completed' ? text('已完成，前往委托领取报酬') : text(quest.description)}<span class="camp-contract-rail"><i style="width:${state.progress / quest.target * 100}%"></i></span></small></div><span>${state.progress} / ${quest.target}${campIcon('arrow')}</span></button>`;
    }).join('') : `<button class="camp-contract-empty" data-nav="quests">${campIcon('quest')}<span><strong>${text('领取你的下一份委托')}</strong><small>${text('完成委托，解锁进阶军械。')}</small></span>${campIcon('arrow')}</button>`;
    return `<div class="camp-section-title"><div><span class="camp-eyebrow">${text('整备台')}</span><h3>${text('营地')}</h3></div><span class="camp-ready-tag">${campIcon(profile.pendingRun ? 'camp' : 'check')}${text(profile.pendingRun ? '等待结算' : '整备就绪')}</span></div>
      <article class="camp-expedition"><div class="camp-expedition-shade"></div><div class="camp-expedition-copy"><span class="camp-chapter">${text('第一章')}</span><h3>${text('钟下墓城')}</h3><p>${text('六个区域 · 两处支路 · 丧钟守卫')}</p><div class="camp-expedition-tags"><span>${campIcon('quest')}${text('连续探索')}</span><span>${campIcon('flame')}${text('三元素战斗')}</span></div></div><div class="camp-route-v6" aria-label="${text('地下城路线')}">${ZONES.map((zone,index)=>`<span class="${index===0?'is-start':''} ${index===ZONES.length-1?'is-boss':''}" title="${text(zone.name)}"><b>${String(index+1).padStart(2,'0')}</b><i></i></span>`).join('')}</div></article>
      <div class="camp-overview-loadout"><button data-nav="armory" class="camp-ready-item"><span class="camp-ready-icon">${skillIcon('attack',weapon)}</span><span><small>${text('出征武器')}</small><strong>${text(weapon.name)}</strong><em>${text(weapon.className)}</em></span>${campIcon('arrow')}</button><button data-nav="bag" class="camp-ready-item"><span class="camp-ready-icon">${selectedSupply?supplyArt(selectedSupply):campIcon('bag')}</span><span><small>${text('携带补给')}</small><strong>${selectedSupply?text(selectedSupply.name):text('未携带补给')}</strong><em>${selectedSupply?text('出征消耗一份'):text('可携带一件补给')}</em></span>${campIcon('arrow')}</button></div>
      <div class="camp-section-heading"><h4>${text('当前委托')}</h4><button class="camp-text-action" data-nav="quests">${text('查看委托')}${campIcon('arrow')}</button></div>${questCards}
      <button class="camp-growth-strip" data-nav="bag"><span class="camp-growth-symbol">${campIcon('camp')}</span><span><strong>${text('营地强化')}</strong><small>${currentLevel?text('生命 +{hp} · 伤害 +{damage}%',{hp:currentLevel.bonuses.maxHp,damage:Math.round((currentLevel.bonuses.damageMultiplier-1)*100)}):text('建立你的永久加成')}</small></span><span class="camp-growth-track">${CAMP_LEVELS.map(level=>`<i class="${level.level<=profile.campLevel?'active':''}"></i>`).join('')}<b>${profile.campLevel}/${CAMP_LEVELS.length}</b></span>${campIcon('arrow')}</button>
      <div class="camp-career"><span><b>${profile.stats.runs}</b>${text('累计出征')}</span><span><b>${profile.stats.wins}</b>${text('通关次数')}</span><span><b>${profile.unlockedWeapons.length}/${EQUIPMENT.length}</b>${text('军械收藏')}</span></div>`;
  }

  const armoryMarkup = profile => renderArmory(profile, inventoryState);
  const bagMarkup = profile => renderBag(profile, inventoryState);

  function questsMarkup(profile) {
    const hasActiveQuest = QUESTS.some(quest => questState(profile, quest).status === 'active');
    return `<h3 class="camp-pane-title">${text('委托')}</h3><p class="camp-pane-sub">${text('一次累计一份。出征前接受，回营结算进度；改接委托会保留已有进度。')}</p><div class="camp-quests">${QUESTS.map(quest => {
      const state = questState(profile, quest);
      const complete = state.status === 'completed', claimed = state.status === 'claimed';
      return `<article class="camp-quest ${complete ? 'is-complete' : ''} ${claimed ? 'is-claimed' : ''}" data-quest="${quest.id}"><span class="camp-quest-seal">${campIcon(claimed ? 'check' : 'quest')}</span><h4>${text(quest.name)}</h4><p>${text(quest.description)}</p><div class="camp-quest-progress"><div class="camp-progress-rail"><i style="width:${Math.min(100, state.progress / quest.target * 100)}%"></i></div><span>${state.progress} / ${quest.target}</span></div><div class="camp-quest-bottom"><span class="camp-quest-reward">${rewardMarkup(quest)}</span>
      ${claimed ? `<span class="camp-quest-status">${text('已领取')}</span>` : complete ? `<button class="camp-claim" data-action="claim" data-id="${quest.id}" ${profile.pendingRun ? 'disabled' : ''}>${text('领取报酬')}</button>` : state.status === 'active' ? `<span class="camp-quest-status">${text('进行中')}</span>` : `<button class="camp-claim" data-action="accept" data-id="${quest.id}" ${profile.pendingRun ? 'disabled' : ''}>${hasActiveQuest ? text('改接此委托') : text('接受委托')}</button>`}</div></article>`;
    }).join('')}</div>`;
  }

  function render() {
    if (destroyed) return null;
    const focused = document.activeElement;
    const focusAction = shell.contains(focused) ? focused?.dataset?.action : null;
    const focusId = focused?.dataset?.id;
    const profile = snapshot(), weapon = weaponById(profile.loadout);
    shell.style.setProperty('--camp-element', ELEMENTS[weapon.element].color);
    shell.dataset.tab = tab;
    shell.lang = getLocale();
    inventoryState = { ...inventoryState, ...normalizeArmorySelection(profile, inventoryState), ...normalizeBagSelection(profile, inventoryState) };
    shell.querySelector('.camp-header-level').textContent = t('营地 {level} 级', { level: profile.campLevel });
    shell.querySelector('.camp-portrait-tag').textContent = t(ELEMENTS[weapon.element].name);
    shell.querySelector('.camp-departure-note').textContent = t(profile.pendingRun ? '先结算上次出征' : '下一站：钟下墓城');
    shell.querySelectorAll('[data-camp-label]').forEach(node => { node.textContent = t(node.dataset.campLabel); });
    shell.querySelectorAll('[data-camp-aria]').forEach(node => { node.setAttribute('aria-label', t(node.dataset.campAria)); });
    if (noticeMessage) shell.querySelector('.camp-notice').textContent = typeof noticeMessage === 'function' ? noticeMessage() : t(noticeMessage);
    shell.querySelectorAll('.camp-nav [data-nav]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.nav === tab)));
    shell.querySelector('.camp-wallet').innerHTML = `${campIcon('coin')}<strong>${profile.gold}</strong><small>${text('金币')}</small><span class="camp-essence" title="${text('精华')}">${campIcon('flame')}<b>${profile.essence}</b></span>`;
    shell.querySelector('.camp-wallet').setAttribute('aria-label', t('{gold} 金币，{essence} 精华', { gold: profile.gold, essence: profile.essence }));
    shell.querySelector('.camp-classes').innerHTML = EQUIPMENT.filter(item => item.starter).map(starter => {
      const item = weaponForClass(profile, starter.element);
      return `<button data-action="class" data-id="${item.element}" aria-label="${text('选择{className}，{name}', { className: t(item.className), name: t(item.name) })}" title="${text(item.className)}" aria-pressed="${item.element === weapon.element}">${skillIcon('attack', item)}</button>`;
    }).join('');
    const packed = SUPPLIES.find(item => item.id === profile.selectedSupply);
    shell.querySelector('.camp-portrait-kit').innerHTML = `<button data-nav="armory" title="${text(weapon.skillName)}">${skillIcon('burst', weapon)}<span>${text(weapon.skillName)}</span></button><button data-nav="bag" title="${text(packed?.name || '携带补给')}">${packed ? supplyArt(packed) : campIcon('bag')}<span>${text(packed?.name || '携带补给')}</span></button>`;
    shell.querySelector('.camp-character').innerHTML = `<span class="camp-class">${text(weapon.className)}</span><h2>${text(weapon.name)}</h2><button class="camp-loadout-link" data-nav="armory">${text('更换武器')}${campIcon('arrow')}</button>`;
    pane.setAttribute('aria-labelledby', `camp-tab-${tab}`);
    const renderPane = { camp: campMarkup, armory: armoryMarkup, bag: bagMarkup, quests: questsMarkup }[tab];
    const oldScroll = pane.scrollTop;
    pane.innerHTML = pendingMarkup(profile) + renderPane(profile);
    pane.scrollTop = oldScroll;
    const start = shell.querySelector('.camp-start');
    start.dataset.action = profile.pendingRun ? 'settle' : 'start';
    start.innerHTML = `<span>${text(profile.pendingRun ? '结束上次出征' : '出征')}</span>${campIcon(profile.pendingRun ? 'camp' : 'arrow')}`;
    shell.querySelector('#camp-difficulty').disabled = Boolean(profile.pendingRun);
    if (focusAction && !shell.contains(document.activeElement)) {
      [...shell.querySelectorAll('button[data-action]')].find(button => button.dataset.action === focusAction && button.dataset.id === focusId && !button.disabled)?.focus({ preventScroll: true });
    }
    const context = { portraitCanvas, weaponId: weapon.id, tab };
    onRender(context);
    return context;
  }

  function setTab(next) {
    if (!tabs.some(item => item.id === next)) return;
    tab = next;
    pane.scrollTop = 0;
    render();
  }

  function mutate(method, args, message) {
    try {
      const synced = profileStore.sync();
      if (!synced.ok) { notify(synced.message, 'error'); return false; }
      const result = profileStore[method](...(typeof args === 'function' ? args(snapshot()) : args));
      if (!result?.ok) {
        if (result?.error === 'storage_conflict') refreshFromStorage();
        else render();
        notify(result?.message || '操作未完成，请检查营地记录。', 'error'); return false;
      }
      if (method === 'selectWeapon') {
        const weapon = weaponById(snapshot().loadout);
        inventoryState = { ...inventoryState, selectedWeaponId: weapon.id, elementFilter: inventoryState.elementFilter === 'all' ? 'all' : weapon.element };
      }
      render();
      onChange(snapshot(), { action: method, result });
      notify(message || result.message || '已保存');
      return true;
    } catch (error) {
      notify(error?.message || '无法保存本次操作。', 'error');
      return false;
    }
  }

  function refreshFromStorage() {
    const result = profileStore.sync();
    if (result.ok) { render(); onChange(snapshot(), { action: 'sync', result }); }
    return result;
  }

  function click(event) {
    const button = event.target.closest('button');
    if (!button || !shell.contains(button) || button.disabled) return;
    if (button.dataset.nav) { setTab(button.dataset.nav); return; }
    const id = button.dataset.id;
    switch (button.dataset.action) {
      case 'help': onHelp(); break;
      case 'inspect-weapon': inventoryState.selectedWeaponId = id; render(); break;
      case 'filter-element': inventoryState.elementFilter = id; render(); break;
      case 'inspect-supply': inventoryState.selectedItemId = id; render(); break;
      case 'class': mutate('selectWeapon', profile => [weaponForClass(profile, id)?.id], () => t('已备战：{name}', { name: t(weaponById(snapshot().loadout).name) })); break;
      case 'weapon': mutate('selectWeapon', [id], () => t('已备战：{name}', { name: t(weaponById(snapshot().loadout).name) })); break;
      case 'buy': mutate('buyItem', [id, 1], () => t('已购买 {name}', { name: t(SUPPLIES.find(item => item.id === id)?.name || '补给') })); break;
      case 'supply': mutate('selectSupply', [id || null], id ? '补给已装入，下次出征消耗一份' : '已取下补给'); break;
      case 'upgrade': mutate('upgradeCamp', [], '营地强化已完成'); break;
      case 'accept': mutate('acceptQuest', [id], '已接受委托，下次出征开始累计'); break;
      case 'claim': mutate('claimQuest', [id], '报酬已领取'); break;
      case 'unlock': {
        setTab('quests');
        const card = pane.querySelector(`[data-quest="${id}"]`);
        card?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        card?.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
        break;
      }
      case 'settle': {
        if (snapshot().pendingRun) mutate('settleRun', profile => [profile.pendingRun?.runId, { ...profile.pendingRun?.summary, outcome: 'retreated' }], '已结束上次出征，记录内战利品已结算');
        break;
      }
      case 'start': {
        const synced = refreshFromStorage();
        if (!synced.ok) { notify(synced.message, 'error'); return; }
        const profile = snapshot();
        if (profile.pendingRun) { render(); notify('请先结束上次出征。', 'error'); return; }
        const started = onStart({ weaponId: profile.loadout, difficulty });
        if (started === false) { render(); notify('未能出征，请检查本地保存或结束上次出征。', 'error'); }
        break;
      }
      default: break;
    }
  }

  function change(event) {
    if (event.target.id === 'camp-difficulty' && ['story', 'normal', 'hard'].includes(event.target.value)) difficulty = event.target.value;
  }

  function keydown(event) {
    const current = event.target.closest('.camp-nav [role="tab"]');
    if (!current || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.code)) return;
    event.preventDefault();
    const index = tabs.findIndex(item => item.id === current.dataset.nav);
    const nextIndex = event.code === 'Home' ? 0 : event.code === 'End' ? tabs.length - 1 : (index + (['ArrowRight','ArrowDown'].includes(event.code) ? 1 : -1) + tabs.length) % tabs.length;
    setTab(tabs[nextIndex].id);
    shell.querySelector(`#camp-tab-${tab}`).focus({ preventScroll: true });
  }

  shell.addEventListener('click', click);
  shell.addEventListener('change', change);
  shell.addEventListener('keydown', keydown);
  const unsubscribeLocale = onLocaleChange(render);
  render();
  if (profileStore.loadResult?.ok === false) notify(profileStore.loadResult.message || '无法读取本地营地记录。', 'error');
  return {
    render, setTab, refreshFromStorage, getPortraitTarget: () => portraitCanvas,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribeLocale();
      clearTimeout(noticeTimer);
      shell.removeEventListener('click', click);
      shell.removeEventListener('change', change);
      shell.removeEventListener('keydown', keydown);
      shell.remove();
    },
  };
}
