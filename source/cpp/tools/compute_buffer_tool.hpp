#pragma once

#include "cpp_adapter/component_registry.hpp"

namespace axiom::tools {

class ComputeBufferTool final {
public:
    using Dependencies = cpp_adapter::TypeList<cpp_adapter::MemoryClient>;

    explicit ComputeBufferTool(cpp_adapter::MemoryClient& memory)
        : memory_(&memory) {}

    static cpp_adapter::ToolDescriptor descriptor();
    cpp_adapter::Json execute(const cpp_adapter::Json& arguments,
                              cpp_adapter::ToolCallContext& context);

private:
    cpp_adapter::MemoryClient* memory_;
};

} // namespace axiom::tools
