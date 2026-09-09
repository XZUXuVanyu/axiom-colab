# 05 权威边界和 Windows 隔离

## 权威通道

host 产生身份和能力，UI/MCP 请求不能携带可自行生效的角色。公共本地 pipe 仅供 MCP 请求 model 会话；workspace 必须由用户先在 Review App 授予。没有全局默认 workspace 授权。MCP 会话绑定 workspace_id、allowed operation set 和精确工具能力；猜到对象 ID 不授予读取权。

review 的 privileged 通道由 host 启动唯一 review 子进程时通过显式继承的匿名 pipe 传入随机单次 bootstrap secret，再换取内存会话。secret 不放 argv、环境、配置或日志；重启失效。独立启动 review 只通知 host 激活/创建审核窗口，不能通过声明 reviewer=true 提权。host 校验批准时的 plan/candidate/package hash 和 expected_revision。

验证结果由 host 内 trusted coordinator 观察 runner 真实状态并提交，model 没有写入 validation-record 的命令。UI 只表达用户决定，不能把失败验证变成 passed。用户可拒绝/要求修订，发布必须通过规定测试集合。批准 token 只能被同内容发布原子消费一次。

此边界防协议冒充和受限候选越权，不保证抵御已经拥有同用户 shell、桌面/调试器权限的恶意客户端。不能把 ACL 同用户所有权当成强隔离证明。

## 能力集合

V1 工具允许 pure_compute、workspace_compute_read、workspace_compute_write、artifact_read_selected、artifact_stage_write。没有 arbitrary_path、shell、network、device_write。未来保留 device_read/device_write/stream，但 V1 请求它们直接 unsupported。文件导出只由用户选择目标，并授权具体 artifact hash；模型不能指定任意宿主文件路径。

published 包只是可选择；workspace binding 决定是否可调用。有效权限是发布权限、workspace grant、节点请求三者交集。组合依赖权限取并集后展示，运行时每个子节点再检查。发布不能制造越权，撤销包立即禁止新作业；已运行调用按用户选择取消且保留记录。

## 候选构建与执行

Windows 实现使用 CreateProcessW 的 suspended process + STARTUPINFOEX security capabilities(AppContainer) + 显式继承 handle list + Job Object。分配 Job 后才 Resume；任一步失败即失败关闭。Job 设置 kill-on-close、内存、进程数、CPU/总墙钟预算。父进程最终收割整个树，不允许 breakaway。

AppContainer 使用一次性作业 SID、无网络能力。只给 staged 输入/依赖必要只读 ACL，只给 build/temp/output root 写权限。允许编译器必需的 SDK/工具链读取范围需明确清单；不能给 D:\Dev、用户 profile 或全部 C: 递归读取来修好构建。私有 oracle、库数据库、其他 workspace、host 会话通道完全不可读。对 Windows 自身普遍可读系统路径的实际可见性如实记录，不声称零系统访问。

创建命令使用冻结 exe 路径和参数数组转换为正确 Windows argv quoting，不调用 cmd /c、PowerShell 或模型提供的 command string。构建脚本仍是任意执行输入，因此 CMake configure、build、candidate tests 全在同受限作业下执行。只读缓存须事先由受信 bootstrap 下载，运行/构建不联网。

候选输出只能写 staging。worker 不获得 compute/DB 根目录；host 把授权的具体输入拷入 job staging，并在完成后检验/导入输出。validate oracle 在受限 worker 外；每次只输入当前测试必要值。输出 stdout/stderr 有界，秘密测试日志不能直接给模型。

限制默认：每 workspace 一个活动作业、最多 32 排队；frame 1 MiB；JSON depth 32；源码 20 MiB/1000 文件；调用 30s，可由用户授权单次至300s；构建+验证总15min，内存2GiB，最多16子进程；普通worker512MiB/4子进程；每输出流10MiB；workspace artifacts1GiB；库默认5GiB；无自动删除。主机配置可由用户调高并记录，模型不能自改。

## 路径和 TOCTOU

输入路径是逻辑相对路径，拒绝 ..、绝对路径、UNC、盘符、NUL、ADS、保留设备名、大小写冲突、symlink/junction/reparse point、额外 hardlink。打开时用 Windows handle 解析最终路径并校验根，避免只做字符串前缀判断；复制后以 staging 实际字节 hash 为准。应用源码前先稳定复制、核对基线；同一用户外部恶意改 ACL 的情形超出威胁模型，但普通竞态必须失败而不是错写。

## M0 前置门槛

T02 必须实测受限 CMake configure、编译、链接、单次 worker 与无网络/越界拒绝/子进程取消。未通过不能继续把系统称为有安全候选验证。报告最小重现，提出 Windows VM 等替代设计；不得静默降级或把实际失败标为环境可忽略。M0 的音频空壳只验证构建及用户启动，不赋予 agent 声卡控制。
