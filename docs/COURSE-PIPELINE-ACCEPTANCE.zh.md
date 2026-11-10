# 课程 PPT 流程验收记录

## 已验证

| 阶段 | 证据 | 状态 |
|---|---|---|
| 本地视频抽帧 | `src/course/slide_scan.py`；0.3 秒扫描清单 | 通过 |
| OCR | RapidOCR/ONNX Runtime；`manifest-ocr.json` | 通过 |
| 重复页与变化版本 | `src/course/slide-versions.js`；固定阈值回归测试 | 通过 |
| 章节识别 | `src/course/chapters.js`；章节输出目录 | 通过 |
| PDF/JPG/Markdown/JSON | `课程输出-Edge-0.3秒-固定参数` | 通过 |
| 输出审计 | `bin/course-audit.mjs` | 通过 |
| LMS 授权媒体捕获 | `src/course/cdp-media.js`、`bin/xjtu-capture.mjs` | 已验证 XJTU |
| 断点缓存 | `src/course/xjtu-cache.js`；Range 测试 | 通过 |
| 安全清理 | `src/course/cleanup.js`；清理回归测试 | 通过 |
| Responses API 适配 | `src/course/course-summary.js`；Responses 回归测试 | 通过模拟接口 |

## 当前输出

固定参数输出目录：

`E:\大三上\思源\课程输出-Edge-0.3秒-固定参数`

该输出包含总 PDF、分章 PDF、页面图片、`slides.json`、`course.json`、OCR 检查报告、转录状态和总结提示词。

## 尚未完成或需要外部条件

1. sub2api 的真实总结调用：代码已经支持 `responses`，但需要用户在本机设置新的 `COURSE_SUMMARY_KEY`。
2. ASR：用户选择暂时跳过，因此当前转录状态为 `not-configured`。
3. 真实 LMS 全课程批处理：单课和 XJTU 捕获链路已验证；批量运行仍依赖用户已登录的 Edge CDP 会话和 LMS 页面状态。

## 安全边界

- 不读取或保存账号密码；
- 不把 Cookie、Authorization 或签名 URL 写入输出；
- API Key 只从本机环境变量读取；
- 只有 PDF、页面图片、索引通过审计后才删除课次临时缓存；
- 失败任务保留视频用于断点重试。
