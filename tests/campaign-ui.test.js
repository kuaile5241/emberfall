import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, STORY_NODES } from '../src/campaign.js';
import { createDefaultProfile } from '../src/profile.js';
import { renderCampaignOverview, renderExpeditionPicker, renderStoryJournal } from '../src/campaign-ui.js';
import { initLocale, setLocale, t } from '../src/i18n.js';
import { AQUEDUCT_WORLD, INTEREST_POINTS } from '../src/world.js';

afterEach(() => initLocale({ storage: null }));
const han = /\p{Script=Han}/u;
const completeGrave = () => {
  const profile = createDefaultProfile();
  profile.campaign.evidence = STORY_NODES.filter(node => node.chapterId === 'grave').flatMap(node => node.evidence);
  profile.campaign.claimed = ['watch', 'names', 'forge', 'bell'];
  profile.campaign.selectedExpedition = 'aqueduct';
  return profile;
};

test('fresh campaign gives a specific objective and a disabled second chapter', () => {
  initLocale({ storage: null });
  const profile = createDefaultProfile();
  const overview = renderCampaignOverview(profile), picker = renderExpeditionPicker(profile), journal = renderStoryJournal(profile);
  assert.ok(overview.includes('data-nav="quests"')); assert.ok(overview.includes(STORY_NODES[0].brief));
  assert.match(picker, /data-id="grave" aria-pressed="true"/);
  assert.match(picker, /data-id="aqueduct" aria-pressed="false" disabled/);
  assert.ok(picker.includes('完成第一章主线后解锁'));
  assert.equal((journal.match(/data-story="/g) || []).length, 7);
  assert.equal(journal.includes('data-action="story-claim"'), false);
  assert.ok(journal.includes('先领取“城门没有日出”的主线奖励'));
  assert.ok(journal.includes(STORY_NODES[0].body));
  for (const node of STORY_NODES.slice(1)) assert.equal(journal.includes(node.body), false, `locked story must not reveal its body: ${node.id}`);
});

test('recorded evidence renders one eligible claim without changing the profile', () => {
  const profile = createDefaultProfile(); profile.campaign.evidence = ['grave:gate', 'grave:burial-relic'];
  const original = JSON.stringify(profile), journal = renderStoryJournal(profile);
  assert.equal((journal.match(/data-action="story-claim"/g) || []).length, 1);
  assert.ok(journal.includes('data-action="story-claim" data-id="watch"'));
  assert.ok(journal.includes('物证 1/1'));
  assert.ok(renderCampaignOverview(profile).includes('剧情物证已齐，回营领取奖励'));
  assert.equal(JSON.stringify(profile), original);
  profile.pendingRun = { runId: 'existing-run' };
  assert.match(renderStoryJournal(profile), /data-action="story-claim" data-id="watch" disabled/);
});

test('claiming chapter one opens a selectable second chapter and keeps completed stories readable', () => {
  const profile = completeGrave(), picker = renderExpeditionPicker(profile), journal = renderStoryJournal(profile);
  assert.match(picker, /data-id="aqueduct" aria-pressed="true" >/);
  assert.equal(picker.includes('完成第一章主线后解锁'), false);
  assert.ok(renderCampaignOverview(profile).includes(STORY_NODES[4].title));
  assert.equal((journal.match(/回看故事/g) || []).length, 4);
  for (const node of STORY_NODES.slice(0, 5)) assert.ok(journal.includes(node.body));
  for (const node of STORY_NODES.slice(5)) assert.equal(journal.includes(node.body), false, `locked story must not reveal its body: ${node.id}`);
});

test('both chapters, every story, map objective and accessibility label have English text', () => {
  setLocale('en');
  const source = [
    ...CHAPTERS.flatMap(chapter => [chapter.title, chapter.subtitle, chapter.description, chapter.bossName]),
    ...STORY_NODES.flatMap(node => [node.speaker, node.title, node.brief, node.body]),
    ...AQUEDUCT_WORLD.zones.flatMap(zone => [zone.name, zone.subtitle]),
    ...[...AQUEDUCT_WORLD.interestPoints, ...INTEREST_POINTS.filter(poi => poi.id === 'forge-sigil')].flatMap(poi => [poi.name, poi.description]),
  ];
  for (const value of source) assert.equal(han.test(t(value)), false, `untranslated content: ${value}`);
  for (const profile of [createDefaultProfile(), completeGrave()]) {
    for (const renderer of [renderCampaignOverview, renderExpeditionPicker, renderStoryJournal]) assert.equal(han.test(renderer(profile)), false, `untranslated markup: ${renderer.name}`);
  }
  assert.equal(t('持续按住 E · {name} · {progress}%', { name: 'Wheel', progress: 0 }), 'Hold E · Wheel · 0%');
});

test('an all-claimed campaign has a complete journal and leaves both maps available', () => {
  const profile = createDefaultProfile();
  profile.campaign.evidence = STORY_NODES.flatMap(node => node.evidence);
  profile.campaign.claimed = STORY_NODES.map(node => node.id);
  assert.ok(renderCampaignOverview(profile).includes('墓城纪事已完成'));
  assert.ok(renderCampaignOverview(profile).includes('所有主线已完成，可重访两个章节。'));
  assert.equal(renderStoryJournal(profile).includes('data-action="story-claim"'), false);
  assert.equal(renderExpeditionPicker(profile).includes(' disabled'), false);
});
