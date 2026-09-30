# Emberfall 战斗引擎接口

`src/game.js` 不依赖浏览器、Three.js、DOM、音频或存储。引擎只管理战斗状态；渲染器读取公开字段并消费事件。

```js
import { Game } from './src/game.js';
const game = new Game({ seed: 20260930, difficulty: 'normal' });
game.start();
game.update(deltaSeconds, { moveX: 0, moveZ: -1, aimX: 0, aimZ: -1, attack: true });
for (const event of game.drainEvents()) showEffect(event);
```

## 生命周期

- `constructor({seed, difficulty})`：初始 `status='menu'`。种子接受数字或字符串，公开 `seed` 是归一化后的 uint32。难度支持 `story`、`normal`、`hard`。
- `start()`：使用当前种子完全重置并开始第一房；返回 `this`。
- `reset({seed, difficulty}={})`：可更换种子/难度并开始新一轮；返回 `this`。
- `update(dt, input)`：只在 `playing` 时推进；最大接受 0.1 秒、内部最多以 1/60 秒步长运行。页面重新获得焦点时不会补算整段离线时间。
- `chooseUpgrade(index)`：三选一使用 0..2。成功返回 `true`；无效选择不改变状态。多个连续升级会逐一展示，全部选完自动恢复。
- `interact()`：清场后首次交互在任意位置展示房间奖励。选择奖励后，走到出口 3.2 米内再次交互进入下一房。未清场、状态不匹配或离出口太远则返回 `false`。
- `drainEvents()`：返回自上次读取起的事件数组并清空；每帧只由一个消费方调用。

## 输入

`moveX/moveZ` 是方向向量，长度大于 1 会归一化。`aimX/aimZ` **也是方向向量**，例如鼠标地面交点减玩家坐标；不是世界坐标。没有有效瞄准向量时，面朝移动方向。

`attack` 可以持续按住。`dash`、`skill`、`potion`、`interact` 使用按下沿触发，须松开后才能再次触发。键位由 UI 决定。升级选项出现时推进暂停，敌人和弹幕不会继续移动。

## 公开状态

所有坐标使用地面 `x/z`，单位为米。`facing = atan2(dx,dz)`，即 0 指向 +Z，π 指向 −Z。地面设计范围 X ±12、Z ±10；玩家中心实际限制在 X ±11.45、Z ±9.35。

| 字段 | 内容 |
|---|---|
| `status` | `menu / playing / upgrade / dead / won` |
| `player` | `x,z,radius,facing,hp,maxHp,level,xp,xpNext,damage,speed,potions,maxPotions,potionHeal,potionCd,dashCd,dashCooldown,dashTime,skillCd,skillCooldown,skillDamage,skillRadius,attackCd,attackInterval,attackRange,attackArc,invulnerable,critChance,armor,lifeOnKill,regen,thorns,moving` |
| `enemies` | `{id,type,x,z,hp,maxHp,facing,radius,elite,windup,stun,hitFlash,spawnTime,phase,...}`，`type=melee/ranged/brute/boss`；击杀即从数组删除 |
| `projectiles` | `{id,ownerId,type,x,z,vx,vz,radius,damage,life,facing}`，`type=bolt/fire` |
| `telegraphs` | `{id,enemyId,type,x,z,radius,angle,arc?,length,width,remaining,duration}`，`type=circle/line/cone`；`remaining/duration` 为蓄力剩余比例 |
| `drops` | `{id,type,x,z,value,radius,age}`，`type=xp/gold/potion`；经验和金币在 4.6 米内吸附，清场自动收取，满药水时药水保留地面 |
| `choices` | `[{id,name,description,icon}]`，仅 `upgrade` 状态显示 |
| `choiceReason` | `level / room / null` |
| `boons` | `[{id,name,description,icon,stacks}]`，已选强化及层数 |
| `weapon` | `{id,name,type,description}`，初始逐火者长剑 |
| `roomIndex / roomName / roomSubtitle / roomTheme` | 0..5；当前房间中文名、描述、渲染主题 |
| `roomLabel / progress` | `"1 / 6"` 形式的标签，以及 0..1 的房间通关进度 |
| `waveIndex / waveCount` | 从 0 开始的波次；总波次 1..3 |
| `roomProgress` | `{kills,total,wave,waves}`，其中 `wave` 从 1 开始 |
| `roomCleared / rewardReady / roomRewardTaken` | 分别为清场、房间奖励待选、奖励已领取 |
| `exit` | `{x:0,z:-8,radius:3.2}` |
| `chest` | 清场后为 `{x:0,z:-2,opened:false}`；领取奖励后 opened=true，否则 null |
| `kills / time / gold / damageDealt / damageTaken` | 本轮击杀、有效游玩秒数、金币、造成伤害、承受伤害 |

## 房间流程

1. 灰烬前庭：2 波近战为主，第二波出现重击者。
2. 无声回廊：2 波混编，出现远程。
3. 遗忘圣所：2 波，末波精英。
4. 熔火工坊：3 波，末波精英。
5. 敲钟长阶：3 波，末波精英。
6. 钟下祭坛：丧钟守卫与 4 个护卫，守卫半血召唤 4 个增援且攻击提速。

清空一波后等待 1.8 秒生成下一波。清空整个房间恢复 24% 最大生命；非最终房间可按 E 开启奖励。最后一房须消灭所有敌人，随后直接进入 `won`，不存在最后一个升级弹窗挡住胜利的问题。升级恢复 14 点生命，清场经验结算可能连续产生多个选项。

金币当前用于本轮成绩展示，未实现商店或局外消费。根 UI 负责记录最高关卡、胜场、最佳通关时间等 `localStorage` 数据。发动胜利/死亡时以事件数据及公开状态生成结算。

## 事件

所有事件都有 `type,time`。可忽略不使用的事件。

| 事件 | 主要附加字段 | 推荐展示 |
|---|---|---|
| `attack` | `x,z,facing,range,arc` | 剑弧、挥刀声 |
| `hit` | `target:'player'/'enemy',id?,x,z,amount,critical?,source` | 飘字、闪白、受击音 |
| `kill` | `id,enemyType,elite,x,z,amount` | 尸体/粒子、击杀声 |
| `dash` | `x,z,facing` | 残影 |
| `skill` | `x,z,radius,amount` | 焰爆圆环 |
| `heal` | `x,z,amount,source:'potion'/'room'` | 治疗提示 |
| `level` | `level,x,z` | 升级闪光 |
| `room` | `index,name,subtitle,wave,waves` | 房间切换 |
| `wave` | `wave,waves,amount` | 波次提示 |
| `waveclear` | `wave,nextWave` | 下一波倒计时 |
| `clear` | `index,name,x,z` | 清场、出口解锁 |
| `pickup` | `x,z,item,amount` | 拾取反馈 |
| `choices` | `reason,choices` | 显示三选一 |
| `upgrade` | `id,name,reason` | 已选强化反馈 |
| `spawn` | `id,enemyType,x,z,elite` | 敌人出现 |
| `windup` | `id,enemyType,x,z,kind,duration` | 蓄力音 |
| `enemyAttack` | `id,x,z,radius,kind` | 重击地面效果 |
| `bossphase` | `id,phase,x,z,name` | Boss 第二阶段提示 |
| `death` | `x,z,room,kills,duration` | 死亡结算 |
| `win` | `x,z,kills,duration,gold` | 胜利结算 |

线形预警的原点是攻击者地面位置，以 angle 指向射程方向。近战使用 `cone` 扇形预警，中心朝向 `angle`，半径 `radius=2.25`，张角 `arc=0.65π`；命中判定在半径上另计玩家碰撞半径 0.48 米，因此要让角色身体完全离开预警。Boss 圆形预警依攻击类型代表落点重击或径向弹幕发射。技能可打断普通敌人蓄力并消除附近弹幕，Boss 只会短暂停顿。闪避无敌 0.31 秒，普通受击后获得 0.48 秒保护。

## 验证

运行 `node --test tests/game.test.js`（项目需使用 ES Modules）。覆盖种子一致性、移动边界、攻击朝向和节奏、闪避无敌、技能冷却、药水输入、预警躲避、升级暂停与恢复、六房间完整推进、Boss 第二阶段和死亡重开。测试使用高伤害角色快速验证完整流程，不能替代真人游玩的难度与手感验收。

### 2026-09-30 自动走位平衡检查

另以正常初始属性、normal 难度、种子 1..8 运行最近敌人追踪脚本。脚本持续朝向敌人攻击，冷却完成即使用技能；在近距离预警剩余不足 0.28 秒时垂直闪避，半血以下自动喝药，按固定偏好选择构筑。8 个种子均可通关，完整击杀 70 敌人，有效模拟时间 171–193 秒，平均约 180 秒。这个脚本能瞬时读取精确坐标和预警，且选项无需思考，结果只说明正常数值可通关，不代表真人的通关时间或难度已验收。

本次调整提高了敌方生命与伤害，使攻击节奏和闪避更有作用；随机药水掉率为 5%，精英保证掉落。清场治疗与升级治疗保留，降低首次体验时无资源恢复的挫败感。难度 `story` 增加玩家生命至 150、敌方生命 ×0.8/伤害 ×0.7，`hard` 敌方生命 ×1.2/伤害 ×1.3。
