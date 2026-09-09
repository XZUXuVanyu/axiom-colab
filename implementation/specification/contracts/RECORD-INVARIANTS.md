# 记录不变量与生成物

本文件补充data-model字段表的关系校验，不能用JSON schema的结构通过代替业务一致性。

- 新graph/object用null id与expected_revision=0，host生成ID。更新必须已有ID与准确revision。图node_id由客户端生成只限图内唯一性，不是权限。
- ArtifactRef的bytes/hash/type必须与存储记录一致；科学metadata位于ArtifactRecord，不信任caller篡改引用。大数据的文件hash、元数据语义hash与整体manifest分别绑定，单位改变产生新记录。
- 角色只在host内传递，wire不接收actor。Result成功data非null/error=null，失败反之。
- 所有异步ProcessSpec/RunSnapshot拥有其字符串与缓冲副本，不能持有调用者临时span；CallContext的引用只活到execute结束。
- 字节limits、revision边界、graph节点<=128/边<=512、组合内部节点<=32、依赖深度<=16(服务层，组合仍仅一层)、公开包列表分页100、job队列32共同执行。
- 全graph有效执行预算为plan预算，节点独立timeout不会重置总体deadline；组合展开不会扩大额度。
- public JSON schema全部在同一个validator解释，不额外安装schema库。command-catalog中的*_json只解决可变记录传输，解析后必须再次检查对应固定记录，禁止当任意对象通道。
- shader式界面不能把随机数、旧运行状态或geometry view坐标隐式加入计算。保存结果时注明validity/revision。
- 框架生产文件白名单只约束本次Axiom源码；用户未来创建的Tool项目是受其项目绑定/设计审核管理的业务数据，不要求修改框架FILE-MANIFEST。
- 本次生成的任务文档和空白进度仅供执行，绝不能被当作actual build或test evidence。
