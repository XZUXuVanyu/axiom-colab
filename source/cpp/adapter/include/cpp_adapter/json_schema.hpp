#pragma once

#include "cpp_adapter/json.hpp"

#include <string>
#include <vector>

namespace cpp_adapter {

struct SchemaViolation final {
    std::string path;
    std::string message;
};

class JsonSchemaValidator final {
public:
    static void assert_supported(const Json& schema,
                                 const std::string& schema_path = "$schema");

    [[nodiscard]] static std::vector<SchemaViolation>
    validate(const Json& schema, const Json& value,
             const std::string& value_path = "$");
};

[[nodiscard]] Json violations_to_json(
    const std::vector<SchemaViolation>& violations);

} // namespace cpp_adapter
