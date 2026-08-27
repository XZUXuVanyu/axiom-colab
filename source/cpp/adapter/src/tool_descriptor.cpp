#include "cpp_adapter/tool_descriptor.hpp"

#include "cpp_adapter/json_schema.hpp"

#include <cctype>
#include <stdexcept>

namespace cpp_adapter {
namespace {

bool valid_tool_name(const std::string& name) {
    if (name.empty() || name.size() > 128
        || name.front() < 'a' || name.front() > 'z') {
        return false;
    }
    for (const unsigned char ch : name) {
        if (!(ch >= 'a' && ch <= 'z')
            && !(ch >= '0' && ch <= '9') && ch != '_') {
            return false;
        }
    }
    return true;
}

} // namespace

namespace schema {

Schema::Schema(std::string type)
    : value_(Json::object({{"type", std::move(type)}})) {}

Schema::Schema(Json value) : value_(std::move(value)) {}

Schema Schema::string() { return Schema(std::string("string")); }
Schema Schema::number() { return Schema(std::string("number")); }
Schema Schema::boolean() { return Schema(std::string("boolean")); }
Schema Schema::array(Schema items) {
    return Schema(Json::object({
        {"type", "array"}, {"items", std::move(items).build()},
    }));
}
Schema Schema::object() {
    return Schema(Json::object({
        {"type", "object"},
        {"properties", Json::object()},
        {"additionalProperties", false},
    }));
}

Schema& Schema::description(std::string value) { value_["description"] = std::move(value); return *this; }
Schema& Schema::pattern(std::string value) { value_["pattern"] = std::move(value); return *this; }
Schema& Schema::min_length(std::int64_t value) { value_["minLength"] = value; return *this; }
Schema& Schema::max_length(std::int64_t value) { value_["maxLength"] = value; return *this; }
Schema& Schema::minimum(double value) { value_["minimum"] = value; return *this; }
Schema& Schema::exclusive_minimum(double value) { value_["exclusiveMinimum"] = value; return *this; }
Schema& Schema::maximum(double value) { value_["maximum"] = value; return *this; }
Schema& Schema::min_items(std::int64_t value) { value_["minItems"] = value; return *this; }
Schema& Schema::max_items(std::int64_t value) { value_["maxItems"] = value; return *this; }
Schema& Schema::constant(Json value) { value_["const"] = std::move(value); return *this; }
Schema& Schema::property(std::string name, Schema value, bool required) {
    value_["properties"][name] = std::move(value).build();
    if (required) {
        if (!value_.contains("required")) value_["required"] = Json::array();
        value_["required"].as_array().emplace_back(std::move(name));
    }
    return *this;
}
Schema& Schema::additional_properties(bool allowed) { value_["additionalProperties"] = allowed; return *this; }
Json Schema::build() && { return std::move(value_); }

} // namespace schema

ToolDescriptorBuilder::ToolDescriptorBuilder(
    std::string name, std::string description, std::string when_to_use)
    : descriptor_{.name = std::move(name),
                  .description = std::move(description),
                  .when_to_use = std::move(when_to_use)} {}

ToolDescriptorBuilder& ToolDescriptorBuilder::parameters(schema::Schema value) {
    descriptor_.parameters = std::move(value).build(); return *this;
}
ToolDescriptorBuilder& ToolDescriptorBuilder::output(schema::Schema value) {
    descriptor_.output = std::move(value).build(); return *this;
}
ToolDescriptorBuilder& ToolDescriptorBuilder::side_effect(bool value) { descriptor_.side_effect = value; return *this; }
ToolDescriptorBuilder& ToolDescriptorBuilder::timeout_ms(std::int64_t value) { descriptor_.timeout_ms = value; return *this; }
ToolDescriptorBuilder& ToolDescriptorBuilder::allow_parallel(bool value) { descriptor_.allow_parallel = value; return *this; }
ToolDescriptor ToolDescriptorBuilder::build() {
    validate_descriptor(descriptor_);
    return std::move(descriptor_);
}

Json descriptor_to_json(const ToolDescriptor& descriptor) {
    return Json::object({
        {"name", descriptor.name},
        {"description", descriptor.description},
        {"whenToUse", descriptor.when_to_use},
        {"parameters", descriptor.parameters},
        {"output", descriptor.output},
        {"timeoutMs", descriptor.timeout_ms},
        {"allowParallel", descriptor.allow_parallel},
        {"sideEffect", descriptor.side_effect},
    });
}

void validate_descriptor(const ToolDescriptor& descriptor) {
    if (!valid_tool_name(descriptor.name)) {
        throw std::invalid_argument(
            "tool name must match ^[a-z][a-z0-9_]{0,127}$");
    }
    if (descriptor.description.empty()) {
        throw std::invalid_argument("tool description must not be empty");
    }
    if (descriptor.when_to_use.empty()) {
        throw std::invalid_argument("tool whenToUse must not be empty");
    }
    if (!descriptor.parameters.is_object()) {
        throw std::invalid_argument("tool parameters schema must be an object");
    }
    if (descriptor.timeout_ms <= 0 || descriptor.timeout_ms > 3'600'000) {
        throw std::invalid_argument(
            "tool timeoutMs must be in the range 1..3600000");
    }
    JsonSchemaValidator::assert_supported(descriptor.parameters,
                                          "$.parameters");
    JsonSchemaValidator::assert_supported(descriptor.output, "$.output");
}

} // namespace cpp_adapter
