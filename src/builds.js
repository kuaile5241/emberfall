import { equipmentById } from './content.js';

const deepFreeze = value => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; };

/** Skill forms describe geometry and timing; combat values remain in the simulation. */
export const SKILL_FORMS = deepFreeze([
  { id: 'fire-pillars', element: 'fire', name: '地脉焚柱', kind: 'sequence', description: '沿瞄准方向依次喷发地下火柱；走位把敌群引入喷发路线。' },
  { id: 'fire-meteor', element: 'fire', name: '坠星', kind: 'impact', description: '在指向地点标记落点，短暂延迟后陨石落下并留下余火。' },
  { id: 'water-blizzard', element: 'water', name: '白夜暴雪', kind: 'field', description: '在指向地点召来持续暴雪；反复命中叠加寒冷并冻结普通敌人。' },
  { id: 'water-torrent', element: 'water', name: '奔潮', kind: 'wave', description: '宽幅水浪沿瞄准方向前进，推开沿途敌人并使其减速。' },
  { id: 'lightning-chain', element: 'lightning', name: '导雷', kind: 'chain', description: '击中指向的首个目标，向附近敌人逐次跳跃，追击分散敌群。' },
  { id: 'lightning-lances', element: 'lightning', name: '裂空雷枪', kind: 'projectile', description: '沿瞄准方向展开多道雷枪；每道雷枪穿透一路上的敌人。' },
]);

export const BUILD_GEAR = deepFreeze([
  { id: 'fire-pillars', slot: 'relic', element: 'fire', name: '地脉余烬', description: '装备火系武器时，将技能替换为沿直线依次喷发的地脉焚柱。', skillForm: 'fire-pillars', price: { gold: 0, essence: 0 }, starter: true },
  { id: 'fire-meteor', slot: 'relic', element: 'fire', name: '坠星熔核', description: '装备火系武器时，将技能替换为指向落点的延迟陨石。', skillForm: 'fire-meteor', price: { gold: 100, essence: 0 } },
  { id: 'water-blizzard', slot: 'relic', element: 'water', name: '雪暴棱镜', description: '装备水系武器时，将技能替换为在指向地点持续降下的暴雪。', skillForm: 'water-blizzard', price: { gold: 0, essence: 0 }, starter: true },
  { id: 'water-torrent', slot: 'relic', element: 'water', name: '逐浪石', description: '装备水系武器时，将技能替换为沿瞄准方向前进的宽幅水浪。', skillForm: 'water-torrent', price: { gold: 100, essence: 0 } },
  { id: 'lightning-chain', slot: 'relic', element: 'lightning', name: '导雷线圈', description: '装备雷系武器时，将技能替换为从首个目标向敌群跳跃的导雷。', skillForm: 'lightning-chain', price: { gold: 0, essence: 0 }, starter: true },
  { id: 'lightning-lances', slot: 'relic', element: 'lightning', name: '裂空棱晶', description: '装备雷系武器时，将技能替换为可穿透敌群的多道雷枪。', skillForm: 'lightning-lances', price: { gold: 100, essence: 0 } },
  { id: 'ash-mantle', slot: 'armor', element: 'fire', name: '余烬披风', description: '火系技能伤害提高 12%。', price: { gold: 70, essence: 0 } },
  { id: 'glacier-robes', slot: 'armor', element: 'water', name: '冰川长袍', description: '水系攻击与技能对减速或冻结的敌人伤害提高 15%。', price: { gold: 70, essence: 0 } },
  { id: 'storm-vest', slot: 'armor', element: 'lightning', name: '风暴护衣', description: '雷系连锁目标增加 1 个，技能冷却缩短 8%。', price: { gold: 70, essence: 0 } },
]);

export const TALENT_NODES = deepFreeze([
  { id: 'fire-kindling', element: 'fire', name: '引燃', description: '火系技能伤害提高 12%。', cost: 1 },
  { id: 'fire-aftershock', element: 'fire', name: '余震', description: '火柱或陨石落点追加一次 40% 伤害的回响。', cost: 1, requires: ['fire-kindling'], exclusiveWith: ['fire-pressure'] },
  { id: 'fire-pressure', element: 'fire', name: '地脉增压', description: '火柱增加 2 根，火系技能范围提高 15%。', cost: 1, requires: ['fire-kindling'], exclusiveWith: ['fire-aftershock'] },
  { id: 'water-permafrost', element: 'water', name: '永冻', description: '暴雪每次命中额外叠加 1 层寒冷，更快冻结敌人。', cost: 1 },
  { id: 'water-shatter', element: 'water', name: '碎冰', description: '冻结的敌人死亡时，碎冰对附近敌人造成 40% 技能伤害。', cost: 1, requires: ['water-permafrost'], exclusiveWith: ['water-whiteout'] },
  { id: 'water-whiteout', element: 'water', name: '白夜', description: '暴雪延长 2 秒，范围扩大 0.8 米；水系技能冷却增加 20%。', cost: 1, requires: ['water-permafrost'], exclusiveWith: ['water-shatter'] },
  { id: 'lightning-conduction', element: 'lightning', name: '传导', description: '雷系连锁目标增加 2 个。', cost: 1 },
  { id: 'lightning-overload', element: 'lightning', name: '过载', description: '雷链末端追加 40% 伤害的爆炸，但连锁目标减少 1 个。', cost: 1, requires: ['lightning-conduction'], exclusiveWith: ['lightning-feedback'] },
  { id: 'lightning-feedback', element: 'lightning', name: '回流', description: '雷系技能每击败一名敌人返还 0.15 秒冷却；每次施法最多返还 1 秒。', cost: 1, requires: ['lightning-conduction'], exclusiveWith: ['lightning-overload'] },
]);

export const buildGearById = id => BUILD_GEAR.find(item => item.id === id) ?? null;
export const talentById = id => TALENT_NODES.find(node => node.id === id) ?? null;
const starterGearIds = BUILD_GEAR.filter(item => item.starter).map(item => item.id);
const cleanTalentIds = values => {
  const requested = new Set(Array.isArray(values) ? values.filter(id => !!talentById(id)) : []), selected = [];
  for (const node of TALENT_NODES) if (requested.has(node.id) && (node.requires || []).every(id => selected.includes(id)) && !(node.exclusiveWith || []).some(id => selected.includes(id))) selected.push(node.id);
  return selected;
};

/** Neutral run snapshots intentionally contain no starter equipment. */
export function normalizeBuildLoadout(value) {
  const armor = buildGearById(value?.armorId), relic = buildGearById(value?.relicId);
  return { armorId: armor?.slot === 'armor' ? armor.id : null, relicId: relic?.slot === 'relic' ? relic.id : null, talents: cleanTalentIds(value?.talents) };
}

/** Missing V4 build fields add owned starter relics without equipping them. */
export function normalizeBuild(value) {
  const ownedGear = [...new Set([...starterGearIds, ...(Array.isArray(value?.ownedGear) ? value.ownedGear.filter(id => !!buildGearById(id)) : [])])];
  const loadout = normalizeBuildLoadout(value);
  if (!ownedGear.includes(loadout.armorId)) loadout.armorId = null;
  if (!ownedGear.includes(loadout.relicId)) loadout.relicId = null;
  return { armorId: loadout.armorId, relicId: loadout.relicId, ownedGear, talents: loadout.talents };
}

export function talentBudget(profile) {
  const wins = Number.isFinite(profile?.stats?.wins) ? Math.max(0, Math.floor(profile.stats.wins)) : 0;
  return 3 + Math.min(wins, 3);
}

export function skillFormFor(weapon, loadout) {
  if (typeof weapon === 'string') weapon = equipmentById(weapon);
  if (!weapon) return null;
  const relic = buildGearById(normalizeBuildLoadout(loadout).relicId);
  const form = SKILL_FORMS.find(item => item.id === relic?.skillForm && item.element === weapon.element);
  return form || { id: weapon.variant, element: weapon.element, name: weapon.skillName, description: weapon.skillDescription, kind: 'legacy' };
}

/** All multipliers apply only to the wielded element, never to unrelated classes. */
export function resolveBuild(value, element) {
  const loadout = normalizeBuildLoadout(value), selected = new Set(loadout.talents);
  const result = { damageMultiplier: 1, skillCooldownMultiplier: 1, radiusMultiplier: 1, durationBonus: 0, radiusBonus: 0, chainBonus: 0, aftershock: 0, shatter: 0, overload: 0, feedback: 0, chillBonus: 0, vsChilledMultiplier: 1, pillarBonus: 0 };
  if (element === 'fire') {
    if (loadout.armorId === 'ash-mantle') result.damageMultiplier *= 1.12;
    if (selected.has('fire-kindling')) result.damageMultiplier *= 1.12;
    if (selected.has('fire-aftershock')) result.aftershock = .4;
    if (selected.has('fire-pressure')) { result.pillarBonus = 2; result.radiusMultiplier = 1.15; }
  } else if (element === 'water') {
    if (loadout.armorId === 'glacier-robes') result.vsChilledMultiplier = 1.15;
    if (selected.has('water-permafrost')) result.chillBonus = 1;
    if (selected.has('water-shatter')) result.shatter = .4;
    if (selected.has('water-whiteout')) { result.durationBonus = 2; result.radiusBonus = .8; result.skillCooldownMultiplier *= 1.2; }
  } else if (element === 'lightning') {
    if (loadout.armorId === 'storm-vest') { result.chainBonus++; result.skillCooldownMultiplier *= .92; }
    if (selected.has('lightning-conduction')) result.chainBonus += 2;
    if (selected.has('lightning-overload')) { result.overload = .4; result.chainBonus--; }
    if (selected.has('lightning-feedback')) result.feedback = .15;
  }
  return result;
}
