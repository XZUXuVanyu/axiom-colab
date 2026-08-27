#pragma once

#include <cstdint>
#include <initializer_list>
#include <map>
#include <stdexcept>
#include <string>
#include <string_view>
#include <variant>
#include <vector>

namespace cpp_adapter {

class JsonParseError final : public std::runtime_error {
public:
    JsonParseError(std::string message, std::size_t offset);

    [[nodiscard]] std::size_t offset() const noexcept { return offset_; }

private:
    std::size_t offset_;
};

class Json final {
public:
    using array_t = std::vector<Json>;
    using object_t = std::map<std::string, Json, std::less<>>;
    using storage_t = std::variant<std::nullptr_t, bool, std::int64_t, double,
                                   std::string, array_t, object_t>;

    Json() noexcept;
    Json(std::nullptr_t) noexcept;
    Json(bool value) noexcept;
    Json(int value) noexcept;
    Json(std::int64_t value) noexcept;
    Json(double value);
    Json(const char* value);
    Json(std::string value);
    Json(array_t value);
    Json(object_t value);

    static Json array(std::initializer_list<Json> values = {});
    static Json object(
        std::initializer_list<std::pair<const std::string, Json>> values = {});
    static Json parse(std::string_view source);

    [[nodiscard]] std::string dump() const;

    [[nodiscard]] bool is_null() const noexcept;
    [[nodiscard]] bool is_bool() const noexcept;
    [[nodiscard]] bool is_integer() const noexcept;
    [[nodiscard]] bool is_number() const noexcept;
    [[nodiscard]] bool is_string() const noexcept;
    [[nodiscard]] bool is_array() const noexcept;
    [[nodiscard]] bool is_object() const noexcept;

    [[nodiscard]] bool as_bool() const;
    [[nodiscard]] std::int64_t as_integer() const;
    [[nodiscard]] double as_number() const;
    [[nodiscard]] const std::string& as_string() const;
    [[nodiscard]] const array_t& as_array() const;
    [[nodiscard]] array_t& as_array();
    [[nodiscard]] const object_t& as_object() const;
    [[nodiscard]] object_t& as_object();

    [[nodiscard]] std::size_t size() const;
    [[nodiscard]] bool contains(std::string_view key) const;
    [[nodiscard]] const Json* find(std::string_view key) const noexcept;
    [[nodiscard]] Json* find(std::string_view key) noexcept;
    [[nodiscard]] const Json& at(std::string_view key) const;
    [[nodiscard]] Json& at(std::string_view key);

    Json& operator[](std::string key);

    [[nodiscard]] const storage_t& storage() const noexcept { return value_; }

    friend bool operator==(const Json& left, const Json& right) noexcept;
    friend bool operator!=(const Json& left, const Json& right) noexcept {
        return !(left == right);
    }

private:
    storage_t value_;
};

} // namespace cpp_adapter
