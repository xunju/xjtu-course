# 课程 PPT 流程

本流程先处理本地授权视频，再连接学校 LMS。默认保留每个 PPT 变化版本，只有产物审计通过后才允许删除临时视频。

## 固定默认参数

```ini
interval=0.3
threshold=0.03
versionVisual=0.999
versionText=0.98
slideVisual=0.999
slideText=0.99
```

这些参数可以通过命令行覆盖，但批处理默认使用上面的值。

## 本地视频

```powershell
node bin/course-ppt.mjs `
  "D:\课程缓存\lesson.mp4" `
  --out "D:\课程输出\lesson" `
  --ocr
```

输出包括总 PDF、分章 PDF、页面 JPG、`slides.json`、`course.json`、OCR 检查报告和章节总结提示词。短间隔扫描会自动顺序解码，避免长视频反复随机定位。

## ASR

程序优先读取视频内嵌字幕；没有字幕时，如果设置了以下变量，会按 OpenAI 兼容的 `/audio/transcriptions` 接口分段转录：

```powershell
$env:DSH_ASR_BASE_URL="http://127.0.0.1:8000/v1"
$env:DSH_ASR_MODEL="你的模型名"
$env:DSH_ASR_KEY="仅保存在本机环境变量"
$env:DSH_ASR_LANG="zh"
node bin/course-transcript.mjs "D:\课程缓存\lesson.mp4" --out "D:\课程输出\lesson\transcript.json"
```

没有配置 ASR 时，`transcript.json` 会明确标记 `not-configured`，不会伪造转录内容。

## AI 总结

总结接口使用 OpenAI 兼容的 `/chat/completions`：

```powershell
$env:COURSE_SUMMARY_ENDPOINT="https://你的服务/v1"
$env:COURSE_SUMMARY_MODEL="你的模型名"
$env:COURSE_SUMMARY_WIRE_API="responses" # 或 chat
$env:COURSE_SUMMARY_KEY="仅保存在本机环境变量"
node bin/course-summary.mjs `
  "D:\课程输出\lesson\course.json" `
  --transcript "D:\课程输出\lesson\transcript.json" `
  --wire-api responses
```

总结提示词只包含 PPT OCR、页面时间和课堂转录；模型被要求在证据不足时明确说明，不能补写课程内容。

## LMS 模式

用户先在独立 Edge 中完成登录，工具通过 CDP 捕获当前授权播放器请求，不读取密码、不保存 Cookie 或签名 URL。捕获的视频写入临时缓存，处理和 `course-audit` 成功后才删除。

```powershell
node bin/xjtu-course-batch.mjs `
  --port 9333 `
  --course 32342 `
  --out "D:\课程输出" `
  --cache "D:\课程缓存" `
  --track 2 `
  --delete-video
```
