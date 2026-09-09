# Axiom V1

Axiom V1 是由本提示包建立的全 C++20 Windows 11 x64 工程：一个用户级工具库 + 多个独立工作区，
用不可变候选、独立验证和用户批准把“模型提出的东西”与“可信任的东西”分开，最终交付一个可独立
运行的物理声音产品（离线 Tool、JUCE Standalone 与通用 VST3）。

本仓库当前处于 **M0 / T00 已执行、业务代码尚未开始** 的状态。下面“实际完成状态”一节只陈述
有证据的事实；未运行的项目一律为 `not_run`，不继承 legacy 项目的任何“已通过”结论。

## 规范入口（只读副本）

| 内容 | 位置 |
| --- | --- |
| 产品范围与用户决定 | `implementation/specification/specs/01-scope.md` |
| 固定架构与依赖方向 | `implementation/specification/specs/02-architecture.md` |
| 构建基线与依赖锁 | `implementation/specification/specs/03-build-and-dependencies.md` |
| 数据契约与科学语义 | `implementation/specification/specs/04-contracts-and-science.md` |
| …至交付与门禁 | `implementation/specification/specs/15-delivery.md` |
| 类型/接口/命令契约 | `implementation/specification/contracts/` |
| 手写文件白名单 | `implementation/specification/FILE-MANIFEST.csv` |
| 任务卡与顺序 | `implementation/specification/tasks/` |
| 验收矩阵与证据规则 | `implementation/specification/acceptance/` |
| 实施约束 | `AGENTS.md`（本仓库根） |
| 进度与证据 | `implementation/progress.json`、`implementation/records/` |

规范优先级：用户后续明确指令 > 经用户批准的落盘设计变更 > `AGENTS.md` > specs 与 contracts >
验收矩阵 > 文件清单 > 任务卡 > 导读。发现同级矛盾须提交设计变更，不得任选有利解释。

## 构建

V1 的正式入口（由 T01 建立，当前**尚不存在**）：

```powershell
cmake --preset win-debug
cmake --build --preset win-debug
ctest --preset win-debug --output-on-failure
```

- 生成器 Ninja，工具链由 x64 Native Tools 环境固定；`build/<preset>` 与 `dist/<preset>` 完全分离。
- 依赖走固定 source directory + `add_subdirectory` 或带 `URL_HASH` 的离线 FetchContent 缓存；
  正式构建无网络。本机尚无 `CMakePresets.json`，也没有 `deps/lock.json`。
- Visual Studio 打开根目录 `CMakeLists.txt`，选择 `win-debug` 与独立 executable target。
- 本机 `cmake`/`ctest`/`ninja` 不在 `PATH`，只有 VS Build Tools 2026 捆绑副本（版本与 SHA-256 见
  `implementation/inventory.json`）。

## 实际完成状态

| 项目 | 状态 | 证据 |
| --- | --- | --- |
| 提示包规范/契约/清单/任务卡/验收材料复制到 `implementation/specification/` | written | `implementation/records/T00.md` |
| `AGENTS.md`（生产约束 + 保留本地规则 + 冲突记录） | written | 本仓库 `AGENTS.md` |
| `implementation/progress.json`（真实状态，初始 not_started） | written | `implementation/progress.json` |
| `implementation/inventory.json`（路径/远端/分支/工具链） | written | `implementation/inventory.json` |
| `implementation/migration-plan.md`（legacy SHA 与迁移计划） | written | `implementation/migration-plan.md` |
| legacy `main`（`a79f4780…`）保全为 `legacy` 分支与 `legacy-v0-20260909-a79f478` 标签，本地+远端 | tested | `git ls-remote --heads --tags origin`（含 peeled target） |
| CMake configure/build | not_run | 无 `CMakePresets.json`；T01 交付 |
| ctest 任一标签 | not_run | 同上 |
| 12 个业务组件、MCP、画布、DSP、VST3 | not_implemented | 后续 T01–T18 |

未决冲突（未自行解决）：仓库实际路径为 `D:\axiom-colab` 而非规范文本的 `D:\Dev\axiom-colab`；
本地规则要求的 `D:\Dev\tools\*` 参考工程本机不可访问；本机工具链偏离 `specs/03` 基线且未安装 Qt。
详见 `implementation/records/T00.md` 与 `AGENTS.md` 的冲突表。

## 许可

许可路线尚未由所有者确认。可完成工程与本地测试，但对外分发 release 标 blocked；不得替用户购买
许可，也不得擅自把整个仓库改成某个开源许可。依赖许可记录不是法律审核通过声明。
