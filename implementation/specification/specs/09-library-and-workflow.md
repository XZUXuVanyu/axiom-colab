# 09 工具包 目标与节点图

## 工具包

package_manifest schema1：tool_id、semver、kind(atomic/composite/source/product)、target、sdk_version、toolchain_fingerprint、descriptor、files(path/hash/size/role)、exact_dependencies、permissions、license_refs、validation_summary_ref。package_hash 是manifest中除自身hash的AXH1摘要。同tool_id+version只绑定一个hash；同版本不同内容conflict。包目录不可变。

源码/静态库/worker的相互关系明确；源码与二进制验证摘要分列。所有运行依赖字节必须在库内或明确已锁系统运行时，禁止依赖发布workspace绝对路径。工具包提交前UI展示完整文件列表与潜在敏感内容；不把整个workspace送入库。private挑战与运行数据禁止进入public summary。

发布：candidate验证passed→review批准release manifest hash→host消费批准→复制staging并重算hash→库提交available→记录publication_id。approve与publish均无MCP工具。revoke阻止新调用，不销毁字节；V1不提供自动GC/删除引用包。

## 目标与计划

goal状态draft/active/paused/completed/archived；plan状态proposed/approved/superseded/rejected。模型可提出goal和plan，review激活计划。run必须引用当前approved plan hash，允许工具和预算不得越界。计划变更须新revision与用户决定，旧run继续绑定旧快照。完成goal需要用户封存结果与未解问题，模型不能仅凭作业结束自动标科学目标已达成。

## 图定义

graph含schema_version、graph_id、revision、nodes、edges、exposed_ports。Node含node_id、package_hash、input_literals、params、execution_policy；Edge含source_node/output_port、target_node/input_port。layout另存GraphViewState，不参与语义hash。每个输入一个来源；接线禁用对应literal编辑但UI保留last_literal于view state，断线恢复且重新校验。

GraphValidator检查包已绑定/未撤销、稳定端口存在、类型/schema/单位/量种一致、所需值齐全、范围/总预算、图无环、单层组合与权限。参数默认值在启动前展开，run快照冻结实际有效值，不从未来descriptor默认读取。未知version或未批准包不能先执行再报错。

调度：Kahn拓扑序，多个ready节点按node_id原始字节排序确定顺序。串行但允许fanout/join。节点失败继续执行无依赖的独立节点，依赖失败者skipped；run总体failed。取消则未开始节点cancelled，当前作业终止，已提交输出保留并标部分运行。run不自动重放，重试产生新run_id。

UI草稿变化只标受影响节点dirty；拖动位置不dirty；运行中参数变化不影响该run。run结果始终标明来源revision，不能把旧结果画成新参数结果。

## 组合工具

选取完整子图并声明外部输入/输出/参数映射；每个映射指向唯一内部端口，输出可fanout。组合内只允许atomic，不允许引用其他composite或自己；外部workspace图可含composite。发布前检查没有捕获compute/artifact私有实例，只有类型/默认常量/映射/固定依赖。

执行时将组合展开为命名空间隔离的子图，node trace保留outer_id+inner_id。组合全部内部必需节点成功才成功；失败包含有界公开路径。所有内部包精确锁定；组合单次预算覆盖内部总运行，不能每层重置预算。发布/验证规则与原子一样，组合测试调用真实子worker。

## 基础示例和正式示例

M1仅TwoProbe工具用于系统验证：ScaleTool对受限标量缩放，OffsetTool偏移；独立worker以artifact或typed值传递，无共享singleton。它们不能替代最终科学产品。

M4正式图：StringRender→SpectrumAnalysis 与 DecayAnalysis→ExperimentReport。同一个audio artifact分叉，汇合报告。用户修改物理参数并再次显式运行，新workspace复用已发布组合生成第二组结果。
