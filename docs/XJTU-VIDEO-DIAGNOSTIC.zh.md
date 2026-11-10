# 西安交通大学 LMS 视频获取诊断

## 已确认

- 课程入口：`https://lms.xjtu.edu.cn/course/...`
- 未登录访问会跳转到 `identity1.xjtu.edu.cn` 统一身份认证。
- 课程页面打开的是独立播放器或新标签页。
- 浏览器 Network 中出现的
  `https://rms-v5.xjtu.edu.cn/api/v1/capture/track/activity-read-to-lms`
  是播放行为埋点（`POST`），不是视频媒体地址。

## 当前结论

不能把 `activity-read-to-lms` 当作视频下载接口，也不能根据它推断出视频文件地址。下一步必须在独立播放器页面中检查真正的媒体传输：

最新浏览器证据显示，独立播放器实际请求了两个 MP4 资源，文件名形如：

```text
0-<课程编号>-<开始时间>-<结束时间>.mp4?... 
2-<课程编号>-<开始时间>-<结束时间>.mp4?... 
```

这说明第一版适配器可以优先按“登录态 MP4 直链”实现，不必先处理 M3U8。两个前缀很可能是 PPT 画面和摄像头/教师画面两路，需要通过分辨率、画面预览或响应大小确认哪一路包含 PPT。

1. 在播放器标签页打开开发者工具，勾选 **Preserve log**。
2. 选择 **Media** 类型；如果为空，再选择 **Fetch/XHR**。
3. 播放、暂停、拖动进度各一次，观察新增请求。
4. 重点寻找 `.m3u8`、`.mpd`、`.mp4`、`init段`、`segment`、`chunk`、`media`、`blob` 或 `Range` 请求。
5. 若请求显示在 iframe 中，切换到该 iframe 对应的页面上下文后重复检查。

不要提交 Cookie、Authorization、完整签名 URL 或账号信息。只需记录：请求类型、请求域名、路径后缀和是否返回二进制/分段数据。

## 适配优先级

1. 可访问的 MP4：直接下载并缓存。
2. M3U8/HLS：保存播放清单，使用带登录头的 ffmpeg 分段下载。
3. MPD/DASH：保存 manifest，使用带登录头的 ffmpeg/yt-dlp 下载。
4. 只有 `blob:` 或 MSE：通过 CDP 监听播放器网络请求，找到其实际分段请求；不把 `blob:` URL 当作可下载源。
5. 存在 DRM：不绕过 DRM，改用学校提供的下载功能或经授权的屏幕采集方案。

## 设计约束

- 登录态只从用户已登录的浏览器会话获取；不保存账号密码。
- Cookie、Authorization 和签名 URL 不写入日志、manifest 或导出的课程索引。
- 视频源获取成功后优先下载到本地或按时间段缓存，再做 PPT 抽帧；实时截图只作为兼容性兜底。

## 本地示例处理命令

已下载的授权 MP4 可以先用课程 PPT 命令验证抽帧和导出：

```bash
node bin/course-ppt.mjs "D:/课程/2-21301-202609141430-202609141530.mp4" \
  --out "D:/课程输出/第一节" --interval 5 --threshold 0.03 --chapter "待识别"
```

输出包含 `scan/manifest.json`、`slides.json`、每章图片、每章 `slides.pdf`、根目录拼接后的 `course.pdf`、`index.md` 和 `course.json`。`--chapter` 目前用于测试；接入 OCR 后会根据标题和讲课转录自动分章。

## 从已登录浏览器捕获 MP4

Windows 可以先运行仓库内的启动脚本，它会寻找 Edge/Chrome 并使用独立临时配置启动：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-xjtu-cdp.ps1
```

然后在新窗口中完成统一认证并打开独立播放器，再运行：

```bash
node bin/xjtu-capture.mjs --port 9333 --seconds 30 --track 2 --out D:/课程缓存
```

命令运行期间在播放器中播放或拖动一次。`--track 2` 是当前示例中确认的 PPT 轨道；命令只把脱敏路径和缓存结果打印到终端。调试端口必须由用户主动开启，工具不会读取密码，也不会绕过统一认证或 DRM。

捕获并缓存成功后，也可以自动处理 PPT 轨道：

```powershell
node bin/xjtu-capture.mjs `
  --port 9333 --seconds 30 --track 2 `
  --out D:/课程缓存 --ppt-out D:/课程输出
```

`--ppt-out` 会对每个缓存 MP4 运行本地 PPT 流程，并生成 `preview.jpg`、`review-report.md`、`transcript.json` 以及每章 PDF/JPG/Markdown/JSON。默认仍然只缓存，不自动处理。

处理完成后可运行产物审计：

```powershell
node bin/course-audit.mjs D:/课程输出
```

审计会检查章节文件、页面图片、PDF、索引、总结、预览和转录状态，并确认导出文件没有签名查询参数。

## 生成课程总结

导出课程目录后，可以生成证据提示词：

```bash
node bin/course-summary.mjs D:/课程输出/course.json \
  --transcript D:/课程输出/transcript.json
```

如果配置了 OpenAI 兼容的总结接口，则直接生成总结：

```bash
$env:COURSE_SUMMARY_ENDPOINT="http://127.0.0.1:8000/v1"
$env:COURSE_SUMMARY_MODEL="your-model"
$env:COURSE_SUMMARY_KEY="your-key"
node bin/course-summary.mjs D:/课程输出/course.json
```

提示词会同时提供 PPT 版本、首次出现时间、重复出现时间、OCR 和老师转录；模型被要求在证据不足时明确标记，不自行补写。

## 自定义 API 的接口要求

总结和语音转录可以使用不同服务：

| 用途 | 环境变量 | 必需接口 |
|---|---|---|
| 语音转录 | `DSH_ASR_BASE_URL`、`DSH_ASR_KEY`、`DSH_ASR_MODEL` | `POST /audio/transcriptions`，multipart `file`，返回 `verbose_json` 或带 `segments` 的 JSON |
| 课程总结 | `COURSE_SUMMARY_ENDPOINT`、`COURSE_SUMMARY_KEY`、`COURSE_SUMMARY_MODEL` | `POST /chat/completions`，OpenAI 兼容消息格式 |

例如用 OpenAI 兼容的转录服务 + DeepSeek 总结：

```powershell
$env:DSH_ASR_BASE_URL="http://127.0.0.1:8000/v1"
$env:DSH_ASR_MODEL="SenseVoiceSmall"
$env:DSH_ASR_KEY=""

$env:COURSE_SUMMARY_ENDPOINT="https://api.deepseek.com/v1"
$env:COURSE_SUMMARY_MODEL="deepseek-chat"
$env:COURSE_SUMMARY_KEY="你的DeepSeek密钥"
```

如果 `sub2api` 同时转发 `/audio/transcriptions` 和 `/chat/completions`，可以把两个变量都指向它；如果它只转发聊天接口，就只能用于总结，ASR 仍需另一个服务。密钥只从环境变量读取，不写入课程 JSON、日志或 Markdown。
