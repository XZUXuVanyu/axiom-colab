#include "cpp_adapter/component_registry.hpp"
#include "cpp_adapter/errors.hpp"
#include "cpp_adapter/memory_client.hpp"
#include "cpp_adapter/tool_descriptor.hpp"

#include <chrono>
#include <thread>

namespace axiom::tests {

class MemoryBridgeTool final {
public:
    using Dependencies = cpp_adapter::TypeList<cpp_adapter::MemoryClient>;

    explicit MemoryBridgeTool(cpp_adapter::MemoryClient& memory)
        : memory_(&memory) {}

    static cpp_adapter::ToolDescriptor descriptor() {
        using cpp_adapter::ToolDescriptorBuilder;
        using cpp_adapter::schema::Schema;
        return ToolDescriptorBuilder(
                   "memory_roundtrip",
                   "Exercise scoped compute memory through the test Bridge.",
                   "Used only by Stage 4 process integration tests.")
            .parameters(Schema::object()
                .property("action", Schema::string(), true)
                .property("id", Schema::string())
                .property("base64", Schema::string())
                .property("delayMs", Schema::number().minimum(0).maximum(10000)))
            .output(Schema::object().additional_properties(true))
            .timeout_ms(500)
            .build();
    }

    cpp_adapter::Json execute(const cpp_adapter::Json& arguments,
                              cpp_adapter::ToolCallContext&) {
        if (arguments.contains("delayMs")) {
            std::this_thread::sleep_for(std::chrono::milliseconds(
                arguments.at("delayMs").as_integer()));
        }
        const std::string& action = arguments.at("action").as_string();
        if (action == "create") {
            return memory_->invoke(cpp_adapter::MemoryOperation::ComputeCreate,
                                   cpp_adapter::Json::object({
                                       {"base64", arguments.at("base64")},
                                   }));
        }
        if (action == "read") {
            return memory_->invoke(cpp_adapter::MemoryOperation::ComputeRead,
                                   cpp_adapter::Json::object({
                                       {"id", arguments.at("id")},
                                   }));
        }
        throw cpp_adapter::ToolError("INVALID_TEST_ACTION",
                                     "test action must be create or read");
    }

private:
    cpp_adapter::MemoryClient* memory_;
};

CPP_ADAPTER_REGISTER_PUBLIC_TOOL(MemoryBridgeTool)

} // namespace axiom::tests
