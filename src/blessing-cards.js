import { boonIcon } from './icons.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
let serial = 0;
const categories = {
  edge: 'inscription', fury: 'inscription', reach: 'inscription', critical: 'inscription', step: 'inscription',
  heart: 'body', ward: 'body', renewal: 'body', flask: 'body',
  ember: 'element', siphon: 'element', thorns: 'element',
};
const labels = { inscription: '铭文', body: '躯体', element: '元素' };

function cardFrame() {
  return `<svg class="blessing-frame" viewBox="0 0 300 460" preserveAspectRatio="none" fill="none" aria-hidden="true">
    <path d="M23 5H277L295 23V437L277 455H23L5 437V23Z" stroke="currentColor" stroke-width="1.2"/>
    <path d="M27 12H273L288 27V433L273 448H27L12 433V27Z" stroke="currentColor" stroke-opacity=".32"/>
    <path d="M20 65V30L31 19H74M226 19H269L280 30V65M20 395V430L31 441H74M226 441H269L280 430V395" stroke="currentColor" stroke-width="2"/>
    <path d="m17 46 8-8 8 8-8 8Zm250 0 8-8 8 8-8 8ZM17 414l8-8 8 8-8 8Zm250 0 8-8 8 8-8 8Z" fill="currentColor" fill-opacity=".4"/>
    <path d="M81 19h42l27 12 27-12h42M81 441h42l27-12 27 12h42" stroke="currentColor" stroke-opacity=".7"/>
    <path d="m150 11 5 8-5 8-5-8Zm0 422 5 8-5 8-5-8Z" fill="currentColor"/>
    <path d="m8 213 7 17-7 17m284-34-7 17 7 17" stroke="currentColor"/>
  </svg>`;
}

function emblem(choice, category) {
  const id = `blessing-etch-${serial++}`;
  const glyph = boonIcon(choice.icon).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const rays = Array.from({ length: 32 }, (_, index) => {
    const angle = index * Math.PI / 16;
    const inner = index % 4 ? 73 : 67, outer = index % 4 ? 82 : 92;
    return `<path d="M${120 + Math.sin(angle) * inner} ${119 + Math.cos(angle) * inner}L${120 + Math.sin(angle) * outer} ${119 + Math.cos(angle) * outer}"/>`;
  }).join('');
  const halo = category === 'body'
    ? '<path d="M120 30 188 67l-8 89-60 54-60-54-8-89Z"/><path d="M120 43 176 74l-7 76-49 44-49-44-7-76Z" stroke-opacity=".35"/>'
    : category === 'element'
      ? '<path d="m120 20 86 148H34Z"/><path d="m120 214 86-148H34Z" stroke-opacity=".35"/>'
      : '<path d="m120 24 92 95-92 95-92-95Z"/><path d="m120 39 77 80-77 80-77-80Z" stroke-opacity=".35"/>';
  return `<svg class="blessing-emblem" viewBox="0 0 240 242" fill="none" aria-hidden="true">
    <defs><radialGradient id="${id}"><stop stop-color="currentColor" stop-opacity=".22"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient></defs>
    <circle cx="120" cy="119" r="106" fill="url(#${id})"/>
    <g class="blessing-rays" stroke="currentColor" stroke-opacity=".35" stroke-width=".8">${rays}</g>
    <g stroke="currentColor" stroke-opacity=".28" stroke-width=".8">${halo}<circle cx="120" cy="119" r="67"/><circle cx="120" cy="119" r="58" stroke-dasharray="1 7"/></g>
    <path d="M31 188q38 30 55 30m123-30q-38 30-55 30M47 42q25-23 41-23m105 23q-25-23-41-23" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
    <g class="blessing-glyph" transform="translate(72 71) scale(2.4)" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
    <g fill="currentColor"><path d="m120 0 3 7 7 3-7 3-3 7-3-7-7-3 7-3Zm0 218 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/><circle cx="21" cy="119" r="2"/><circle cx="219" cy="119" r="2"/></g>
  </svg>`;
}

/** Returns the contents of the existing upgrade dialog. Bind [data-choice] as before. */
export function blessingMarkup(game) {
  const roomReward = game.choiceReason === 'room';
  return `<div class="blessing-draw">
    <header class="blessing-heading"><span class="blessing-kicker">${roomReward ? '清场奖励' : `等级 ${escape(game.player.level)}`}</span><h3>选择祝福</h3><p>三选一 · 本局生效</p></header>
    <div class="blessing-hand" role="group" aria-label="三选一祝福">${game.choices.map((choice, index) => {
      const category = categories[choice.id] || 'inscription';
      const stacks = game.boons?.find(boon => boon.id === choice.id)?.stacks || 0;
      return `<button class="blessing-card" data-choice="${index}" data-blessing="${escape(choice.id)}" data-category="${category}" style="--card-index:${index}" aria-label="${index + 1}，${escape(choice.name)}。${escape(choice.description)}。${stacks ? `已有 ${stacks} 层` : '尚未获得'}">
        ${cardFrame()}<span class="blessing-grain" aria-hidden="true"></span>
        <span class="blessing-kind">${labels[category]}</span>${emblem(choice, category)}
        <span class="blessing-title">${escape(choice.name)}</span>
        <span class="blessing-divider" aria-hidden="true"><i></i></span>
        <span class="blessing-description">${escape(choice.description)}</span>
        <span class="blessing-stack">${stacks ? `已有 ${stacks} 层 <b>→ ${stacks + 1}</b>` : '首次获得'}</span>
        <span class="blessing-choose"><kbd>${index + 1}</kbd><span>选择此祝福</span></span>
      </button>`;
    }).join('')}</div>
    <p class="blessing-help">点击卡牌或按 <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd><span>祝福仅在本局生效</span></p>
  </div>`;
}

/** Optional 180ms selection flourish. This does not change game state or set timers. */
export function markBlessingSelected(container, index) {
  const card = container.querySelector(`[data-choice="${Number(index)}"]`);
  if (!card) return false;
  container.querySelector('.blessing-hand')?.classList.add('has-selection');
  card.classList.add('is-selected');
  card.setAttribute('aria-pressed', 'true');
  return true;
}
