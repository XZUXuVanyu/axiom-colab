# 所有者决定记录（2026-09-09，DSH host session）

- 记录者：DSH coding agent（`deepseek-v4.1-flash-expires-on-0910`），host session `session-0b7bd31d-b86b-4874-9548-5f419ba03a2d`
- 依据：`AGENTS.md`「设计变更机制」——「状态只能 proposed；用户明确同意后记录 approved、批准原文来源与新规范版本。实现模型不能自己签字。」
- 状态：**用户已明确同意**（原文见下）。本文件记录批准原文与证据；**不是** DCR 文件，也未修改任何冻结规范。
- 注意：提示包 `FILE-MANIFEST.csv` 中没有 DCR 文件的条目（184 行中只有 F012 `deps/lock.json`、F013 `implementation/toolchain.json`、F015 `docs/LICENSE-DECISION.md` 与依赖/许可相关）。因此 DCR 落盘路径需在 T01 决定并可能需要一次清单变更提案；本文件暂存于提示包 `state/`，不属于生产仓库文件。

## 1. 用户批准原文（来源：本会话用户消息，2026-09-09）

```text
1. Approve switch version
2. Installed Qt at C:Qt, verify it
3. yes, this project will be opensource
4. keep D:\axiom-colab at local machine, the important thing is the consistency in remote repo
5. yes, keep them under D: disk
```

上一轮提供的选项原文（供追溯）：

```text
C4-a: install VS 2022 17.14 / MSVC v143 14.44 + CMake 4.1.3, or authorize a DCR adopting
      VS 2026 18.9.12120.119 / MSVC 14.51.36231 / CMake 4.3.1-msvc1
C4-b: install Qt 6.11.2 MSVC x64
C4-c: Qt + JUCE licence route (owner decision)
C1  : repo path text D:\axiom-colab vs spec D:\Dev\axiom-colab
bootstrap: may I pre-fetch the locked official bytes under D:\
```

## 2. 逐项裁定

| 项 | 裁定 | 生效范围与限制 |
| --- | --- | --- |
| C4-a 工具链版本 | **approved：改用本机工具链** VS Build Tools 2026 `18.9.12120.119`、MSVC `14.51.36231`（cl `19.51.36256`）、CMake `4.3.1-msvc1`；`specs/03` 基线 VS 2022 17.14 / MSVC v143 14.44 / CMake 4.1.3 被取代 | `specs/03` 原文「版本更换须记录批准」已满足；冻结规范文本本身未改，正式版本号变更须在 T01 以 DCR 形式落盘 |
| C4-b Qt | **approved 且已安装**：`C:\Qt\6.11.2\msvc2022_64`（见第 3 节验证） | Qt 二进制由 MSVC `19.44.35227` 构建，本机编译器为 `19.51.36256`；见第 4 节 ABI 风险，须在 DCR 中记录，不得静默更换 |
| C4-c 许可 | **approved：项目将开源** | 具体许可证文本（MIT/Apache-2.0/GPL-3.0 等）仍待所有者选定；Qt 走 LGPLv3/GPLv3，JUCE 8 为 AGPLv3 或商业许可，最终组合义务由所有者确认；模型不代签 |
| C1 仓库路径 | **approved：保留 `D:\axiom-colab`**；以远端仓库一致性为准 | 规范文本 `D:\Dev\axiom-colab` 未改；T00 已在该路径实施，远端 `origin` 与预期一致 |
| bootstrap 预取 | **approved：依赖放在 D: 盘** | 允许在沙箱外按锁定官方字节预取；预取后须逐字节校验 hash 并写入 F012 `deps/lock.json`，禁止编造 SHA |

## 3. Qt 安装验证（只读探针，2026-09-09）

```text
Test-Path 'C:\Qt'  -> True
C:\Qt 顶层：6.11.2/ dist/ Docs/ Examples/ installerResources/ Licenses/ Tools/ vcredist/
           components.xml InstallationLog.txt licenseInfo.txt MaintenanceTool.exe ...
C:\Qt\6.11.2  -> msvc2022_64, msvc2022_arm64

qmake -v        -> QMake version 3.1 / Using Qt version 6.11.2 in C:/Qt/6.11.2/msvc2022_64/lib
qtpaths6 --qt-version -> 6.11.2
Qt6Config.cmake -> QT_VERSION_MAJOR 6 / MINOR 11 / PATCH 2
Qt6CoreConfigVersionImpl.cmake -> set(PACKAGE_VERSION "6.11.2")
```

必需模块（`specs/03`：Core、Network、Gui、Widgets）：

| 模块 | CMake 配置 | 头文件 | 导入库 | DLL |
| --- | --- | --- | --- | --- |
| Qt6Core | ✅ `lib/cmake/Qt6Core/Qt6CoreConfig.cmake` | ✅ | ✅ `Qt6Core.lib` | ✅ |
| Qt6Network | ✅ | ✅ | ✅ | ✅ |
| Qt6Gui | ✅ | ✅ | ✅ | ✅ |
| Qt6Widgets | ✅ | ✅ | ✅ | ✅ |

DLL SHA-256：

```text
22c113a5644b875b2c85482723cd5d2e6a3a4029169778fcc78adde08ef3b6aa  Qt6Core.dll
75ff0896a618f4f5b602f391eb4917a55fd738b2e751d2cf18244a0de3619184  Qt6Network.dll
19265a4e76efc12ef5f5bcf59be6c6a5b9b59ec4c89660797738bd2da7f719cc  Qt6Gui.dll
e6d0b7e2e697de6ad985b97f9ed8b381c1c2172fcae87b6ab08455b3b7330f32  Qt6Widgets.dll
```

平台插件（发布必需）：`plugins/platforms/qwindows.dll`、`qwindowsd.dll`、`qminimal*.dll`、`qoffscreen*.dll`、`qdirect2d*.dll`。

禁用模块仍在安装中（`specs/03` 禁止使用）：`Qt6Sql` ✅ 存在、`Qt6Qml` ✅ 存在、`Qt6WebEngineWidgets` ❌ 不存在。
→ **必须在 CMake 层显式不链接**，仅凭「未安装」不能作为约束。

许可证据：`C:\Qt\licenseInfo.txt` = `License type [Opensource]`；`C:\Qt\Licenses\LICENSE` 含 GPLv3/LGPLv3 条文；
SBOM `sbom/qtbase-6.11.2.cdx.json` 出现的 license id：`LGPL-3.0-only`、`GPL-2.0-only`、`GPL-3.0-only`、`Qt-GPL-exception-1.0`、`BSD-3-Clause`。
构建配置：`QT_CONFIG += shared no-pkg-config debug_and_release openssl release debug`（**shared 动态链接**，对 LGPLv3 合规有利）。

## 4. 新发现的 ABI 风险（未解决，需 DCR 记录）

```text
C:\Qt\6.11.2\msvc2022_64\mkspecs\qconfig.pri
  QT_MSVC_MAJOR_VERSION = 19
  QT_MSVC_MINOR_VERSION = 44
  QT_MSVC_PATCH_VERSION = 35227
本机 cl.exe 版本：19.51.36256.0
```

Qt 6.11.2 官方包使用 MSVC `19.44`（v143）编译，本机只有 `19.51`（VS 2026 工具集）。
MSVC 的 C++ ABI 在同一主版本 19.x 内向前兼容，且 Qt 以 **shared** 方式提供，风险低于静态链接，
但 `specs/01` 明文「必须使用冻结的工具集并记录；**不静默更换 ABI**」。
处理方式：在 T01 的 DCR 与 F013 `implementation/toolchain.json` 中记录该差异，
并在 T02/T13 用真实 configure+链接+运行验证（而非假设）确认可用。

## 5. 本记录不声称的内容

- 未修改任何冻结规范、未改 `specs/03` 版本号、未签署任何 DCR（DCR 落盘路径尚未定义）。
- 未安装或升级任何工具（Qt 由用户在 `C:\Qt` 安装，本模型只做只读验证）。
- 未预取任何依赖字节，未生成 `deps/lock.json` 或 `implementation/toolchain.json`。
- 未选择具体开源许可证文本；JUCE 与 Qt 的最终组合义务仍待所有者确认。
