# Windows 安装包

项目提供两种部署方式：源码运行和 Windows 安装包。安装包由 Inno Setup 构建，包含项目代码、插件、启动脚本和本地服务；正式发行时应将便携式 Node/Python/ffmpeg 放入 `runtime/` 后再编译。

## 本地构建

安装 Inno Setup 6 后执行：

```powershell
cd E:\大三上\思源\repo_inspect
.\scripts\build-portable.ps1
.\scripts\build-installer.ps1 -Iscc 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe' -Version '1.0.0'
```

生成文件：

```text
release\XJTU-Course-PDF-Setup-1.0.0.exe
```

## GitHub Release

推送 `v1.0.0` 标签后，GitHub Actions 会自动执行测试、安装 Inno Setup、构建并上传安装包。工作流文件为 `.github/workflows/release.yml`。

## 用户安装

用户双击安装包后，桌面会出现“XJTU 课程 PDF”。首次使用时在 Edge/Chrome 的扩展管理页加载 `extension` 目录；扩展商店版本发布后可改为直接安装商店扩展。
