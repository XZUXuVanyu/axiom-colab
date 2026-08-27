#pragma once

#include "cpp_adapter/json.hpp"

#include <array>
#include <cstdint>
#include <string>
#include <string_view>

namespace cpp_adapter {

inline constexpr std::string_view k_protocol_version = "1.0";
inline constexpr std::array<std::string_view, 4> k_protocol_capabilities = {
    "describe-tools",
    "tool-call",
    "input-schema-validation",
    "output-schema-validation",
};

struct ToolDescriptor final {
    std::string name;
    std::string description;
    std::string when_to_use;
    Json parameters;
    Json output;
    bool side_effect = false;
    std::int64_t timeout_ms = 5000;
    bool allow_parallel = false;
};

namespace schema {

class Schema final {
public:
    static Schema string();
    static Schema number();
    static Schema boolean();
    static Schema array(Schema items);
    static Schema object();

    Schema& description(std::string value);
    Schema& pattern(std::string value);
    Schema& min_length(std::int64_t value);
    Schema& max_length(std::int64_t value);
    Schema& minimum(double value);
    Schema& exclusive_minimum(double value);
    Schema& maximum(double value);
    Schema& min_items(std::int64_t value);
    Schema& max_items(std::int64_t value);
    Schema& constant(Json value);
    Schema& property(std::string name, Schema value, bool required = false);
    Schema& additional_properties(bool allowed);

    [[nodiscard]] Json build() &&;

private:
    explicit Schema(std::string type);
    explicit Schema(Json value);
    Json value_;
};

} // namespace schema

class ToolDescriptorBuilder final {
public:
    ToolDescriptorBuilder(std::string name, std::string description,
                          std::string when_to_use);

    ToolDescriptorBuilder& parameters(schema::Schema value);
    ToolDescriptorBuilder& output(schema::Schema value);
    ToolDescriptorBuilder& side_effect(bool value = true);
    ToolDescriptorBuilder& timeout_ms(std::int64_t value);
    ToolDescriptorBuilder& allow_parallel(bool value = true);
    [[nodiscard]] ToolDescriptor build();

private:
    ToolDescriptor descriptor_;
};

[[nodiscard]] Json descriptor_to_json(const ToolDescriptor& descriptor);
void validate_descriptor(const ToolDescriptor& descriptor);

} // namespace cpp_adapter
