# 圆润角色与营地展示台 · V0.6

这次直接更换了游戏和营地共同加载的三职业 GLB。Knight、Rogue_Hooded、Mage 的头部和装备边缘经过几何处理，不只是把阴影改成 smooth。现有三职业装备、双语文本和营地存档格式不受影响。

## 实际美术改动

- 头部横向放大 12%、纵深放大 10%，身体横向略加宽，使大头小身的轮廓更明确。
- 重新接合 glTF 法线和 UV 边界产生的重复顶点，清理共面的三角形，再加入三段真实倒角。帽子、头盔、手脚、披风增加一层 Catmull–Clark 细分。
- 水系法师的旧帽子另行替换为原创几何：圆椭圆帽檐、柔弯帽冠、蜂蜜皮带和铜扣。头盔比例在世界坐标中修改，再转回骨骼父子局部坐标，保留正确贴合。
- 先将原始色带图集采样为顶点色，再进行几何处理。这样圆角处不会误采相邻色带，避免头盔出现肤色斑或帽带出现颜色锯齿；原图集和原始 GLB 仍保留。
- 胸前加入圆形铜框与珐琅元素扣，实际绑定到 chest 骨骼。所有材质为可导出的 Principled BSDF；没有无法导出到 glTF 的 procedural texture。
- 玩家去掉旧的灰棕色乘色滤镜，使用清楚的原始角色配色和较柔和的表面粗糙度。敌人的视觉和数值保持原状。
- 营地使用同一 `ActorSystem` 和同一模型：双层鼠尾草石台、圆石、两盏真实暖灯，柔和主光和冷色边缘光。画布变窄时自动退后相机，保留完整帽子、鞋子和手持武器。

## 动画和预算

每职业保留 KayKit 的 76 个动作、41 个关节及左右 hand slot。几何修改在 Armature 之前应用，细分产生的新顶点继承插值后的蒙皮权重；武器仍绑定原 hand slot。

| 角色 | GLB 大小 | 总三角形（包含默认隐藏配件） | 动画 |
|---|---:|---:|---:|
| Knight | 4.88 MiB | 52,790 | 76 |
| Rogue_Hooded | 4.28 MiB | 38,450 | 76 |
| Mage | 4.39 MiB | 41,646 | 76 |

细分只用于单个玩家角色。敌群仍使用原有模型，避免 AOE 敌群场景叠加几何成本。GLB 不依赖 Draco 或外部贴图请求。

## 复现与验证

从项目根目录运行：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python blender/build_rounded_v6.py
node tools/check_models_v6.mjs
node tools/check_actors_v3.mjs
```

`blender/emberfall-v6-Knight.blend`、`emberfall-v6-Rogue_Hooded.blend`、`emberfall-v6-Mage.blend` 是独立可编辑源文件。`public/assets/models-v6/` 保存真正使用的模型、三张 Blender 渲染图、逐网格顶点变化与 GLB manifest。构建脚本使用独立 headless Blender，不改变当前用户在 Blender 中打开的场景。`Knight-before.png` 用相同摄影机和灯光保留了原始模型，供前后对照。

`check_models_v6.mjs` 的 100 项检查验证实际 GLB 的原动画名称、骨骼、有限且归一化的蒙皮权重、法线/UV/PBR材质、顶点和文件预算、攻击时手与武器同步、跑动/闪避/施法回到动作循环。既有 ActorSystem 的 22 项检查也通过。三份模型另经 gltf-transform inspect 检查。Blender 渲染已查看，未见粉色丢材质或头帽穿插；浏览器画面验收由整体 V0.6 验收文档记录。

## 来源与许可

三职业基础几何和动画来自 Kay Lousberg / KayKit Game Assets，CC0 1.0；本次圆角、比例、顶点色与胸扣为项目编辑。许可证副本位于 `public/assets/models-v6/LICENSE-KayKit.txt`。

原始 Knight/Rogue 的来源记录见 `public/assets/vendor/manifest-v2.json`；Mage 的固定来源、commit 和 SHA256 见 `public/assets/models-v3/Mage-source.json`。本次不替换也不删除这些原始资产和出处文件。
