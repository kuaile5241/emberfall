# V0.3 角色与动画交付

本版使用 KayKit 的风格化骨骼角色，新增 Mage 和三把原创元素武器；没有把模型改称写实风格。运行时实现为 `src/actors.js`，不写入游戏逻辑状态。

## 接入契约

```js
import { ActorSystem, ACTOR_ASSETS } from './actors.js';
// models: { assetName: gltf.scene }; clips: { assetName: gltf.animations }
const actors = new ActorSystem({ models, clips, parent, camera });
actors.ensure(entity, isPlayer, game.weapon); // 返回 THREE.Group
actors.event(event);                         // 消费事件，但不修改事件
actors.update(game, dt);                     // 暂停时 dt = 0
actors.clear();                             // 切换房间或结束时清理
```

`ACTOR_ASSETS` 包含所有实际模型 URL；`actors.actors` 为角色 Group 的 Map，玩家键为 `'player'`，敌人为其逻辑 `id`。原始模型与 clips 保持不变。角色使用 SkeletonUtils 克隆独立骨骼，动态材质按角色克隆，纹理和几何体共享。装备改变时重新创建玩家外形，清理前一角色自有资源。

## 动作行为

- 移动速度、朝向和动画权重采用指数平滑。前进走/跑、后退、左右横移根据速度与角色朝向混合。循环动作只启动一次，帧更新不重置动作时间。
- 原始动画按上身（spine/chest/head/手臂/手部）和下身分轨。移动时，上身播放攻击、下身继续步态；停止时恢复全身动作。保留原始骨骼动画，去掉 root 的 XZ 位移，保留 Y 起伏。
- 普攻连招用三个不同动画。火剑为横斩、斜斩、下劈；大剑为双手横扫、下劈、旋斩；雷枪以刺击为主；水杖使用三段施法。按实际 `attack.duration` 调整完整动作时长。
- 优先级：死亡 > 闪避 > 施法 > 敌人蓄力 > 普攻 > 受击 > 移动。短施法为 **0.68 秒**；不会把地面技能的 3–4.5 秒持续时间当作动作锁定。
- 动作交接保留约 0.085 秒淡出；敌人的蓄力动作按警示持续时间压缩前段，再完成出手。死亡动作播放后保留短暂尸体并下沉清理。
- 闪避、受击、死亡以及低于当前优先级的新事件分别处理。尚未生成的角色事件最多等待 0.4 秒，避免丢失开局攻击，也不会无限排队。
- 暂停时，动作时间、骨骼姿势和已混合的权重不推进。局部受击/燃烧/减速颜色恢复到角色自己的原材质；减速脚环冷蓝，燃烧脚环暖橙。

调试状态位于 Group.userData：`animation`、`overlay`、`baseWeights`、`combatStats`、`buffs`。`buffs` 读取 `game.activeBuffs`。

## 角色与装备

| 元素 | 角色 | 默认手持模型 | 变化 |
|---|---|---|---|
| 火 | Knight | Fire_Sword | 普通剑配盾；大剑放大并取消盾 |
| 雷 | Rogue_Hooded | Lightning_Spear | 双手待机、刺击；长戟版本放大 |
| 水 | Mage | Water_Staff | 施法；权杖版本缩短 |

均为 glTF +Y 向上、+Z 向前。独立武器握点为原点，长轴 +Y；挂载到 `handslotr`（原始骨名 `handslot.r`）。只保留角色身体前缀，隐藏模型自带的其他武器，避免多套装备同时出现。Mage 保留 `Mage_` 前缀，隐藏 Spellbook、Spellbook_open、1H_Wand、2H_Staff。Mage 在 Idle 第 8 帧的原始可见高度约 **2.6867**，运行时缩放为 0.86。

## 新资产与可编辑源

目录：`public/assets/models-v3/`。

| 文件 | 大小 | 三角形 | 来源 |
|---|---:|---:|---|
| Mage.glb | 3,589,240 B | 5,683（含可选装备） | Kay Lousberg / KayKit，CC0 1.0 |
| Fire_Sword.glb | 49,584 B | 1,328 | 本项目原创 Blender 几何 |
| Lightning_Spear.glb | 125,692 B | 2,476 | 本项目原创 Blender 几何 |
| Water_Staff.glb | 156,412 B | 3,154 | 本项目原创 Blender 几何 |

Mage 包含 41 骨骼、76 个原始动画，来源为 [KayKit Adventurers 官方仓库固定提交](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/blob/672074b73ba276876a19e8816ecdc5241817ab47/addons/kaykit_character_pack_adventures/Characters/gltf/Mage.glb)。下载以固定提交的 jsDelivr 为传输渠道，内容 Git Blob SHA-1 与官方仓库树校验相同。许可证存于 `LICENSE-Mage.txt`，出处及哈希存于 `Mage-source.json` 和 `manifest-v3.json`。沿用的 v2 资产许可仍在 `public/assets/vendor/manifest-v2.json`。

三把武器源文件：`blender/emberfall-v3-elemental-weapons.blend`。独立重新打开确认 32 个物体、3 个 Collection、7 种材质；旧 Blender 文件未覆盖。可编辑库为便于观察将三套物体水平排开；导出的 GLB 保持握点原点。

- 生成武器：`tools/element_weapons_v3.py`
- 重算清单：`python3 tools/manifest_assets_v3.py`
- Blender 检查/渲染：`tools/inspect_assets_v3.py`
- 检查图：`elemental-weapons-inspection.png`、`mage-inspection.png`
- Blender 检查数据：`inspection-v3.json`

## 验证与边界

`node tools/check_actors_v3.mjs` 使用全部 12 个实际 GLB 和 Three AnimationMixer 运行 **22 项检查全部通过**，包括独立骨骼、装备隐藏、移动中下肢步态、转向阻尼、暂停姿势、连招、施法与闪避优先级、死亡清理、材质隔离、换装及事件超时。结果存于 `actor-checks-v3.json`。该脚本为无 WebGL 的骨骼/状态检查，图片解码被桩替代，不能代替浏览器视觉验收；游戏的整体验收见项目 `docs/ACCEPTANCE.md`。

实际 Blender 检查图已查看。此实现改善现有作者动画的组合和交接，未实现动态足部 IK、自动寻路转身、披风布料模拟或动作捕捉。模型风格仍为低多边形卡通，三职业体型和武器轮廓不同。
