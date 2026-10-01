# 圆润可爱角色：素材与制作路线

核验日期：2026-10-01，Asia/Shanghai。本文给当前 Blender → GLB → Three.js 项目提供素材候选与学习路线。素材网页确认不等于本项目已经下载、接入或完成游戏内验收。

## 主张对账

| 主张 | 对象/版本 | 截至时间 | 支持证据 | 相反或相邻证据 | 证据类型 | 正文允许措辞 |
| --- | --- | --- | --- | --- | --- | --- |
| KayKit 免费档可继续使用 | Adventurers，页面 Free 2.0 | 2026-10-01 | 作者页面列出 5 个角色、绑骨动画、FBX/glTF、CC0 与免费档 | Extra 与 Source 分别收费；已接入文件以本地固定提交清单为准 | 官方资产页 + 本地来源文档 | 免费档有可用于商业项目的 CC0 角色；原生 .blend Source 属于付费档 |
| KayKit 付费档价格 | Adventurers 当前页面 | 2026-10-01 | Extra 至少 $7.95；Source 至少 $11.95 | 美元页面标价可能变化；本次没有购买 | 官方作者价格页 | 本次核验的当前页面标价如此，免费 GLB 已可在 Blender 导入编辑 |
| 有可爱敌人候选 | Quaternius Cute Animated Monsters，August 2020 | 2026-10-01 | 作者页写明 21 个带动画怪物、FBX/OBJ/Blend、免费个人和商业使用，许可栏 CC0 | 格式栏另列 glTF，但正文未列；本次不承诺下载包中包含 glTF | 官方资产页 + CC0 许可解释页 | 可作为后续可爱怪物候选；下载后再确认具体格式与骨骼动作 |
| 有作者的制作教程 | Quaternius Tutorials | 2026-10-01 | 页面列出 Toon Human、Retopology、Character Rigging、Simple Walk、Run Animation | 仅核对教程目录；未逐帧审核教程视频，界面可能与当前 Blender 有差异 | 官方作者教程目录 | 可按这些主题学习卡通角色的完整制作流程 |
| Bevel 真正改变边缘形状 | Blender 5.2 LTS Manual 当前页面 | 2026-10-01 | 官方 Bevel 文档说明边缘倒角、Segments、Clamp Overlap、Harden Normals | Shade Smooth 只影响法线/着色，不能替代轮廓几何；已经绑骨角色还要复查蒙皮 | 官方技术文档原文 | 选择性倒角可圆化硬边；平滑着色不能单独把方头变圆 |
| GLB 可承载模型与骨骼动画 | Blender glTF 2.0 文档 | 2026-10-01 | 官方文档支持 mesh、Principled 材质、keyframe/shape-key/skinning 动画 | Blender 任意节点材质、约束与布料效果不能一概假定导出一致 | 官方技术文档 | 导出后检查实际 GLB 的骨骼、动作与材质，不能以 Blender 截图替代运行验证 |
| AI 图能帮助原创设计 | 当前项目建议 | 2026-10-01 | 可用正侧背参考约束外观；后续工作依赖实体网格、蒙皮与动画 | 2D 图片不包含可供游戏直接使用的网格、权重与动作 | 制作建议与工程判断 | AI 适合概念设计与参考；可玩角色仍须完成 3D 制作管线 |

正反主张对撞：PASS。免费包与付费 Source、网页许可与实际下载、模型截图与游戏运行验收分别表述。

## 已确认事实与五个实用入口

1. **玩家角色：继续用 [KayKit Adventurers](https://kaylousberg.itch.io/kaykit-adventurers)。** 作者免费档列出 5 个已贴图、绑骨、带动画角色和 25+ 配件，提供 FBX/glTF，采用 CC0。当前页面 Extra 为 $7.95 起，原生 `.blend` Source 为 $11.95 起。本项目已有角色来源与动画清单在 `asset-research-v2.md`、`animation-v3.md`；可以导入现有 GLB 做圆润处理，无需为本次调整购买 Source。
2. **后续怪物：[Quaternius Cute Animated Monsters](https://quaternius.com/packs/cutemonsters.html)。** 作者列出 21 个带动画、贴图的可爱怪物，许可栏为 CC0，正文说明可免费用于个人与商业项目。正文保证 FBX/OBJ/Blend；接入时先检查实际包，再通过 Blender 转 GLB。它是候选，当前版本没有下载或替换这些敌人。
3. **原创角色教程：[Quaternius 官方教程目录](https://quaternius.com/tutorials.html)。** 推荐顺序为 `25 Simple Toon Human pt.1` → `15 Retopology` → `8 Character Rigging` → `23 Simple Walk Animation` / `13 Run Animation`。目录还包括 `19 Atlas Texturing` 和 `7 Character Palettes`，适合学习小贴图统一一组卡通角色。
4. **真正圆化边缘：[Blender 官方 Bevel Modifier](https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/bevel.html)。** 学习 Width、Segments、Limit Method、Clamp Overlap；头盔、肩甲、鞋、盾牌等硬表面适合选择性倒角。官方 Subdivision Surface 与 Shade Smooth 文档也已读取：前者改变曲面形状，后者主要改变着色。这两个操作用途不同。
5. **最终进游戏：[Blender 官方 glTF 2.0 导入/导出](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html)。** 此入口是已读取的 5.1 文档，操作时以本机版本界面为准。glTF 能保存模型、材质、蒙皮与动画；导出结果要在 Three.js 中复查。

## 来源方主张

KayKit 和 Quaternius 的角色数量、免费使用范围、动画能力与格式说明来自各自作者页面。本项目已有 KayKit 文件还保存了固定提交、许可证与本地检查记录；候选 Quaternius 包这次只读网页，没有进行文件级许可或骨骼检查。下载新包时仍需保存包内 LICENSE 与实际文件清单，便于以后换模型和追溯。

## 当前项目的判断与推荐

建议把风格定为“暖光下的圆润小冒险者”：较大的头、短而结实的身体、圆角装备、清楚的火/雷/水配色，搭配有层次的布料和金属。可爱感来自比例、轮廓、表情、材质与动作的共同作用。

先改善现有角色轮廓与营地展示，保留已经接好的装备挂点和动画。以后再把怪物按一个统一风格替换。一次混入很多不同作者的角色，会增加头身比、材质和动作不一致的问题。这是针对本项目的美术判断，素材许可并不能证明某个包一定更好看。

### Blender 中的圆润制作步骤

1. **复制到独立文件。** 导入角色 GLB，另存新的 `.blend`，保留原文件、Armature、动作与挂点。先记录站立身高、脚底位置和朝向；本项目 glTF 为 `+Y` 向上、`+Z` 朝前。
2. **先改大轮廓。** 在静止姿态下检查头部、肩甲、手套和靴子。硬表面用少量倒角段数作为起点，保持尖锐的剑刃与盾牌识别边；有机头/身体可采用低级别 Catmull–Clark，但先检查拓扑和 UV。不要直接给整组角色无限细分。
3. **再改法线与材质。** 按曲面与硬面分配平滑/锐边；用较柔和的粗糙度和清晰的材质分区表现布料、皮革、金属。单靠 Shade Smooth 会让面部高光更柔和，方形轮廓仍需修改几何。
4. **保护蒙皮和动作。** 几何处理会增加顶点，需检查权重是否正确传递。避免直接对动画中的骨骼随意应用缩放；比例改变可能影响手持武器、施法、闪避和脚接地。至少检查 Idle、Running、Attack、Cast、Dodge、Death 六种姿态。
5. **输出与比较。** 另存 GLB，保留骨骼与命名兼容；三角面、文件大小和加载时间一起记录。在营地近景和战斗俯视镜头都比较，再用项目的 `node tools/check_actors_v3.mjs` 检查原有角色契约。后处理之后还要确认新的模型没有法线接缝、UV 拉伸或肩肘塌陷。

具体倒角宽度、细分级别和材质值应由实际几何决定；这些步骤是起始方法，不能凭固定参数保证任意模型都漂亮。

### 后续原创 / AI 辅助制作路线

先做一个角色再扩展全套：**正侧背概念参考 → Blender 低模或雕刻 → 重拓扑与 UV → 贴图 → 骨骼和权重 → 动作 → GLB → 游戏验收。** AI 图片适合快速确认脸、服装、色板与三视图；AI 3D 输出若用于生产，也要完成网格、权重与动画检查。

可复用的概念提示词：

> Original cute fantasy adventurer, rounded toy-like proportions, large expressive head, compact body, soft rounded armor, readable silhouette, ember orange and muted teal palette, front side and back orthographic character turnaround, neutral A-pose, consistent outfit in all views, clean plain background, no text, no logo, no existing franchise character.

这份提示词生成的是设计参考。正式游戏角色需要独立制作真实几何与动画，不能把参考图的好看程度当成可玩性验证。

## 仍未确认

候选 Quaternius 怪物的实际压缩包内容、骨骼命名、动作时长与本项目挂点兼容性尚未做文件级检查；后续接入时再核验。这里不把“网页写有动画”扩展为“已经兼容现有 ActorSystem”。

## 查询记录

- 先只读 Agent Memory 窄查 `emberfall game KayKit Quaternius character models`，仅用于发现本地历史线索；现场读取 `asset-research-v2.md`、`animation-v3.md`、`DEPENDENCIES.md` 核对当前项目。
- 搜索工具目录中未提供 AnySearch 调用入口，采用现有 `web.run` 搜索官方作者页与 Blender 文档；查询词覆盖 `KayKit Adventurers CC0`、`Quaternius rigged cute`、`Blender Bevel Subdivision glTF`。
- 2026-10-01 读取 KayKit 作者 itch.io 页面、Quaternius 官方资产页/教程目录与 Creative Commons CC0 说明。未下载大包、购买 Source 或改变账号设置。
- `web.run` 读取 Blender 文档返回 402/403，记录为该读取路径失败。使用 `curl` 直接读取同一官方域名，Bevel、Subdivision Surface、Shade Smooth 的当前 5.2 LTS 手册与 glTF 5.1 手册成功返回原文。当前 glTF `latest` 入口传输失败，改读官方版本固定的 5.1 文档，没有把失败当成资料不存在。
- 本文件只交付调研与教程路线；实际模型与营地 UI 改动、运行检查记录由本版实现文档承担。
