# 10 MCP 与本地接口

## MCP 固定最小实现

自行实现标准兼容最小 C++ JSON-RPC/MCP gateway，不引入未经评估的 C++ SDK。锁定协议 2025-11-25，只声明 tools(listChanged=true)。支持initialize、notifications/initialized、ping、tools/list、tools/call、notifications/cancelled以及工具目录变更通知；不声明sampling、roots、resources、prompts、experimental tasks或HTTP能力。客户端提供不同protocolVersion时按规范协商到唯一支持版本，不伪称支持未知版本。

stdio UTF-8一行一条JSON-RPC，没有Content-Length头；拒绝超1MiB单行和batch。stdout仅协议，stderr诊断。初始化完成前不执行工具。未知method用-32601，解析-32700，无效请求-32600，参数-32602；工具业务失败返回isError=true，public error结构放structuredContent并保留text JSON副本。已声明的outputSchema必须覆盖成功/失败的统一对象，见command-catalog。

tools/list将通用固定命令与已授权tool bindings合并，分页100项，不泄漏其他workspace工具；包/绑定变更发送list_changed。动态名为tool.<binding_id>，与精确包一一对应，不把两个版本都叫同名覆盖。其arguments为descriptor固定inputs/params加request_key；新的工具不改gateway业务代码。

长动作立即返回job_id；轮询axiom.job.get和axiom.job.cancel是应用工具，不冒称MCP Tasks扩展。取消JSON-RPC request只取消尚未完成的处理；已经返回job_id后必须使用job.cancel，不能假设客户端取消自动撤回已完成响应后的作业。

固定命令的读写角色、输入输出见contracts/command-catalog.json。所有model工具都不接受actor/admin/批准字段。公开能力不含approval、publish、bind权限扩大、export或任意path读取。用户操作由privileged IPC执行。

## 本地 IPC

Qt QLocalServer/QLocalSocket使用Windows命名pipe，单用户本地ACL，禁止远程连接。消息长度为4字节无符号大端长度+UTF-8 JSON；限制frame=1MiB、深度32。Hello建立会话后每命令绑定connection，session secret不通过MCP透传。消息：{schema_version:1,request_id,operation,payload,request_key?}；响应：{schema_version:1,request_id,result:{ok,data,error}}。事件含seq、workspace、kind、job/target、public payload；断线重连查询最新状态，不能因丢事件把DB倒退。

host序列化全部权威写入；UI使用异步响应和事件。长作业不占住pipe读取线程。操作不支持返回unsupported，不静默忽略未知字段。

## 插件包装

dist附带plugins/axiom-colab/.codex-plugin/plugin.json、.mcp.json以及skills/axiom-workflow/SKILL.md。正式manifest名称axiom-colab、版本0.1.0、真实作者XZUXuVanyu，mcpServers指./.mcp.json，skills指./skills；不伪造logo、网址或安装状态。

.mcp.json由用户选择安装目录和workspace之后生成：mcpServers.axiom.command为实际axiom-mcp.exe绝对路径；args为["--workspace",实际ID]。配置不含review token。通用客户端可使用同一stdio command/args；其配置包装格式须按实际客户端验证，不保证每个Luna/DeepSeek会话自带MCP。

启动应用不自动更改客户端全局配置或marketplace。V1提供copy/install说明和本机配置预览；用户明确安装才执行。至少一个真实外部客户端完成发现、调用、job轮询、受限失败测试；无客户端环境则该门禁awaiting_user。
