#include "compute_buffer_tool.hpp"

#include "cpp_adapter/errors.hpp"

namespace axiom::tools {

cpp_adapter::ToolDescriptor ComputeBufferTool::descriptor() {
    using cpp_adapter::ToolDescriptorBuilder;
    using cpp_adapter::schema::Schema;
    return ToolDescriptorBuilder(
               "compute_buffer",
               "Create, read, update, snapshot, or release a scoped compute buffer.",
               "Use for bounded temporary bytes that may be shared by calls in one workspace.")
        .parameters(Schema::object()
            .property("action", Schema::string(), true)
            .property("id", Schema::string())
            .property("base64", Schema::string())
            .property("expiresAt", Schema::string()))
        .output(Schema::object().additional_properties(true))
        .side_effect()
        .build();
}

cpp_adapter::Json ComputeBufferTool::execute(
    const cpp_adapter::Json& arguments, cpp_adapter::ToolCallContext&) {
    const std::string& action = arguments.at("action").as_string();
    if (action == "create") {
        cpp_adapter::Json request = cpp_adapter::Json::object({
            {"base64", arguments.at("base64")},
        });
        if (arguments.contains("expiresAt")) {
            request["expiresAt"] = arguments.at("expiresAt");
        }
        return memory_->invoke(cpp_adapter::MemoryOperation::ComputeCreate, request);
    }
    if (action == "read") {
        return memory_->invoke(cpp_adapter::MemoryOperation::ComputeRead,
                               cpp_adapter::Json::object({{"id", arguments.at("id")}}));
    }
    if (action == "update") {
        return memory_->invoke(cpp_adapter::MemoryOperation::ComputeUpdate,
                               cpp_adapter::Json::object({
                                   {"id", arguments.at("id")},
                                   {"base64", arguments.at("base64")},
                               }));
    }
    if (action == "snapshot") {
        return memory_->invoke(cpp_adapter::MemoryOperation::ComputeSnapshot,
                               cpp_adapter::Json::object({{"id", arguments.at("id")}}));
    }
    if (action == "release") {
        return memory_->invoke(cpp_adapter::MemoryOperation::ComputeRelease,
                               cpp_adapter::Json::object({{"id", arguments.at("id")}}));
    }
    throw cpp_adapter::ToolError(
        "INVALID_COMPUTE_ACTION",
        "action must be create, read, update, snapshot, or release");
}

CPP_ADAPTER_REGISTER_PUBLIC_TOOL(ComputeBufferTool)

} // namespace axiom::tools
