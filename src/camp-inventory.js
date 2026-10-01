import { EQUIPMENT, ELEMENTS, DEFAULT_WEAPON_ID, equipmentById } from './content.js';
import { SUPPLIES, CAMP_LEVELS, QUESTS } from './profile.js';
import { Game } from './game.js';
import { skillIcon, campIcon, boonIcon } from './icons.js';
import { t } from './i18n.js';
import { equipmentAppearanceName } from './gear-appearance.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const text = (key, params) => escape(t(key, params));
const number = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const decimal = value => Number(value.toFixed(2)).toString();
const ownedWeapons = profile => EQUIPMENT.filter(item => profile.unlockedWeapons?.includes(item.id));
const stock = (profile, item) => number(profile.items?.[item.id]);
const packedSupply = profile => SUPPLIES.find(item => item.id === profile.selectedSupply && stock(profile, item) > 0) || null;
const equippedWeapon = profile => equipmentById(profile.loadout) || equipmentById(DEFAULT_WEAPON_ID);
const costText = cost => t(cost?.essence ? '{gold} 金币 · {essence} 精华' : '{gold} 金币', { gold: number(cost?.gold), essence: number(cost?.essence) });

/** A class shortcut keeps the equipped weapon, otherwise chooses the best owned tier. */
export function weaponForClass(profile, element) {
  const weapons = ownedWeapons(profile).filter(item => item.element === element);
  return weapons.find(item => item.id === profile.loadout)
    || weapons.sort((a, b) => b.tier - a.tier)[0] || null;
}

/** Selection is ephemeral UI state: filtering and inspecting never change a save. */
export function normalizeArmorySelection(profile, state = {}) {
  const elementFilter = state.elementFilter === 'all' || Object.hasOwn(ELEMENTS, state.elementFilter) ? state.elementFilter : 'all';
  const weapons = EQUIPMENT.filter(item => elementFilter === 'all' || item.element === elementFilter);
  const selected = weapons.find(item => item.id === state.selectedWeaponId)
    || weapons.find(item => item.id === profile.loadout) || weapons[0];
  return { elementFilter, selectedWeaponId: selected.id, weapons };
}

export function normalizeBagSelection(profile, state = {}) {
  const selected = SUPPLIES.find(item => item.id === state.selectedItemId) || packedSupply(profile)
    || SUPPLIES.find(item => stock(profile, item) > 0) || SUPPLIES[0];
  return { selectedItemId: selected.id };
}

/** Use the combat simulation itself so displayed numbers cannot drift from a run. */
export function weaponComparison(profile, weaponId) {
  const weapon = equipmentById(weaponId);
  if (!weapon) return null;
  const currentWeapon = equippedWeapon(profile);
  const campBonuses = CAMP_LEVELS.find(level => level.level === profile.campLevel)?.bonuses;
  const game = new Game({ seed: 1, weaponId: currentWeapon.id, unlockedWeapons: [currentWeapon.id], campBonuses, supply: packedSupply(profile)?.id || null });
  return { currentWeapon, selectedWeapon: weapon, current: game.statsForWeapon(currentWeapon.id), selected: game.statsForWeapon(weapon.id) };
}

export function supplyArt(item) {
  return item?.id === 'damage-tonic' ? skillIcon('heal') : `<span class="camp-ward-amulet">${boonIcon('shield')}</span>`;
}

const statDefinitions = [
  { key: 'damage', label: '普攻伤害' },
  { key: 'attackInterval', label: '攻击间隔', unit: '秒', lower: true },
  { key: 'attackRange', label: '攻击距离', unit: '米' },
  { key: 'skillDamage', label: '技能伤害' },
  { key: 'skillRadius', label: '技能半径', unit: '米' },
  { key: 'skillCooldown', label: '技能冷却', unit: '秒', lower: true },
];

function comparisonMarkup(comparison) {
  return `<div class="inv-stats-heading"><span>${text('出征属性')}</span><small>${text('当前 → 所选')}</small></div>
    <dl class="inv-stats">${statDefinitions.map(stat => {
      const before = comparison.current[stat.key], after = comparison.selected[stat.key], delta = after - before;
      const changed = Math.abs(delta) > .00001;
      const better = stat.lower ? delta < 0 : delta > 0;
      const unit = stat.unit ? `<small>${text(stat.unit)}</small>` : '';
      return `<div class="inv-stat-row"><dt>${text(stat.label)}</dt><dd><span class="inv-stat-before">${decimal(before)}</span><span class="inv-stat-arrow" aria-hidden="true">→</span><strong class="${changed ? better ? 'is-better' : 'is-lower' : ''}">${decimal(after)}${unit}</strong></dd></div>`;
    }).join('')}</dl><p class="inv-stat-note">${text('已计入营地与携带补给；不含战场祝福及临时效果。')}</p>`;
}

export function renderArmory(profile, state = {}) {
  const { selectedWeaponId, elementFilter, weapons } = normalizeArmorySelection(profile, state);
  const selected = equipmentById(selectedWeaponId), unlocked = ownedWeapons(profile);
  const isUnlocked = unlocked.some(item => item.id === selected.id), equipped = profile.loadout === selected.id;
  const quest = QUESTS.find(item => item.reward.weaponId === selected.id);
  const action = equipped
    ? `<button class="inv-primary is-equipped" disabled>${campIcon('check')}${text('已备战')}</button>`
    : isUnlocked ? `<button class="inv-primary" data-action="weapon" data-id="${selected.id}">${campIcon('armory')}${text('装备出征')}</button>`
      : `<button class="inv-primary" data-action="unlock" data-id="${quest?.id || ''}">${campIcon('lock')}${text('查看解锁委托')}</button>`;
  return `<div class="inv-view inv-armory-view" data-selected-weapon="${selected.id}">
    <div class="inv-page-heading"><div><span class="inv-eyebrow">${text('出征收藏')}</span><h3>${text('军械')}</h3></div><span class="inv-count">${campIcon('armory')}${text('{owned} / {total} 已收藏', { owned: unlocked.length, total: EQUIPMENT.length })}</span></div>
    <p class="inv-page-intro">${text('点选卡片查看属性，再点「装备出征」切换武器与职业。')}</p>
    <div class="inv-filters" role="group" aria-label="${text('按元素筛选武器')}">${[{ id: 'all', name: '全部' }, ...Object.values(ELEMENTS)].map(element => `<button class="inv-filter" data-action="filter-element" data-id="${element.id}" aria-pressed="${elementFilter === element.id}" ${element.color ? `style="--inv-accent:${element.color}"` : ''}>${element.id === 'all' ? campIcon('armory') : boonIcon({ fire: 'flame', lightning: 'bolt', water: 'drop' }[element.id])}<span>${text(element.name)}</span></button>`).join('')}</div>
    <div class="inv-workspace">
      <div class="inv-collection"><div class="inv-weapon-grid" role="group" aria-label="${text('武器收藏')}">${weapons.map(weapon => {
        const owned = unlocked.some(item => item.id === weapon.id), active = weapon.id === selected.id, ready = profile.loadout === weapon.id;
        return `<button class="inv-weapon-tile ${active ? 'is-selected' : ''} ${owned ? '' : 'is-locked'}" data-action="inspect-weapon" data-id="${weapon.id}" data-equipment="${weapon.id}" aria-pressed="${active}" aria-controls="inv-weapon-detail" style="--inv-accent:${ELEMENTS[weapon.element].color}">
          <span class="inv-tile-status" title="${text(ready ? '已备战' : owned ? '已收藏' : '尚未解锁')}">${ready ? campIcon('check') : !owned ? campIcon('lock') : ''}</span>
          <span class="inv-tile-art">${skillIcon('attack', weapon)}</span><strong>${text(weapon.name)}</strong><small>${text(weapon.tier === 1 ? '基础' : '高级')} · ${text(ELEMENTS[weapon.element].name)}</small>
        </button>`;
      }).join('')}</div><p class="inv-collection-note">${campIcon('quest')}${text('委托报酬与战利品会永久加入收藏。')}</p></div>
      <article id="inv-weapon-detail" class="inv-detail" style="--inv-accent:${ELEMENTS[selected.element].color}" aria-label="${text('武器详情')}">
        <div class="inv-detail-heading"><span class="inv-detail-art">${skillIcon('attack', selected)}</span><div><span class="inv-element-label">${text(selected.className)}</span><h4>${text(selected.name)}</h4><span class="inv-detail-status">${campIcon(equipped ? 'check' : isUnlocked ? 'armory' : 'lock')}${text(equipped ? '已备战' : isUnlocked ? '已收藏' : '尚未解锁')}</span></div></div>
        <div class="inv-detail-actions inv-equip-action">${action}${!isUnlocked && quest ? `<small>${text('完成「{name}」可解锁', { name: t(quest.name) })}</small>` : ''}</div>
        <p class="inv-outfit-label">${campIcon('armory')}<span>${text('穿着效果')} · ${text(equipmentAppearanceName(selected))}</span></p>
        <p class="inv-description">${text(selected.description)}</p>
        <div class="inv-skill"><span>${skillIcon('burst', selected)}</span><div><small>${text('专属技能')}</small><strong>${text(selected.skillName)}</strong><p>${text(selected.skillDescription)}</p></div></div>
        ${comparisonMarkup(weaponComparison(profile, selected.id))}
      </article>
    </div>
  </div>`;
}

function upgradeMarkup(profile) {
  const current = CAMP_LEVELS.find(level => level.level === profile.campLevel);
  const next = CAMP_LEVELS.find(level => level.level === profile.campLevel + 1);
  const affordable = next && number(profile.gold) >= next.cost.gold && number(profile.essence) >= next.cost.essence;
  return `<section class="inv-upgrade"><div class="inv-upgrade-heading"><span class="inv-upgrade-emblem">${campIcon('camp')}</span><div><span class="inv-eyebrow">${text('永久成长')}</span><h4>${text('营地强化')}</h4></div><span class="inv-level">${text('{level} / {max} 级', { level: profile.campLevel, max: CAMP_LEVELS.length })}</span></div>
    <ol class="inv-upgrade-track" aria-label="${text('营地强化路线')}">${CAMP_LEVELS.map(level => `<li class="${level.level <= profile.campLevel ? 'is-complete' : level.level === profile.campLevel + 1 ? 'is-next' : ''}"><span>${level.level <= profile.campLevel ? campIcon('check') : level.level}</span><small>${text(level.name)}</small></li>`).join('')}</ol>
    <div class="inv-upgrade-bottom"><div><p>${current ? text('当前：生命 +{hp} · 伤害 +{damage}%', { hp: current.bonuses.maxHp, damage: Math.round((current.bonuses.damageMultiplier - 1) * 100) }) : text('当前无永久属性加成')}</p>${next ? `<p class="inv-next-bonus">${text('升级后：生命 +{hp} · 伤害 +{damage}%', { hp: next.bonuses.maxHp, damage: Math.round((next.bonuses.damageMultiplier - 1) * 100) })}</p>` : `<p class="inv-next-bonus">${text('营地已完全强化')}</p>`}</div>${next ? `<button class="inv-upgrade-button" data-action="upgrade" ${!affordable || profile.pendingRun ? 'disabled' : ''}><span>${text('强化营地')}</span><small>${escape(costText(next.cost))}</small></button>` : `<span class="inv-max-level">${campIcon('check')}${text('已满级')}</span>`}</div>
    <p class="inv-stat-note">${text('营地加成为累计总值。任务报酬可获得精华；本局战场进度不会因此保存。')}</p>
  </section>`;
}

export function renderBag(profile, state = {}) {
  const { selectedItemId } = normalizeBagSelection(profile, state);
  const selected = SUPPLIES.find(item => item.id === selectedItemId), packed = packedSupply(profile);
  const count = stock(profile, selected), isPacked = packed?.id === selected.id;
  const total = SUPPLIES.reduce((sum, item) => sum + stock(profile, item), 0);
  const purchaseDisabled = number(profile.gold) < selected.price || count >= 99 || profile.pendingRun;
  const packDisabled = !count;
  const effect = selected.effect.shield ? text('入场护盾 +{amount}', { amount: selected.effect.shield }) : text('伤害加成 +{amount}%', { amount: Math.round((selected.effect.damageMultiplier - 1) * 100) });
  return `<div class="inv-view inv-bag-view" data-selected-supply="${selected.id}">
    <div class="inv-page-heading"><div><span class="inv-eyebrow">${text('旅途准备')}</span><h3>${text('行囊')}</h3></div><span class="inv-count">${campIcon('bag')}${text('{count} 件补给', { count: total })}</span></div>
    <p class="inv-page-intro">${text('把补给放进出征槽，再为营地添一把火。')}</p>
    <section class="inv-packed-slot ${packed ? 'is-packed' : ''}" aria-label="${text('出征补给槽')}"><span class="inv-packed-art">${packed ? supplyArt(packed) : campIcon('plus')}</span><div><span class="inv-eyebrow">${text('出征补给槽')} <b>${packed ? 1 : 0} / 1</b></span><strong>${packed ? text(packed.name) : text('选择一件补给同行')}</strong><small>${text('每次携带一件，出征时消耗一份。')}</small></div>${packed ? `<button class="inv-remove" data-action="supply" data-id="">${text('取下')}</button>` : `<span class="inv-slot-empty">${text('空')}</span>`}</section>
    <div class="inv-workspace inv-bag-workspace"><div class="inv-collection"><div class="inv-section-title"><h4>${text('补给收纳')}</h4><span>${text('点击查看')}</span></div><div class="inv-supply-grid" role="group" aria-label="${text('补给收纳')}">${SUPPLIES.map(item => {
      const itemCount = stock(profile, item), isSelected = item.id === selected.id, ready = packed?.id === item.id;
      return `<button class="inv-supply-tile ${isSelected ? 'is-selected' : ''} ${itemCount ? '' : 'is-empty'}" data-action="inspect-supply" data-id="${item.id}" aria-pressed="${isSelected}" aria-controls="inv-supply-detail"><span class="inv-stock">×${itemCount}</span>${ready ? `<span class="inv-tile-status" title="${text('已携带')}">${campIcon('check')}</span>` : ''}<span class="inv-tile-art">${supplyArt(item)}</span><strong>${text(item.name)}</strong><small>${text(ready ? '已携带' : itemCount ? '可携带' : '暂无库存')}</small></button>`;
    }).join('')}</div>${!total ? `<div class="inv-empty-state">${campIcon('bag')}<p>${text('行囊还空着。选一份补给，即可在右侧购买。')}</p></div>` : `<p class="inv-collection-note">${campIcon('bag')}${text('每种补给最多收纳 99 件。')}</p>`}</div>
      <article id="inv-supply-detail" class="inv-detail inv-supply-detail" aria-label="${text('补给详情')}"><div class="inv-detail-heading"><span class="inv-detail-art">${supplyArt(selected)}</span><div><span class="inv-element-label">${text('出征消耗品')}</span><h4>${text(selected.name)}</h4><span class="inv-detail-status">${text('持有 {count} 件', { count })}</span></div></div><div class="inv-supply-effect">${boonIcon(selected.effect.shield ? 'shield' : 'sword')}<strong>${effect}</strong></div><p class="inv-description">${text(selected.description)}</p><div class="inv-supply-price"><span>${text('每份价格')}</span><strong>${campIcon('coin')}${selected.price}</strong></div>
        <div class="inv-detail-actions"><button class="inv-primary" data-action="buy" data-id="${selected.id}" ${purchaseDisabled ? 'disabled' : ''}>${campIcon('coin')}${text('购买一份')}</button><button class="inv-secondary" data-action="supply" data-id="${isPacked ? '' : selected.id}" ${packDisabled ? 'disabled' : ''}>${campIcon(isPacked ? 'check' : 'bag')}${text(isPacked ? '已装入 · 点击取下' : '带入下次出征')}</button><small>${count >= 99 ? text('已达持有上限') : number(profile.gold) < selected.price ? text('还需 {gold} 金币', { gold: selected.price - number(profile.gold) }) : text('购买后可随时携带或取下。')}</small></div>
      </article>
    </div>${upgradeMarkup(profile)}
  </div>`;
}
