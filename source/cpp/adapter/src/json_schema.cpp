#include "cpp_adapter/json_schema.hpp"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <regex>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string_view>

namespace cpp_adapter {
namespace {

const std::set<std::string, std::less<>> supported_keywords = {
    "$schema", "$id", "title", "description", "default", "examples",
    "deprecated", "readOnly", "writeOnly", "format",
    "type", "enum", "const", "properties", "required",
    "additionalProperties", "minProperties", "maxProperties",
    "items", "minItems", "maxItems", "uniqueItems",
    "minLength", "maxLength", "pattern",
    "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
    "multipleOf", "allOf", "anyOf", "oneOf", "not",
};

const std::set<std::string, std::less<>> supported_types = {
    "null", "boolean", "integer", "number", "string", "array", "object",
};

[[noreturn]] void schema_error(const std::string& path,
                               const std::string& message) {
    throw std::invalid_argument("unsupported or invalid JSON Schema at " + path
                                + ": " + message);
}

bool is_schema(const Json& value) {
    return value.is_bool() || value.is_object();
}

void require_nonnegative_integer(const Json& value, const std::string& path) {
    if (!value.is_integer() || value.as_integer() < 0) {
        schema_error(path, "must be a non-negative integer");
    }
}

void assert_schema(const Json& schema, const std::string& path);

void assert_schema_array(const Json& value, const std::string& path) {
    if (!value.is_array() || value.as_array().empty()) {
        schema_error(path, "must be a non-empty array of schemas");
    }
    for (std::size_t index = 0; index < value.as_array().size(); ++index) {
        assert_schema(value.as_array()[index],
                      path + "[" + std::to_string(index) + "]");
    }
}

void assert_type_keyword(const Json& value, const std::string& path) {
    std::set<std::string, std::less<>> seen;
    const auto check = [&](const Json& item, const std::string& item_path) {
        if (!item.is_string() || !supported_types.contains(item.as_string())) {
            schema_error(item_path, "unknown JSON type");
        }
        if (!seen.insert(item.as_string()).second) {
            schema_error(item_path, "duplicate JSON type");
        }
    };

    if (value.is_string()) {
        check(value, path);
        return;
    }
    if (!value.is_array() || value.as_array().empty()) {
        schema_error(path, "must be a type string or non-empty type array");
    }
    for (std::size_t index = 0; index < value.as_array().size(); ++index) {
        check(value.as_array()[index],
              path + "[" + std::to_string(index) + "]");
    }
}

void assert_schema(const Json& schema, const std::string& path) {
    if (schema.is_bool()) {
        return;
    }
    if (!schema.is_object()) {
        schema_error(path, "schema must be an object or boolean");
    }

    for (const auto& [keyword, value] : schema.as_object()) {
        const std::string keyword_path = path + "." + keyword;
        if (!supported_keywords.contains(keyword)) {
            schema_error(keyword_path,
                         "keyword is not supported by protocol 1.0");
        }
        if (keyword == "type") {
            assert_type_keyword(value, keyword_path);
        } else if (keyword == "enum") {
            if (!value.is_array() || value.as_array().empty()) {
                schema_error(keyword_path, "must be a non-empty array");
            }
        } else if (keyword == "properties") {
            if (!value.is_object()) {
                schema_error(keyword_path, "must be an object");
            }
            for (const auto& [name, child] : value.as_object()) {
                assert_schema(child, keyword_path + "." + name);
            }
        } else if (keyword == "required") {
            if (!value.is_array()) {
                schema_error(keyword_path, "must be an array of unique strings");
            }
            std::set<std::string, std::less<>> required;
            for (std::size_t index = 0; index < value.as_array().size(); ++index) {
                const Json& item = value.as_array()[index];
                if (!item.is_string()
                    || !required.insert(item.as_string()).second) {
                    schema_error(keyword_path + "[" + std::to_string(index) + "]",
                                 "must be a unique string");
                }
            }
        } else if (keyword == "additionalProperties" || keyword == "items"
                   || keyword == "not") {
            if (!is_schema(value)) {
                schema_error(keyword_path, "must be a schema");
            }
            assert_schema(value, keyword_path);
        } else if (keyword == "allOf" || keyword == "anyOf"
                   || keyword == "oneOf") {
            assert_schema_array(value, keyword_path);
        } else if (keyword == "minProperties" || keyword == "maxProperties"
                   || keyword == "minItems" || keyword == "maxItems"
                   || keyword == "minLength" || keyword == "maxLength") {
            require_nonnegative_integer(value, keyword_path);
        } else if (keyword == "minimum" || keyword == "maximum"
                   || keyword == "exclusiveMinimum"
                   || keyword == "exclusiveMaximum"
                   || keyword == "multipleOf") {
            if (!value.is_number()) {
                schema_error(keyword_path, "must be a finite number");
            }
            if (keyword == "multipleOf" && value.as_number() <= 0.0) {
                schema_error(keyword_path, "must be greater than zero");
            }
        } else if (keyword == "pattern") {
            if (!value.is_string()) {
                schema_error(keyword_path, "must be a string");
            }
            try {
                static_cast<void>(std::regex(value.as_string(),
                                             std::regex::ECMAScript));
            } catch (const std::regex_error& error) {
                schema_error(keyword_path,
                             std::string("invalid ECMAScript regex: ")
                                 + error.what());
            }
        } else if (keyword == "uniqueItems" || keyword == "deprecated"
                   || keyword == "readOnly" || keyword == "writeOnly") {
            if (!value.is_bool()) {
                schema_error(keyword_path, "must be a boolean");
            }
        } else if (keyword == "$schema" || keyword == "$id"
                   || keyword == "title" || keyword == "description"
                   || keyword == "format") {
            if (!value.is_string()) {
                schema_error(keyword_path, "must be a string");
            }
        } else if (keyword == "examples" && !value.is_array()) {
            schema_error(keyword_path, "must be an array");
        }
        // const/default are deliberately unconstrained JSON annotations/values.
    }

    const Json* minimum = schema.find("minimum");
    const Json* maximum = schema.find("maximum");
    if (minimum != nullptr && maximum != nullptr
        && minimum->as_number() > maximum->as_number()) {
        schema_error(path, "minimum must not exceed maximum");
    }
    const auto compare_cardinality = [&](std::string_view minimum_key,
                                         std::string_view maximum_key) {
        const Json* min_value = schema.find(minimum_key);
        const Json* max_value = schema.find(maximum_key);
        if (min_value != nullptr && max_value != nullptr
            && min_value->as_integer() > max_value->as_integer()) {
            schema_error(path, std::string(minimum_key)
                                   + " must not exceed "
                                   + std::string(maximum_key));
        }
    };
    compare_cardinality("minProperties", "maxProperties");
    compare_cardinality("minItems", "maxItems");
    compare_cardinality("minLength", "maxLength");
}

bool matches_type(std::string_view expected, const Json& value) {
    if (expected == "null") return value.is_null();
    if (expected == "boolean") return value.is_bool();
    if (expected == "integer") {
        return value.is_integer()
            || (value.is_number() && std::floor(value.as_number()) == value.as_number());
    }
    if (expected == "number") return value.is_number();
    if (expected == "string") return value.is_string();
    if (expected == "array") return value.is_array();
    if (expected == "object") return value.is_object();
    return false;
}

bool matches_declared_type(const Json& type, const Json& value) {
    if (type.is_string()) {
        return matches_type(type.as_string(), value);
    }
    return std::any_of(type.as_array().begin(), type.as_array().end(),
                       [&](const Json& item) {
                           return matches_type(item.as_string(), value);
                       });
}

std::string declared_type_text(const Json& type) {
    if (type.is_string()) return type.as_string();
    std::string result;
    for (const Json& item : type.as_array()) {
        if (!result.empty()) result += " | ";
        result += item.as_string();
    }
    return result;
}

std::size_t utf8_code_points(std::string_view text) {
    std::size_t count = 0;
    for (const unsigned char ch : text) {
        if ((ch & 0xc0U) != 0x80U) ++count;
    }
    return count;
}

std::string property_path(const std::string& base, const std::string& property) {
    const bool simple = !property.empty()
        && (std::isalpha(static_cast<unsigned char>(property.front()))
            || property.front() == '_')
        && std::all_of(property.begin() + 1, property.end(), [](unsigned char ch) {
               return std::isalnum(ch) || ch == '_';
           });
    if (simple) return base + "." + property;
    return base + "[" + Json(property).dump() + "]";
}

void validate_schema(const Json& schema, const Json& value,
                     const std::string& path,
                     std::vector<SchemaViolation>& violations);

bool schema_matches(const Json& schema, const Json& value) {
    std::vector<SchemaViolation> local;
    validate_schema(schema, value, "$", local);
    return local.empty();
}

void add_violation(std::vector<SchemaViolation>& violations,
                   const std::string& path, std::string message) {
    violations.push_back({path, std::move(message)});
}

void validate_combinators(const Json& schema, const Json& value,
                          const std::string& path,
                          std::vector<SchemaViolation>& violations) {
    if (const Json* all = schema.find("allOf")) {
        for (const Json& child : all->as_array()) {
            validate_schema(child, value, path, violations);
        }
    }
    if (const Json* any = schema.find("anyOf")) {
        const bool matched = std::any_of(any->as_array().begin(),
                                         any->as_array().end(),
                                         [&](const Json& child) {
                                             return schema_matches(child, value);
                                         });
        if (!matched) add_violation(violations, path, "does not match anyOf");
    }
    if (const Json* one = schema.find("oneOf")) {
        const std::size_t matches = static_cast<std::size_t>(std::count_if(
            one->as_array().begin(), one->as_array().end(),
            [&](const Json& child) { return schema_matches(child, value); }));
        if (matches != 1) {
            add_violation(violations, path,
                          "must match exactly one oneOf branch; matched "
                              + std::to_string(matches));
        }
    }
    if (const Json* negated = schema.find("not")) {
        if (schema_matches(*negated, value)) {
            add_violation(violations, path, "matches forbidden not schema");
        }
    }
}

void validate_object(const Json& schema, const Json& value,
                     const std::string& path,
                     std::vector<SchemaViolation>& violations) {
    if (!value.is_object()) return;
    if (const Json* min = schema.find("minProperties")) {
        if (value.size() < static_cast<std::size_t>(min->as_integer())) {
            add_violation(violations, path, "has fewer properties than minProperties");
        }
    }
    if (const Json* max = schema.find("maxProperties")) {
        if (value.size() > static_cast<std::size_t>(max->as_integer())) {
            add_violation(violations, path, "has more properties than maxProperties");
        }
    }
    if (const Json* required = schema.find("required")) {
        for (const Json& item : required->as_array()) {
            if (!value.contains(item.as_string())) {
                add_violation(violations, property_path(path, item.as_string()),
                              "is required");
            }
        }
    }

    const Json* properties = schema.find("properties");
    const Json* additional = schema.find("additionalProperties");
    for (const auto& [name, property_value] : value.as_object()) {
        const Json* property_schema =
            properties == nullptr ? nullptr : properties->find(name);
        const std::string child_path = property_path(path, name);
        if (property_schema != nullptr) {
            validate_schema(*property_schema, property_value, child_path,
                            violations);
        } else if (additional != nullptr) {
            if (additional->is_bool() && !additional->as_bool()) {
                add_violation(violations, child_path,
                              "is not allowed by additionalProperties=false");
            } else if (!additional->is_bool()) {
                validate_schema(*additional, property_value, child_path,
                                violations);
            }
        }
    }
}

void validate_array(const Json& schema, const Json& value,
                    const std::string& path,
                    std::vector<SchemaViolation>& violations) {
    if (!value.is_array()) return;
    if (const Json* min = schema.find("minItems")) {
        if (value.size() < static_cast<std::size_t>(min->as_integer())) {
            add_violation(violations, path, "has fewer items than minItems");
        }
    }
    if (const Json* max = schema.find("maxItems")) {
        if (value.size() > static_cast<std::size_t>(max->as_integer())) {
            add_violation(violations, path, "has more items than maxItems");
        }
    }
    if (const Json* unique = schema.find("uniqueItems");
        unique != nullptr && unique->as_bool()) {
        for (std::size_t left = 0; left < value.as_array().size(); ++left) {
            for (std::size_t right = left + 1; right < value.as_array().size();
                 ++right) {
                if (value.as_array()[left] == value.as_array()[right]) {
                    add_violation(violations,
                                  path + "[" + std::to_string(right) + "]",
                                  "duplicates an earlier item while uniqueItems=true");
                }
            }
        }
    }
    if (const Json* items = schema.find("items")) {
        for (std::size_t index = 0; index < value.as_array().size(); ++index) {
            validate_schema(*items, value.as_array()[index],
                            path + "[" + std::to_string(index) + "]",
                            violations);
        }
    }
}

void validate_string(const Json& schema, const Json& value,
                     const std::string& path,
                     std::vector<SchemaViolation>& violations) {
    if (!value.is_string()) return;
    const std::size_t length = utf8_code_points(value.as_string());
    if (const Json* min = schema.find("minLength")) {
        if (length < static_cast<std::size_t>(min->as_integer())) {
            add_violation(violations, path, "is shorter than minLength");
        }
    }
    if (const Json* max = schema.find("maxLength")) {
        if (length > static_cast<std::size_t>(max->as_integer())) {
            add_violation(violations, path, "is longer than maxLength");
        }
    }
    if (const Json* pattern = schema.find("pattern")) {
        const std::regex expression(pattern->as_string(), std::regex::ECMAScript);
        if (!std::regex_search(value.as_string(), expression)) {
            add_violation(violations, path, "does not match pattern");
        }
    }
}

void validate_number(const Json& schema, const Json& value,
                     const std::string& path,
                     std::vector<SchemaViolation>& violations) {
    if (!value.is_number()) return;
    const double number = value.as_number();
    if (const Json* bound = schema.find("minimum");
        bound != nullptr && number < bound->as_number()) {
        add_violation(violations, path, "is less than minimum");
    }
    if (const Json* bound = schema.find("maximum");
        bound != nullptr && number > bound->as_number()) {
        add_violation(violations, path, "is greater than maximum");
    }
    if (const Json* bound = schema.find("exclusiveMinimum");
        bound != nullptr && number <= bound->as_number()) {
        add_violation(violations, path, "is not greater than exclusiveMinimum");
    }
    if (const Json* bound = schema.find("exclusiveMaximum");
        bound != nullptr && number >= bound->as_number()) {
        add_violation(violations, path, "is not less than exclusiveMaximum");
    }
    if (const Json* divisor = schema.find("multipleOf")) {
        const double ratio = number / divisor->as_number();
        const double nearest = std::round(ratio);
        const double tolerance = 1e-12 * std::max(1.0, std::abs(ratio));
        if (std::abs(ratio - nearest) > tolerance) {
            add_violation(violations, path, "is not a multipleOf value");
        }
    }
}

void validate_schema(const Json& schema, const Json& value,
                     const std::string& path,
                     std::vector<SchemaViolation>& violations) {
    if (schema.is_bool()) {
        if (!schema.as_bool()) {
            add_violation(violations, path, "is rejected by false schema");
        }
        return;
    }

    if (const Json* type = schema.find("type")) {
        if (!matches_declared_type(*type, value)) {
            add_violation(violations, path,
                          "must have type " + declared_type_text(*type));
            return;
        }
    }

    if (const Json* enumeration = schema.find("enum")) {
        if (std::none_of(enumeration->as_array().begin(),
                         enumeration->as_array().end(),
                         [&](const Json& item) { return item == value; })) {
            add_violation(violations, path, "is not one of the enum values");
        }
    }
    if (const Json* constant = schema.find("const")) {
        if (*constant != value) {
            add_violation(violations, path, "does not equal const value");
        }
    }

    validate_combinators(schema, value, path, violations);
    validate_object(schema, value, path, violations);
    validate_array(schema, value, path, violations);
    validate_string(schema, value, path, violations);
    validate_number(schema, value, path, violations);
}

} // namespace

void JsonSchemaValidator::assert_supported(const Json& schema,
                                           const std::string& schema_path) {
    assert_schema(schema, schema_path);
}

std::vector<SchemaViolation>
JsonSchemaValidator::validate(const Json& schema, const Json& value,
                              const std::string& value_path) {
    assert_supported(schema);
    std::vector<SchemaViolation> violations;
    validate_schema(schema, value, value_path, violations);
    return violations;
}

Json violations_to_json(const std::vector<SchemaViolation>& violations) {
    Json::array_t result;
    result.reserve(violations.size());
    for (const SchemaViolation& violation : violations) {
        result.push_back(Json::object({
            {"path", violation.path},
            {"message", violation.message},
        }));
    }
    return result;
}

} // namespace cpp_adapter
