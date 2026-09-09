# 12 拨弦物理模型与音频产品

本章是实现契约，不是课程解答。生产模型为两端固定、均匀、线性小振幅弦的有限模态近似；只模拟虚拟拾取位置的弦速度，不声称完整吉他琴体或标定声压。

## 方程和状态

连续模型：mu*y_tt = T*y_xx - 2*mu*gamma*y_t，0<x<L，y(0,t)=y(L,t)=0。初始位移为在x=pL处高度h的三角拨弦形状，初始速度为0。T单位N，mu单位kg/m，gamma单位s^-1。

y(x,t)=sum(q_n(t)*sin(n*pi*x/L))，omega_n=n*pi*sqrt(T/mu)/L；每个模态满足q_n''+2*gamma*q_n'+omega_n^2*q_n=0，q_n(0)=2*h*sin(n*pi*p)/(n^2*pi^2*p*(1-p))，v_n(0)=0。状态必须保存q_n与v_n，不能只保存位移。模态能量E=mu*L/4*sum(v_n^2+omega_n^2*q_n^2)，E'=-mu*L*gamma*sum(v_n^2)≤0。

推进固定选择欠阻尼线性系统的解析单步状态转移，float64；可预计算每模态2×2转移系数，无通用矩阵库。gamma=0必须自然退化到无阻尼旋转。不能用Euler/任意数值积分代替然后扩大容差。每次prepare或新激励算系数，sample循环仅固定数组和乘加。离线oracle使用从初值到指定时间的闭式解，不调用相同step函数生成expected。

## 参数域与默认值

| 参数ID | 域 | 默认 | 时机 |
| --- | --- | --- | --- |
| length_m | [0.1,2] | 0.65 | 下一次激励 |
| tension_n | [1,1000] | 100 | 下一次激励 |
| density_kg_m | [0.0001,0.1] | 0.005 | 下一次激励 |
| damping_per_s | [0,20] | 2 | 下一次激励 |
| pluck_position | [0.05,0.95] | 0.25 | 下一次激励 |
| pluck_height_m | [0,0.002] | 0.0005 | 下一次激励 |
| pickup_position | [0.05,0.95] | 0.8 | 下一次激励 |
| output_gain | [0,1] | 0.1 | 5ms平滑即时生效 |
| tuning_mode | physical / midi | physical | 下一次激励 |

联合约束：20≤f1≤2000Hz；max(h/(pL),h/((1-p)L))≤0.05保证设定的小斜率范围；sample_rate为44100/48000/96000；gamma<omega1，前述域保证；N=min(32,floor(0.45*sample_rate/f1))且至少1，保留f_n≤0.45fs的模态。非法组合返回invalid_argument，不钳到一个不同模型。模态截断是近似，不说连续弦被精确求解。

默认h=0是合法零激励；所有finite检查在更新状态前完成。模态状态和采样频率、物理参数分离，不能用vec3混淆m/b/k或用一个位移值当完整状态。

## 输出与实时外壳

physical_string_dsp输出pickup_velocity_m_s=sum(v_n*sin(n*pi*pickup_position))，纯物理float64。离线Tool保存原始速度序列f64 little endian及单位/采样率/模型元数据；另生成试听WAV，输出映射s=0.1 s/m * output_gain * velocity。产品最终播放保护将数字输出限制在[-0.95,0.95]并显示clip计数；该输出保护只处理合法大振幅的播放电平，原始DSP值必须先做非有限/能量检查，不能用它掩盖发散或使数值测试通过。离线数值验收全部使用保护前数据。

同一DSP库用于offline worker与JUCE音频壳，禁止复制算法。DSP不依赖Qt/JUCE/MCP/数据库。最多32模态固定数组、无heap回调分配。prepare可分配一次但不在音频回调；new pluck只写预分配state。参数来自APVTS原子快照、手动Pluck/Stop来自有界SPSC命令队列；队列满返回UI忙碌，不能丢Stop，Stop使用独立原子标志。UI刷新读取无阻塞计数/快照，不直接访问正在写的state。

回调禁止堆分配/释放、阻塞锁、日志输出、文件、DB、MCP、网络、进程和不受控异常。非有限状态触发静音并原子记error，控制线程显示原因，重新prepare/合法激励才能恢复。改变设备采样率重新prepare并停止旧声部。

## MIDI和状态恢复

单声部，note-on重新激励当前声部；velocity0视为note-off。physical模式note号不改变T，velocity按v/127缩放h；midi模式f=440*2^((note-69)/12)，保持L/mu并派生T=mu*(2Lf)^2，GUI的T显示只读“有效张力”，用户的manual tension仍作为physical模式参数存储。非法目标或派生T越域时忽略该次激励并增加invalid_event计数，不能悄悄移调。音符范围36–84；域外无声并报告计数。

sample offset按宿主MIDI事件执行；同offset按宿主顺序，最后合法note-on占据声部。note-off只对当前音符生效，通过5ms释放输出然后清state；Stop同样5ms静音；新note-on打断释放并重新激励。参数变化默认下一激励，gain平滑即时。块长度不允许改变物理时间语义。

APVTS state schema1只保存参数/tuning_mode，不保存正在振动的历史state；恢复后静音，等待下一激励。校验未知版本/非法值，保留当前有效状态并报告，不用损坏preset重写内存。插件参数ID一经发布不得变；MIDI参数、GUI和automation共享同一组值。

## 精确数值验收

P01 方程/边界/初态/输出/域可追溯。P02 零初态100000样本严格0；NaN/Inf/负T/零L/联合域失败且原state不变。

P03 单模态单位初始q的解析对照：fs取三档，gamma取0/2/20、f1取40/220/1000，时长2s，每个q/v用归一化误差|q-qref|/max(|q0|,1e-12)及|v-vref|/max(omega*|q0|,1e-12)≤1e-8；reference用直接闭式解，非逐步累加。零阻尼能量相对漂移≤1e-8。

P04 阻尼情况下相邻采样能量增加不得大于1e-12*max(E0,1e-24)；E趋小后绝对阈值避免除零。能量整体衰减，不要求每个音频样本单调。

P05 p=0.5时偶数初模态振幅绝对值≤1e-14m；h倍增在线性域使所有q/v倍增，归一化差≤1e-10；模态初值与独立积分三角形投影对照误差≤1e-8（高精度数值积分仅oracle，可在C++测试内实现有界解析分段积分）。

P06 三档fs和64/256/1024块，相同事件sample index、参数策略，原始DSP相对归一化误差≤1e-10；固定同工具链环境，不声称跨CPU bitwise一致。JUCE float输出与double reference映射后绝对误差≤2e-6，限幅发生的样本按同一明确映射比较。

P07 测试GUI激励/停止、增益、设备重启、保存恢复、长时播放10min；目标机器Release记录回调分位耗时/最大值、underrun和配置，要求受控测试中观测underrun=0且99.9%回调耗时≤半个block时间；它不是Windows硬实时保证。计时记录使用预分配缓冲并在结束后导出。

P08 同一VST3包在Live/FL各记录版本、加载扫描、note、automation、state恢复、关闭再开。缺宿主标awaiting_user，不假PASS。P09 关host仍播放。P10 新workspace绑定精确工具组合再渲染并保存不同参数结果。

Standalone/VST3先在M0做不含模型的基础空壳；正式DSP必须经M2/M3形成设计、候选、验证和库包记录后链接到音频壳，不能事后伪造流程。
