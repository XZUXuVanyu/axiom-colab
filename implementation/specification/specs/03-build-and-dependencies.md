# 03 构建基线与依赖锁

## 固定选择

| 项目 | 基线 | 实施要求 |
| --- | --- | --- |
| 语言 | C++20 | 自主源码不依赖 C++23 expected；Result 使用 variant |
| OS | Windows 11 x64 | 记录实际 OS build；不以 Linux 结果签发 Windows 验收 |
| IDE/ABI | Visual Studio 2022 17.14、MSVC v143 14.44 系列 | T00 记录 cl 完整版本与 SDK，形成单机工具链锁；若不可用报告，不猜具体补丁号 |
| CMake | 4.1.3 | Presets；Debug/Release；版本更换须记录批准 |
| Ninja | 使用 T00 检测的 VS 自带版本 | 精确版本和 exe hash 写入工具链锁后才构建，不自动升级 |
| Qt | 6.11.2 MSVC x64 | Core、Network 仅本地 IPC、Gui、Widgets；不使用 QtSql/QML/WebEngine |
| JSON | nlohmann/json v3.12.0 | 唯一 JSON 解析器；拒绝重复 key、非有限数、超深嵌套 |
| SQLite | 3.53.4 amalgamation | 唯一 C 第三方依赖例外；通过官方 C API，禁 load_extension |
| 测试 | Catch2 v3.8.1 + CTest | 唯一单元测试框架；真实宿主/GUI 检查仍须人工证据 |
| 音频 | JUCE 8.0.14 | 仅音频产品；VST3 SDK 使用所锁 JUCE 携带版本并记录来源 |
| SHA-256 / RNG | Windows BCrypt | 不引入第二密码库，不手写散列或随机发生器 |

这些选择是本包的实现约束，不代表已在目标机器组合通过。M0 必须验证 Qt/MSVC、JUCE/VST3、受限 CMake/编译器兼容性。

## 两阶段锁定

dependencies-baseline.json 锁定官方版本和获取来源。T01 从该版本解析完整 commit/SHA-256、许可文本、下载字节、编译选项，生成 deps/lock.json 与 implementation/toolchain.json。任何 null/未解析 hash 使正式构建拒绝；这不是允许实现者自由挑版本。禁止把短 SHA、tag 名当作不可变供应链证明。正式构建无网络；用户授权的 bootstrap 在沙箱外预取白名单依赖，随后候选只读依赖缓存。

采用 CMake 固定 source directory 加 add_subdirectory，或带 URL_HASH 的 FetchContent 离线缓存；只选择前者作为 V1：bootstrap 生成 deps/sources/<name>，CMake 只读这些固定目录。Qt 使用精确版本预装包路径，通过 CMakeUserPresets.json 提供，不把本机路径提交到共享预设。不引入 vcpkg/Conan/包管理第二套锁。

## 预设和诊断

win-debug、win-release 是 configure/build/test preset 同名三组。生成器 Ninja，架构由 x64 Native Tools 环境固定。build/<preset> 与 dist/<preset> 完全分离；/MDd 对 Debug、/MD 对 Release；/W4 /permissive- /utf-8；浮点默认 /fp:precise，不允许 /fp:fast。

CMake 源列表显式列出，不使用 GLOB 吞入未批准文件。测试通过 BUILD_TESTING 控制，音频通过 AXIOM_BUILD_AUDIO 控制；M0 可关闭尚未实现 targets，但最终 preset 必须全部开启。禁用的模块记 not_implemented，不算测试跳过成功。

固定命令入口：cmake --preset win-debug；cmake --build --preset win-debug；ctest --preset win-debug --output-on-failure；Release 同理；cmake --install build/win-release --prefix dist/win-release。VS 打开根目录 CMakeLists.txt，选择 win-debug 与独立 executable target。

许可：采集锁定字节自带许可；Qt 动态链接发布必须按实际所选许可满足义务；JUCE 许可路线不自动推定为免费闭源。不得替用户购买许可或自行把整个仓库改成某个开源许可。LICENSE-DECISION.md 记录所有者选择，未定时对外发布门禁失败。依赖许可记录不是法律审核通过声明。
