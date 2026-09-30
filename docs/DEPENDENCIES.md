# 运行依赖与本地边界

- Three.js 0.186.1：WebGL 3D、GLB 加载与后期；MIT 许可正文随构建保存在 `THREE-LICENSE.txt`。参考 [官方文档](https://threejs.org/docs/)。
- Vite 8.3.1：仅用于开发与构建，版本锁定在 package-lock.json。
- Blender 5.2.1 LTS：本机后台生成可编辑模型与 GLB 导出。运行游戏无需 Blender。
- Python 3：双击启动器所使用的标准库本地静态服务器，无第三方 Python 包。

构建版本只从本机读取模型、主视觉、音效及 JS；服务器仅监听 127.0.0.1。游戏不需要账号，不请求远程 API，不包含遥测。战绩及画质/音量设置只保存于当前浏览器 localStorage；当前战斗不会续存。

开发资源与调试入口仅在源码目录下。正式 dist 不包含 tools/capture.html；仅在地址明确携带 `?qa=1` 时提供测试用状态对象，正常入口不公开对象。
