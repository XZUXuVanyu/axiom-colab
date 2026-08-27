# C++ Tool Authoring

An ordinary public capability consists of one header, one implementation, and
C++ tests. Do not edit `source/ts/`, the Bridge entry point, CMake, or a central tool
list.

## Minimal template

```cpp
// source/cpp/tools/echo_tool.hpp
#pragma once
#include "cpp_adapter/component_registry.hpp"

namespace app::tools {
class EchoTool final {
public:
    using Dependencies = cpp_adapter::TypeList<>;
    static cpp_adapter::ToolDescriptor descriptor();
    cpp_adapter::Json execute(const cpp_adapter::Json& arguments,
                              cpp_adapter::ToolCallContext& context);
};
} // namespace app::tools
```

```cpp
// source/cpp/tools/echo_tool.cpp
#include "echo_tool.hpp"

namespace app::tools {
cpp_adapter::ToolDescriptor EchoTool::descriptor() {
    using cpp_adapter::ToolDescriptorBuilder;
    using cpp_adapter::schema::Schema;
    return ToolDescriptorBuilder(
               "echo_text", "Return the supplied text.",
               "Use when the caller explicitly asks to echo text.")
        .parameters(Schema::object().property(
            "text", Schema::string().min_length(1), true))
        .output(Schema::object().property("text", Schema::string(), true))
        .allow_parallel()
        .build();
}

cpp_adapter::Json EchoTool::execute(
    const cpp_adapter::Json& arguments,
    cpp_adapter::ToolCallContext&) {
    return cpp_adapter::Json::object({{"text", arguments.at("text")}});
}

CPP_ADAPTER_REGISTER_PUBLIC_TOOL(EchoTool)
} // namespace app::tools
```

Declare injected types in `Dependencies` and accept the same non-owning
references, in the same order, in the constructor. Registration emits a focused
compile-time error if that signature does not match. At runtime, missing and
circular registrations report the readable dependency path.

`Schema::object()` is closed by default. Pass `true` as the third argument to
`property` for required fields. C++ validates the complete input and output
schemas; TypeScript only discovers and projects them for Harness.

Add behavior tests under `tests/cpp/`, then run `pnpm.cmd test` and the standard
`proj/scripts/build-and-test.ps1` command. The authoring-boundary test automatically
derives public names from C++ and rejects business tool names in `source/ts/`.

## Diagnosing failures

- `INVALID_DESCRIPTOR` means discovery rejected an incomplete descriptor or
  unsupported schema. Check the reported JSON path and the builder call nearest
  that property.
- A compile-time dependency-signature error means the constructor references do
  not exactly match `Dependencies`, including order and qualifiers.
- `DEPENDENCY_NOT_REGISTERED` and `CIRCULAR_DEPENDENCY` include the C++ type path;
  register internal components before resolving a Tool and break dependency
  cycles rather than exposing internal components as public Tools.
- `INPUT_VALIDATION_FAILED` and `OUTPUT_VALIDATION_FAILED` are C++ boundary
  errors. Their ledger records identify which validation completed; do not add
  compensating TypeScript validation for a specific Tool.
- `TIMEOUT`, byte-limit, cancellation, backpressure, and worker-exit errors are
  transport failures. Inspect stderr diagnostics and the call ID, then adjust a
  generic configured limit only when the Tool's declared contract justifies it.

Keep Bridge stdout JSON-only. Write native diagnostics to stderr; the adapter
correlates and bounds them without contaminating the protocol response.
