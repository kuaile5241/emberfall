/** Shared equipment descriptions and combat tuning. No renderer dependencies. */
export const ELEMENTS = Object.freeze({
  fire: Object.freeze({ id: 'fire', name: '火', className: '火焰骑士', color: '#ed844d', buffName: '余火昂扬' }),
  lightning: Object.freeze({ id: 'lightning', name: '雷', className: '雷刃游侠', color: '#b8d8f3', buffName: '疾电' }),
  water: Object.freeze({ id: 'water', name: '水', className: '潮汐使', color: '#67bfd1', buffName: '潮汐护盾' }),
});

const equipment = (id, name, type, element, tier, description, skillName, skillDescription, variant, stats, skill) => Object.freeze({
  id, name, type, element, tier, starter: tier === 1, className: ELEMENTS[element].className,
  description, skillName, skillDescription, variant,
  stats: Object.freeze({ damage: 1, attackInterval: 1, attackRange: 0, attackArc: 1, skillDamage: 1, skillRadius: 0, skillCooldown: 1, ...stats }),
  skill: Object.freeze(skill),
});

export const EQUIPMENT = Object.freeze([
  equipment('fire-sword', '余烬长剑', 'sword', 'fire', 1,
    '火系近战，持续焚烧与短时增伤。', '焚野', '引爆周身并留下 3.2 秒火场；获得 5 秒增伤 20%。', 'ember-burst', {},
    { duration: 3.2, interval: 0.5, dotScale: 0.16, buffDuration: 5, damageBoost: 0.2, stun: 0.8, knockback: 1.5 }),
  equipment('fire-greatsword', '烬王重剑', 'greatsword', 'fire', 2,
    '较慢的重斩，宽幅火场与更长燃烧。', '炼狱环', '更大的爆发与 4.5 秒火场；获得 6 秒增伤 25%。', 'inferno-ring',
    { damage: 1.28, attackInterval: 1.19, attackRange: 0.6, attackArc: 1.14, skillDamage: 1.28, skillRadius: 1.3, skillCooldown: 1.06 },
    { duration: 4.5, interval: 0.5, dotScale: 0.2, buffDuration: 6, damageBoost: 0.25, stun: 0.95, knockback: 2 }),
  equipment('lightning-spear', '引雷长枪', 'spear', 'lightning', 1,
    '快速突刺，以连锁雷击追击散开的敌人。', '环链雷击', '震击周围敌人并连锁至最多 5 名远处目标；攻速提高 30%，持续 4 秒。', 'chain-nova',
    { damage: 0.86, attackInterval: 0.8, attackRange: 0.75, attackArc: 0.78, skillDamage: 1, skillRadius: 0.6, skillCooldown: 0.88 },
    { duration: 0.5, chainCount: 5, chainRange: 4.4, chainScale: 0.85, stun: 1, buffDuration: 4, haste: 0.3, knockback: 0.8 }),
  equipment('lightning-halberd', '风暴战戟', 'halberd', 'lightning', 2,
    '横扫战戟，长距离连锁后留下第二次雷震。', '风暴回响', '最多 8 次连锁，并在 0.65 秒后再次震击周围；攻速提高 35%，持续 5 秒。', 'storm-echo',
    { damage: 1.08, attackInterval: 0.98, attackRange: 1, attackArc: 1.08, skillDamage: 1.15, skillRadius: 1.2, skillCooldown: 0.96 },
    { duration: 0.8, interval: 0.65, pulseScale: 0.4, chainCount: 8, chainRange: 5, chainScale: 0.95, stun: 1.2, buffDuration: 5, haste: 0.35, knockback: 1.2 }),
  equipment('water-staff', '涌泉法杖', 'staff', 'water', 1,
    '水波牵制近身敌人，以可消耗的护盾抵挡伤害。', '潮汐环', '水波减速 42%；形成 2.5 秒水域，并获得持续 6 秒的护盾。', 'tidal-wave',
    { damage: 0.9, attackInterval: 1.04, attackRange: 0.65, attackArc: 1.1, skillDamage: 1.05, skillRadius: 1, skillCooldown: 1 },
    { duration: 2.5, slow: 0.42, slowDuration: 3.5, shield: 30, shieldHealthScale: 0.08, buffDuration: 6, stun: 0.4, knockback: 2.2 }),
  equipment('water-scepter', '深潮权杖', 'scepter', 'water', 2,
    '深水涟漪持续造成伤害，提供更强的减速与护盾。', '深潮领域', '持续 3.6 秒的水域每 0.8 秒冲击敌人；减速 52%，获得更厚的 7 秒护盾。', 'deep-tide',
    { damage: 1.02, attackInterval: 1.04, attackRange: 0.85, attackArc: 1.15, skillDamage: 1.2, skillRadius: 1.6, skillCooldown: 1.08 },
    { duration: 3.6, interval: 0.8, pulseScale: 0.24, slow: 0.52, slowDuration: 4, shield: 48, shieldHealthScale: 0.08, buffDuration: 7, stun: 0.6, knockback: 2.8 }),
]);

export const STARTER_WEAPON_IDS = Object.freeze(EQUIPMENT.filter(item => item.starter).map(item => item.id));
export const DEFAULT_WEAPON_ID = 'fire-sword';
export const equipmentById = id => EQUIPMENT.find(item => item.id === id) ?? null;
