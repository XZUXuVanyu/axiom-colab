#include "derive_artifact_tool.hpp"

namespace axiom::tools {

cpp_adapter::ToolDescriptor DeriveArtifactTool::descriptor() {
    using cpp_adapter::ToolDescriptorBuilder;
    using cpp_adapter::schema::Schema;
    return ToolDescriptorBuilder(
               "derive_artifact",
               "Create an immutable, provenance-linked copy of an artifact.",
               "Use when a deterministic research step must seal an existing artifact as a new derivation.")
        .parameters(Schema::object()
            .property("parentId", Schema::string(), true))
        .output(Schema::object().additional_properties(true))
        .side_effect()
        .build();
}

cpp_adapter::Json DeriveArtifactTool::execute(
    const cpp_adapter::Json& arguments, cpp_adapter::ToolCallContext&) {
    const cpp_adapter::Json payload = memory_->invoke(
        cpp_adapter::MemoryOperation::ArtifactRead,
        cpp_adapter::Json::object({{"id", arguments.at("parentId")}}));
    return memory_->invoke(
        cpp_adapter::MemoryOperation::ArtifactDerive,
        cpp_adapter::Json::object({
            {"parentIds", cpp_adapter::Json::array({arguments.at("parentId")})},
            {"base64", payload.at("base64")},
            {"schema", cpp_adapter::Json::object({
                {"type", "string"}, {"contentEncoding", "base64"},
            })},
            {"provenance", cpp_adapter::Json::object({
                {"operation", "artifact.copy"},
                {"parametersHash", "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a"},
                {"softwareVersion", "1.0.0"},
                {"validationId", nullptr},
            })},
        }));
}

CPP_ADAPTER_REGISTER_PUBLIC_TOOL(DeriveArtifactTool)

} // namespace axiom::tools
