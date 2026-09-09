# 04 数据契约与科学语义

详细结构见 contracts/data-model.json、contracts/public-api.hpp.txt 与 contracts/command-catalog.json。所有消息 UTF-8，顶层 schema_version=1，未知字段默认拒绝；只允许预先声明的 extensions 对象，V1 必须为空。权威对象 ID 由 host 生成带类型前缀的 128-bit 随机十六进制字符串，不能由名字或时间戳充当唯一身份；图内 node_id 可由客户端生成并经 host 检查格式与唯一性，绝不具有授权意义。hash 为 64 字符小写 SHA-256。UTC 时间用于审计，steady_clock 用于超时，两者不混用。

revision、uint64 和 byte size 传输用无前导零十进制字符串，除零本身；禁止 JSON→QJsonValue double→整数路线。JSON number 对应有限 binary64，integer JSON 数值仅限 ±(2^53−1)；其他整数显式使用 i64/u64 编码对象。数据库 revision 限制为 1 至 2^63−1，超过明确返回 quota_exceeded；通用 u64 数据值仍允许完整 64 位域。MCP 的 JSON-RPC id 在原解析树中无损回传，不转 double。

## 类型与单位

PortSpec 含稳定 port_id、type_id、schema_id、quantity_kind、unit_id、required、default、bounds。V1 schema 子集仅 object/properties/required/additionalProperties=false、array/items/maxItems、string/maxLength/enum、number/minimum/maximum、integer、boolean；type 可为单类型或 [单类型,"null"]，仅用于明确可空字段，不支持任意联合；禁止 $ref/oneOf/正则/远程解析。默认值必须通过同一校验。

ValueEnvelope 含 type_id、payload、science。science 至少记录单位、量种、uncertainty.status。支持的值：scalar_f64、scalar_i64、scalar_u64、record、artifact_ref。记录字段也有固定 schema，不使用任意 JSON 绕过校验。单位表只注册 V1 的 1、m、s、Hz、N、kg/m、1/s、m/s，量纲采用 SI 七基维整数指数。精确 type/schema/quantity_kind/unit 匹配才可接线；长度不能接频率，位置不能隐式当速度；同维不同单位也不自动换算。量纲一致只是必要条件，不证明物理意义相同。

未知 quantity_kind 或未来 coordinate_frame 可作为有版本数据文件内容保存，但 V1 节点不处理未注册类型。暂不实现通用 Quantity 模板运算、摄氏偏移量换算或单位推导引擎。以后可替换库，核心不会允许改变米的定义来适配某工具。

## 精度和不确定度

ExecutionPolicy 必须含 backend=cpu、dtype=float64、math_mode=precise、algorithm_id、algorithm_version；依算法可含容差、最大步数、seed。V1 只有经过验证的实现；选择未知策略返回 unsupported。fast 与任意精度仅列未来能力，不能伪造等价路径。

不确定度状态 not_evaluated 不等于零。V1 仅接受 not_evaluated 与用户声明 exact；exact 仅指该输入在模型中的设定，不宣称仪器或现实物理精确。未来 standard_uncertainty、covariance_ref、ensemble_ref 使用新类型版本；不能把同源输入当独立样本。测量不确定度、离散/舍入误差、模型偏差分别记录。结果 diagnostics 可以给 estimate，但不能自动将其称为严格误差界。

## 散列规范 AXH1

不声称实现 RFC JCS。采用明确的二进制语义编码：null 标记 0；false/true 标记 1/2；有限 number 标记 3 加 IEEE754 binary64 的 8 个大端字节，负零标准化正零；UTF-8 string 标记 4 加 uint64 大端长度和原始字节；array 标记 5 加长度及各值；object 标记 6 加成员数，再按 key 原始 UTF-8 字节字典序编码 key/value。禁止重复 key；不做隐式 Unicode 归一化。无损大整数保持编码对象。散列为 SHA256("AXH1" 的四个 ASCII 字节 + 上述编码)。原文件内容 hash 直接 SHA256(bytes)，与语义 hash 明确区分。

图执行语义 hash 排除布局、展开状态、显示名称、当前运行状态；包含节点稳定 ID、精确包、连线、有效参数、策略、输入修订和组合映射。不将未连接的历史 UI 值纳入有效运行输入。snapshot/candidate/package 各自字段投影固定，不用可变日志或自引用 hash 参与自身摘要。

## 结果与错误

ErrorCode 固定：invalid_argument、unsupported、not_found、conflict、permission_denied、quota_exceeded、timeout、cancelled、interrupted、dependency_error、validation_failed、io_error、protocol_error、internal_error。错误含 code、可公开 message、correlation_id、可选 details；私有路径、challenge 输入/答案和能力 token 必须过滤。工具返回错误与 host 审核结论有不同类型，不以一个 bool 替代。

Result<T> 是 variant<T,Error>；领域层预期失败返回 Result。RAII 清理 noexcept；跨线程、进程、DLL/宿主回调边界捕获异常并转换；音频回调只返回状态码且 noexcept，不分配错误字符串。

wire result 统一为 {ok,data,error}：成功 data 为对应命令的闭合对象且 error=null；失败 data=null 且 error 为固定 Error。schema允许nullable，host另检查互斥不变量。ArtifactRef只携带身份、版本、hash、类型、bytes；科学metadata存于与内容绑定的ArtifactRecord，通过授权读取获得，不能由调用者修改引用中的metadata来冒充单位。
