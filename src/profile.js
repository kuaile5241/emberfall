import { STARTER_WEAPON_IDS, DEFAULT_WEAPON_ID, equipmentById } from './content.js';
import { chapterById, campaignNodeState, expeditionUnlocked, normalizeCampaign, storyNodeById, validEvidence, summaryEvidenceIds, storyEvidenceFromRun } from './campaign.js';
import { buildGearById, talentById, talentBudget, normalizeBuild, normalizeBuildLoadout } from './builds.js';

export const PROFILE_VERSION = 4;
export const DEFAULT_PROFILE_KEY = 'emberfall.profile.v4';
const deepFreeze = value => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; };
export const SUPPLIES = deepFreeze([
  { id: 'damage-tonic', name: '烈刃药剂', price: 45, description: '出征时消耗 1 瓶，本局攻击伤害提高 12%。', effect: { damageMultiplier: 1.12, shield: 0 } },
  { id: 'ward-charm', name: '守护符', price: 35, description: '出征时消耗 1 枚，入场获得 35 点护盾。', effect: { damageMultiplier: 1, shield: 35 } },
]);
export const CAMP_LEVELS = deepFreeze([
  { level: 1, name: '修复篝火', cost: { gold: 120, essence: 0 }, bonuses: { maxHp: 10, damageMultiplier: 1.03 } },
  { level: 2, name: '加固营地', cost: { gold: 220, essence: 2 }, bonuses: { maxHp: 20, damageMultiplier: 1.06 } },
  { level: 3, name: '余烬据点', cost: { gold: 380, essence: 4 }, bonuses: { maxHp: 30, damageMultiplier: 1.09 } },
]);
export const QUESTS = deepFreeze([
  { id: 'ash-hunt', name: '扫清墓道', description: '接受后，累计击败 60 名敌人。', metric: 'kills', target: 60, reward: { gold: 100, essence: 1, weaponId: 'fire-greatsword' } },
  { id: 'gravebreaker', name: '破阵者', description: '接受后，累计击败 3 名精英。', metric: 'eliteKills', target: 3, reward: { gold: 140, essence: 2, weaponId: 'lightning-halberd' } },
  { id: 'side-search', name: '支路搜寻', description: '接受后，累计完成 2 次支路探索目标。', metric: 'sideRelics', target: 2, reward: { gold: 120, essence: 2, weaponId: 'water-scepter' } },
  { id: 'bell-breaker', name: '钟声止息', description: '接受后，击败丧钟守卫 1 次。', metric: 'bossKills', target: 1, reward: { gold: 240, essence: 4 } },
]);
export const SETTLEMENT_RATIOS = Object.freeze({ won: 1, dead: .6, retreated: .25 });
const MONEY_CAP = 9999999, COUNT_CAP = 9999999, RUN_LIMIT = 4096;
const clone = value => JSON.parse(JSON.stringify(value));
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const int = (value, fallback = 0, max = COUNT_CAP) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(value))) : fallback;
const safeRunId = id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
const fail = (error, message) => ({ ok: false, error, message });
const weaponIds = values => [...new Set((Array.isArray(values) ? values : []).filter(id => !!equipmentById(id)))];
const questById = id => QUESTS.find(quest => quest.id === id);
const supplyById = id => SUPPLIES.find(item => item.id === id);
const campBonuses = level => clone(CAMP_LEVELS.find(item => item.level === level)?.bonuses || { maxHp: 0, damageMultiplier: 1 });
const statKeys = ['runs', 'wins', 'deaths', 'retreats', 'totalKills', 'eliteKills', 'sideRelics', 'bossKills', 'goldEarned', 'bestKills', 'bestRoom', 'fastestVictory'];

function validBuildRecord(value, withInventory = false) {
  if (value === undefined) return true;
  if (!object(value)) return false;
  for (const [field, slot] of [['armorId', 'armor'], ['relicId', 'relic']]) if (value[field] != null && buildGearById(value[field])?.slot !== slot) return false;
  if (value.talents !== undefined && (!Array.isArray(value.talents) || value.talents.some(id => typeof id !== 'string' || !talentById(id)))) return false;
  const talents = new Set(value.talents || []);
  for (const id of talents) {
    const node = talentById(id);
    if ((node.requires || []).some(required => !talents.has(required)) || (node.exclusiveWith || []).some(other => talents.has(other))) return false;
  }
  if (withInventory) {
    if (value.ownedGear !== undefined && (!Array.isArray(value.ownedGear) || value.ownedGear.some(id => typeof id !== 'string' || !buildGearById(id)))) return false;
    const owned = normalizeBuild({ ownedGear: value.ownedGear }).ownedGear;
    if ([value.armorId, value.relicId].some(id => id != null && !owned.includes(id))) return false;
  }
  return true;
}

export function createDefaultProfile(legacyRecords = {}) {
  const stats = Object.fromEntries(statKeys.map(key => [key, 0]));
  for (const key of ['runs', 'wins', 'bestKills', 'bestRoom', 'fastestVictory']) stats[key] = int(legacyRecords?.[key]);
  stats.wins = Math.min(stats.wins, stats.runs);
  return { version: PROFILE_VERSION, gold: 120, essence: 0, loadout: DEFAULT_WEAPON_ID,
    unlockedWeapons: [...STARTER_WEAPON_IDS], items: Object.fromEntries(SUPPLIES.map(item => [item.id, 0])),
    selectedSupply: null, campLevel: 0, activeQuest: null,
    quests: Object.fromEntries(QUESTS.map(quest => [quest.id, { status: 'available', progress: 0 }])),
    stats, processedRuns: {}, pendingRun: null, campaign: normalizeCampaign(), build: normalizeBuild() };
}

function cleanSummary(value = {}, expeditionId = 'grave') {
  const result = {};
  for (const key of ['kills', 'eliteKills', 'sideRelics', 'bossKills']) result[key] = int(value?.[key], 0, 100000);
  result.eliteKills = Math.min(result.eliteKills, result.kills);
  result.bossKills = Math.min(result.bossKills, result.kills);
  result.goldEarned = int(value?.goldEarned ?? value?.gold, 0, MONEY_CAP);
  result.duration = int(value?.duration ?? value?.time, 0, 86400);
  result.weaponId = equipmentById(value?.weaponId)?.id || DEFAULT_WEAPON_ID;
  result.inventory = weaponIds(value?.inventory);
  result.room = int(value?.room ?? value?.roomIndex, 0, 100);
  Object.assign(result, summaryEvidenceIds(expeditionId, value));
  return result;
}
function mergeSummary(previous = {}, incoming = {}, expeditionId = 'grave') {
  const a = cleanSummary(previous, expeditionId), b = cleanSummary(incoming, expeditionId);
  for (const key of ['kills', 'eliteKills', 'sideRelics', 'bossKills', 'goldEarned', 'duration', 'room']) b[key] = Math.max(a[key], b[key]);
  b.inventory = weaponIds([...a.inventory, ...b.inventory]);
  b.clearedZones = [...new Set([...a.clearedZones, ...b.clearedZones])];
  b.poiIds = [...new Set([...a.poiIds, ...b.poiIds])];
  if (!equipmentById(incoming?.weaponId)) b.weaponId = a.weaponId;
  return b;
}
function cleanReward(value = {}) {
  if (!object(value)) value = {};
  return { gold: int(value.gold, 0, MONEY_CAP), essence: int(value.essence, 0, MONEY_CAP),
    unlockedWeapons: weaponIds(value.unlockedWeapons), ratio: [1, .6, .25].includes(value.ratio) ? value.ratio : .25,
    questProgress: object(value.questProgress) && questById(value.questProgress.id) ? {
      id: value.questProgress.id, progress: int(value.questProgress.progress, 0, questById(value.questProgress.id).target),
      target: questById(value.questProgress.id).target, completed: value.questProgress.completed === true,
    } : null,
    storyUnlocked: validEvidence(value.storyUnlocked),
    ...(chapterById(value.storyChapterUnlocked) ? { storyChapterUnlocked: value.storyChapterUnlocked } : {}) };
}

/** Sanitizes known V4 fields. Invalid envelopes are rejected, never overwritten on load. */
export function validateProfile(value) {
  if (!object(value)) return fail('invalid_profile', '营地存档格式损坏，原数据已保留。');
  if (value.version !== PROFILE_VERSION) return fail('unsupported_version', '营地存档版本不兼容，原数据已保留。');
  const profile = createDefaultProfile();
  if (!validBuildRecord(value.build, true)) return fail('invalid_build', '构筑存档格式损坏，原数据已保留。');
  profile.build = normalizeBuild(value.build);
  if (value.campaign != null && !object(value.campaign)) return fail('invalid_campaign', '剧情存档格式损坏，原数据已保留。');
  profile.campaign = normalizeCampaign(value.campaign);
  profile.gold = int(value.gold, 0, MONEY_CAP); profile.essence = int(value.essence, 0, MONEY_CAP);
  profile.unlockedWeapons = weaponIds([...STARTER_WEAPON_IDS, ...(Array.isArray(value.unlockedWeapons) ? value.unlockedWeapons : [])]);
  profile.loadout = profile.unlockedWeapons.includes(value.loadout) ? value.loadout : DEFAULT_WEAPON_ID;
  for (const item of SUPPLIES) profile.items[item.id] = int(value.items?.[item.id], 0, 99);
  profile.selectedSupply = supplyById(value.selectedSupply) && profile.items[value.selectedSupply] > 0 ? value.selectedSupply : null;
  profile.campLevel = int(value.campLevel, 0, 3);
  for (const quest of QUESTS) {
    const raw = value.quests?.[quest.id] || {};
    const progress = int(raw.progress, 0, quest.target);
    const status = raw.status === 'claimed' ? 'claimed' : progress >= quest.target ? 'completed' : 'available';
    profile.quests[quest.id] = { status, progress: status === 'claimed' ? quest.target : progress };
  }
  if (questById(value.activeQuest) && profile.quests[value.activeQuest].status !== 'claimed') {
    profile.activeQuest = value.activeQuest;
    if (profile.quests[value.activeQuest].status !== 'completed') profile.quests[value.activeQuest].status = 'active';
  }
  for (const key of statKeys) profile.stats[key] = int(value.stats?.[key]);
  profile.stats.wins = Math.min(profile.stats.runs, profile.stats.wins);
  if (profile.build.talents.length > talentBudget(profile)) return fail('invalid_build', '天赋点数超过当前预算，原数据已保留。');
  if (object(value.processedRuns)) {
    const entries = Object.entries(value.processedRuns);
    if (entries.length > RUN_LIMIT) return fail('ledger_full', '结算记录超过上限，未截断旧账或覆盖存档。');
    for (const [id, record] of entries) {
      if (!safeRunId(id) || !object(record)) return fail('invalid_ledger', '结算记录损坏，原数据已保留。');
      profile.processedRuns[id] = { outcome: Object.hasOwn(SETTLEMENT_RATIOS, record.outcome) ? record.outcome : 'retreated', reward: cleanReward(record.reward) };
    }
  } else if (value.processedRuns !== undefined) return fail('invalid_ledger', '结算记录损坏，原数据已保留。');
  if (value.pendingRun != null) {
    const pending = value.pendingRun, run = pending?.run;
    if (!object(pending) || !safeRunId(pending.runId) || !object(run) || Object.hasOwn(profile.processedRuns, pending.runId)) return fail('invalid_pending_run', '未结算出征记录损坏，原数据已保留。');
    if (run.expeditionId !== undefined && !chapterById(run.expeditionId)) return fail('invalid_pending_run', '未结算出征目的地损坏，原数据已保留。');
    if (!validBuildRecord(run.buildLoadout) || normalizeBuildLoadout(run.buildLoadout).talents.length > 6) return fail('invalid_pending_run', '未结算出征构筑损坏，原数据已保留。');
    const expeditionId = run.expeditionId || 'grave';
    const unlockedWeapons = weaponIds([...STARTER_WEAPON_IDS, ...(Array.isArray(run.unlockedWeapons) ? run.unlockedWeapons : [])]);
    const selected = supplyById(run.supply?.id);
    const runLevel = int(pending.campLevel, profile.campLevel, 3);
    profile.pendingRun = { runId: pending.runId, campLevel: runLevel,
      questId: questById(pending.questId) ? pending.questId : null,
      run: { runId: pending.runId, expeditionId, weaponId: unlockedWeapons.includes(run.weaponId) ? run.weaponId : DEFAULT_WEAPON_ID,
        unlockedWeapons, campBonuses: campBonuses(runLevel), supply: selected ? { id: selected.id, ...clone(selected.effect) } : null,
        buildLoadout: normalizeBuildLoadout(run.buildLoadout) },
      summary: cleanSummary(pending.summary, expeditionId) };
  }
  return { ok: true, profile, repaired: JSON.stringify(profile) !== JSON.stringify(value) };
}

/** Storage is injected; this module never touches window/localStorage or V1 keys. */
export class ProfileStore {
  constructor({ storage, key = DEFAULT_PROFILE_KEY, legacyRecords = {} } = {}) {
    this.storage = storage; this.key = key; this.legacyRecords = legacyRecords;
    this._profile = createDefaultProfile(legacyRecords); this._raw = null; this._blocked = null;
    this.loadResult = this.load();
  }
  get profile() { return this.snapshot(); }
  snapshot() { const result = clone(this._profile); result.activeRun = result.pendingRun ? clone(result.pendingRun) : null; return result; }
  validate(value) { return validateProfile(value); }
  load() {
    let raw;
    try {
      if (!this.storage || typeof this.storage.getItem !== 'function' || typeof this.storage.setItem !== 'function') throw new Error('storage unavailable');
      raw = this.storage.getItem(this.key);
    } catch { this._blocked = 'storage_unavailable'; return this.loadResult = fail('storage_unavailable', '无法读取营地存档；出征与消费暂不可用。'); }
    if (raw == null) {
      this._profile = createDefaultProfile(this.legacyRecords); this._raw = null; this._blocked = null;
      return this.loadResult = { ok: true, profile: this.snapshot(), persisted: false, repaired: false };
    }
    let parsed;
    try { parsed = JSON.parse(raw); } catch { this._blocked = 'invalid_json'; return this.loadResult = fail('invalid_json', '营地存档无法解析，原数据已保留，未自动重置。'); }
    const result = validateProfile(parsed);
    if (!result.ok) { this._blocked = result.error; return this.loadResult = result; }
    this._profile = result.profile; this._raw = raw; this._blocked = null;
    return this.loadResult = { ok: true, profile: this.snapshot(), persisted: true, repaired: result.repaired };
  }
  /** Read only: an active game can refresh its own ledger, never adopt another run. */
  sync({ runId = null } = {}) {
    if (runId == null) return this.load();
    if (!safeRunId(runId)) return fail('invalid_run_id', '出征编号无效。');
    let raw;
    try {
      if (!this.storage || typeof this.storage.getItem !== 'function' || typeof this.storage.setItem !== 'function') throw new Error('storage unavailable');
      raw = this.storage.getItem(this.key);
    } catch { return fail('storage_unavailable', '无法读取营地存档；出征与消费暂不可用。'); }
    const changedRun = () => fail('run_changed', '当前出征记录已在其他页面结束或改变，请返回营地重新读取。');
    if (raw == null) return changedRun();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return fail('invalid_json', '营地存档无法解析，原数据已保留，未自动重置。'); }
    const result = validateProfile(parsed);
    if (!result.ok) return result;
    if (result.profile.pendingRun?.runId !== runId) return changedRun();
    this._profile = result.profile; this._raw = raw; this._blocked = null;
    return this.loadResult = { ok: true, profile: this.snapshot(), persisted: true, repaired: result.repaired };
  }
  _commit(draft, extra = {}) {
    if (this._blocked) return fail(this._blocked, this.loadResult?.message || '存档状态异常，请重新读取后再操作。');
    const serialized = JSON.stringify(draft);
    try {
      if (this.storage.getItem(this.key) !== this._raw) return fail('storage_conflict', '营地存档已在其他页面改变，请重新载入。');
      this.storage.setItem(this.key, serialized);
    } catch { return fail('save_failed', '营地保存失败，本次操作未在内存中生效。'); }
    this._profile = draft; this._raw = serialized;
    return { ok: true, profile: this.snapshot(), ...extra };
  }
  save() { return this._commit(clone(this._profile)); }
  _change(change, allowPending = false) {
    if (this._blocked) return fail(this._blocked, this.loadResult?.message || '存档状态异常。');
    if (!allowPending && this._profile.pendingRun) return fail('run_pending', '请先结束上次出征，再调整营地。');
    const draft = clone(this._profile), result = change(draft);
    if (result?.ok === false) return result;
    return this._commit(draft, result || {});
  }
  selectWeapon(id) {
    return this._change(profile => {
      if (!profile.unlockedWeapons.includes(id)) return fail('weapon_locked', '这件武器尚未解锁。');
      profile.loadout = id;
    }, true);
  }
  equipBuildGear(slot, id) {
    return this._change(profile => {
      if (!['armor', 'relic'].includes(slot)) return fail('invalid_build_slot', '构筑装备栏位不存在。');
      if (id != null && buildGearById(id)?.slot !== slot) return fail('invalid_build_gear', '这件装备不属于所选栏位。');
      if (id != null && !profile.build.ownedGear.includes(id)) return fail('build_gear_locked', '这件构筑装备尚未获得。');
      profile.build[`${slot}Id`] = id ?? null;
    }, true);
  }
  buyBuildGear(id) {
    return this._change(profile => {
      const item = buildGearById(id);
      if (!item) return fail('invalid_build_gear', '构筑装备不存在。');
      if (profile.build.ownedGear.includes(id)) return { duplicate: true, spent: { gold: 0, essence: 0 }, gear: id };
      if (profile.gold < item.price.gold || profile.essence < item.price.essence) return fail('insufficient_resources', '购买装备所需金币或精华不足。');
      profile.gold -= item.price.gold; profile.essence -= item.price.essence;
      profile.build.ownedGear.push(id);
      return { duplicate: false, spent: clone(item.price), gear: id };
    }, true);
  }
  toggleTalent(id) {
    return this._change(profile => {
      const node = talentById(id);
      if (!node) return fail('invalid_talent', '天赋不存在。');
      const selected = profile.build.talents;
      if (selected.includes(id)) {
        let kept = selected.filter(current => current !== id), changed = true;
        while (changed) {
          const next = kept.filter(current => (talentById(current).requires || []).every(required => kept.includes(required)));
          changed = next.length !== kept.length; kept = next;
        }
        const removed = selected.filter(current => !kept.includes(current));
        profile.build.talents = kept;
        return { talent: id, selected: false, removed };
      }
      if ((node.requires || []).some(required => !selected.includes(required))) return fail('talent_prerequisite', '请先选择这个天赋的前置节点。');
      if ((node.exclusiveWith || []).some(other => selected.includes(other))) return fail('talent_exclusive', '同一系的两个进阶分支只能选择一个，请先移除另一个。');
      if (selected.length + node.cost > talentBudget(profile)) return fail('talent_budget', '天赋点数不足；前三次通关各增加 1 点，最多 6 点。');
      selected.push(id);
      profile.build.talents = normalizeBuildLoadout(profile.build).talents;
      return { talent: id, selected: true };
    }, true);
  }
  resetTalents() {
    return this._change(profile => {
      const removed = [...profile.build.talents]; profile.build.talents = [];
      return { removed };
    }, true);
  }
  selectSupply(id) {
    return this._change(profile => {
      if (id != null && (!supplyById(id) || profile.items[id] < 1)) return fail('supply_unavailable', '没有可携带的这件补给。');
      profile.selectedSupply = id ?? null;
    }, true);
  }
  selectExpedition(id) {
    return this._change(profile => {
      if (!chapterById(id)) return fail('invalid_expedition', '出征目的地不存在。');
      if (!expeditionUnlocked(profile, id)) return fail('expedition_locked', '请先领取“钟声止息以后”的剧情奖励，再进入沉钟水道。');
      profile.campaign.selectedExpedition = id;
    }, true);
  }
  claimStory(id) {
    return this._change(profile => {
      const node = storyNodeById(id);
      if (!node || campaignNodeState(profile, node) !== 'completed') return fail('story_not_claimable', '剧情目标尚未完成、前置奖励未领取，或本次奖励已领取。');
      profile.gold = Math.min(MONEY_CAP, profile.gold + node.reward.gold);
      profile.essence = Math.min(MONEY_CAP, profile.essence + node.reward.essence);
      profile.campaign.claimed.push(id);
      const reward = { ...clone(node.reward), unlockedWeapons: [], storyId: id };
      if (id === 'bell') reward.storyChapterUnlocked = 'aqueduct';
      return { reward, story: id };
    });
  }
  buyItem(id, quantity = 1) {
    return this._change(profile => {
      const item = supplyById(id);
      if (!item || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return fail('invalid_item', '补给或购买数量无效。');
      if (profile.items[id] + quantity > 99) return fail('inventory_full', '这类补给最多保存 99 件。');
      const cost = item.price * quantity;
      if (profile.gold < cost) return fail('insufficient_gold', '金币不足。');
      profile.gold -= cost; profile.items[id] += quantity;
      return { spent: { gold: cost }, item: id, quantity };
    });
  }
  upgradeCamp() {
    return this._change(profile => {
      const next = CAMP_LEVELS.find(level => level.level === profile.campLevel + 1);
      if (!next) return fail('max_camp_level', '营地已达到最高等级。');
      if (profile.gold < next.cost.gold || profile.essence < next.cost.essence) return fail('insufficient_resources', '营地升级所需金币或精华不足。');
      profile.gold -= next.cost.gold; profile.essence -= next.cost.essence; profile.campLevel = next.level;
      return { spent: clone(next.cost), campBonuses: clone(next.bonuses) };
    });
  }
  acceptQuest(id) {
    return this._change(profile => {
      if (!questById(id)) return fail('invalid_quest', '委托不存在。');
      if (['completed', 'claimed'].includes(profile.quests[id].status)) return fail('quest_finished', '这个委托已完成。');
      if (profile.activeQuest && profile.quests[profile.activeQuest].status === 'active') profile.quests[profile.activeQuest].status = 'available';
      profile.activeQuest = id; profile.quests[id].status = 'active';
    });
  }
  claimQuest(id) {
    return this._change(profile => {
      const quest = questById(id);
      if (!quest || profile.quests[id].status !== 'completed') return fail('quest_not_claimable', '委托尚未完成或奖励已领取。');
      const unlockedWeapons = [];
      profile.gold = Math.min(MONEY_CAP, profile.gold + quest.reward.gold); profile.essence = Math.min(MONEY_CAP, profile.essence + quest.reward.essence);
      if (quest.reward.weaponId && !profile.unlockedWeapons.includes(quest.reward.weaponId)) { profile.unlockedWeapons.push(quest.reward.weaponId); unlockedWeapons.push(quest.reward.weaponId); }
      profile.quests[id].status = 'claimed'; if (profile.activeQuest === id) profile.activeQuest = null;
      return { reward: { gold: quest.reward.gold, essence: quest.reward.essence, unlockedWeapons } };
    });
  }
  prepareRun(runId, options = {}) {
    if (this._blocked) return fail(this._blocked, this.loadResult?.message || '存档状态异常。');
    if (!safeRunId(runId)) return fail('invalid_run_id', '出征编号无效。');
    if (Object.hasOwn(this._profile.processedRuns, runId)) return fail('run_already_settled', '这次出征已经结算，不能重复开始。');
    if (this._profile.pendingRun?.runId === runId) return { ok: true, run: clone(this._profile.pendingRun.run), reused: true, profile: this.snapshot() };
    return this._change(profile => {
      const expeditionId = options?.expeditionId ?? profile.campaign.selectedExpedition;
      if (!chapterById(expeditionId)) return fail('invalid_expedition', '出征目的地不存在。');
      if (!expeditionUnlocked(profile, expeditionId)) return fail('expedition_locked', '请先领取“钟声止息以后”的剧情奖励，再进入沉钟水道。');
      if (Object.keys(profile.processedRuns).length >= RUN_LIMIT) return fail('ledger_full', '结算记录已满，未删除旧账；本次无法出征。');
      const selected = supplyById(profile.selectedSupply);
      if (selected && profile.items[selected.id] < 1) return fail('supply_unavailable', '所选补给已经用尽。');
      if (selected) profile.items[selected.id]--;
      const run = { runId, expeditionId, weaponId: profile.loadout, unlockedWeapons: [...profile.unlockedWeapons], campBonuses: campBonuses(profile.campLevel), supply: selected ? { id: selected.id, ...clone(selected.effect) } : null, buildLoadout: normalizeBuildLoadout(profile.build) };
      profile.pendingRun = { runId, run, campLevel: profile.campLevel, questId: profile.activeQuest, summary: cleanSummary({ weaponId: profile.loadout }, expeditionId) };
      if (selected && profile.items[selected.id] === 0) profile.selectedSupply = null;
      return { run: clone(run), reused: false };
    });
  }
  checkpointRun(runId, summary) {
    return this._change(profile => {
      if (!profile.pendingRun || profile.pendingRun.runId !== runId) return fail('run_not_pending', '没有对应的未结算出征。');
      profile.pendingRun.summary = mergeSummary(profile.pendingRun.summary, summary, profile.pendingRun.run.expeditionId);
      return { checkpoint: clone(profile.pendingRun.summary) };
    }, true);
  }
  settleRun(runId, summary = {}) {
    if (!safeRunId(runId)) return fail('invalid_run_id', '出征编号无效。');
    if (this._blocked) return fail(this._blocked, this.loadResult?.message || '存档状态异常。');
    const previous = this._profile.processedRuns[runId];
    if (previous) return { ok: true, duplicate: true, reward: clone(previous.reward), profile: this.snapshot() };
    const outcome = summary.outcome === 'abandoned' ? 'retreated' : summary.outcome;
    if (!Object.hasOwn(SETTLEMENT_RATIOS, outcome)) return fail('invalid_outcome', '出征结果无效。');
    return this._change(profile => {
      const pending = profile.pendingRun;
      if (!pending || pending.runId !== runId) return fail('run_not_pending', '没有对应的未结算出征。');
      const expeditionId = pending.run.expeditionId;
      const result = mergeSummary(pending.summary, summary, expeditionId), ratio = SETTLEMENT_RATIOS[outcome];
      const gold = Math.floor(result.goldEarned * ratio) + (outcome === 'won' ? 80 : 0);
      const essence = outcome === 'retreated' ? 0 : Math.floor(result.eliteKills / 2) + (outcome === 'won' ? 2 : 0);
      const unlockedWeapons = [];
      for (const id of result.inventory) if (!profile.unlockedWeapons.includes(id)) { profile.unlockedWeapons.push(id); unlockedWeapons.push(id); }
      const storyUnlocked = storyEvidenceFromRun(expeditionId, result, outcome).filter(id => !profile.campaign.evidence.includes(id));
      profile.campaign.evidence = validEvidence([...profile.campaign.evidence, ...storyUnlocked]);
      if (outcome === 'won') profile.campaign.clears[expeditionId] = int(profile.campaign.clears[expeditionId] + 1);
      const reward = { gold, essence, unlockedWeapons, ratio, questProgress: null, storyUnlocked };
      profile.gold = Math.min(MONEY_CAP, profile.gold + gold); profile.essence = Math.min(MONEY_CAP, profile.essence + essence);
      const quest = questById(pending.questId);
      if (quest && !['claimed', 'completed'].includes(profile.quests[quest.id].status)) {
        const progress = profile.quests[quest.id]; progress.progress = Math.min(quest.target, progress.progress + result[quest.metric]);
        if (progress.progress >= quest.target) progress.status = 'completed';
        reward.questProgress = { id: quest.id, progress: progress.progress, target: quest.target, completed: progress.status === 'completed' };
      }
      const stats = profile.stats;
      stats.runs++; stats.wins += outcome === 'won' ? 1 : 0; stats.deaths += outcome === 'dead' ? 1 : 0; stats.retreats += outcome === 'retreated' ? 1 : 0;
      stats.totalKills += result.kills; stats.eliteKills += result.eliteKills; stats.sideRelics += result.sideRelics; stats.bossKills += result.bossKills; stats.goldEarned += gold;
      stats.bestKills = Math.max(stats.bestKills, result.kills); stats.bestRoom = Math.max(stats.bestRoom, result.room);
      if (outcome === 'won' && result.duration > 0 && (!stats.fastestVictory || result.duration < stats.fastestVictory)) stats.fastestVictory = result.duration;
      for (const key of statKeys) stats[key] = int(stats[key]);
      profile.processedRuns[runId] = { outcome, reward: clone(reward) }; profile.pendingRun = null;
      return { reward, duplicate: false, outcome };
    }, true);
  }
}
