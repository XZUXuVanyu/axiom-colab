# 02 固定架构与依赖方向

| 组件 | 生产 target | 职责 | 禁止依赖 |
| --- | --- | --- | --- |
| C01 Domain Contracts | axiom_domain | ID、错误、状态、schema、散列、核心接口 | Qt、JUCE、SQLite |
| C02 Host Session | axiom_hostlib、axiom-host | 唯一权威写入、身份、命令路由、作业协调 | JUCE、Widgets |
| C03 MCP Gateway | axiom_mcp、axiom-mcp | 标准 stdio 协议和动态能力目录 | SQLite、工具业务 |
| C04 Review App | axiom_review、axiom-review | 审核、项目、库、画布 UI | 直接数据库和 worker 调用 |
| C05 Project Collaboration | axiom_project | 快照、context、worktree、冲突与应用 | Widgets、MCP |
| C06 Tool SDK | axiom_sdk、axiom-worker | 工具描述、工厂、依赖装配、调用边界 | host 身份、权威数据库 |
| C07 Runner | axiom_runner | Windows 进程隔离、限额、取消、捕获 | Widgets、领域算法 |
| C08 Candidate Validation | axiom_validation | 不可变候选、可信 oracle、证据 | GUI、模型作为 validator |
| C09 Tool Library | axiom_library | 发布、版本绑定、撤销、源/静态库/worker 包 | 项目临时绝对路径 |
| C10 Workspace Store | axiom_store | SQLite RAII、对象、revision、审计、恢复 | Widgets、JUCE |
| C11 Workflow | axiom_workflow | 目标/计划、图、单层组合、运行快照 | 实时音频线程 |
| C12 Delivery Diagnostics | axiom-diagnostics、打包目标 | 诊断、备份、恢复、分发 | 第二份业务状态机 |

axiom_ipc 是 C02/C03/C04 共用的传输支持 target，不是新增业务组件。physical_string_dsp、physical_string_tools、AxiomPluckedString 是使用 Axiom 工作流产生的产品 targets，不是宿主核心。

依赖清单：domain→标准库/nlohmann_json/私有BCrypt实现；store→domain/SQLite；sdk→domain；runner→domain/QtCore/Windows API；project→domain/store/runner；validation→domain/store/runner；library→domain/store；workflow→domain/store/sdk 仅类型；hostlib→全部业务服务并作为 composition root；ipc→domain/QtCore/QtNetwork 本地 socket；mcp→domain/ipc；review→domain/ipc/QtWidgets；dsp→标准库；physical_string_tools→dsp/sdk；音频壳→dsp/JUCE。

workflow 通过 domain 中 IToolInvoker 调用 host 提供的执行器，避免 workflow→host 反向依赖；validation 通过 IProcessRunner 调用 runner。host 负责连接 library→runner 的已绑定版本解析。HostService采用稳定PImpl头文件，后续任务仅在cpp装配新服务，不改公开header。库的发布证据校验由 host 从自己的 repository 加载，不信任客户端传入 passed 字段。

## 进程与生命周期

一个用户会话一个 axiom-host，唯一写入库索引与 workspace DB。每个 MCP 客户端一个 axiom-mcp，连接时固定 workspace 和 model 身份。一个 axiom-review；用户重复打开只激活已有窗口。每个构建/调用使用受限子进程；没有常驻任意用户 DLL loader。音频 Standalone 与 DAW 完全独立。

host 用 QCoreApplication 的事件循环处理连接；业务写入和状态迁移在同一串行执行通道。长构建/worker 由 runner 非阻塞观察；哈希/复制可在有界工作线程执行，完成后回到写入通道提交。Qt Widgets 仅在 UI 主线程访问。UI 不等待长任务同步返回。

Windows 平台细节只放 runner、ipc 和 hash 的平台实现。domain 的接口中没有 QObject、HANDLE、SQLite 指针、JUCE Buffer。公开数据使用值对象、std::span 和明确所有权；异步参数不可持有调用者暂存引用。

## 生命周期和共享内存

工具依赖在单个 worker 生命周期内装配。同一工具的两个调用默认没有共享可变内存；需要共享数据必须使用 workspace object_id+revision 或 immutable artifact。高频 DSP 使用实例自身的预分配状态，不经过通用对象库。未来共享内存后端必须保留相同隔离/生命周期语义，V1 不实现。
