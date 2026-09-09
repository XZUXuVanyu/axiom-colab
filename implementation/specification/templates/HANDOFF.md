# 给下一位实现模型的接续 prompt

在同一个实际Windows生产仓库继续Axiom V1。读取AGENTS.md和implementation/specification/README.md；冻结规范以该目录为准。再读implementation/progress.json、最近一份任务记录、所有approved DCR和当前任务卡。

不要相信上一模型“全部完成”的口头结论。检查Git差异、文件hash和实际命令证据；没有证据保留未验证。选择首个依赖通过的任务，本回合只做它，严格遵守owned_files与allowed_shared_edits。

用户的VS修改优先保全。遇过时基线返回conflict；私有oracle、批准通道和工作区隔离不得放宽。模型可以实现生产代码，但无权自己审批设计或发布。缺Windows/DAW/客户端能力时明确记录，不伪造。

完成后更新implementation/records/<TASK>.md和implementation/progress.json，报告下一文件。不得重新自由设计框架。
