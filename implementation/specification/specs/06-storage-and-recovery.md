# 06 持久化和恢复

安装目录只读程序；运行数据默认 %LOCALAPPDATA%\AxiomV1\library 与 %LOCALAPPDATA%\AxiomV1\workspaces\<workspace_id>。用户可改数据根但不嵌入发布包。项目源码默认 D:\Dev\axiom-colab 下的普通 project；目录迁移通过用户绑定更新路径。

## 权威存储

library/index.sqlite 与各 workspace/state.sqlite 分别存在。每 DB 打开 foreign_keys=ON、journal_mode=WAL、synchronous=FULL、busy_timeout=5000；通过 SQLite 事务操作。禁止 extension load；SQL 参数绑定；不得拼接模型给出的列名或查询。

迁移只实现 schema1；更高 user_version 拒绝打开，不做降级重写。host 是唯一写入者；UI/MCP/worker 不打开 DB。JSON payload 是版本化记录，SQLite 保留可索引 ID/FK/state/revision；不在两个文件各维护同一个 authoritative 状态。

具体建表约束见 contracts/storage.sql.txt。核心记录：workspace、goal、plan、project、revision_proposal、candidate、validation、approval、job、object_revision、graph_revision、run、run_node、audit、outbox；库：package、package_file、dependency、publication、revocation。工作区 binding 含 package_hash+grant。private_suite 的内容保存在 host 的私有对象区，公开 audit 只记不可逆 ID/hash 和结果汇总。

## 三类对象

compute 有逻辑 object_id 与递增 revision；put 必须带 expected_revision，0 只用于创建。payload 可变语义通过追加不可变版本实现，不覆盖旧字节。working 是用户明确采纳的 compute revision；模型提出请求，review 批准后才产生记录。artifact 封存选定已接受输出，含来源和科学状态，不可修改；纠错创建新 artifact 并指向 supersedes。

小标量 payload 可在 DB；大数据写 objects/sha256/<前2位>/<hash>。artifact_ref 只含 workspace_id/object_id/revision/content_hash/type/bytes/meta，不泄漏真实路径。所有读取先授权再解析，跨workspace默认拒绝。导入从明确用户选择的文件复制出新 artifact，保留 origin，不建立原工作区隐式依赖。

## 文件加数据库提交

先写同卷 staging→flush→计算并核对内容 hash→atomic rename 到对象区→DB 事务引用对象并记状态。DB 提交失败可留下 orphan 字节，但它不是有效 artifact；恢复时标记待整理，不自动删除。不可先写 succeeded 后写文件。数据根要求本地 NTFS；跨卷/网络共享不支持同等语义，返回 unsupported。

库发布采用 publication journal：prepared(源/证据/批准全绑定)→对象持久化→库 DB 提交 available→workspace 记录 published。一次性批准消费与 workspace outbox 同事务，库 publication_id 唯一；重复恢复只能完成同一内容，不能重新批准或覆盖包。中途失败显示 pending_recovery，不把跨库操作假设成单 SQLite 事务。

重启时 running/cancelling 作业标 interrupted；重新扫描已记录产物 hash，已完整提交结果可保留。未完成作业不自动重放；用户重新运行产生新 run_id。任何损坏/丢失对象标 corrupted 并禁止作为新输入，不用重新计算替换旧证据。

## 幂等和审计

写命令必须有 request_key，host 以 workspace+稳定authority_scope+operation+request_key 绑定规范化请求 hash。同键同内容返回原 response/job_id；同键异内容返回 conflict。authority_scope由host绑定到稳定grant或reviewer主体，重连不使用新socket ID改变它；key 永久保留于该 workspace 的审计范围，禁止 TTL 后自动重做副作用。读取不需 request_key。

审计为追加事件：UTC、actor_kind、session_id、workspace、goal、operation、target、before/after revision、request/result digest、public error、correlation_id；不存 token/私密答案。追加日志不是防同用户篡改的密码学保证；完整性通过对象 hash 与备份检查。

备份由 host 暂停该根的写入，使用 SQLite backup API 导出一致 DB，复制其引用对象与 manifest hash，最后封存。库和workspace分别备份；恢复到空目录，校验 schema/hash/引用，用户重新绑定 workspace 的库根。工作区备份不暗中包含其他workspace。备份无未知目录递归复制。

artifact record的manifest另外绑定metadata_hash；内容hash只标原始bytes，不足以独立代表科学元数据。读取ArtifactRef先加载该object_id/revision对应record，核对内容与metadata manifest。metadata改变产生新revision/artifact，即使payload字节相同。
