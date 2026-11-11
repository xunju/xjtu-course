# XJTU 课程 PDF 导出器

这是一个面向西安交通大学 LMS 的课程 PDF 导出工具，包含 Edge/Chrome 插件、本地 Node.js 服务、视频捕获、分页扫描、抽帧、OCR、PDF 导出和 Windows 安装包流程。

## 最快开始

### 1. 准备环境

Windows 需要 Node.js 20+、Python 3、ffmpeg/ffprobe、Edge 或 Chrome。

~~~powershell
node -v
python --version
ffmpeg -version
ffprobe -version
~~~

### 2. 下载项目

~~~powershell
git clone https://github.com/xunju/xjtu-course.git
cd xjtu-course
npm install
~~~

### 3. 启动服务和浏览器

~~~powershell
powershell -ExecutionPolicy Bypass -File .\\scripts\\start-xjtu.ps1
~~~

脚本会启动带 CDP 端口 9333 的 Edge/Chrome、本地服务 8765 和 LMS 页面。手动启动方式：

~~~powershell
powershell -ExecutionPolicy Bypass -File .\\scripts\\start-xjtu-cdp.ps1
node bin/xjtu-extension-server.mjs --port 8765 --cdp-port 9333
~~~

### 4. 加载插件

打开 `edge://extensions` 或 `chrome://extensions`，开启开发者模式，点击“加载已解压的扩展”，选择项目中的 `extension` 目录。

## 使用课程 PDF 功能

### 整门课程

登录 `https://lms.xjtu.edu.cn/user/courses#/`，点击插件选择课程，进入课程的“录播教材”页面（地址通常为 `/course/<课程ID>/lesson#/`），必须在这个页面点击插件并选择“生成整门课程 PDF”。插件会自动读取分页并逐节处理。进入具体录播视频播放页后，只使用“生成当前节 PDF”。

### 单节课程

直接打开 `https://lms.xjtu.edu.cn/course/32342/learning-activity#/1291472`，点击插件并选择“生成当前节 PDF”。

## 采样模式

- 快速：1 秒间隔，速度优先；
- 平衡：0.3 秒间隔，推荐；
- 完整：0.1 秒间隔，完整性优先；
- 自定义：手动设置间隔、变化阈值、视觉阈值和 OCR 阈值。

任务窗口会显示进度，也支持取消任务。

## 输出位置

默认输出：`%LOCALAPPDATA%\\XJTU-Course-PDF\\output`。

常见结果：`course-all.pdf`、`course.json`、`slides.json`、`transcript.json`、`summary.md`、`batch-state.json`。

## 构建 Windows 安装包

安装 Inno Setup 6 后执行：

~~~powershell
.\\scripts\\build-portable.ps1
.\\scripts\\build-installer.ps1 -Iscc "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe" -Version "1.0.0"
~~~

生成 `release\\XJTU-Course-PDF-Setup-1.0.0.exe`。推送 `v1.0.0` 标签后，GitHub Actions 会自动构建安装包。

## 常见问题

- 插件提示服务不可用：确认 `http://127.0.0.1:8765/health` 可以访问；
- 找不到 CDP 页面：确认浏览器由 `start-xjtu-cdp.ps1` 启动且端口为 9333；
- 没扫描到课程：刷新 LMS，等待课程列表加载完成后重新扫描；
- PDF 不完整：切换到“完整”采样或使用 0.1 秒间隔。

## 隐私和授权

项目不保存 LMS 密码、不上传课程视频、不把 Cookie 写入日志，只读取用户已经登录且有权访问的页面。请遵守学校规定和目标网站条款。

## 详细文档

- [Windows 安装包说明](docs/INSTALLER.zh.md)
- [插件闭环实现](docs/EXTENSION-IMPLEMENTATION.zh.md)
- [插件开发计划](docs/EXTENSION-PLAN.zh.md)
- [课程处理流程](docs/COURSE-PIPELINE.zh.md)
- [课程验收标准](docs/COURSE-PIPELINE-ACCEPTANCE.zh.md)

