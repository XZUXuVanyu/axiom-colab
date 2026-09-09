# 验收证据规则

MATRIX.csv是门禁索引，specs中的精确条件为判据。初始所有not_run。每次实际结果生成evidence记录，字段为：gate_id、status(passed/failed/not_run/blocked/awaiting_user)、source_commit、dirty_snapshot_hash、binary_hashes、dependency_lock_hash、toolchain_hash、test_suite_hash、actual_command、cwd、exit_code、log_refs、observations、timestamp_utc、executed_by。

测试作者和实现作者可以相同，但不能把作者自述当成应用内trusted validator结论。private challenge原始记录放host私有区，公开evidence仅含脱敏汇总和不可逆引用。

人工项记录软件版本、具体动作、观测、文件hash及用户反馈。DAW/VS未访问不得标passed；同一个产品在Live通过不替FL通过。无法获得两宿主时可以交付明确限定兼容性的试用包，但完整A18/P08仍未关闭。

性能是指定硬件与配置的测量，不承诺所有PC。科学验证把数学模型、数值方法、代码、宿主集成分开；不以可听声音代替物理依据。

所有必要门禁都passed且所有者许可决定记录后，才称完整V1验收通过。工程prompt包本身只做结构/一致性检查，不具有任何上述C++或Windows验收状态。
