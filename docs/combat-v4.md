# v0.4：怪群、元素收割与营地接口

本版保留六区连续地形与步行推进，调整每波规模、元素技能和局外输入；不改变战斗引擎与 Three.js 渲染分离的结构。

## 战斗节奏

| 区域 | 各波人数 |
| --- | --- |
| 灰烬前庭 | 14 / 16 |
| 无声回廊 | 18 / 20 |
| 遗忘圣所 | 20 / 22 |
| 熔火工坊 | 22 / 24 / 24 |
| 敲钟长阶 | 24 / 26 / 28 |
| 钟下祭坛 | Boss 与 24 名随从，半血追加最多 10 名 |

全程正常生成 293 名敌人，同时存活最多 36 名。小队围绕接近玩家的几个落点生成，约四分之三为 `fodder`：基础生命 42，伤害 6，经验 2；普通守卫、远程、重甲和精英继续使用较高生命与攻击强度。位置始终落在当前区域地板内，离玩家至少约 6 米；拥挤时选择安全距离和间距评分最好的候选点。敌人不构成不可穿过的实体墙。

技能基础伤害 104、基础半径 6.2 米、基础冷却 5.6 秒，再应用武器修饰、祝福、营地、补给和暂时增益。火保留地面燃烧和增伤，雷有最多 5 / 8 次跨目标连锁与攻速增益，水有减速、水域和可消耗护盾。所有技能均有击退；Boss 只承受普通击退的 6%，重甲和精英 35%。位移使用相同地面碰撞，AOE、连锁与持续伤害仍要求墙体视线可达。

连续两次击杀间隔不超过 2.4 秒时保持连杀。在 3 / 6 / 10 / 16 / 24 连杀节点发放金币，并为造成该次击杀的元素返还最多 0.7 秒技能冷却；整条连杀最多返还 2.4 秒，不会把冷却减到零以下，也不会清空其他元素冷却。持续伤害记录施法时的元素，换武器后火场击杀仍算火系。

经验升级暂存到当前波敌人全部清空，并在最后一敌死亡后等待 0.85 秒才展示祝福，让范围技能尾焰和连杀反馈有时间读完；期间可以移动，待选祝福未处理时禁止下一波刷入。房间奖励、等级祝福、精英掉落和已取得武器逻辑保留。

## 两条可互动支路

`WORLD.interestPoints` 是静态配置；`game.interestPoints` 是本局状态，含 `available`、`completed`、`reward`。`game.nearestInteraction` 返回当前可按 E 的目标，包含 `id/name/label/kind/x/z/radius`；房间奖励仍允许在区域内任意位置领取。

- `burial-relic`：守墓者遗物，坐标 `(8, -26)`，第一支路，本局技能基础伤害 +10、金币 +60。进入关卡后即可探索。
- `forge-cache`：工坊补给箱，坐标 `(72, -31)`，第三、四区之间支路。第三个区域领取祝福、通道解锁后可用；药水 +2（最多 5）、生命 +60（不超过上限）、金币 +50。

两者均要求距离不超过 2.4 米并具有真实地面视线。奖励只能领取一次，回溯不会重置，重开才清空。战斗中接近可用支路目标可以互动；E 不会传送或跳过当前遭遇。

## 营地输入与结算输出

```js
const game = new Game({
  seed, difficulty,
  runId,
  weaponId,
  unlockedWeapons, // 有效装备 ID 数组；三件入门装备始终拥有
  campBonuses: { maxHp: 30, damageMultiplier: 1.09 },
  supply: { id: 'damage-tonic', damageMultiplier: 1.12, shield: 0 },
}).start();
```

`bonuses` 是 `campBonuses` 的优先别名。输入只接受有限数；maxHp 0–60、基础技能加伤 0–40、基础普攻加伤 0–12、护甲 0–0.15、总伤害乘数 1–1.15。非法或未解锁武器退回入门火剑；装备去重。派生加成不会写回基础战斗属性，换装和 reset 不会重复叠加。

供给接受对象或合法字符串 ID。`damage-tonic` 固定让本局普攻和技能伤害乘以 1.12；`ward-charm` 入场给 35 点一次性护盾。引擎按 ID 决定强度，不接受供给对象里伪造的数值。护盾符剩余池记录在 `player.wardShield`，公开总护盾仍读 `player.shield`；水盾覆盖刷新自己的部分，消耗时先消耗水盾，水盾到期保留尚未消耗的营地护盾。切装不恢复护盾。

`game.runSummary` 返回新的快照，包含：

```js
{
  runId, outcome, won,
  kills, eliteKills, bossKills,
  elementKills: { fire, lightning, water },
  clearedZones: ['gate', /* ... */],
  poiIds: ['burial-relic', 'forge-cache'], sideRelics,
  gold, goldEarned,
  inventory: ['fire-sword', /* ... */], weaponId,
  time, duration, bestCombo,
}
```

`outcome` 在胜利 / 死亡时为 `won` / `dead`，其余状态快照为 `abandoned`；调用方只应在明确撤回营地时将普通快照用于最终结算，正常过程中可 checkpoint。`goldEarned` 是实际已拾取、支线和连杀获得的金币，不含未拾取掉落。`eliteKills` 包含 Boss，`bossKills` 单独统计；`sideRelics` 是两种支路目标的完成总数。引擎不直接写 localStorage，不自行消费营地库存。

## 渲染与音效事件

旧字段继续保留，新增字段如下：

- `skill`：`hitCount / kills / eliteHits`；`targets` 是实际命中的 ID / 坐标 / elite；`chain` 是实际连锁边。`duration` 是地面效果时长。
- `kill`：`element / source / fodder / elite`，持续伤害也走统一击杀奖励。
- `multikill`：`kills / combo / element / x / z / cooldownRefund / gold`，只在奖励节点触发。
- `poi`：`id / name / kind / x / z / reward`；`reward.heal` 和 `reward.potions` 为考虑上限后的实际取得数量。
- `hit`：增加伤害来源元素 `element`。

暂停时由 `game.status` 阻止引擎推进，时钟、BUFF、区域伤害、敌人、冷却和连杀窗口都不推进；渲染暂停处理由视图负责。

## 验证与边界

运行：

```sh
node --test --test-reporter=spec tests/game.test.js tests/combat-v3.test.js tests/combat-v4.test.js tests/normal-run-v3.test.js
```

45 项通过，包括原有战斗、碰撞、连续六区推进、武器派生、冷却台账、墙体视线、DOT 奖励、新怪群上限、三元素一次收割 12 名小怪且精英存活、冷却返还上限、击退碰撞、换装后伤害归因、真实步行访问两支路与回溯、营地输入校验、有限护盾、结算快照，以及清场尾效等待和下一波门控。

三个正常属性、仅使用对应元素及实际获得的二阶武器的输入 bot，固定种子 913 均通关：火 146 秒、雷 159 秒、水 200 秒，各 293 击杀、等级 6。bot 不改生命、伤害、速度或敌人数，但具有准确敌人位置和预警信息；此结果证明流程可完成，不代表普通玩家真实通关时间或难度。未进行多人、长期经济、宽种子难度统计或本子任务独立浏览器性能测试；场景与 UI 实际整合验收由主任务负责。
