# 07 源码协作和候选

用户可绑定普通本地 Git/CMake 项目；源码在 VS 保存/调试，无专有编辑器格式。host 项目绑定记录 project_id、repo identity、relative approved roots、design hash、允许文件/区域、toolchain lock。绑定现有项目或扩大文件范围必须来自 review。

## 模式 A 生成源码

用户批准 goal/plan→host 建修订 worktree→导出 context→用户在其外部 agent 中打开该 worktree→agent 按批准文件实现→host 扫描修订→UI 展示 diff→用户应用到开发工作树→VS 打开相同 CMake target。V1 不自动调用模型 API，不自动发起第三方消息。

## 模式 B 补全框架

用户在 VS 保存文件→host 捕获确切字节基线→冻结允许文件与可选补全区域→context 包提供基线与公开接口→agent 修改独立 worktree→提案扫描检查→应用前重新检查目标 hash→用户审核后应用。即使改动发生在另一个区域，只要文件基线变化，V1 保守返回 conflict，不做自动三方合并。用户可重新生成提案。

区域限制用明确 marker 对或整文件白名单；marker 文本和外部字节 hash 绑定基线。没有 marker 的行号不能充当稳定区域。改变 public API、include依赖、构建参数不因落在允许区域而免于设计变更。

## 快照和上下文

snapshot 捕获用户选择的tracked/untracked源码、descriptor、依赖锁、构建配置；忽略build、.git、运行DB、环境密钥、private oracle。Git dirty 允许但需保存每个文件原字节，不能用 HEAD 冒充。源路径列表排序并记录每文件 hash、size，snapshot hash 绑定清单；源变化生成新 snapshot。

context 只提供目标、批准计划/设计hash、目录/公开头文件、所需实现、文件/区域白名单、固定依赖、公开测试、上一轮公开失败与未解问题。单包上限4MiB、每次文件片段最多64KiB；超出返回目录索引和读取分页，不截断后当作完整。记录 omitted files，外部 README/注释被标数据，不能变成新权限。

patch 是对基线文件的改后完整内容+before_hash+after_hash+操作类型(add/modify/delete)。传输内容超过帧上限走workspace内分块staging，由host验证整文件hash。V1 UI 展示diff；不接收 shell patch 命令。文件删除需在用户审阅清单显式展示。

## 应用原子性和崩溃

每project只允许一个 apply。应用前检查全部目标和schema限制；冲突时一个文件也不改。写入临时文件与原文件备份，写 apply journal，再逐文件 atomic replace；整个多文件动作不能声称单次NTFS原子。中断后启动恢复：依据 journal/当前hash完成同一批准内容或恢复备份；不覆盖第三方新修改，必要时需要用户处理冲突。不能失败一半却标 applied。

每个revision状态：draft→submitted→approved/rejected→applying→applied；检测基线不符为conflict；应用中断为interrupted。author不能批准自己。最终candidate从用户审定的工作树或审定修订捕获，不从不明当前目录随意构建。

VS操作只是打开固定本机配置的 executable + 路径参数；不接受模型构造devenv命令字符串。断点命中、变量观测、用户解释作为development observation，不能替代候选隔离验证。
