const freeze = value => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } return value; };
const integer = value => typeof value === 'number' && Number.isFinite(value) ? Math.min(9999999, Math.max(0, Math.floor(value))) : 0;

export const CHAPTERS = freeze([
  { id: 'grave', number: 1, title: '钟下墓城', subtitle: '被困住的最后一声钟',
    description: '沿旧墓道寻找失踪守夜人的线索，揭开钟楼与地下水道的联系。', bossName: '丧钟守卫',
    zoneIds: ['gate', 'crypt', 'shrine', 'forge', 'stairs', 'throne'], poiIds: ['burial-relic', 'forge-cache', 'forge-sigil'],
    requires: null, nodeIds: ['watch', 'names', 'forge', 'bell'] },
  { id: 'aqueduct', number: 2, title: '沉钟水道', subtitle: '让水声重新流动',
    description: '进入墓城下方的蓄水设施，找到封闭闸轮，直面守在尽头的幽潮守望者。', bossName: '幽潮守望者',
    zoneIds: ['cistern', 'sluice', 'drowned-throne'], poiIds: ['sluice-wheel'],
    requires: 'bell', nodeIds: ['descent', 'sluice', 'undertow'] },
]);

export const STORY_NODES = freeze([
  { id: 'watch', chapterId: 'grave', expeditionId: 'grave', order: 1, requires: null,
    evidence: ['grave:gate'], speaker: '守夜人·岚', title: '城门没有日出', brief: '清理灰烬前庭，找到守夜人留下的路标。',
    body: '岚的巡夜灯还挂在旧城门上。灯底的刻痕指向墓城深处：钟声响起时，守夜人没有撤离。他们去接那些住在地下的人。', reward: { gold: 50, essence: 0 } },
  { id: 'names', chapterId: 'grave', expeditionId: 'grave', order: 2, requires: 'watch',
    evidence: ['grave:burial-relic'], speaker: '档案员·弥', title: '墓碑上的活人', brief: '探索墓室支路，取回遗骨匣中的名册。',
    body: '匣里装着工匠的名册，纸边写着“转移到下层水道”。墓碑提前刻好了他们的名字。弥认出了父亲的字迹——这些人当时还活着。', reward: { gold: 75, essence: 1 } },
  { id: 'forge', chapterId: 'grave', expeditionId: 'grave', order: 3, requires: 'names',
    evidence: ['grave:forge-sigil'], speaker: '铁匠·烛', title: '没有铸成的钥匙', brief: '调查熔火工坊中央的铭印，带回水闸铸印。',
    body: '工坊最后熔炼的不是兵器，而是一枚水闸铸印。烛把残片拼合，才看清一行反刻的字：钟停，闸启。工匠给幸存者留下了出路。', reward: { gold: 90, essence: 1 } },
  { id: 'bell', chapterId: 'grave', expeditionId: 'grave', order: 4, requires: 'forge',
    evidence: ['grave:boss'], speaker: '守夜人·岚', title: '钟声止息以后', brief: '击败丧钟守卫并完成出征。',
    body: '守卫倒下后，钟锤仍想完成最后一次敲击。岚将铸印嵌入底座，钟楼终于安静。石阶下传来流水声：撤离路线就在城的下方。', reward: { gold: 160, essence: 2 } },
  { id: 'descent', chapterId: 'aqueduct', expeditionId: 'aqueduct', order: 1, requires: 'bell',
    evidence: ['aqueduct:cistern'], speaker: '档案员·弥', title: '水位之下', brief: '进入沉钟水道，清理蓄水庭院。',
    body: '水线已经淹过当年的刻度。墙上的箭头被一遍遍重画，最后都指向同一扇闸门。弥在潮湿的石壁上找到了父亲刻下的家徽。', reward: { gold: 60, essence: 0 } },
  { id: 'sluice', chapterId: 'aqueduct', expeditionId: 'aqueduct', order: 2, requires: 'descent',
    evidence: ['aqueduct:sluice-wheel'], speaker: '铁匠·烛', title: '留给后来者的闸轮', brief: '调查断桥闸室中央的闸轮，开启封闭的水闸。',
    body: '闸轮被一根铁钎锁住，那是守夜人的巡灯支架。有人守在这里，让上游的同伴先走。烛拔出铁钎，浑水开始退去，前方露出石台。', reward: { gold: 100, essence: 1 } },
  { id: 'undertow', chapterId: 'aqueduct', expeditionId: 'aqueduct', order: 3, requires: 'sluice',
    evidence: ['aqueduct:boss'], speaker: '档案员·弥', title: '把名字带回地面', brief: '击败幽潮守望者，完成水道出征。',
    body: '守望者散去，石台上的铜灯重新亮起。幸存者早已离开，留下的名册却记录了每一个人。弥将它带回营地，墓城的故事终于有了结尾。', reward: { gold: 180, essence: 3 } },
]);

const nodeIds = new Set(STORY_NODES.map(node => node.id));
const evidenceIds = new Set(STORY_NODES.flatMap(node => node.evidence));
export const chapterById = id => CHAPTERS.find(chapter => chapter.id === id) || null;
export const expeditionMeta = chapterById;
export const storyNodeById = id => STORY_NODES.find(node => node.id === id) || null;
export const validEvidence = ids => [...new Set((Array.isArray(ids) ? ids : []).filter(id => evidenceIds.has(id)))];

/** Optional V4 field: old profiles begin the story without inventing past exploration. */
export function normalizeCampaign(value = {}) {
  const evidence = validEvidence(value?.evidence);
  const requested = new Set(Array.isArray(value?.claimed) ? value.claimed.filter(id => nodeIds.has(id)) : []);
  const claimed = [];
  for (const node of STORY_NODES) {
    if (requested.has(node.id) && (!node.requires || claimed.includes(node.requires)) && node.evidence.every(id => evidence.includes(id))) claimed.push(node.id);
  }
  const selectedExpedition = value?.selectedExpedition === 'aqueduct' && claimed.includes('bell') ? 'aqueduct' : 'grave';
  return { evidence, claimed, selectedExpedition,
    clears: { grave: integer(value?.clears?.grave), aqueduct: integer(value?.clears?.aqueduct) } };
}

export function expeditionUnlocked(profile, id) {
  const chapter = chapterById(id);
  return !!chapter && (!chapter.requires || normalizeCampaign(profile?.campaign).claimed.includes(chapter.requires));
}

export function campaignNodeState(profile, node) {
  if (typeof node === 'string') node = storyNodeById(node);
  if (!node || !nodeIds.has(node.id)) return 'locked';
  const campaign = normalizeCampaign(profile?.campaign);
  if (campaign.claimed.includes(node.id)) return 'claimed';
  if (node.requires && !campaign.claimed.includes(node.requires)) return 'locked';
  return node.evidence.every(id => campaign.evidence.includes(id)) ? 'completed' : 'active';
}

export function currentStoryNode(profile) {
  const campaign = normalizeCampaign(profile?.campaign);
  return STORY_NODES.find(node => !campaign.claimed.includes(node.id)) || null;
}

/** Map IDs are filtered before the checkpoint union and again before awarding evidence. */
export function summaryEvidenceIds(expeditionId, summary = {}) {
  const chapter = chapterById(expeditionId);
  if (!chapter) return { clearedZones: [], poiIds: [] };
  return {
    clearedZones: [...new Set((Array.isArray(summary.clearedZones) ? summary.clearedZones : []).filter(id => chapter.zoneIds.includes(id)))],
    poiIds: [...new Set((Array.isArray(summary.poiIds) ? summary.poiIds : []).filter(id => chapter.poiIds.includes(id)))],
  };
}

export function storyEvidenceFromRun(expeditionId, summary = {}, outcome) {
  const { clearedZones, poiIds } = summaryEvidenceIds(expeditionId, summary), result = [];
  if (expeditionId === 'grave') {
    if (clearedZones.includes('gate')) result.push('grave:gate');
    if (poiIds.includes('burial-relic')) result.push('grave:burial-relic');
    if (poiIds.includes('forge-sigil')) result.push('grave:forge-sigil');
    if (outcome === 'won' && integer(summary.bossKills) >= 1) result.push('grave:boss');
  } else if (expeditionId === 'aqueduct') {
    if (clearedZones.includes('cistern')) result.push('aqueduct:cistern');
    if (poiIds.includes('sluice-wheel')) result.push('aqueduct:sluice-wheel');
    if (outcome === 'won' && integer(summary.bossKills) >= 1) result.push('aqueduct:boss');
  }
  return result;
}
