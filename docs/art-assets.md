# 《余烬地牢：钟下墓城》美术与声音素材

本页所列主视觉与声音为本项目生成；角色、场景与贴图的第三方来源见 [asset-research-v2.md](asset-research-v2.md)。没有使用《暗黑破坏神》的角色、模型、配乐、标识或场景资产。

## 视觉

- 项目路径：`public/assets/art/key-art.png`
- 用途：启动画面、关卡载入主视觉、项目概念参考。它是平面概念图；实际游戏模型另见模型资产。
- 尺寸：1672 × 941，约 16:9，PNG。
- 来源：Codex 内置 `image_gen`，生成日期 2026-09-30。已目视检查：巨钟、地下哥特教堂、骑士与暖色火光明确，无文字、水印和品牌标识。
- 仓库保留文件：[key-art.png](../public/assets/art/key-art.png)。

生成提示词：

> Use case: stylized-concept. Asset type: original dark fantasy roguelite game key art and loading screen, widescreen 16:9 landscape. Primary request: a tiny ember knight standing on an ancient cracked stone causeway before a colossal gothic underground bell cathedral. Scene: monumental vaulted underground cathedral carved into dark rock, one gigantic old bronze bell suspended over the far apse, broken buttresses fading into cold volumetric fog, scattered warm ember candles along the causeway. Subject: a solitary small armored knight seen from behind carrying a humble sword, muted ember-orange cloak, no visible facial features. Style: premium cinematic painterly low-poly 3D concept art, readable graphic silhouettes, exquisite faceted stone, restrained fine grain, solemn and haunting. Composition: epic architectural symmetry with subtle asymmetry from ruined masonry, knight small in lower center-right, deep cinematic perspective; dark relatively uncluttered lower-left for interface overlay; enormous bell high in upper center. Lighting: verdigris cold teal fog and dark ink shadows contrasted by sparse warm amber candlelight and glowing ember particles. Palette: charcoal #10191c, teal #304f50, oxidized bronze #6b7461, ember #e7a354, parchment #d4c9ae. Constraints: no text, no letters, no logos, no watermark, no existing intellectual-property characters; fully original world design. Render as a finished beautiful illustration, not a UI mockup, no border. Output 16:9.

建议在 UI 使用以下颜色；敌人攻击预警另外使用醒目的朱红，避免和友方余烬特效混淆。

| 用途 | 色值 |
| --- | --- |
| 深色底板 | `#10191c` |
| 冷雾、地牢远景 | `#304f50` |
| 铜绿与旧青铜 | `#6b7461` |
| 余烬、交互强调 | `#e7a354` |
| 正文与刻文 | `#d4c9ae` |
| 敌方危险预警 | `#df6254` |

## 声音

所有音频由 `tools/generate_audio.py` 以 Python 标准库从正弦波、固定随机种子噪声和包络合成，没有第三方采样、外部录音或已有音乐。WAV 均为 24 kHz、16 位 PCM、双声道。环境音另提供 Vorbis 压缩版，便于加载。

| 文件，相对 `public/assets/audio/` | 时长 | 内容 | 峰值 |
| --- | ---: | --- | ---: |
| `ambience.wav` / `ambience.ogg` | 48.00 秒 | 低频持续音、四次远钟、空气感、轻脉冲，可循环 | −12.40 dBFS（WAV） |
| `hit.wav` | 0.27 秒 | 护甲/石质短促命中 | −7.96 dBFS |
| `slash.wav` | 0.29 秒 | 挥剑气流与微弱金属高频 | −9.90 dBFS |
| `dash.wav` | 0.46 秒 | 低沉短冲刺气流 | −9.90 dBFS |
| `heal.wav` | 1.55 秒 | 上行四音玻璃钟与低频暖光 | −9.37 dBFS |
| `pickup.wav` | 0.68 秒 | 两音明亮拾取反馈 | −11.06 dBFS |
| `boss.wav` | 2.60 秒 | 低钟、轻滚动低频与远回声 | −7.96 dBFS |

环境音的持续振荡器均为循环周期的整数倍频率；钟尾按周期回卷，脉冲在周期内衰减为零。建议使用 `ambience.ogg` 并设置循环。各短音效具有淡入淡出，文件首尾为零，避免直接截断的爆音。

建议首次接入音量：环境音 0.28，短音效 0.40；使用用户的首次点击解锁浏览器音频，提供静音入口。不要让每一个伤害粒子都触发音效，同种命中反馈可间隔 60–90 ms。

再生成：

```sh
python3 tools/generate_audio.py
ffmpeg -y -i public/assets/audio/ambience.wav -c:a libvorbis -q:a 4 public/assets/audio/ambience.ogg
```

验收：检查了 WAV 帧数、双声道/位深/采样率、PCM 峰值无削波、短音效零起止、环境音 OGG 可解码且精确 48 秒。`manifest.json` 保存各 WAV 的时长、峰值、RMS 与文件大小。本次未做人耳听审，实际混音以游戏试玩为准。
