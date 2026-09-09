# 15 迁移 交付和验收门禁

## 目录落地

本提示包解压于D:\Dev\Axiom-V1-Prompt-Pack，实施于D:\Dev\axiom-colab。如果该路径已有其他仓库、用户使用不同真实路径或预期远端不符，T00只做只读检查并报告，不覆盖。不能在云Linux创建D:目录然后说已经写到用户电脑。

T00将提示包的规范、契约、文件清单、任务卡与验收材料复制到生产准备分支implementation/specification/，写AGENTS.md，初始化implementation/progress.json。原始规范只读，后续approved DCR追加版本。progress不直接继承本提示包生成时的任何测试结论。

## Git 保全

获取远端refs，检查未提交/未跟踪文件和现有main。记录当前准确main SHA和差异清单。先保全用户未提交内容，不能自动stash/drop。若legacy不存在，指向原main并准备归档tag legacy-v0-<UTCdate>-<shortsha>。有同名不同内容不得覆盖，先报告冲突；同名同SHA可复用。

此前用户授权legacy保全和新main方向；本地执行者仍应核对该授权在会话/规则中适用。先push legacy/tag并用ls-remote验证准确SHA（annotated tag还须检查peeled target），成功后才在独立rewrite准备分支提交移除旧跟踪内容与新骨架。只移除tracked旧文件，不清理其他目录；旧版字节留在可访问legacy。工作树脏则暂不替换，继续可隔离准备。

新版main是有原祖先的普通提交，最终经约定分支检查后fast-forward，不orphan、不reset远端、不force-push。远端main有新提交时停止集成并重新核对，不覆盖他人进度。分支整理只有在本地Git/远端权限真实具备时执行；提示编写本身没有完成它。

旧DB/工具库/学习课件不自动迁移到新schema。旧工具源码可显式导出并重新验证，新项目不继承旧通过/批准。指定legacy目录若本机有更强保护规则，先遵循保护并提出具体冲突，不改写它来绕过。

## 可交付内容

dist/win-release含host/mcp/review/diagnostics/worker、所需Qt DLL与platforms插件、许可证/第三方清单、默认非敏感配置、MCP插件目录、用户指南；不含private suite、数据根、用户路径token。audio子目录含AxiomPluckedString.exe、相应依赖与AxiomPluckedString.vst3 bundle；准确VST3结构由JUCE target生成，不能只把DLL改扩展名。发布后换一个安装目录仍能运行；MCP配置按用户选择重生成。

发布源码含完整显式CMake文件、依赖lock、DSP/SDK公开头、tests、docs、可重复构建说明、真实验收报告。调试符号PDB单独打包可选，由真实build生成；不上传敏感绝对源路径而未说明。

许可路线未由所有者确认时可完成工程和本地测试，但对外分发release标blocked。不默认付费购买或擅自决定全仓AGPL。Windows沙箱门禁失败、两宿主未测、客户端未接入等分别记录，不能“其余都好”概括为完整V1通过。

## 最终测试入口

ctest标签：platform_probe、domain、store、authority、sdk、sandbox、runner、mcp、project、validation、library、workflow、ui_model、recovery、dsp、analysis、audio、end_to_end。integration测试调用真实exe；windows-only标签在Linux不可当passed。axiom-diagnostics --doctor --json报告版本/路径/锁，不篡改环境；--verify-backup仅验证用户指定备份；危险修复不自动执行。

T18端到端：用真实MCP客户端创建提案→用户审核→两种VS协作→候选验证→发布→画布→组合→W2复用→归档→备份恢复→独立VST3。按照acceptance/MATRIX.csv逐项证据；人工项写实际操作/截图或日志/软件版本/参与者，不能模型代签。

发布包文件manifest列hash/size，运行记录保留build commit/dirty snapshot与工具链。最终说明哪些已实测、哪些awaiting_user、哪些blocked。测试只证明规定案例与环境，不承诺所有物理问题正确或Windows硬实时。
