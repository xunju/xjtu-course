# 插件闭环实现与验收记录

当前仓库已具备可加载的 Manifest V3 扩展和本地处理服务，入口目录为 `extension/`。

## 已实现流程

1. 用户登录 `https://lms.xjtu.edu.cn/user/courses#/` 后打开扩展，插件扫描课程卡片并显示课程名、课程 ID；点击课程会在当前标签页打开对应课次页。
2. 在 `/course/<courseId>/lesson#/` 页面，插件读取当前页课次、分页状态和课次 ID；点击课次可直接跳转到 `learning-activity#/<lessonId>`。
3. 在单节视频页点击“生成当前节 PDF”，本地服务启动单节任务；在课程页点击“生成整门课程 PDF”，批处理器逐页重新扫描并确认分页状态后逐节处理。
4. 任务状态通过 `GET /v1/jobs/<id>` 轮询展示，支持 `POST /v1/jobs/<id>/cancel` 取消。失败课次保留缓存，只有审计成功后才按开关清理视频。
5. 快速、平衡、完整和自定义采样参数均传入 `course-ppt`，并写入 `batch-state.json`；采样键参与输出目录和缓存隔离策略。

## 安装与运行

```powershell
node bin/xjtu-extension-server.mjs --port 8765 --cdp-port 9333
```

使用带 `--remote-debugging-port=9333` 的 Edge/Chrome 登录 LMS。浏览器扩展管理页开启开发者模式，选择“加载已解压的扩展”，目录选择本仓库的 `extension`。插件只读取当前已登录页面，不保存密码、Cookie 或签名媒体 URL。

## 自动验收结果

- `node --check extension/*.js`：通过。
- `npm test`：530 项测试，522 项通过，8 项因可选宿主依赖缺失而跳过，0 项失败。
- 分页核心测试覆盖加载中、旧页内容、错误页码和无页码标记模板：通过。

真实 LMS 验收仍需在用户已登录、可访问课程回放且本机已启动 CDP 的浏览器中执行；仓库测试不伪造登录态或媒体授权。
