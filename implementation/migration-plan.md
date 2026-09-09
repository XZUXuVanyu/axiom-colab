# T00 迁移计划：legacy 保全与新 main 方向

- 任务：T00（阶段 M0，前置无）
- 记录时间（UTC）：2026-09-09T13:10:14Z
- 实际仓库：`D:\axiom-colab`（规范文本写 `D:\Dev\axiom-colab`，见冲突 C1）
- 远端：`https://github.com/XZUXuVanyu/axiom-colab`（与 `00-START-HERE.md` 预期一致）

## 1. 保全前的真实状态

| 项目 | 值 |
| --- | --- |
| `git rev-parse HEAD` | `a79f4780ac7c25db53ad0c738e48674359fd742f` |
| 提交 | `chore(repo): prepare GitHub publication`，2026-09-05T23:52:28+08:00，`XZUXuVanyu <liangyux984@gmail.com>` |
| 分支 | 仅 `main`（+ `remotes/origin/main`、`remotes/origin/HEAD`） |
| 标签 | 无 |
| `git status` | `nothing to commit, working tree clean`（porcelain 0 行） |
| `git stash list` | 空 |
| `git worktree list` | `D:/axiom-colab  a79f478 [main]` |
| `git reflog` | `HEAD@{0}: clone: from https://github.com/XZUXuVanyu/axiom-colab` |
| 远端 refs（保全前） | `a79f4780…  refs/heads/main`（`ls-remote --heads --tags`，仅此一条，exit 0） |

结论：本机 `main` 与远端 `main` 同一 SHA，工作树干净，无未提交/未跟踪用户内容，无 stash。因此**没有需要暂存或保护的用户脏文件**；`specs/15` 要求的“先保全用户未提交内容”在本机为空集。

## 2. 已执行的保全（用户 2026-09-09 明确授权）

命令与结果（全部真实执行，工作目录 `D:\axiom-colab`）：

```text
git branch legacy a79f4780ac7c25db53ad0c738e48674359fd742f
  exit=0  -> refs/heads/legacy = a79f4780…

GIT_COMMITTER_NAME='Axiom V1 executor' GIT_COMMITTER_EMAIL='axiom-v1-executor@localhost' \
git tag -a legacy-v0-20260909-a79f478 \
  -m "Legacy Axiom CoLab main preserved before V1 rebuild (specs/15-delivery.md)" \
  a79f4780ac7c25db53ad0c738e48674359fd742f
  exit=0  -> refs/tags/legacy-v0-20260909-a79f478 = a80ddfb75a56255bf73597b94f8833e772d4534b
             peeled commit                              = a79f4780ac7c25db53ad0c738e48674359fd742f

git -c http.sslBackend=openssl push origin refs/heads/legacy:refs/heads/legacy
  exit=0  * [new branch] legacy -> legacy
git -c http.sslBackend=openssl push origin refs/tags/legacy-v0-20260909-a79f478
  exit=0  * [new tag] legacy-v0-20260909-a79f478 -> legacy-v0-20260909-a79f478
```

命名规则符合 `specs/15`：`legacy-v0-<UTCdate>-<shortsha>` = `legacy-v0-20260909-a79f478`。

未执行（也不允许执行）：force-push、`git reset` 远端、删除分支/标签、修改既有 `main`、`git clean`、`git stash`。

## 3. 保全后的远端验证（`git -c http.sslBackend=openssl ls-remote --heads --tags origin`，exit 0）

```text
a79f4780ac7c25db53ad0c738e48674359fd742f	refs/heads/legacy
a79f4780ac7c25db53ad0c738e48674359fd742f	refs/heads/main
a80ddfb75a56255bf73597b94f8833e772d4534b	refs/tags/legacy-v0-20260909-a79f478
a79f4780ac7c25db53ad0c738e48674359fd742f	refs/tags/legacy-v0-20260909-a79f478^{}
```

- annotated tag 的 peeled target 已检查，指向 `a79f4780…`，与 `legacy` 分支和原 `main` 一致。
- `refs/heads/main` 在推送前后均为 `a79f4780…`，未被改写。
- 远端原本不存在 `legacy` 或 `legacy-v0-*`，不存在“同名不同内容”的覆盖冲突。

## 4. 新 main 的迁移计划（尚未执行，留待后续任务）

1. **准备分支**：本次已在 `a79f4780…` 之上创建 `v1-rebuild-prep`（普通分支，不改 `main`），用于放规范副本与 `implementation/` 记录入口。
2. **只移除 tracked 旧文件**：新版内容提交时只删除 `git ls-files` 列出的 legacy 文件；不清理其他目录、不删除未跟踪内容、不动 `D:\Dev` 或学习仓库。
3. **旧字节可访问性**：旧内容字节在 `refs/heads/legacy` 与 `refs/tags/legacy-v0-20260909-a79f478`（本地与远端）中始终可取，删除前不依赖工作树副本。
4. **普通提交、保留祖先**：新版 `main` 必须是以 `a79f4780…` 为祖先的普通提交；禁止 orphan 分支、禁止 `--force`、禁止 `git reset` 远端。
5. **分支检查后 fast-forward**：约定分支检查通过后，才允许将 `main` fast-forward 到新版提交。
6. **远端并发保护**：集成前重新 `ls-remote refs/heads/main`；若远端 `main` 已前移（非 `a79f4780…`），立即停止集成并重新核对，不覆盖他人进度。
7. **不自动迁移旧资产**：旧 DB、工具库、学习课件不迁入新 schema；旧工具源码若需复用必须显式导出并重新验证，新项目不继承任何旧“通过/批准”状态。
8. **许可与发布门禁**：许可路线未由所有者确认前，可完成工程与本地测试，但对外 release 标 blocked。

## 5. 未决项（需用户裁定，未自行解决）

| ID | 事项 | 影响 |
| --- | --- | --- |
| C1 | 仓库真实路径 `D:\axiom-colab` ≠ 规范 `D:\Dev\axiom-colab` | 规范文本未改；已按用户指令在本路径实施 |
| C2 | 本地规则要求的 `D:\Dev\tools\*` 参考工程不可访问 | 前置读取 blocked |
| C3 | 本地规则要求每提交更新 `for-agent/HANDOFF.md`，与包规则 16 冲突 | 进度记录按包规则 16；`for-agent/` 未修改 |
| C4 | 工具链偏离 specs/03 基线（VS 2026 / MSVC 14.51 / CMake 4.3.1 / 无 Qt） | T01 前需安装基线或提交 DCR |

## 6. 本记录不声称的内容

- 未编译任何 C++、未配置 CMake、未运行 ctest：G00 中与构建/测试相关的部分为 `not_run`。
- 未迁移远端 `main`，未删除任何 legacy 跟踪文件，未创建新版内容提交。
- 提示包本身与 `state/progress.json` 不携带任何验收结论；本文件不继承旧项目“已通过”状态。
