import { EQUIPMENT, ELEMENTS, DEFAULT_WEAPON_ID } from './content.js';
import { SUPPLIES, CAMP_LEVELS, QUESTS } from './profile.js';
import { skillIcon, campIcon, boonIcon } from './icons.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const number = value => Math.max(0, Number(value) || 0);
const weaponById = id => EQUIPMENT.find(weapon => weapon.id === id) || EQUIPMENT.find(weapon => weapon.id === DEFAULT_WEAPON_ID);
const tabs = [{ id: 'camp', label: '营地', icon: 'camp' }, { id: 'armory', label: '军械', icon: 'armory' }, { id: 'bag', label: '行囊', icon: 'bag' }, { id: 'quests', label: '委托', icon: 'quest' }];
const costText = cost => `${number(cost?.gold)} 金币${cost?.essence ? ` · ${cost.essence} 精华` : ''}`;
const affordable = (profile, cost) => profile.gold >= number(cost?.gold) && profile.essence >= number(cost?.essence);

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
  let tab = 'camp', difficulty = 'normal', noticeTimer = 0, destroyed = false;
  const shell = document.createElement('div');
  shell.className = 'camp-shell';
  shell.innerHTML = `<header class="camp-header">
    <div class="camp-brand">${campIcon('camp')}<div><strong>余烬地牢</strong><small>钟下墓城</small></div></div>
    <nav class="camp-nav" aria-label="营地功能" role="tablist">${tabs.map(item => `<button id="camp-tab-${item.id}" role="tab" aria-controls="camp-panel" aria-selected="${item.id === tab}" data-nav="${item.id}">${campIcon(item.icon)}<span>${item.label}</span></button>`).join('')}</nav>
    <div class="camp-wallet" aria-label="营地资金"></div>
  </header>
  <div class="camp-main">
    <section class="camp-portrait-space" aria-label="当前角色与武器"><div class="camp-portrait-window"><canvas id="camp-portrait" aria-label="角色三维预览"></canvas></div><div class="camp-classes" aria-label="选择基础职业"></div><div class="camp-character"></div></section>
    <section id="camp-panel" class="camp-pane" role="tabpanel" aria-labelledby="camp-tab-camp"></section>
  </div>
  <footer class="camp-footer"><div class="camp-footer-left"><button data-action="help">${campIcon('help')}操作</button><span>v0.4</span></div><button class="camp-start" data-action="start"><span>出征</span>${campIcon('arrow')}</button><div class="camp-footer-right"><span>难度</span><select id="camp-difficulty" aria-label="出征难度"><option value="story">轻松</option><option value="normal" selected>标准</option><option value="hard">困难</option></select></div></footer>
  <div class="camp-notice" role="status" aria-live="polite"></div>`;
  root.replaceChildren(shell);
  const portraitCanvas = shell.querySelector('#camp-portrait');
  const pane = shell.querySelector('.camp-pane');
  const snapshot = () => profileStore.snapshot ? profileStore.snapshot() : profileStore.profile;

  function notify(message, kind = 'normal') {
    if (destroyed || !message) return;
    clearTimeout(noticeTimer);
    const notice = shell.querySelector('.camp-notice');
    notice.textContent = message;
    notice.dataset.kind = kind;
    notice.classList.add('is-visible');
    noticeTimer = setTimeout(() => notice.classList.remove('is-visible'), 3300);
  }

  function questState(profile, quest) {
    const saved = profile.quests?.[quest.id] || {};
    return { status: saved.status || 'available', progress: Math.min(quest.target, number(saved.progress)) };
  }

  function rewardMarkup(quest) {
    const reward = quest.reward;
    return `${campIcon('coin')}${reward.gold}${reward.essence ? ` <span>· ${reward.essence} 精华</span>` : ''}${reward.weaponId ? `<span class="camp-reward-weapon">${escape(weaponById(reward.weaponId).name)}</span>` : ''}`;
  }

  function pendingMarkup(profile) {
    if (!profile.pendingRun) return '';
    return `<div class="camp-pending"><strong>上次出征尚未结算</strong><p>带回 25% 已记录金币及已记录装备，无法恢复战场。</p><button class="camp-claim" data-action="settle">结束上次出征</button></div>`;
  }

  function campMarkup(profile) {
    const selectedSupply = SUPPLIES.find(item => item.id === profile.selectedSupply);
    const active = QUESTS.filter(quest => ['active', 'completed'].includes(questState(profile, quest).status));
    const quests = active.length ? active.map(quest => {
      const state = questState(profile, quest);
      return `<div class="camp-contract-preview">${campIcon(state.status === 'completed' ? 'check' : 'quest')}<div><strong>${escape(quest.name)}</strong><small>${state.status === 'completed' ? '已完成，前往委托领取报酬' : escape(quest.description)}</small></div><span>${state.progress} / ${quest.target}</span></div>`;
    }).join('') : '<p class="camp-empty">接受一份委托，完成目标后回营领取报酬。</p>';
    return `<div class="camp-map"><span class="camp-map-label">出征地点</span><h3>钟下墓城</h3><p>六个区域 · 两处支路 · 丧钟守卫</p><div class="camp-route" aria-hidden="true"><i></i><span></span><i></i><span></span><i></i><span></span><i></i><span></span><i></i><span></span><i></i></div></div>
      <div class="camp-section-heading"><h4>当前委托</h4><button class="camp-text-action" data-nav="quests">查看委托</button></div>${quests}
      <div class="camp-section-heading"><h4>出征整备</h4><button class="camp-text-action" data-nav="bag">整理行囊</button></div>
      <div class="camp-loadout"><span class="camp-loadout-symbol">${selectedSupply ? supplyArt(selectedSupply) : campIcon('bag')}</span><div><strong>${selectedSupply ? escape(selectedSupply.name) : '未携带补给'}</strong><small>${selectedSupply ? escape(selectedSupply.description) : '每次可携带一件补给，出征时消耗。'}</small></div></div>
      <div class="camp-camp-level">营地等级 <b>${profile.campLevel} / ${CAMP_LEVELS.length}</b><span>${profile.campLevel ? '永久加成已计入下次出征' : '可在行囊页强化营地'}</span></div>`;
  }

  function armoryMarkup(profile) {
    return `<h3 class="camp-pane-title">军械</h3><p class="camp-pane-sub">选择出征武器。高级军械可由委托或战斗结算解锁。</p><div class="camp-armory">${[...EQUIPMENT].sort((a, b) => a.tier - b.tier).map(weapon => {
      const unlocked = profile.unlockedWeapons.includes(weapon.id), equipped = profile.loadout === weapon.id;
      const unlockQuest = QUESTS.find(quest => quest.reward.weaponId === weapon.id);
      return `<article class="camp-weapon ${unlocked ? '' : 'is-locked'} ${equipped ? 'is-equipped' : ''}" data-equipment="${weapon.id}"><div class="camp-weapon-top"><span class="camp-weapon-art">${skillIcon('attack', weapon)}</span><div><span class="camp-weapon-tier">${ELEMENTS[weapon.element].name} · ${weapon.tier === 1 ? '基础' : '高级'}</span><h4>${escape(weapon.name)}</h4><small>${escape(weapon.className)}</small></div></div><p>${escape(weapon.description)}</p>
        ${equipped ? '<span class="camp-equipped-label">已备战</span>' : unlocked ? `<button class="camp-equip" data-action="weapon" data-id="${weapon.id}" ${profile.pendingRun ? 'disabled' : ''}>装备出征</button>` : `<button class="camp-buy" data-action="unlock" data-id="${unlockQuest?.id || ''}">${campIcon('lock')}查看解锁委托</button>`}</article>`;
    }).join('')}</div><p class="camp-armory-note">结算时，已实际拾得的武器永久入库，撤退也保留。领取对应委托报酬同样可以解锁。</p>`;
  }

  function bagMarkup(profile) {
    const current = CAMP_LEVELS.find(level => level.level === profile.campLevel);
    const next = CAMP_LEVELS.find(level => level.level === profile.campLevel + 1);
    return `<h3 class="camp-pane-title">行囊</h3><p class="camp-pane-sub">金币购买补给。选择一件带入，出征时扣除一份。</p><div class="camp-supplies">${SUPPLIES.map(item => {
      const count = number(profile.items[item.id]), packed = profile.selectedSupply === item.id;
      return `<article class="camp-supply ${packed ? 'is-packed' : ''}"><span class="camp-supply-art">${supplyArt(item)}</span><h4>${escape(item.name)}</h4><p>${escape(item.description)}</p><div class="camp-supply-stock">持有<b>${count}</b></div><button class="camp-buy" data-action="buy" data-id="${item.id}" ${profile.gold < item.price || profile.pendingRun ? 'disabled' : ''}>${campIcon('coin')}${item.price} 购买一份</button><button class="camp-pack" data-action="supply" data-id="${packed ? '' : item.id}" ${!count || profile.pendingRun ? 'disabled' : ''}>${packed ? '已装入 · 点击取下' : '带入下次出征'}</button></article>`;
    }).join('')}</div><div class="camp-section-heading"><h4>营地强化</h4><span class="camp-level-caption">${profile.campLevel} / ${CAMP_LEVELS.length} 级</span></div><div class="camp-upgrade"><span class="camp-upgrade-icon">${campIcon('camp')}</span><div><strong>${next ? `营地升至 ${next.level} 级` : '营地已完全强化'}</strong><p>${current ? `当前：生命 +${current.bonuses.maxHp} · 伤害 +${Math.round((current.bonuses.damageMultiplier - 1) * 100)}%` : '当前无永久属性加成'}</p>${next ? `<p>升级后：生命 +${next.bonuses.maxHp} · 伤害 +${Math.round((next.bonuses.damageMultiplier - 1) * 100)}%</p>` : ''}<div class="camp-upgrade-steps" aria-label="营地等级 ${profile.campLevel}">${CAMP_LEVELS.map(level => `<i class="${level.level <= profile.campLevel ? 'active' : ''}"></i>`).join('')}</div></div>${next ? `<button class="camp-buy" data-action="upgrade" ${!affordable(profile, next.cost) || profile.pendingRun ? 'disabled' : ''}>${escape(costText(next.cost))}<br><span>强化营地</span></button>` : '<span class="camp-upgrade-max">已满级</span>'}</div><p class="camp-armory-note">营地加成为累计总值。任务报酬可获得精华；本局战场进度不会因此保存。</p>`;
  }

  function questsMarkup(profile) {
    const hasActiveQuest = QUESTS.some(quest => questState(profile, quest).status === 'active');
    return `<h3 class="camp-pane-title">委托</h3><p class="camp-pane-sub">一次累计一份。出征前接受，回营结算进度；改接委托会保留已有进度。</p><div class="camp-quests">${QUESTS.map(quest => {
      const state = questState(profile, quest);
      const complete = state.status === 'completed', claimed = state.status === 'claimed';
      return `<article class="camp-quest ${complete ? 'is-complete' : ''} ${claimed ? 'is-claimed' : ''}" data-quest="${quest.id}"><span class="camp-quest-seal">${campIcon(claimed ? 'check' : 'quest')}</span><h4>${escape(quest.name)}</h4><p>${escape(quest.description)}</p><div class="camp-quest-progress"><div class="camp-progress-rail"><i style="width:${Math.min(100, state.progress / quest.target * 100)}%"></i></div><span>${state.progress} / ${quest.target}</span></div><div class="camp-quest-bottom"><span class="camp-quest-reward">${rewardMarkup(quest)}</span>
      ${claimed ? '<span class="camp-quest-status">已领取</span>' : complete ? `<button class="camp-claim" data-action="claim" data-id="${quest.id}" ${profile.pendingRun ? 'disabled' : ''}>领取报酬</button>` : state.status === 'active' ? '<span class="camp-quest-status">进行中</span>' : `<button class="camp-claim" data-action="accept" data-id="${quest.id}" ${profile.pendingRun ? 'disabled' : ''}>${hasActiveQuest ? '改接此委托' : '接受委托'}</button>`}</div></article>`;
    }).join('')}</div>`;
  }

  function render() {
    if (destroyed) return null;
    const profile = snapshot(), weapon = weaponById(profile.loadout);
    shell.style.setProperty('--camp-element', ELEMENTS[weapon.element].color);
    shell.dataset.tab = tab;
    shell.querySelectorAll('.camp-nav [data-nav]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.nav === tab)));
    shell.querySelector('.camp-wallet').innerHTML = `${campIcon('coin')}<strong>${profile.gold}</strong><small>金币</small><span class="camp-essence" title="精华">${campIcon('flame')}<b>${profile.essence}</b></span>`;
    shell.querySelector('.camp-wallet').setAttribute('aria-label', `${profile.gold} 金币，${profile.essence} 精华`);
    shell.querySelector('.camp-classes').innerHTML = EQUIPMENT.filter(item => item.starter).map(item => `<button data-action="weapon" data-id="${item.id}" aria-label="选择${escape(item.className)}，${escape(item.name)}" title="${escape(item.className)}" aria-pressed="${item.element === weapon.element}" ${profile.pendingRun ? 'disabled' : ''}>${skillIcon('attack', item)}</button>`).join('');
    shell.querySelector('.camp-character').innerHTML = `<span class="camp-class">${escape(weapon.className)}</span><h2>${escape(weapon.name)}</h2><button class="camp-loadout-link" data-nav="armory">更换武器${campIcon('arrow')}</button>`;
    pane.setAttribute('aria-labelledby', `camp-tab-${tab}`);
    const renderPane = { camp: campMarkup, armory: armoryMarkup, bag: bagMarkup, quests: questsMarkup }[tab];
    const oldScroll = pane.scrollTop;
    pane.innerHTML = pendingMarkup(profile) + renderPane(profile);
    pane.scrollTop = oldScroll;
    const start = shell.querySelector('.camp-start');
    start.dataset.action = profile.pendingRun ? 'settle' : 'start';
    start.innerHTML = `<span>${profile.pendingRun ? '结束上次出征' : '出征'}</span>${campIcon(profile.pendingRun ? 'camp' : 'arrow')}`;
    shell.querySelector('#camp-difficulty').disabled = Boolean(profile.pendingRun);
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
      const result = profileStore[method](...args);
      if (!result?.ok) { notify(result?.message || '操作未完成，请检查营地记录。', 'error'); return false; }
      render();
      onChange(snapshot(), { action: method, result });
      notify(message || result.message || '已保存');
      return true;
    } catch (error) {
      notify(error?.message || '无法保存本次操作。', 'error');
      return false;
    }
  }

  function click(event) {
    const button = event.target.closest('button');
    if (!button || !shell.contains(button) || button.disabled) return;
    if (button.dataset.nav) { setTab(button.dataset.nav); return; }
    const id = button.dataset.id;
    switch (button.dataset.action) {
      case 'help': onHelp(); break;
      case 'weapon': mutate('selectWeapon', [id], `已备战：${weaponById(id).name}`); break;
      case 'buy': mutate('buyItem', [id, 1], `已购买 ${SUPPLIES.find(item => item.id === id)?.name || '补给'}`); break;
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
        const pending = snapshot().pendingRun;
        if (pending) mutate('settleRun', [pending.runId, { ...pending.summary, outcome: 'retreated' }], '已结束上次出征，记录内战利品已结算');
        break;
      }
      case 'start': {
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
    if (!current || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.code)) return;
    event.preventDefault();
    const index = tabs.findIndex(item => item.id === current.dataset.nav);
    const nextIndex = event.code === 'Home' ? 0 : event.code === 'End' ? tabs.length - 1 : (index + (event.code === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    setTab(tabs[nextIndex].id);
    shell.querySelector(`#camp-tab-${tab}`).focus({ preventScroll: true });
  }

  shell.addEventListener('click', click);
  shell.addEventListener('change', change);
  shell.addEventListener('keydown', keydown);
  render();
  if (profileStore.loadResult?.ok === false) notify(profileStore.loadResult.message || '无法读取本地营地记录。', 'error');
  return {
    render, setTab, getPortraitTarget: () => portraitCanvas,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(noticeTimer);
      shell.removeEventListener('click', click);
      shell.removeEventListener('change', change);
      shell.removeEventListener('keydown', keydown);
      shell.remove();
    },
  };
}
