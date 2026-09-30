import { Game, ROOMS } from './game.js';
import { DungeonView } from './view.js';
import { GameAudio } from './audio.js';
import { WORLD } from './world.js';
import { EQUIPMENT, ELEMENTS, STARTER_WEAPON_IDS, DEFAULT_WEAPON_ID } from './content.js';
import { skillIcon, utilityIcon, boonIcon } from './icons.js';
import { ProfileStore, QUESTS } from './profile.js';
import { createCampUI } from './camp-ui.js';
import { CampPreview } from './camp-preview.js';
import { blessingMarkup, markBlessingSelected } from './blessing-cards.js';
import './style.css';
import './camp.css';
import './blessing-cards.css';
import './battle-v4.css';

const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['world', 'loading', 'load-progress', 'menu', 'battle-impact', 'multikill', 'expedition-tracker',
  'hud', 'timer', 'sound', 'pause', 'bossbar', 'minimap', 'interaction-hint',
  'toast', 'floaters', 'level', 'hp-text', 'hp-bar', 'xp-bar', 'attack-button', 'dash-button', 'burst-button',
  'heal-button', 'potions', 'weapon', 'kills', 'build-open', 'overlay', 'overlay-content',
  'damage-flash', 'shield-value', 'buffs', 'weapon-cycle'].map(id => [id, $(id)]));
const QA_MODE = new URLSearchParams(location.search).get('qa') === '1';
const SETTINGS_KEY = 'emberfall.settings.v1' + (QA_MODE ? '.qa' : '');
const RECORD_KEY = 'emberfall.records.v1' + (QA_MODE ? '.qa' : '');
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clock = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function readStorage(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function saveStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
const savedSettings = readStorage(SETTINGS_KEY);
const settings = {
  version: 1,
  volume: clamp(finite(savedSettings?.volume, .8), 0, 1),
  muted: savedSettings?.muted === true,
  quality: ['low', 'medium', 'high'].includes(savedSettings?.quality) ? savedSettings.quality : 'high',
  bloom: savedSettings?.bloom !== false,
  shake: savedSettings?.shake !== false,
  effects: clamp(finite(savedSettings?.effects, 1), .5, 1.5),
};
let savedRecords = readStorage(RECORD_KEY);
if (savedRecords?.version !== 1) savedRecords = null;
const records = {
  version: 1,
  runs: Math.max(0, Math.floor(finite(savedRecords?.runs))),
  wins: Math.max(0, Math.floor(finite(savedRecords?.wins))),
  bestKills: Math.max(0, Math.floor(finite(savedRecords?.bestKills))),
  bestRoom: clamp(Math.floor(finite(savedRecords?.bestRoom)), 0, ROOMS.length),
  fastestVictory: finite(savedRecords?.fastestVictory, 0),
};
const PROFILE_KEY = 'emberfall.profile.v4' + (QA_MODE ? '.qa' : '');
const profileStore = new ProfileStore({ storage: localStorage, key: PROFILE_KEY, legacyRecords: records });
let campUI = null, campPreview = null;
let runId = null, runQuest = null, lastSettlement = null, checkpointClock = 0, checkpointWarning = false;
let blessingSelectionPending = false, impactTime = 0, killBannerTimer = 0;
const audio = new GameAudio(settings);
let game = null;
let view = null;
let ready = false;
let overlay = null;
let lastRoom = -1;
let resultRecorded = false, recordSaved = true;
let previousFrame = performance.now();
let hudClock = 0;
let flash = 0;
let toastTimer = 0;
let popupReturn = null;
let narrowNotified = false;
let selectedWeaponId = profileStore.profile.loadout || DEFAULT_WEAPON_ID;
let displayedWeaponId = null;
let displayedBuffs = '';
const attackNames = { sword: '烈焰斩击', greatsword: '重剑横斩', spear: '雷枪突刺', halberd: '战戟横扫', staff: '水刃挥击', scepter: '深潮挥击' };
const elementGlyph = { fire: 'flame', lightning: 'bolt', water: 'drop' };
const held = new Set();
const pulses = { dash: false, skill: false, potion: false, interact: false };
const pointer = { x: innerWidth / 2, y: innerHeight / 2, active: false, attack: false, buttonAttack: false };
let queuedAttack = false;
const difficultyLabel = { story: '轻松', normal: '标准', hard: '困难' };
const castTimers = new Map();
for (const node of document.querySelectorAll('[data-skill-art]')) node.innerHTML = skillIcon(node.dataset.skillArt);
ui['shield-value'].innerHTML = `${boonIcon('shield')}<span>0</span>`;
ui.pause.innerHTML = utilityIcon('pause');
ui['build-open'].querySelector('.build-art').innerHTML = utilityIcon('bag');

function clearInput() {
  held.clear();
  pointer.attack = false;
  pointer.buttonAttack = false;
  queuedAttack = false;
  for (const key of Object.keys(pulses)) pulses[key] = false;
}

function playable() {
  return ready && game?.status === 'playing' && overlay === null && !document.hidden;
}

function syncAudio() {
  audio.setRunning(playable());
  ui.sound.innerHTML = utilityIcon(settings.muted || settings.volume === 0 ? 'mute' : 'sound');
  ui.sound.setAttribute('aria-label', settings.muted ? '打开声音' : '静音');
  ui.sound.setAttribute('aria-pressed', String(!settings.muted));
}

function showToast(message, duration = 1800) {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.style.opacity = '1';
  ui['interaction-hint'].style.opacity = '0';
  toastTimer = setTimeout(() => { ui.toast.style.opacity = '0'; ui['interaction-hint'].style.opacity = ''; }, duration);
}

function showOverlay(type, markup) {
  clearInput();
  overlay = type;
  ui.overlay.dataset.panel = type;
  ui['overlay-content'].innerHTML = markup;
  ui.overlay.classList.remove('hidden');
  syncAudio();
  const focus = ui['overlay-content'].querySelector('button:not(:disabled), select, input');
  focus?.focus({ preventScroll: true });
}

function hideOverlay() {
  clearInput();
  overlay = null;
  ui.overlay.classList.add('hidden');
  ui['overlay-content'].replaceChildren();
  syncAudio();
}

function restoreGame() {
  hideOverlay();
  if (game?.status === 'upgrade') showUpgrade();
  else if (game?.status === 'dead' || game?.status === 'won') showResult();
  else if (game) ui.world.focus({ preventScroll: true });
}

function updateRecordLabel() { if (!game) campUI?.render(); }

function settleExpedition(outcome) {
  if (!game || !runId) return { ok: true, reward: null };
  const result = profileStore.settleRun(runId, { ...game.runSummary, outcome });
  if (result.ok) { lastSettlement = result; runId = null; }
  return result;
}
function checkpointExpedition() {
  if (!game || !runId || !['playing', 'upgrade'].includes(game.status)) return;
  const result = profileStore.checkpointRun?.(runId, game.runSummary);
  if (result && !result.ok && !checkpointWarning) { checkpointWarning = true; showToast('战利品暂未保存，请保持页面打开', 3200); }
}
function renderCamp() {
  if (!campUI) {
    campUI = createCampUI({ root: ui.menu, profileStore,
      onStart: startGame, onHelp: () => openHelp(),
      onChange: () => { selectedWeaponId = profileStore.profile.loadout; },
      onRender: ({ portraitCanvas, weaponId }) => {
        if (!view || !portraitCanvas) return;
        if (!campPreview || campPreview.canvas !== portraitCanvas) { campPreview?.dispose(); campPreview = new CampPreview(portraitCanvas, view); }
        campPreview.select(weaponId); campPreview.resize();
      },
    });
  }
  campUI.render();
}

export function startGame(options = {}) {
  if (!ready) return false;
  const requested = options.difficulty || 'normal';
  const difficulty = requested === 'easy' ? 'story' : ['story', 'normal', 'hard'].includes(requested) ? requested : 'normal';
  if (game && runId) { const settled = settleExpedition(['dead', 'won'].includes(game.status) ? game.status : 'retreated'); if (!settled.ok) { showToast(settled.message || '无法保存本局，暂不能重新出征', 3000); return false; } }
  if (options.weaponId && profileStore.profile.unlockedWeapons.includes(options.weaponId)) {
    const selected = profileStore.selectWeapon(options.weaponId); if (!selected.ok) return false;
  }
  const nextRunId = globalThis.crypto?.randomUUID?.() || `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const prepared = profileStore.prepareRun(nextRunId);
  if (!prepared.ok) { renderCamp(); return false; }
  runId = nextRunId; lastSettlement = null; checkpointClock = 0; checkpointWarning = false;
  selectedWeaponId = prepared.run.weaponId;
  const camp = profileStore.profile;
  const quest = QUESTS.find(item => item.id === camp.activeQuest);
  runQuest = quest ? { ...quest, baseProgress: camp.quests[quest.id].progress } : null;
  const seed = options.seed ?? (globalThis.crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Date.now());
  clearInput();
  hideOverlay();
  ui.floaters.replaceChildren();
  clearTimeout(toastTimer);
  ui.toast.style.opacity = '0';
  ui['interaction-hint'].style.opacity = '';
  ui['damage-flash'].style.opacity = '0';
  flash = 0;
  resultRecorded = false; recordSaved = true; blessingSelectionPending = false; impactTime = 0;
  ui.multikill.classList.remove('visible'); ui.multikill.replaceChildren(); clearTimeout(killBannerTimer);
  game = new Game({ ...prepared.run, seed, difficulty }).start();
  displayedWeaponId = null;
  displayedBuffs = '';
  ui.buffs.replaceChildren();
  lastRoom = game.roomIndex;
  view.setRoom(lastRoom);
  ui.menu.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  syncAudio();
  consumeEvents();
  updateHud();
  ui.world.focus({ preventScroll: true });
  if ((innerWidth < 720 || matchMedia('(pointer: coarse)').matches) && !narrowNotified) {
    narrowNotified = true;
    showToast('建议使用键盘、鼠标和横屏', 3000);
  }
  return true;
}

function showMenu() {
  if (game && runId) { const result = settleExpedition(['dead','won'].includes(game.status) ? game.status : 'retreated'); if (!result.ok) { showToast(result.message || '无法保存本局战利品，请保持页面打开', 3200); return; } }
  clearInput();
  game = null;
  lastRoom = -1;
  hideOverlay();
  ui.hud.classList.add('hidden');
  ui.menu.classList.remove('hidden');
  ui.floaters.replaceChildren();
  ui['damage-flash'].style.opacity = '0';
  renderCamp();
  ui.menu.querySelector('button')?.focus({ preventScroll: true });
  syncAudio();
}

function applyViewSettings() {
  view?.configure({ quality: settings.quality, bloom: settings.bloom, shake: settings.shake, effects: settings.effects });
}

function openPause(message = '') {
  if (!game || ['dead', 'won', 'menu'].includes(game.status)) return;
  showOverlay('pause', `
    <h3>暂停</h3>${message ? `<p class="sub">${escape(message)}</p>` : ''}
    <div class="settings">
      <label>声音 <input id="volume-setting" aria-label="音量" type="range" min="0" max="100" value="${Math.round(settings.volume * 100)}"></label>
      <label>画质 <select id="quality-setting">${[['low', '低'], ['medium', '中'], ['high', '高']].map(([value, name]) => `<option value="${value}" ${settings.quality === value ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
      <label class="setting-toggle">光晕 <input id="bloom-setting" type="checkbox" ${settings.bloom ? 'checked' : ''}><span class="switch" aria-hidden="true"></span></label>
      <label class="setting-toggle">镜头震动 <input id="shake-setting" type="checkbox" ${settings.shake ? 'checked' : ''}><span class="switch" aria-hidden="true"></span></label>
      <label class="effects-setting">特效强度 <input id="effects-setting" aria-label="特效强度" type="range" min="0.5" max="1.5" step="0.1" value="${settings.effects}"><output id="effects-value">${settings.effects.toFixed(1)}×</output></label>
    </div>
    <div class="actions"><button id="resume-game" class="primary">继续游戏</button><button id="pause-help" class="secondary">操作</button><button id="pause-build" class="secondary">装备</button></div>
    <div class="actions" style="margin-top:18px"><button id="restart-game" class="text-btn">重新开始</button><button id="return-menu" class="text-btn">收队回营</button></div>
    <p class="sub" style="font-size:10px;margin-top:26px">收队带回 25% 金币与已发现装备；本局祝福不保留。</p>`);
  $('resume-game').addEventListener('click', restoreGame);
  $('pause-help').addEventListener('click', () => openHelp('pause'));
  $('pause-build').addEventListener('click', () => openBuild('pause'));
  $('restart-game').addEventListener('click', () => startGame({ difficulty: game.difficulty }));
  $('return-menu').addEventListener('click', showMenu);
  $('volume-setting').addEventListener('input', event => {
    settings.volume = Number(event.target.value) / 100;
    if (settings.volume > 0) settings.muted = false;
    audio.setVolume(settings.volume);
    audio.setMuted(settings.muted);
    saveStorage(SETTINGS_KEY, settings);
    syncAudio();
  });
  for (const field of ['quality', 'bloom', 'shake', 'effects']) {
    $(field + '-setting').addEventListener(field === 'effects' ? 'input' : 'change', event => {
      settings[field] = field === 'quality' ? event.target.value : field === 'effects' ? clamp(Number(event.target.value), .5, 1.5) : event.target.checked;
      if (field === 'effects') $('effects-value').textContent = settings.effects.toFixed(1) + '×';
      applyViewSettings();
      saveStorage(SETTINGS_KEY, settings);
    });
  }
}

function closePopup() {
  if (popupReturn === 'pause') openPause();
  else if (game) restoreGame();
  else hideOverlay();
}

function openHelp(returnTo = null) {
  popupReturn = returnTo;
  showOverlay('help', `<h3>操作</h3>
    <div class="help-grid"><div><kbd>W A S D</kbd>移动</div><div><kbd>鼠标</kbd>瞄准</div><div><kbd>左键 / J</kbd>按住连续攻击</div><div><kbd>SPACE</kbd>闪避，短暂无敌</div><div><kbd>右键 / K</kbd>当前武器范围技能</div><div><kbd>Q</kbd>治疗药水</div><div><kbd>E</kbd>清场后领取奖励</div><div><kbd>1 / 2 / 3</kbd>选择祝福</div><div><kbd>B</kbd>装备与构筑</div><div><kbd>TAB</kbd>切换元素武器</div><div><kbd>ESC</kbd>暂停 / 返回</div></div>
    <p class="sub">躲开红色攻击预警。范围群杀会返还冷却；清场领奖后沿金色标记前进。<br>装备自动拾取，按 B 更换；Tab 优先使用已拥有的高级装备。<br>地图青色菱形是支线目标，靠近按 E 互动。击败最终 Boss 及随从即可通关。</p>
    <button id="close-popup" class="primary">返回</button>`);
  $('close-popup').addEventListener('click', closePopup);
}

function openBuild(returnTo = null) {
  if (!game) return;
  popupReturn = returnTo;
  const stats = game.combatStats;
  const boons = game.boons.length
    ? game.boons.map(boon => `<div>${boonIcon(boon.icon)}<span><strong>${escape(boon.name)}${boon.stacks > 1 ? ` ×${boon.stacks}` : ''}</strong><small>${escape(boon.description)}</small></span></div>`).join('')
    : '<p class="sub">尚未获得祝福</p>';
  const cards = [...EQUIPMENT].sort((a, b) => a.tier - b.tier).map(item => {
    const owned = game.inventory.includes(item.id), equipped = item.id === game.weapon.id;
    const preview = game.statsForWeapon(item.id);
    return `<article class="weapon-card ${equipped ? 'equipped' : ''} ${owned ? '' : 'locked'}" data-element="${item.element}" data-weapon-card="${item.id}">
      <div class="weapon-card-top"><span class="weapon-art">${skillIcon('attack', item)}</span><div><span class="weapon-tier">${ELEMENTS[item.element].name} · ${item.tier === 1 ? '初始武器' : '进阶武器'}</span><h4>${escape(item.name)}</h4><span class="weapon-class">${escape(item.className)}</span></div></div>
      <div class="weapon-numbers"><span><b>${Math.round(preview.damage)}</b> 攻击</span><span><b>${preview.attackInterval.toFixed(2)}</b> 秒 / 次</span><span><b>${preview.attackRange.toFixed(1)}</b> 米</span></div>
      <p class="weapon-skill"><strong>${escape(item.skillName)}</strong><span>${Math.round(preview.skillDamage)} 爆发 · ${preview.skillCooldown.toFixed(1)} 秒冷却</span></p>
      <p class="weapon-description">${escape(item.skillDescription)}</p>
      ${equipped ? '<span class="equip-state">已装备</span>' : owned ? `<button class="equip-button" data-equip="${item.id}">装备</button>` : '<span class="equip-state locked-label">探索获得</span>'}
    </article>`;
  }).join('');
  showOverlay('build', `<div class="build-heading"><div><h3>装备与构筑</h3><p class="sub">${escape(game.weapon.className)} · Tab 切换元素，优先使用高级装备</p></div><button id="close-popup" class="close-build" aria-label="关闭装备面板">返回 <kbd>B / ESC</kbd></button></div>
    <div class="build-stats"><div><strong>${Math.round(stats.damage)}</strong><small>攻击</small></div><div><strong>${Math.round(stats.critChance * 100)}%</strong><small>暴击</small></div><div><strong>${Math.round(stats.armor * 100)}%</strong><small>减伤</small></div><div><strong>${stats.speed.toFixed(1)}</strong><small>移动速度</small></div><div><strong>${Math.ceil(game.player.shield || 0)}</strong><small>护盾</small></div></div>
    <div class="weapon-inventory">${cards}</div>
    <div class="build-footnote">属性已计入本局祝福与当前增益 · 高级装备来自清场奖励和精英掉落</div>
    <details class="build-boons"><summary>祝福 <span>${game.boons.reduce((n, boon) => n + boon.stacks, 0)}</span></summary><div class="boon-list">${boons}</div></details>`);
  $('close-popup').addEventListener('click', closePopup);
  ui['overlay-content'].querySelectorAll('[data-equip]').forEach(button => button.addEventListener('click', () => {
    if (!game.equipWeapon(button.dataset.equip)) return;
    consumeEvents();
    updateHud();
    openBuild(returnTo);
  }));
}

function cycleWeapon() {
  if (!playable() || !game.cycleWeapon()) return;
  consumeEvents();
  updateHud();
  ui.world.focus({ preventScroll: true });
}

function showUpgrade() {
  if (game?.status !== 'upgrade') return;
  blessingSelectionPending = false;
  showOverlay('upgrade', blessingMarkup(game));
  ui['overlay-content'].querySelectorAll('[data-choice]').forEach(button => {
    button.addEventListener('click', () => chooseUpgrade(Number(button.dataset.choice)));
  });
}

function chooseUpgrade(index) {
  if (overlay !== 'upgrade' || game?.status !== 'upgrade' || blessingSelectionPending || !game.choices[index]) return;
  blessingSelectionPending = true;
  markBlessingSelected(ui['overlay-content'], index);
  const pendingGame = game;
  setTimeout(() => {
    if (game !== pendingGame) return;
    try {
      if (game.status !== 'upgrade' || !game.chooseUpgrade(index)) return;
    } finally {
      // The click guard belongs to this animation, not the rest of the run.
      blessingSelectionPending = false;
    }
    // A pointer/blur may have opened pause while the selection animated.
    if (overlay === 'upgrade') restoreGame();
    consumeEvents(); updateHud(); checkpointExpedition();
  }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200);
}

function showResult() {
  if (!game || !['dead', 'won'].includes(game.status)) return;
  const won = game.status === 'won';
  const settlement = runId ? settleExpedition(won ? 'won' : 'dead') : lastSettlement;
  let saved = settlement?.ok !== false;
  if (!resultRecorded) {
    resultRecorded = true;
    records.runs++;
    records.wins += won ? 1 : 0;
    records.bestKills = Math.max(records.bestKills, game.kills);
    records.bestRoom = Math.max(records.bestRoom, game.roomIndex + 1);
    if (won && (!records.fastestVictory || game.time < records.fastestVictory)) records.fastestVictory = game.time;
    recordSaved = saveStorage(RECORD_KEY, records);
    saved = recordSaved && saved;
  }
  saved = saved && recordSaved;
  showOverlay('result', `<h3>${won ? '凯旋' : '火种未熄'}</h3>
    <p class="sub">${won ? '丧钟守卫已被击败' : escape(game.roomName)}</p>
    <div class="stats"><div><strong>${clock(game.time)}</strong><small>耗时</small></div><div><strong>${game.kills}</strong><small>击杀</small></div><div><strong>${game.player.level}</strong><small>等级</small></div><div><strong>${game.gold}</strong><small>金币</small></div></div>
    <p class="settlement-reward">带回 <strong>${settlement?.reward?.gold ?? 0}</strong> 金币 · <strong>${settlement?.reward?.essence ?? 0}</strong> 余烬精华${settlement?.reward?.unlockedWeapons?.length ? ` · 发现 ${settlement.reward.unlockedWeapons.length} 件装备` : ''}</p>
    <p class="sub">${difficultyLabel[game.difficulty]} · ${game.boons.reduce((total, boon) => total + boon.stacks, 0)} 项祝福 · ${Math.round(game.damageDealt)} 伤害</p>
    <div class="actions"><button id="play-again" class="primary">再来一局</button><button id="result-menu" class="secondary">返回营地</button></div>
    <p class="sub" style="font-size:10px;margin-top:25px">${saved ? '战利品与委托进度已保存' : '保存未成功，请保持页面打开'}</p>`);
  $('play-again').addEventListener('click', () => startGame({ difficulty: game.difficulty }));
  $('result-menu').addEventListener('click', showMenu);
  updateRecordLabel();
}

function floatText(event, style, text) {
  if (!Number.isFinite(event.x) || !Number.isFinite(event.z)) return;
  const position = view.screenPoint(event.x, event.z, event.target === 'player' ? 2.4 : 2);
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
  const element = document.createElement('span');
  element.className = `floater ${style} ${event.critical ? 'critical' : ''} ${event.source === 'skill' || event.source === 'chain' ? 'skill-damage' : ''}`;
  element.dataset.element = event.element || game?.weapon.element || 'fire';
  element.textContent = text;
  element.style.left = `${position.x + (Math.random() - .5) * 22}px`;
  element.style.top = `${position.y}px`;
  if (event.critical) element.style.fontSize = '27px';
  while (ui.floaters.childElementCount >= 32) ui.floaters.firstElementChild.remove();
  ui.floaters.append(element);
  setTimeout(() => element.remove(), 900);
}

function consumeEvents() {
  if (!game) return;
  lastRoom = game.roomIndex;
  const events = game.drainEvents();
  const receivedEquipment = events.some(event => event.type === 'equipment');
  for (const event of events) {
    view.effect(event);
    switch (event.type) {
      case 'room': checkpointExpedition(); if (event.index === 5) audio.play('boss', { gain: .5 }); break;
      case 'attack': audio.play('slash', { gain: .3, element: event.element }); flashSkill('attack-button'); break;
      case 'dash': audio.play('dash', { gain: .34 }); flashSkill('dash-button'); break;
      case 'skill':
        audio.play('skill', { gain: .58, element: event.element }); flashSkill('burst-button');
        impactTime = .22; ui['battle-impact'].dataset.element = event.element;
        break;
      case 'multikill':
        clearTimeout(killBannerTimer);
        ui.multikill.dataset.element = event.element;
        ui.multikill.innerHTML = `<span class="kill-flourish">${event.kills >= 10 ? '横扫千军' : event.kills >= 6 ? '势不可挡' : '一击破阵'}</span><strong>${event.kills}<small>连斩</small></strong><span class="kill-reward">${event.cooldownRefund > .01 ? `技能回转 −${event.cooldownRefund.toFixed(1)}s · ` : ''}+${event.gold || 0} 金币</span>`;
        ui.multikill.classList.remove('visible'); void ui.multikill.offsetWidth; ui.multikill.classList.add('visible');
        audio.play('multikill',{gain:.44});
        killBannerTimer = setTimeout(() => ui.multikill.classList.remove('visible'), 2400);
        break;
      case 'poi': showToast(`${event.name} · 已取得`, 2500); audio.play('heal',{gain:.44}); checkpointExpedition(); break;
      case 'hit':
        audio.play('hit', { gain: event.target === 'player' ? .42 : .24 });
        floatText(event, event.target === 'player' ? 'damage' : '', `${event.amount}`);
        if (event.target === 'player') flash = .55;
        break;
      case 'heal': audio.play('heal', { gain: .3 }); floatText(event, 'heal', `+${Math.round(event.amount)}`); if (event.source === 'potion') flashSkill('heal-button'); break;
      case 'pickup': audio.play('pickup', { gain: event.item === 'xp' ? .09 : .16 }); break;
      case 'upgrade': audio.play('heal', { gain: .24 }); if (event.reason === 'room' && !receivedEquipment) showToast('通道已开启', 2000); break;
      case 'equip': if (!overlay) showToast(`${event.name} · ${event.className}`, 1100); break;
      case 'equipment': showToast(`获得 ${event.name} · B 装备`, 2800); audio.play('pickup', { gain: .3 }); break;
      case 'bossphase': showToast('Boss 进入第二阶段', 2200); audio.play('boss', { gain: .5 }); break;
      default: break;
    }
  }
  if (game.status === 'upgrade' && overlay !== 'upgrade' && !['pause', 'help', 'build'].includes(overlay)) showUpgrade();
  if (['dead', 'won'].includes(game.status) && overlay !== 'result') showResult();
}

function flashSkill(id) {
  clearTimeout(castTimers.get(id));
  ui[id].classList.add('is-casting');
  castTimers.set(id, setTimeout(() => { ui[id].classList.remove('is-casting'); castTimers.delete(id); }, 170));
}

function drawMinimap() {
  const context = ui.minimap.getContext('2d');
  if (!context || !game) return;
  const width = ui.minimap.width, height = ui.minimap.height;
  const bounds = WORLD.bounds;
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  const scale = Math.min((width - 18) / spanX, (height - 18) / spanZ);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanZ * scale) / 2;
  const x = worldX => offsetX + (worldX - bounds.minX) * scale;
  const y = worldZ => offsetY + (worldZ - bounds.minZ) * scale;
  const visited = game.visitedZoneIds || new Set();
  const cleared = game.clearedZoneIds || new Set();
  context.clearRect(0, 0, width, height);
  // Every rectangle uses the same world transform: halls remain connected and
  // the marker follows the player's global position, including side alcoves.
  for (const area of WORLD.walkable) {
    const zoneIndex = area.zoneIndex ?? area.from;
    const zone = WORLD.zones[zoneIndex];
    const known = zone && visited.has(zone.id);
    const done = zone && cleared.has(zone.id);
    context.fillStyle = done ? '#718d7e49' : known ? '#afa07836' : '#61716b1c';
    context.fillRect(x(area.minX), y(area.minZ), (area.maxX - area.minX) * scale, (area.maxZ - area.minZ) * scale);
  }
  context.strokeStyle = '#a3b8a45c'; context.lineWidth = .7;
  context.beginPath();
  for (const edge of WORLD.boundaries) { context.moveTo(x(edge.x1), y(edge.z1)); context.lineTo(x(edge.x2), y(edge.z2)); }
  context.stroke();
  const current = WORLD.zones.find(zone => zone.id === game.currentZoneId);
  if (current) {
    const r = current.bounds;
    context.strokeStyle = '#d7bd8870'; context.lineWidth = .9;
    context.strokeRect(x(r.minX) + 1, y(r.minZ) + 1, (r.maxX - r.minX) * scale - 2, (r.maxZ - r.minZ) * scale - 2);
  }
  for (const zone of WORLD.zones) {
    if (!cleared.has(zone.id)) continue;
    const cx = x(zone.center.x), cy = y(zone.center.z);
    context.strokeStyle = '#bdd0ac88'; context.lineWidth = 1;
    context.beginPath(); context.moveTo(cx - 3, cy); context.lineTo(cx - 1, cy + 2); context.lineTo(cx + 4, cy - 3); context.stroke();
  }
  const waypoint = game.nextWaypoint;
  if (waypoint && ['reward', 'travel'].includes(waypoint.kind)) {
    const cx = x(waypoint.x), cy = y(waypoint.z);
    context.fillStyle = '#e9c382';
    context.beginPath(); context.moveTo(cx, cy - 3); context.lineTo(cx + 3, cy); context.lineTo(cx, cy + 3); context.lineTo(cx - 3, cy); context.closePath(); context.fill();
  }
  for (const point of game.interestPoints || []) {
    if (!point.available || point.completed) continue;
    const cx=x(point.x), cy=y(point.z); context.fillStyle='#8cdbd3'; context.strokeStyle='#102626';context.lineWidth=1;
    context.beginPath(); context.moveTo(cx,cy-4);context.lineTo(cx+4,cy);context.lineTo(cx,cy+4);context.lineTo(cx-4,cy);context.closePath();context.fill();context.stroke();
  }
  for (const drop of game.drops) {
    if (drop.type !== 'potion') continue;
    context.fillStyle = '#dc8d75'; context.fillRect(x(drop.x) - 1, y(drop.z) - 1, 2, 2);
  }
  for (const enemy of game.enemies) {
    context.fillStyle = enemy.type === 'boss' ? '#ff9262' : enemy.elite ? '#d28bd2' : '#e47362';
    context.beginPath(); context.arc(x(enemy.x), y(enemy.z), enemy.type === 'boss' ? 3 : 1.5, 0, Math.PI * 2); context.fill();
  }
  const p = game.player;
  context.save(); context.translate(x(p.x), y(p.z)); context.rotate(-p.facing);
  context.shadowColor = '#fff1bb'; context.shadowBlur = 5;
  context.fillStyle = '#ffe7a7'; context.strokeStyle = '#252d25'; context.lineWidth = 1;
  context.beginPath(); context.moveTo(0, 5); context.lineTo(-3.5, -3); context.lineTo(0, -1); context.lineTo(3.5, -3); context.closePath(); context.fill(); context.stroke();
  context.restore();
}

function updateSkillArt() {
  const weapon = game.weapon;
  if (displayedWeaponId === weapon.id) return;
  displayedWeaponId = weapon.id;
  ui.hud.dataset.element = weapon.element;
  for (const node of document.querySelectorAll('[data-skill-art]')) node.innerHTML = skillIcon(node.dataset.skillArt, weapon);
  ui['weapon-cycle'].title = 'Tab 切换元素（优先高级装备）';
  ui['weapon-cycle'].setAttribute('aria-label', `${weapon.name}，Tab 切换元素武器`);
  ui['weapon-cycle'].querySelectorAll('[data-element]').forEach(node => node.classList.toggle('selected', node.dataset.element === weapon.element));
}

function updateBuffs() {
  const buffs = game.activeBuffs;
  const signature = buffs.map(buff => buff.id).join('|');
  if (signature !== displayedBuffs) {
    displayedBuffs = signature;
    ui.buffs.innerHTML = buffs.map(buff => `<div class="buff-medallion" data-buff="${escape(buff.id)}" data-element="${buff.element}">${boonIcon(elementGlyph[buff.element])}<span class="buff-time"></span><span class="buff-tooltip">${escape(buff.name)}</span></div>`).join('');
  }
  for (const buff of buffs) {
    const node = ui.buffs.querySelector(`[data-buff="${buff.id}"]`);
    node.style.setProperty('--buff-angle', `${clamp(buff.remaining / buff.duration, 0, 1) * 360}deg`);
    node.querySelector('.buff-time').textContent = `${Math.ceil(buff.remaining)}s`;
    node.title = `${buff.name} · 剩余 ${buff.remaining.toFixed(1)} 秒`;
    node.setAttribute('aria-label', node.title);
  }
}

function updateHud() {
  if (!game) return;
  const p = game.player;
  const stats = game.combatStats;
  updateSkillArt();
  updateBuffs();
  ui['shield-value'].querySelector('span').textContent = Math.ceil(p.shield || 0);
  ui['shield-value'].classList.toggle('active', p.shield > 0);
  ui['shield-value'].setAttribute('aria-label', `护盾 ${Math.ceil(p.shield || 0)}`);
  ui.timer.textContent = clock(game.time);
  ui.level.innerHTML = `<span>${p.level}</span>`;
  ui['hp-text'].textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
  ui['hp-bar'].style.width = `${clamp(p.hp / p.maxHp, 0, 1) * 100}%`;
  ui['xp-bar'].style.width = `${clamp(p.xp / p.xpNext, 0, 1) * 100}%`;
  ui['xp-bar'].title = `经验 ${Math.floor(p.xp)} / ${p.xpNext}`;
  ui.potions.textContent = p.potions;
  ui.weapon.textContent = game.weapon.name;
  ui.kills.textContent = `${game.kills} 击杀 · ${game.gold} 金币`;
  const interaction = game.nearestInteraction;
  const rewardAvailable = game.status === 'playing' && (interaction || game.rewardReady);
  ui['interaction-hint'].classList.toggle('hidden', !rewardAvailable);
  if (rewardAvailable) ui['interaction-hint'].innerHTML = `<kbd>E</kbd>${escape(interaction?.label || '领取祝福')}`;
  const optional = (game.interestPoints || []).filter(point => point.available && !point.completed);
  ui['expedition-tracker'].innerHTML = `<span>${escape(game.roomName)}</span><strong>${game.roomCleared ? '区域已肃清' : `第 ${game.waveIndex + 1} / ${game.waveCount} 波 · ${game.enemies.length} 敌人`}</strong>${runQuest ? `<small class="tracked-quest">${escape(runQuest.name)} · ${Math.min(runQuest.target,runQuest.baseProgress+(game.runSummary?.[runQuest.metric]||0))}/${runQuest.target}</small>` : ''}${optional.length ? `<small>◇ ${escape(optional[0].name)} · 支线 ${Math.round(Math.hypot(game.player.x-optional[0].x,game.player.z-optional[0].z))}m</small>` : ''}`;
  const boss = game.enemies.find(enemy => enemy.type === 'boss');
  ui.bossbar.classList.toggle('hidden', !boss);
  if (boss) {
    ui.bossbar.querySelector('strong').textContent = boss.phase === 2 ? '丧钟守卫 · 狂焰' : '丧钟守卫';
    ui.bossbar.querySelector('i').style.width = `${Math.max(0, boss.hp / boss.maxHp * 100)}%`;
    ui.bossbar.title = `${Math.ceil(boss.hp)} / ${boss.maxHp}`;
  }
  const tooltips = {
    'attack-button': `左键 / J · 按住连击\n${Math.round(stats.damage)} 伤害 · ${stats.attackInterval.toFixed(2)} 秒 / 次`,
    'dash-button': `SPACE · 短暂无敌\n冷却 ${p.dashCooldown.toFixed(1)} 秒`,
    'burst-button': `右键 / K · ${Math.round(stats.skillDamage)} 爆发伤害\n${game.weapon.skillDescription}`,
    'heal-button': `Q · 恢复生命\n剩余 ${p.potions} 瓶`,
  };
  for (const [id, remaining, max, name] of [
    ['attack-button', p.attackCd, stats.attackInterval, attackNames[game.weapon.type] || '攻击'],
    ['dash-button', p.dashCd, p.dashCooldown, '闪避'],
    ['burst-button', p.skillCd, stats.skillCooldown, game.weapon.skillName],
    ['heal-button', p.potionCd, .8, '药水'],
  ]) {
    const cooling = remaining > .04;
    ui[id].style.setProperty('--cooldown-angle', `${clamp(remaining / max, 0, 1) * 360}deg`);
    ui[id].classList.toggle('is-cooling', cooling);
    ui[id].querySelector('.cooldown-number').textContent = cooling ? remaining >= 1 ? String(Math.ceil(remaining)) : remaining.toFixed(1) : '';
    ui[id].setAttribute('aria-label', `${name}${cooling ? `，冷却 ${remaining.toFixed(1)} 秒` : '，已就绪'}。${tooltips[id].replaceAll('\n', '。')}`);
    const tooltip = ui[id].querySelector('.skill-name');
    const text = `<strong>${escape(name)}</strong><small>${escape(tooltips[id]).replaceAll('\n', '<br>')}</small>`;
    if (tooltip.innerHTML !== text) tooltip.innerHTML = text;
    ui[id].setAttribute('aria-disabled', String(cooling));
  }
  ui['heal-button'].classList.toggle('is-empty', p.potions <= 0);
  ui['heal-button'].setAttribute('aria-disabled', String(p.potions <= 0 || p.potionCd > 0 || p.hp >= p.maxHp));
  drawMinimap();
}

function action(name) {
  if (!playable()) return;
  if (name === 'potion') {
    if (game.player.potions <= 0) { showToast('没有药水'); return; }
    if (game.player.hp >= game.player.maxHp) { showToast('生命已满', 1200); return; }
  }
  if (name === 'interact' && !game.roomCleared && !game.nearestInteraction) { showToast('战斗结束后可领取奖励', 1300); return; }
  if (name === 'interact' && game.roomRewardTaken && !game.nearestInteraction) {
    showToast('沿通道继续前进', 1500); return;
  }
  pulses[name] = true;
}

ui.world.tabIndex = 0;
ui.world.style.outline = 'none';
ui.world.addEventListener('contextmenu', event => event.preventDefault());
ui.world.addEventListener('pointermove', event => { pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = true; });
ui.world.addEventListener('pointerdown', event => {
  if (!playable()) return;
  event.preventDefault();
  pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = true;
  if (event.button === 0) { pointer.attack = true; queuedAttack = true; }
  if (event.button === 2) action('skill');
  ui.world.focus({ preventScroll: true });
});
addEventListener('pointerup', event => { if (event.button === 0) { pointer.attack = false; pointer.buttonAttack = false; } });
addEventListener('pointercancel', clearInput);
ui['attack-button'].addEventListener('pointerdown', event => {
  if (playable()) { event.preventDefault(); pointer.buttonAttack = true; queuedAttack = true; }
});
ui['dash-button'].addEventListener('click', () => action('dash'));
ui['burst-button'].addEventListener('click', () => action('skill'));
ui['heal-button'].addEventListener('click', () => action('potion'));
ui['weapon-cycle'].addEventListener('click', cycleWeapon);
ui['build-open'].addEventListener('click', () => openBuild());
ui.pause.addEventListener('click', () => openPause());
ui.sound.addEventListener('click', () => {
  settings.muted = !settings.muted;
  audio.setMuted(settings.muted);
  saveStorage(SETTINGS_KEY, settings);
  syncAudio();
});

addEventListener('keydown', event => {
  if (blessingSelectionPending && overlay === 'upgrade') { event.preventDefault(); return; }
  if (event.code === 'Escape') {
    event.preventDefault();
    if (event.repeat) return;
    if (overlay === 'help' || overlay === 'build') closePopup();
    else if (overlay === 'pause') restoreGame();
    else if (game && ['playing', 'upgrade'].includes(game.status)) openPause();
    return;
  }
  if (event.target instanceof Element && event.target.matches('input, select, textarea, [contenteditable="true"]')) return;
  if (overlay === 'upgrade' && /^Digit[123]$/.test(event.code) && !event.repeat) {
    event.preventDefault(); chooseUpgrade(Number(event.code.slice(-1)) - 1); return;
  }
  if (event.code === 'KeyB' && game && ['playing', 'upgrade'].includes(game.status) && !event.repeat) {
    event.preventDefault();
    if (overlay === 'build') closePopup();
    else if (overlay === null || overlay === 'upgrade') openBuild();
    return;
  }
  if (!playable()) return;
  if (event.code === 'Tab') { event.preventDefault(); if (!event.repeat) cycleWeapon(); return; }
  if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ', 'KeyK', 'Space', 'KeyQ', 'KeyE'].includes(event.code)) return;
  event.preventDefault();
  held.add(event.code);
  if (!event.repeat) {
    if (event.code === 'KeyJ') queuedAttack = true;
    const pulse = { Space: 'dash', KeyK: 'skill', KeyQ: 'potion', KeyE: 'interact' }[event.code];
    if (pulse) action(pulse);
  }
});
addEventListener('keyup', event => { held.delete(event.code); });

function suspend() {
  clearInput();
  audio.setRunning(false);
  if (game && ['playing', 'upgrade'].includes(game.status) && overlay === null) openPause('已自动暂停');
}
addEventListener('blur', suspend);
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });
addEventListener('resize', () => { view?.resize(); campPreview?.resize(); });
addEventListener('pagehide', checkpointExpedition);

function frame(now) {
  const dt = Math.min(Math.max((now - previousFrame) / 1000, 0), .05);
  previousFrame = now;
  if (game && view && ready) {
    const running = playable();
    if (running) {
      const aim = pointer.active ? view.aimAt(pointer.x, pointer.y) : null;
      const input = {
        moveX: (Number(held.has('KeyD')) - Number(held.has('KeyA'))) * .8423 + (Number(held.has('KeyS')) - Number(held.has('KeyW'))) * .5391,
        moveZ: -(Number(held.has('KeyD')) - Number(held.has('KeyA'))) * .5391 + (Number(held.has('KeyS')) - Number(held.has('KeyW'))) * .8423,
        aimX: aim ? aim.x - game.player.x : 0,
        aimZ: aim ? aim.z - game.player.z : 0,
        attack: held.has('KeyJ') || pointer.attack || pointer.buttonAttack || queuedAttack,
        ...pulses,
      };
      game.update(dt, input);
      queuedAttack = false;
      for (const key of Object.keys(pulses)) pulses[key] = false;
      consumeEvents();
      checkpointClock += dt; if (checkpointClock >= 15) { checkpointClock = 0; checkpointExpedition(); }
    }
    view.render(game, running ? dt : 0, { moving: running && game.player.moving });
    hudClock += dt;
    if (hudClock >= .075) { hudClock = 0; updateHud(); }
    impactTime = Math.max(0, impactTime - (running ? dt : 0)); ui['battle-impact'].style.opacity = settings.shake ? String(impactTime / .22 * .32) : '0';
    if (flash > 0) { flash = Math.max(0, flash - dt * 1.7); ui['damage-flash'].style.opacity = String(flash); }
  }
  if (!game && ready) campPreview?.render(dt);
  requestAnimationFrame(frame);
}

async function initialize() {

  try {
    view = new DungeonView(ui.world);
    applyViewSettings();
    await view.load((progress, total, label) => {
      if (typeof progress === 'string') { ui['load-progress'].textContent = progress; return; }
      const data = typeof progress === 'object' && progress !== null ? progress : { loaded: progress, total, label };
      const ratio = data.total ? data.loaded / data.total : data.loaded;
      ui['load-progress'].textContent = `${data.label || '装载墓城模型'}${Number.isFinite(ratio) ? ` · ${Math.round(clamp(ratio, 0, 1) * 100)}%` : ''}`;
    });
    ready = true;
    ui.loading.classList.add('hidden');
    ui.menu.classList.remove('hidden');
    renderCamp();
    ui.menu.querySelector('button')?.focus({ preventScroll: true });
    syncAudio();
    if (new URLSearchParams(location.search).get('qa') === '1') {
      window.__emberfall = {
        get game() { return game; }, view, startGame, profileStore, get campPreview() { return campPreview; },
        state: () => game ? { ready, status: game.status, overlay, seed: game.seed, difficulty: game.difficulty,
          room: game.roomIndex, roomName: game.roomName, cleared: game.roomCleared, rewardReady: game.rewardReady,
          currentZoneId: game.currentZoneId, visitedZones: [...game.visitedZoneIds], waypoint: game.nextWaypoint,
          hp: game.player.hp, maxHp: game.player.maxHp, level: game.player.level, potions: game.player.potions,
          x: game.player.x, z: game.player.z, kills: game.kills, time: game.time, enemies: game.enemies.length,
          wave: game.waveIndex + 1, choices: game.choices.map(choice => choice.id), boons: game.boons.map(boon => boon.id),
          weapon: { id: game.weapon.id, name: game.weapon.name, element: game.weapon.element, tier: game.weapon.tier },
          inventory: [...game.inventory], combatStats: { ...game.combatStats }, shield: game.player.shield,
          buffs: game.activeBuffs.map(buff => ({ ...buff })), areas: game.areas.map(area => ({ ...area })),
          profile: profileStore.snapshot(), runSummary: game.runSummary, settings: { ...settings }, audioVoices: audio.voices.length } : { ready, status: 'menu', overlay, selectedWeaponId, profile: profileStore.snapshot(), settings: { ...settings } },
      };
    }
    requestAnimationFrame(frame);
  } catch (error) {
    console.error('Emberfall failed to initialize:', error);
    ui.loading.querySelector('p').textContent = '加载失败';
    ui['load-progress'].textContent = `加载失败：${error?.message || '模型或 WebGL 初始化错误'}。请确认资源可访问后重试。`;
    const retry = document.createElement('button');
    retry.textContent = '重新加载'; retry.className = 'primary';
    retry.addEventListener('click', () => location.reload());
    ui.loading.append(retry);
  }
}

initialize();
