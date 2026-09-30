# v0.2 模型与材质档案

v0.2 的主要角色改用 Kay Lousberg / KayKit 的第三方 CC0 角色与骨骼动画，石材采用 Poly Haven 的 CC0 PBR 贴图。旧版项目生成的 12 个 GLB 与 Blender 源场景继续保留，但当前渲染器已不通过旧版角色文件加载主角和敌人。

KayKit 角色仍是大头、短身的卡通比例。骨骼动画、材质与灯光能够改善动作和环境层次，不能据此将角色描述为写实人物。完整来源、许可证、固定版本、文件校验与静态渲染记录见 `docs/asset-research-v2.md`；游戏浏览器验收见 `docs/ACCEPTANCE.md`。

## 当前加载范围

以下映射根据 `src/view.js` 与 `src/environment.js` 的实际资源入口记录。文件“已下载”与“游戏当前使用”分开列出。

| 游戏对象 | 实际资源，相对 `public/assets/vendor/kaykit/` | 当前接入 |
| --- | --- | --- |
| 玩家 | `Knight.glb` | 保留单手剑、盾牌、头盔与披风，隐藏多余可切换装备 |
| 近战敌人 | `Skeleton_Warrior.glb` + `Skeleton_Blade.glb` | 武器挂到右手挂点 |
| 重击者 | `Skeleton_Warrior.glb` + `Skeleton_Axe.glb` + `Skeleton_Shield_Large_A.glb` | 同一骷髅资源的体型与装备变体 |
| 丧钟守卫 | `Skeleton_Warrior.glb` + 斧、盾 | 放大骷髅并增加运行时冠饰，不是独立原创角色模型 |
| 远程敌人 | `Skeleton_Mage.glb` + `Skeleton_Staff.glb` | 法杖挂到右手挂点 |
| 备用角色 | `Rogue_Hooded.glb` | 已下载、校验并收入 Blender 素材库；当前渲染器未加载 |
| 场景道具 | `props/chest.glb`、`crates_stacked.glb`、`barrel_large_decorated.glb` | 宝箱、箱堆、木桶已接入环境 |
| 备用道具 | `pillar_decorated`、`wall_arched`、`torch_mounted`、`candle_triple` | 已下载并归档，当前未加载 |

七件道具为 `barrel_large_decorated`、`crates_stacked`、`pillar_decorated`、`wall_arched`、`torch_mounted`、`candle_triple`、`chest`。四件独立武器由作者原始 glTF、BIN 与 atlas PNG 封装为单文件 GLB，保留原始节点、几何和材质。

## 第三方角色文件

统计来自已下载文件与独立 Blender 检查。三角面总数包含部分运行时隐藏的可切换装备，不等于每个可见角色每帧实际绘制量。

| 文件 | 网格 / 三角面总数 | Skin / 原文件动画数 | Idle 可见高度 |
| --- | --- | --- | --- |
| `Knight.glb` | 15 / 6952 | 1 / 76 | 2.4375 |
| `Skeleton_Warrior.glb` | 10 / 5934 | 1 / 95 | 2.5611 |
| `Skeleton_Mage.glb` | 9 / 4588 | 1 / 95 | 2.6003 |
| `Rogue_Hooded.glb` | 12 / 6035 | 1 / 76 | 2.2222 |

高度是在 Blender 5.2.1 LTS 中选择 Idle、第 8 帧、24fps，隐藏多余装备后计算的可见变形网格高度，包含头盔或帽子。游戏会再按对象类型缩放，表中数值不是最终碰撞体尺寸。

所有角色 GLB 均内嵌贴图，没有外部图像 URI。坐标使用 glTF 的 +Y 向上、+Z 朝前；导入 Blender 后对应 +Z 向上、−Y 朝前。

## 骨骼与动作接入

- 实例通过 `SkeletonUtils.clone()` 复制骨架，分别使用 `AnimationMixer`；没有把可动角色当作普通刚性网格克隆。
- 武器使用 `handslot.r / handslot.l` 挂点；GLTFLoader 净化名称后对应 `handslotr / handslotl`，当前接入兼容两种名称。
- 运行时从作者动作中选用 `Idle`、`Running_A`、`1H_Melee_Attack_Slice_Horizontal`、`Dodge_Forward`、施法和近战蓄力动作，并使用 `Death_A` 处理敌人死亡。原文件有更多动作，不代表全部动作都已用于或逐一验收过。
- 游戏位移由战斗引擎控制；复制动画时移除 root 的 X/Z 位移，保留垂直起伏及 hips 等骨骼的局部运动，避免闪避动作与引擎位移叠加。
- 默认装备显隐按 glTF 节点名称筛选，不能仅根据 `Cube.*` 网格数据名判断。
- 角色、武器挂点、动作切换、死亡过渡与碰撞体大小的最终游戏内效果属于浏览器验收范围，GLB 可以导入不等于这些全部通过。

完整动作名、时长、文件摘要见 `public/assets/vendor/manifest-v2.json`。

## 石材 PBR

当前 `src/environment.js` 加载下列三套材质，每套四张 1024 × 1024 JPG：Diffuse、OpenGL Normal、Roughness、AO，共 12 张，合计 8,748,873 字节。

| 目录，相对 `public/assets/vendor/polyhaven/` | 作者 | 运行时用途 |
| --- | --- | --- |
| `monastery_stone_floor/` | Amal Kumar | 连续石地板 |
| `stone_wall/` | Charlotte Baglioni / Dario Barresi | 石墙、建筑石材 |
| `rocks_ground_05/` | Rob Tuytel | 岩土地面 |

文件名为 `<目录名>_diff_1k.jpg`、`<目录名>_nor_gl_1k.jpg`、`<目录名>_rough_1k.jpg`、`<目录名>_ao_1k.jpg`。Diffuse 按 sRGB 读取，其余作为非颜色数据，normal 使用 OpenGL 方向；均从本机文件加载。官方 API 返回保存在各目录的 `source-files.json`，MD5 保存在总清单。

环境建筑、通道、封印、支路布置与贴图尺度由 `src/world.js` 和 `src/environment.js` 控制。地面和墙体材质是第三方素材，项目布局与程序化搭建不能将其来源改写为项目原创。

## Blender 可编辑素材库

- `blender/emberfall-v2-characters.blend`：新版独立素材库，包含角色、武器与备用道具，按 Collection 排列；它不是完整连续关卡的 Blender 场景。
- `tools/import_v2_blender.py`：导入并保存该素材库的脚本。
- `tools/import_assets_v2.py`：获取、封装与校验资源的入口。
- `tools/import_assets_preview.py`：独立 Blender 预览检查入口。
- `public/assets/vendor/kaykit/blender-inspection.json` 与 `*-inspection.png`：静态姿态尺寸和实际渲染记录。

该 `.blend` 已保存并独立重新打开验证：4 个 armature、342 个 action、15 张内嵌图像、17 个 Collection。角色默认 Idle，保留原作者全部导入动作并设置 fake user，其余 NLA 轨道静音。文件内置 `README - CC0 Asset Library` 文本。

连续地下城本身目前由运行时 JavaScript 搭建，不能将这份角色素材库说成已经导出了整个新版关卡。

## 来源与许可

KayKit 下载范围来自作者官方 Adventurers、Skeletons 和 Dungeon Remastered 仓库的固定提交。原始许可分别保存在：

- `public/assets/vendor/kaykit/LICENSE-adventurers.txt`
- `public/assets/vendor/kaykit/LICENSE-skeletons.txt`
- `public/assets/vendor/kaykit/props/LICENSE.txt`

这些公共包标注 CC0 1.0；Poly Haven 的三套资产也采用 CC0。作者、官方来源页面、固定提交与逐文件摘要已记录在 `docs/asset-research-v2.md` 和 `public/assets/vendor/manifest-v2.json`。本项目保留 Kay Lousberg / KayKit、Poly Haven 与纹理作者信息以便追溯。

## v0.1 模型与视频保留

以下是旧版项目中由 Blender Python 脚本生成的原始素材，供回退、比较或继续编辑。它们不是 v0.2 当前角色来源，也没有覆盖新版地图与动画。

- `blender/emberfall-assets.blend`：旧版模型陈列场景。
- `blender/build_assets.py`：旧版建模生成脚本。
- `blender/asset-gallery.png`：旧版 1920 × 1380 模型画册。
- `public/assets/models/`：旧版 12 个 GLB：`player`、`skeleton`、`wraith`、`brute`、`boss`、`pillar`、`arch`、`brazier`、`sarcophagus`、`altar`、`chest`、`crystal`。
- `public/assets/models/manifest.json`、`blender/validation-report.json`：旧模型的尺寸、几何与结构检查。
- `public/assets/video/level-scene.mp4`、`artifacts/level-scene-source.webm`：v0.1 场景动画与源录制，未展示新版环境或第三方角色。

旧 12 个 GLB 合计 898,256 字节，采用刚性分件层级，没有骨骼蒙皮和内置 AnimationClip。旧模型的 +Y 向上、+Z 朝前、脚底原点和武器轴心检查仍是历史有效证据，不能替代新版骨骼角色的检查。原始验收记录已保存在 `artifacts/v0.1-backup/ACCEPTANCE.md`。
