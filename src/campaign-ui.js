import { CHAPTERS, STORY_NODES, campaignNodeState, currentStoryNode, expeditionUnlocked, normalizeCampaign, storyNodeById } from './campaign.js';
import { campIcon } from './icons.js';
import { t } from './i18n.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const text = (key, params) => escape(t(key, params));
const chapterLabel = chapter => chapter.number === 1 ? '第一章' : '第二章';
const statusLabel = state => ({ locked: '尚未开启', active: '进行中', completed: '等待领取', claimed: '已领取' }[state]);

export function renderCampaignOverview(profile) {
  const campaign = normalizeCampaign(profile.campaign), current = currentStoryNode(profile);
  const state = current ? campaignNodeState(profile, current) : 'claimed';
  const chapter = CHAPTERS.find(item => item.id === current?.chapterId) || CHAPTERS.at(-1);
  return `<button class="campaign-overview ${state === 'completed' ? 'is-ready' : ''}" data-nav="quests" aria-label="${text('查看剧情纪事')}">
    <span class="campaign-overview-seal">${campIcon(current ? 'quest' : 'check')}</span>
    <span class="campaign-overview-copy"><small>${text('主线')} <span>· ${text(chapterLabel(chapter))}</span></small>
      <strong>${text(current?.title || '墓城纪事已完成')}</strong>
      <span>${text(!current ? '所有主线已完成，可重访两个章节。' : state === 'completed' ? '剧情物证已齐，回营领取奖励' : current.brief)}</span></span>
    <span class="campaign-overview-progress"><b>${campaign.claimed.length}<i> / ${STORY_NODES.length}</i></b><small>${text('剧情纪事')}</small>${campIcon('arrow')}</span>
  </button>`;
}

export function renderExpeditionPicker(profile) {
  const campaign = normalizeCampaign(profile.campaign);
  return `<section class="campaign-expeditions" aria-label="${text('选择出征章节')}">${CHAPTERS.map(chapter => {
    const unlocked = expeditionUnlocked(profile, chapter.id), selected = campaign.selectedExpedition === chapter.id;
    const claimed = chapter.nodeIds.filter(id => campaign.claimed.includes(id)).length;
    return `<button class="campaign-destination campaign-destination-${chapter.id} ${selected ? 'is-selected' : ''} ${unlocked ? '' : 'is-locked'}" data-action="expedition" data-id="${chapter.id}" aria-pressed="${selected}" ${unlocked ? '' : 'disabled'}>
      <span class="campaign-destination-top"><small>${text(chapterLabel(chapter))}</small><span>${campIcon(unlocked ? selected ? 'check' : 'quest' : 'lock')}${text(!unlocked ? '未解锁' : selected ? '已选择' : '已解锁')}</span></span>
      <strong>${text(chapter.title)}</strong><span class="campaign-destination-subtitle">${text(chapter.subtitle)}</span>
      <span class="campaign-destination-route">${text('{count} 个区域', { count: chapter.zoneIds.length })}<i>·</i>${text(chapter.bossName)}</span>
      <span class="campaign-destination-bottom">${unlocked ? `<span>${text('主线进度')} ${claimed}/${chapter.nodeIds.length}</span><span>${text(campaign.clears[chapter.id] ? '已通关' : '首通')}</span>` : `<span>${text('完成第一章主线后解锁')}</span>`}</span>
    </button>`;
  }).join('')}</section>`;
}

export function renderStoryJournal(profile) {
  const campaign = normalizeCampaign(profile.campaign);
  return `<section class="campaign-journal" aria-label="${text('剧情纪事')}">
    <div class="campaign-journal-heading"><div><span>${text('主线')}</span><h3>${text('剧情纪事')}</h3></div><strong>${campaign.claimed.length} / ${STORY_NODES.length}</strong></div>
    <p class="campaign-journal-help">${text('线索随探索记录，回营后按顺序领取。失败或撤退保留已记录的物证。')}</p>
    ${CHAPTERS.map(chapter => `<div class="campaign-story-chapter"><h4><span>${text(chapterLabel(chapter))}</span>${text(chapter.title)}</h4><div class="campaign-story-list">${STORY_NODES.filter(node => node.chapterId === chapter.id).map(node => {
      const state = campaignNodeState(profile, node), count = node.evidence.filter(id => campaign.evidence.includes(id)).length;
      const prerequisite = node.requires ? storyNodeById(node.requires) : null;
      return `<article class="campaign-story-node is-${state}" data-story="${node.id}">
        <span class="campaign-story-step" aria-hidden="true">${state === 'claimed' ? campIcon('check') : String(node.order).padStart(2, '0')}</span>
        <div class="campaign-story-heading"><h5>${text(node.title)}</h5><span>${text(statusLabel(state))}</span></div>
        <p>${text(node.brief)}</p>
        ${state === 'locked' && prerequisite ? `<p class="campaign-story-lock">${campIcon('lock')}${text('先领取“{name}”的主线奖励', { name: t(prerequisite.title) })}</p>` : ''}
        ${state === 'locked' ? '' : `<details class="campaign-story-entry"><summary>${text(state === 'claimed' || state === 'completed' ? '回看故事' : '剧情摘记')}</summary><div><small>${text(node.speaker)}</small><p>${text(node.body)}</p></div></details>`}
        <div class="campaign-story-bottom"><span class="campaign-story-evidence">${text('物证')} ${count}/${node.evidence.length}</span><span class="campaign-story-reward">${campIcon('coin')}${node.reward.gold}${node.reward.essence ? `<i>·</i>${campIcon('flame')}${node.reward.essence}` : ''}</span>
          ${state === 'completed' ? `<button class="campaign-story-claim" data-action="story-claim" data-id="${node.id}" ${profile.pendingRun ? 'disabled' : ''}>${text('领取主线奖励')}</button>` : state === 'claimed' ? `<span class="campaign-story-collected">${campIcon('check')}${text('已领取')}</span>` : ''}
        </div>
      </article>`;
    }).join('')}</div></div>`).join('')}
  </section>`;
}
