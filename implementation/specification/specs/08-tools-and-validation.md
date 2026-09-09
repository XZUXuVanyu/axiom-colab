# 08 Tool SDK 和候选验证

## 原子工具接口

一个公开 C++ ITool 实现类对应一个 Tool ID。descriptor() 返回固定 ToolDescriptor；execute() 接受受校验输入、参数、CallContext，返回 ToolOutput 或 Error。descriptor 的哈希从包内静态manifest核对，不能由候选运行时任意扩大权限。

registry 保存 tool_id→factory 以及 required service_id 列表。按有向无环依赖创建 unique_ptr 服务，检查缺失/循环/重复ID。一个 worker 每作业重新装配，状态不跨工作区。内部 expression helper 不一定公开为 Tool；如果作为可复用依赖发布，须精确 package hash+service_id，不进行全局类名猜测。

worker 只接收一次请求、返回一次结果后退出。入口 --protocol axiom-worker-1；stdin为带4字节大端长度的UTF8 JSON，stdout同格式仅返回一个结果；stderr是受限诊断。数值大数据通过 job staging 的逻辑 artifact 文件；输出声明 logical_name/type/hash/size，host重新计算hash，不信任worker自己声称。禁止stdout打印PASS充当验证。

worker adapter 同源编译进项目，使用注册工厂；第三方C++ ABI只允许固定MSVC/CRT/arch/config的静态链接。跨版本替换依赖重新构建新worker，禁止运行时load任意DLL。包可以包含源码与静态库供音频壳直接链接，但host只执行已验证worker。

## 候选和验证绑定

candidate_id 绑定design_hash、snapshot_hash、descriptor_hash、dependency_lock_hash、build_recipe_hash、target、requested_permissions。构建后绑定每个binary_hash，随后验证该字节。修改任何源/依赖/descriptor/编译选项/策略会产生新candidate或新的build attempt；不能沿用旧passed。

三类suite：author(作者公开)、standard(实验室公开)、private(用户私有)。全都由可信coordinator控制观测；作者测试自身可以造假，因此只提供一类证据，不取代独立oracle。private是mandatory configured或用户在review中明确not_configured；not_configured不计passed，批准要求中不可被偷偷当已执行。系统完整功能验收必须演示至少一个实际私有挑战，其内容不能进入公共仓库。

oracle仅内置三类fixture：typed_exact、numeric_tolerance、artifact_properties；实际数据和tolerance属于suite封存版本。测试期不从模型输出推断expected。保密测试的expected/context不挂载到worker；单例输入必要可见。结果向模型仅提供允许的失败类别，不透出私有输入或答案。

build/validation job的终态：succeeded、failed、cancelled、timed_out、interrupted；validation结论passed、failed、incomplete，只有所需suite全部执行、过程隔离合格且产物一致才passed。返回码0是必要条件而非充分条件；stderr空也不是通过证明。

validation_record 写明 validator_version、policy_hash、test_suite_hashes、platform、toolchain、sources、binaries、timestamps、case结果、权限/隔离观测、实际日志引用。独立验证和DAW人工集成分开；宿主hash不等于DSP hash。

## 任务内测试

本工程自身Catch2测试是实现正确性检查；应用内candidate pipeline是给后来工具使用的生产功能，二者不可混为一套“tests已通过”。恶意fixture必须真实触发越界/超时/假PASS，证明系统拒绝。测试不允许联外网，只尝试访问本机受控假服务证明网络拒绝，避免不必要流量。

worker请求固定为{schema_version:1,tool_id,call_id,inputs,params,context}，context只含host已解析的工作区/作业ID、执行策略、逻辑staging映射和限额，不含批准能力。响应为{schema_version:1,call_id,ok,data,error}，data为ToolOutput或null；error为Error或null，两者按ok互斥。manifest所指worker可以注册多个工具类，但该包的指定tool_id之外不允许调用；host与worker均检查。
