# V0.4 营地与跨局成长：窄范围调研及实现对账

核验日期：2026-10-01（Asia/Shanghai）。范围是 Hades 初代的永久成长/祝福选择，以及 Diablo IV 第 4 赛季的装备整备思路；不把历史赛季文章当作 Diablo IV 当前赛季规则。

## 主张对账

| 主张 | 对象/版本 | 截至时间 | 支持证据 | 相反或相邻证据 | 证据类型 | 允许措辞 |
|---|---|---|---|---|---|---|
| 永久成长与每次重新出征可以并存 | Hades 初代 | 2026-10-01 读取 | 官方 Steam 产品页：Mirror of Night 可永久增强角色，帮助下一次出逃 | 同页仍以每次不同的出逃尝试为核心，没有给出本项目的成长数值 | 开发商发布的产品说明 | “Hades 官方说明包含跨次尝试的永久成长” |
| 祝福用于能力选择与构筑 | Hades 初代 | 同上 | 同页说明玩家选择众神 Boons 强化能力 | “数千种构筑”是产品方宣传，本研究不验证组合数量，也不据此推导具体平衡 | 官方机制说明；规模属来源方主张 | “官方把祝福选择作为构筑的一部分” |
| 探索所得可在整备环节继续形成装备成长 | Diablo IV S4: Loot Reborn | 2026-10-01 读取历史 S4 文章 | Blizzard 正文说明拾取/学习 Tempering Manuals 后，去 Blacksmith 给装备追加词缀；Iron Wolves 路线奖励手册 | 同文明确赛季服手册持续到赛季结束，永恒服另有持续规则；不能概括为所有服务器永久保留 | 官方历史赛季设计说明 | “S4 官方展示了探索获取与回城装备改造相连的流程” |

原文锚点（均已读取全文，短引总量受限）：

- Hades：“Use the powerful Mirror of Night to grow permanently stronger”；“choose from their dozens of powerful Boons”。[Supergiant Games 发布的 Hades Steam 产品页](https://store.steampowered.com/app/1145360/Hades/)
- Diablo IV：“head to a Blacksmith to Temper your item”。[Blizzard：Galvanize your Legend in Season 4: Loot Reborn](https://news.blizzard.com/en-us/article/24077223/galvanize-your-legend-in-season-4-loot-reborn)

## 已确认事实

上述两份官方原文分别存在永久成长、祝福选择、探索所得用于装备整备的机制说明。它们支持机制层面的借鉴；本地 `src/profile.js` 及对应测试才是《余烬地牢》实际实现的证据。Hades 和 Diablo IV 的货币、术语、美术与原数值未复制到本项目。

## 来源方主张

Hades 商品页称有大量可行构筑；Diablo IV S4 文章称减少掉落并提高单件影响力，希望玩家少整理、多战斗。这是开发商的设计目标与产品描述，不是本研究测得的留存、趣味或平衡结论。

## 推断与落地设计

据此采用“营地选择 → 本局战斗与祝福 → 带回战利品 → 整备再出征”。以下是本项目的设计决定，不是两款参考游戏的规则：

- 3 把基础武器可选；高级武器可由真实拾取结算或委托解锁。永久装备库只保存已知武器 ID，切换会影响下局实际载入。
- 初始 120 金币。烈刃药剂 45 金币，整局伤害乘 1.12；守护符 35 金币，入场护盾 35。一次选择一件，成功保存出征记录时才扣一份。
- 营地 3 级，每级总加成为生命 +10/+20/+30、伤害 ×1.03/×1.06/×1.09；价格依次为 120 金，220 金+2 精华，380 金+4 精华。配置给出升级后的累计总值。
- 四项委托：击杀 60、精英 3、支路目标 2、Boss 1。一次累计一个；改接保留已得进度。只累计接受后出征的真实结算，不把历史总击杀倒灌为新任务进度。完成与领取分开，奖励只能领取一次。
- 通关带回拾取金币 100%，另奖 80；阵亡带回 60%；主动撤退/刷新后结束旧局带回 25%，均向下取整。通关/阵亡精华为每 2 名精英 1 点，通关另加 2；撤退精华为 0。三种结果都保留已实际拾得装备与本局任务进度。
- 保存的是营地与最小结算摘要。刷新后的“结束上次出征”只结算最近成功记录的收入，不能继续旧战场。

委托配置：

| 委托 | 目标 | 奖励 |
|---|---|---|
| 扫清墓道 | 60 击杀 | 100 金、1 精华、烬王重剑 |
| 破阵者 | 3 精英 | 140 金、2 精华、风暴战戟 |
| 支路搜寻 | 2 次支路目标 | 120 金、2 精华、深潮权杖 |
| 钟声止息 | 1 次丧钟守卫 | 240 金、4 精华 |

## 数据边界与验证

`ProfileStore({storage,key,legacyRecords})` 接收外部存储，无隐式 window/localStorage。默认新键 `emberfall.profile.v4`；QA 必须由调用方传独立键。v1 设置/战绩键不写；只可读取调用方传入的少量旧战绩作显示起点。

主要方法：`load`、`validate`、`save`、`snapshot`、`selectWeapon`、`selectSupply`、`buyItem`、`upgradeCamp`、`acceptQuest`、`claimQuest`、`prepareRun`、`checkpointRun`、`settleRun`。写失败返回 `{ok:false,error,message}`，内存不假装已保存；消费与出征记录用同一次单键写入。陈旧页面写入会报告冲突。坏 JSON、未知版本、损坏结算账本会阻止覆盖并保留原串。已知版本的普通字段做有限值、数量和 ID 白名单校验。

`pendingRun` 包含出征配置、当时委托和最小摘要；checkpoint 的计数/金币取最大值，防旧帧回退。`processedRuns` 记录已结算编号，重复结算跨重载也不再发奖。记录上限 4096 局，到上限拒绝新局，避免删除旧账后重放领奖。此为单机存储校验，不是服务端反作弊或跨浏览器存档同步。

`node --test tests/profile-v4.test.js`：20 项通过，覆盖预算、实际消耗、重复结算/领取、保存失败重试、刷新恢复、所有委托、3 级营地、战利品解锁、旧键隔离、损坏数据保留和陈旧页面冲突。界面/场景验收另见项目验收记录；这些纯数据测试不冒充浏览器交互验证。

## 仍未确认

成长价格与通关时长之间的长期平衡需要玩家试玩数据；当前仅验证流程真实、可完成及存储一致性。未进行长期留存、掉落分布或商业化评估。

## 查询记录

2026-10-01 先窄查 Agent Memory（“余烬地牢 营地 Hades 跨局成长”），仅返回本项目先前界面验收信息，未用作玩法事实。AnySearch 脚本相对其本地 Git 无修改；读取 gaming 子域后以商店检索辅助定位 Hades，通用检索限定官方来源。

1. `Hades`（gaming.store）与 `site.supergiantgames.com Hades permanent upgrades boons`，随后 extract 上述 Steam 原文。
2. 初始 Diablo IV 炼金药剂检索发现历史机制存在版本变化，未据搜索摘要给当前规则下结论，也未采用药剂升级作为参考事实。
3. `site.news.blizzard.com "Diablo IV" "Blacksmith" "Tempering" "2024"` 结果未直接命中官方页；调整为 `Diablo IV Season 4 Loot Reborn All Systems official Blizzard tempering blacksmith`，定位并 extract 上述 Blizzard 原文。

正反主张对撞：PASS。所有外部机制限定到具体产品/历史版本；没有使用“未搜索到”推断机制不存在，没有把本项目设计或测试结果归因给参考游戏。
