# Edge/Chrome 插件方案

`extension/` 是 Manifest V3 插件前端。它只读取用户当前已经登录的 LMS 页面，不保存密码、Cookie 或签名 URL。视频下载、抽帧、OCR、PDF 和课程总结仍由本地 Node 服务完成。

## 页面入口

- `/user/courses#/`：扫描课程卡片，用户选择课程后提交整门课程任务；
- `/course/<id>/lesson#/`：扫描当前分页课次，整门任务携带 `allPages=true`，由本地服务确认并遍历分页；
- `/course/<id>/learning-activity#/<lessonId>`：提交单节任务。

Content script 会返回 `courseId`、`lessonId`、课程/课次列表、当前页码、可见页码和 `hasNext`。分页不能只依赖 DOM 文本；本地服务必须在每次切页后重新扫描，并确认课次 ID 集合发生变化，再进入下载。

## 本地服务协议

插件默认访问 `http://127.0.0.1:8765`：

- `GET /health`：返回服务版本和可用状态；
- `POST /v1/jobs`：接收 `{mode,page,allPages,sampling,deleteVideo}`，返回 `{jobId,status}`；
- `GET /v1/jobs/<id>`：返回进度、当前课次和失败原因；
- `POST /v1/jobs/<id>/cancel`：请求停止任务。

服务应复用 `xjtu-course-batch.mjs` 的捕获、缓存、审计和清理逻辑。`sampling` 字段应传给 `course-ppt.mjs`，包括 `interval`、`threshold`、`versionVisual`、`versionText`、`slideVisual`、`slideText`。

## 加载测试插件

Edge/Chrome 打开扩展管理页，开启“开发者模式”，选择“加载已解压的扩展”，目录选择仓库的 `extension` 文件夹。安装前应先启动本地服务；当前仓库的插件前端会在服务不可用时明确显示错误。
