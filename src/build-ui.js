import { EQUIPMENT, equipmentById, ELEMENTS } from './content.js';
import { BUILD_GEAR, TALENT_NODES, normalizeBuild, normalizeBuildLoadout, skillFormFor, buildGearById, talentById, talentBudget } from './builds.js';
import { buildSkillIcon } from './build-icons.js';
import { campIcon } from './icons.js';
import { t } from './i18n.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const text = (key, params) => escape(t(key, params));
const slotLabel = slot => slot === 'armor' ? '护甲' : '技能遗物';

export function renderBuildSummary(weapon, value, { battle = false } = {}) {
  const build = normalizeBuildLoadout(value), skill = skillFormFor(weapon, build);
  const armor = buildGearById(build.armorId), relic = buildGearById(build.relicId);
  const mismatch = relic && relic.element !== weapon.element;
  return `<section class="loadout-summary" data-active-form="${skill.id}"><span class="loadout-skill-art">${buildSkillIcon(skill.id, weapon.element)}</span><div><small>${text(battle ? '本局配装' : '当前构筑')}</small><strong>${text(skill.name)}</strong><p>${text(skill.description)}</p><span class="loadout-summary-gear">${text(armor?.name || '原有护甲')}<i>·</i>${text(relic?.name || '原生技能')}</span>${mismatch ? `<em>${text('遗物需搭配{element}系武器，当前使用原生技能。', { element: t(ELEMENTS[relic.element].name) })}</em>` : ''}</div></section>`;
}

function gearCard(profile, item, build) {
  const owned = build.ownedGear.includes(item.id), equipped = build[item.slot === 'armor' ? 'armorId' : 'relicId'] === item.id;
  const affordable = profile.gold >= item.price.gold && profile.essence >= item.price.essence;
  return `<article class="build-gear-card ${equipped ? 'is-equipped' : ''} ${owned ? '' : 'is-unowned'}" data-build-gear="${item.id}" data-element="${item.element}"><div class="build-gear-top">${buildSkillIcon(item.slot === 'armor' ? 'armor' : item.skillForm, item.element)}<span><small>${text(slotLabel(item.slot))} · ${text(ELEMENTS[item.element].name)}</small><strong>${text(item.name)}</strong></span>${equipped ? campIcon('check') : ''}</div><p>${text(item.description)}</p><div class="build-gear-actions">${owned ? `<span>${text('已收藏')}</span><button data-action="build-equip" data-slot="${item.slot}" data-id="${equipped ? '' : item.id}" aria-pressed="${equipped}">${text(equipped ? '取下' : '装备')}</button>` : `<span>${campIcon('coin')}${item.price.gold}</span><button data-action="build-buy" data-id="${item.id}" ${affordable ? '' : 'disabled'}>${text(affordable ? '购入收藏' : '金币不足')}</button>`}</div></article>`;
}

export function renderBuildWorkshop(profile, element = equipmentById(profile.loadout)?.element || 'fire') {
  const weapon = equipmentById(profile.loadout) || EQUIPMENT[0], build = normalizeBuild(profile.build);
  const budget = talentBudget(profile), selected = new Set(build.talents), spent = build.talents.length;
  const nodes = TALENT_NODES.filter(node => node.element === element);
  const talentCard = node => {
    const chosen = selected.has(node.id), missing = (node.requires || []).filter(id => !selected.has(id));
    const excluded = (node.exclusiveWith || []).some(id => selected.has(id));
    const locked = !chosen && (missing.length > 0 || excluded || spent >= budget);
    const reason = missing.length ? t('需要先选择{name}', { name: missing.map(id => t(talentById(id).name)).join(' / ') }) : excluded ? t('先移除另一分支') : spent >= budget && !chosen ? t('天赋点不足') : t(chosen ? '点击移除' : '点击投入 1 点');
    return `<button class="talent-node ${chosen ? 'is-selected' : ''}" data-action="build-talent" data-id="${node.id}" aria-pressed="${chosen}" ${locked ? 'disabled' : ''}><span class="talent-node-seal">${chosen ? campIcon('check') : node.requires?.length ? campIcon('armory') : campIcon('flame')}</span><strong>${text(node.name)}</strong><p>${text(node.description)}</p><small>${escape(reason)}</small></button>`;
  };
  return `<div class="camp-section-title"><div><span class="camp-eyebrow">${text('技能 · 配装 · 天赋')}</span><h3>${text('构筑工坊')}</h3></div><span class="build-point-count">${text('剩余天赋点')} <b>${budget - spent}<i> / ${budget}</i></b></span></div>
    ${renderBuildSummary(weapon, build)}<p class="build-save-note">${text('构筑在出征时生效；自由洗点，当前战场保持原配装。')}</p>
    <div class="build-element-tabs" aria-label="${text('按元素查看构筑')}">${['fire', 'water', 'lightning'].map(id => `<button data-action="build-filter" data-id="${id}" data-element="${id}" aria-pressed="${element === id}">${text(ELEMENTS[id].name)}<span>${text(ELEMENTS[id].className)}</span></button>`).join('')}</div>
    <div class="build-section-heading"><h4>${text('技能形态')}</h4><span>${text('遗物替换对应元素技能')}</span></div><div class="build-gear-grid">${BUILD_GEAR.filter(item => item.slot === 'relic' && item.element === element).map(item => gearCard(profile, item, build)).join('')}</div>
    <div class="build-section-heading"><h4>${text('元素天赋')}</h4><button data-action="build-reset" ${spent ? '' : 'disabled'}>${text('重置天赋')}</button></div><div class="talent-tree" data-element="${element}"><div class="talent-root">${talentCard(nodes[0])}</div><div class="talent-branches">${nodes.slice(1).map(talentCard).join('')}</div></div><p class="build-talent-note">${text('分支互斥；移除前置会同时移除后续天赋。前三次通关各增加 1 点，最多 6 点。')}</p>
    <div class="build-section-heading"><h4>${text('护甲搭配')}</h4><span>${text('护甲外观同步营地与战场')}</span></div><div class="build-gear-grid build-armor-grid">${BUILD_GEAR.filter(item => item.slot === 'armor').map(item => gearCard(profile, item, build)).join('')}</div>`;
}
