# V2 角色与石材素材：来源、检查及接入

核验时间：2026-09-30，Asia/Shanghai。当前文档覆盖已下载素材与隔离 Blender 检查；游戏中的实际观感、运行性能与玩法验收由主项目另行核验。

## 已确认事实

本次实际下载四个 KayKit 角色、四件配套武器、七件地下城道具和十二张 1K 石材贴图。KayKit 文件逐一与作者官方 GitHub 仓库指定提交的 Git blob SHA1 比对；Poly Haven 贴图逐一与官方 API 的 MD5 比对。最终清单与完整动作列表在 `public/assets/vendor/manifest-v2.json`。

### 角色

| 相对 `public/assets/vendor/kaykit/` 的路径 | Mesh / 三角面总数 | Skin / 动画数 | Idle 姿态高度 |
| --- | --- | --- | --- |
| `Knight.glb` | 15 / 6952 | 1 / 76 | 2.4375 |
| `Skeleton_Warrior.glb` | 10 / 5934 | 1 / 95 | 2.5611 |
| `Skeleton_Mage.glb` | 9 / 4588 | 1 / 95 | 2.6003 |
| `Rogue_Hooded.glb` | 12 / 6035 | 1 / 76 | 2.2222 |

三角面数包含未选用的可切换装备。高度为 Blender 5.2.1 LTS 导入后选择 Idle、第 8 帧、24fps、隐藏多余装备后，对变形后的实际可见网格顶点计算的尺寸，包含头盔或帽子。未以骨架控制器和空物体计算高度。脚底接近 0。完整检查记录为 `kaykit/blender-inspection.json`，实际渲染为 `kaykit/*-inspection.png`。

四个角色均为原始 GLB，图像已内嵌，没有外部贴图依赖。均为 glTF `+Y` 向上、`+Z` 朝前；导入 Blender 后对应 `+Z` 向上、`-Y` 朝前。骨骼和原作者动作均保留。

常用动画：`Idle`（1.0667s）、`Walking_A`（1.0667s）、`Running_A`（0.8s）、`1H_Melee_Attack_Slice_Horizontal`（1.0667s）、`1H_Melee_Attack_Chop`（1.0667s）、`Death_A`（0.8s）、`Dodge_Forward`、`Spellcast_Shoot`（0.9333s）。骷髅额外有 `Idle_Combat`、`Walking_D_Skeletons`、`Death_C_Skeletons`、`Spellcast_Summon` 等。所有名称与时长以 JSON 清单为准。

**装备显示规则：**

- Knight 保留身体、`Knight_Helmet`、`Knight_Cape`、`1H_Sword`、`Badge_Shield`。隐藏 `1H_Sword_Offhand`、`Rectangle_Shield`、`Round_Shield`、`Spike_Shield`、`2H_Sword`。这些是 glTF node 名称，不能按 `Cube.*` mesh 数据名判断。
- Skeleton_Warrior 和 Skeleton_Mage 不含内置武器，全部身体网格应显示；使用独立武器模型挂到手部挂点。
- Rogue_Hooded 可保留 `Knife`，隐藏 `Knife_Offhand`、`1H_Crossbow`、`2H_Crossbow`、`Throwable`；本次作为备用角色。

**骨骼与动作：**

- 武器挂点为 `handslot.r` / `handslot.l`，相关骨骼包括 `hand.r` / `hand.l`、`head`、`hips`、`spine`、`chest`、`root`、`upperleg.l` / `upperleg.r`。
- Three.js 的 GLTFLoader 会净化节点名，点号通常被移除，运行时对应 `handslotr` / `handslotl`、`handr` / `handl` 等；应以实际加载节点名匹配。
- 已解析三个主要角色的原始动画数值：`Idle`、`Walking_A` 的 root translation 固定为 0；`Running_A` 只有 Y 轴 0–0.05 的起伏，XZ 无位移。`Dodge_Forward` 的 root Z 具有 0–0.25 的位移，应在游戏主动驱动位移时去掉 root 的 XZ。
- 保留 hips 的局部运动，斩击、倒地等依赖其动作；不要把所有骨骼的 position track 一并删除。
- 如要修改头身比，直接改变 bone.scale 可能被动画中的 scale track 覆盖。应在 mixer 更新后施加明确的比例修正，或离线修改 bind pose 与蒙皮再重新验收；本次原文件没有做这类改造。

### 配套武器与道具

四件武器由作者原始 glTF、BIN 和 atlas PNG 封装为单文件 GLB，节点、几何与材质数据不变：

- `Skeleton_Blade.glb`：457 三角面。
- `Skeleton_Axe.glb`：534 三角面。
- `Skeleton_Staff.glb`：1519 三角面。
- `Skeleton_Shield_Large_A.glb`：626 三角面。

道具为官方 Dungeon Remastered 的原始 GLB，仅将源文件多余 `.gltf.glb` 后缀整理为 `.glb`：

`props/barrel_large_decorated.glb`、`props/crates_stacked.glb`、`props/pillar_decorated.glb`、`props/wall_arched.glb`、`props/torch_mounted.glb`、`props/candle_triple.glb`、`props/chest.glb`。

所有最终 GLB 均通过头部长度、JSON 数据和内嵌贴图引用检查，没有外部 image URI。

### 1K PBR 石材

三套均为 1024×1024，四种贴图为 Diffuse、OpenGL Normal、Roughness、AO，合计 **8,748,873 字节**。不含更大分辨率文件。

| 目录，相对 `public/assets/vendor/polyhaven/` | 作者 | 官方来源 |
| --- | --- | --- |
| `monastery_stone_floor/` | Amal Kumar | [Monastery Stone Floor](https://polyhaven.com/a/monastery_stone_floor) |
| `stone_wall/` | Charlotte Baglioni / Dario Barresi | [Stone Wall](https://polyhaven.com/a/stone_wall) |
| `rocks_ground_05/` | Rob Tuytel | [Rocks Ground 05](https://polyhaven.com/a/rocks_ground_05) |

每个目录文件名为 `<目录名>_diff_1k.jpg`、`<目录名>_nor_gl_1k.jpg`、`<目录名>_rough_1k.jpg`、`<目录名>_ao_1k.jpg`。Diffuse 使用 sRGB；其余使用非颜色数据，normal 为 OpenGL 方向。每套的官方 API 返回保存在 `source-files.json`，实际文件摘要保存在总 manifest。

## 来源方主张与许可

Kay Lousberg 官方仓库及各包的 LICENSE 文件明确标注 CC0 1.0。许可原文已保存为 `kaykit/LICENSE-adventurers.txt`、`kaykit/LICENSE-skeletons.txt`、`kaykit/props/LICENSE.txt`。[Adventurers 官方仓库](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0)、[Skeletons 官方仓库](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0)、[Dungeon Remastered 官方仓库](https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0)。

固定提交分别为：

- Adventurers：`672074b73ba276876a19e8816ecdc5241817ab47`。
- Skeletons：`15b62b9bad122f72926c10fb14d622c73819fa54`。
- Dungeon Remastered：`b0ca9bd96a8072ab36a3a5464f00ed1e06a16d07`。

Poly Haven 官方许可页说明其资产采用 CC0，可用于商业作品和再分发；作者署名受欢迎，但不是强制条件。[官方资产许可](https://polyhaven.com/license)。为便于来源追踪，本项目仍建议在制作人员中致谢 Kay Lousberg / KayKit、Poly Haven 及上述纹理作者。

## 判断与风格限制

已观看四个实际 Blender 渲染。KayKit 角色具有明确的大头、短身、卡通轮廓；成熟的手工几何与骨骼动作能改善原始刚体角色的细节和运动，但不能据此将它描述为写实人物。降低饱和度与厚重照明只能改变氛围，不能独自解决比例差异。

另核对了 [Quaternius Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html) 和 [Animated Knight Pack](https://quaternius.com/packs/knightcharacter.html)。前者官方介绍提供 Regular 等人体比例、Humanoid rig 与基础发型，后者提供骑士与动作。仅核对网页，没有将它们下载、接入或验收；本次不能声称这些候选已经解决偏写实暗黑角色需求。

## 尚待主项目确认

角色在游戏中的装备挂点、动画切换、死亡与受击过渡、场景比例、PBR 贴图尺度、实时帧率及整体验收，仍需要主项目实际运行确认。这里的文件与静态 Blender 证据不替代游戏体验。

## 主张对账

| 主张 | 对象/版本 | 截至时间 | 支持证据 | 相邻证据与边界 | 证据类型 | 允许措辞 |
| --- | --- | --- | --- | --- | --- | --- |
| KayKit 可用于本项目 | 三个固定提交 | 2026-09-30 | 官方 LICENSE + 仓库描述 | 只针对下载的公共包 | 官方许可与文件 | 已下载的公共包为 CC0 |
| 四角色带骨骼动画 | 4 个指定 GLB | 同上 | skin/animation 解析、Blender 导入 | 未代替全部动作游戏内验收 | 本地文件与运行检查 | 角色含 76/95 个动作并可导入 |
| 石材是 1K 且来源匹配 | 12 张 JPG | 同上 | 图像尺寸、官方 API MD5 | 不承诺所有场景距离无重复感 | 官方 API + 文件校验 | 12 张1024×1024贴图，校验通过 |
| 角色面向 +Z | 4 个 GLB | 同上 | Blender 正面渲染及骷髅眼睛位置 | 坐标系转换到 Blender 为 -Y | 实际渲染/几何 | glTF 前向 +Z |
| 风格属于卡通 | 当前作者模型 | 同上 | 四张实际模型渲染 | 审美是判断，非量化结论 | 视觉检查与判断 | 仍是大头卡通比例，不称写实 |
| V2已达到最终游戏品质 | 当前整合版 | 同上 | 本文未覆盖完整游戏验收 | 游戏运行由主流程处理 | 未确认 | 不作此结论 |

正反主张对撞：PASS。已下载/已校验/已渲染与已接入游戏/最终审美验收分别表述；没有用页面未出现替代来源不存在。

## 查询与处理记录

1. 只读 Agent Memory 窄查 KayKit / Poly Haven / CC0 / Blender；未采用记忆作为许可和文件证据。
2. AnySearch 查询 `KayKit official Adventurers Skeletons CC0 GLTF GitHub`；官方 GitHub 页面与 LICENSE 交叉核对。
3. 读取三个官方 GitHub repository tree，固定提交并记录 blob SHA1。
4. `raw.githubusercontent.com` 大文件路径在当前网络无有效返回；官方 Blob API 的大 JSON 返回在 60 秒内不完整。改用 jsDelivr 指定官方仓库同一提交的文件分发，再与官方 Git blob SHA1 校验，防止传输来源变化冒充作者内容。
5. Poly Haven 官方素材页、许可页与 `/files/<asset>` API 对照；只下载三套 1K JPG 必需贴图。
6. 标准 GLB 结构解析、内嵌贴图与动画检查；Blender 独立后台进程导入、Idle 姿态尺寸与实际渲染检查。没有接管用户当前 Blender 场景，也没有上传到外部预览服务。

复现入口：`python3 tools/import_assets_v2.py`；可见模型渲染：Blender 后台运行 `tools/import_assets_preview.py`；可编辑素材库：Blender 后台运行 `tools/import_v2_blender.py`，保存独立 `blender/emberfall-v2-characters.blend`，不覆盖旧建模文件。

素材库已经保存并独立重新打开验证：4 个 armature、342 个 action、15 张图像全部内嵌、17 个 Collection。角色、武器、道具分别分组排列，角色默认 Idle，全部导入动作保留为 fake user，其他 NLA 轨道静音。文件内置 `README - CC0 Asset Library` 文本，供后续编辑使用。
