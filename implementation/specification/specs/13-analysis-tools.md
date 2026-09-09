# 13 正式音频实验工具

三个分析/报告类与StringRenderTool形成正式组合示例，每个类有独立descriptor和固定worker注册。工具参数/输出见contracts/builtin-tools.json。

StringRenderTool接受StringParameters七个物理字段、output_gain、fs和duration_s；不接受tuning_mode或MIDI，所有音高通过物理参数给定。duration_s(0.1–10)，采样数floor(fs*duration_s)，分块256内部生成；产物包括audio.signal.v1(原始float64速度/mono)、audio.preview.v1(float32 WAV/mono)、render.meta.v1。渲染参考零时刻定义：第0样本先输出初态速度，随后推进一步。所有入口一致。duration不满足精确整样本不是错误，必须记录实际sample_count/duration。

SpectrumAnalysisTool读取同一workspace授权audio.signal.v1，不读任意文件路径。分析前65536样本，不足则零填充；去均值，Hann窗w[n]=0.5*(1-cos(2pi*n/(M-1)))作用实际M点(M≥2)，余点零；NFFT固定65536。实现迭代radix2 FFT，float64，作为该工具私有算法，不另建通用FFT服务/依赖。单边幅度按sum(w)归一，非DC/Nyquist乘2；频率k*fs/NFFT。输出全谱artifact、最大非DC峰频率和max_amplitude。名字明确peak_frequency，不把最大峰当理论基频。NFFT上限固定且输入大小受限。

FFT测试使用独立O(N^2) DFT对小N内核(8/16/32)对照归一误差≤1e-10，以及bin对齐纯正弦幅度/频率校验；测试可调用内部测试适配但不能修改公共NFFT。分析工具结果不能成为DSP自身唯一oracle。

DecayAnalysisTool读取速度信号，按20ms窗(至少2样本)、10ms hop计算RMS，选择用户给定拟合区间[start_s,end_s]，去除RMS≤1e-12m/s点，对ln(RMS)与秒数做普通最小二乘，返回slope_per_s、r_squared、valid_windows、observed_decay_rate=-slope及status。点<3、时间方差0或无正RMS返回not_estimable；正slope也输出growing而非伪造正阻尼。拟合结果是观测包络估计，不能等同模型gamma，特别是多模态拍频下。固定oracle：fs=48000、时长1s，输入exp(-2*n/fs)，拟合0.1至0.8s，斜率应为-2且误差≤1e-8 s^-1；输入exp(n/fs)同区间应为+1、误差≤1e-8并标growing；全零not_estimable；常量1返回斜率0、r_squared=null。指数数据的定长窗RMS仅乘固定比例，不改变对数斜率；不能要求所有拨弦曲线完美直线。

ExperimentReportTool接受render.meta、spectrum、decay三份类型正确的引用和model说明，检查它们来源于相同audio内容hash与run，输出report.json和人读Markdown artifact。报告包含参数、模型假设、版本、源/二进制hash、原始数据、分析设置、有效性和未评估事项。它不调用LLM总结、不推断实验已证明现实物理正确。

模板组合StringExperiment的外部参数就是render参数+decay拟合区间，输出raw audio、preview、spectrum、decay、report。报告聚合节点是纯数据封存，不向外部路径写文件；导出由用户入口完成。四工具在W1真实开发发布，组合发布后在W2复用。

产物字段由contracts/artifact-types.json固定。对静音信号spectrum返回status=silent、peak_frequency_hz=0、max_amplitude_m_s=0；并列最大峰选择最小正频率bin。RMS窗样本数round(0.02*fs)，hop=round(0.01*fs)，只保留完整窗，窗中心时间落在闭区间[start_s,end_s]内。OLS的R平方在因变量总方差为零时为null，不把0/0写为NaN；status按可估计性与斜率规则判定。
