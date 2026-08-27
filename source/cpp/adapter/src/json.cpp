#include "cpp_adapter/json.hpp"

#include <charconv>
#include <cmath>
#include <iomanip>
#include <iterator>
#include <limits>
#include <sstream>
#include <system_error>

namespace cpp_adapter {
namespace {

[[noreturn]] void throw_type(const char* expected) {
    throw std::logic_error(std::string("JSON value is not ") + expected);
}

void append_utf8(std::string& output, std::uint32_t code_point) {
    if (code_point <= 0x7fU) {
        output.push_back(static_cast<char>(code_point));
    } else if (code_point <= 0x7ffU) {
        output.push_back(static_cast<char>(0xc0U | (code_point >> 6U)));
        output.push_back(static_cast<char>(0x80U | (code_point & 0x3fU)));
    } else if (code_point <= 0xffffU) {
        output.push_back(static_cast<char>(0xe0U | (code_point >> 12U)));
        output.push_back(static_cast<char>(0x80U | ((code_point >> 6U) & 0x3fU)));
        output.push_back(static_cast<char>(0x80U | (code_point & 0x3fU)));
    } else if (code_point <= 0x10ffffU) {
        output.push_back(static_cast<char>(0xf0U | (code_point >> 18U)));
        output.push_back(static_cast<char>(0x80U | ((code_point >> 12U) & 0x3fU)));
        output.push_back(static_cast<char>(0x80U | ((code_point >> 6U) & 0x3fU)));
        output.push_back(static_cast<char>(0x80U | (code_point & 0x3fU)));
    } else {
        throw std::logic_error("invalid Unicode code point");
    }
}

bool valid_utf8(std::string_view input) {
    std::size_t index = 0;
    while (index < input.size()) {
        const auto first = static_cast<unsigned char>(input[index]);
        if (first <= 0x7fU) {
            ++index;
            continue;
        }

        std::size_t width = 0;
        std::uint32_t code_point = 0;
        if ((first & 0xe0U) == 0xc0U) {
            width = 2;
            code_point = first & 0x1fU;
        } else if ((first & 0xf0U) == 0xe0U) {
            width = 3;
            code_point = first & 0x0fU;
        } else if ((first & 0xf8U) == 0xf0U) {
            width = 4;
            code_point = first & 0x07U;
        } else {
            return false;
        }
        if (index + width > input.size()) {
            return false;
        }
        for (std::size_t offset = 1; offset < width; ++offset) {
            const auto continuation =
                static_cast<unsigned char>(input[index + offset]);
            if ((continuation & 0xc0U) != 0x80U) {
                return false;
            }
            code_point = (code_point << 6U) | (continuation & 0x3fU);
        }
        const bool overlong = (width == 2 && code_point < 0x80U)
            || (width == 3 && code_point < 0x800U)
            || (width == 4 && code_point < 0x10000U);
        if (overlong || code_point > 0x10ffffU
            || (code_point >= 0xd800U && code_point <= 0xdfffU)) {
            return false;
        }
        index += width;
    }
    return true;
}

class Parser final {
public:
    explicit Parser(std::string_view source) : source_(source) {}

    Json parse_document() {
        if (!valid_utf8(source_)) {
            fail("input is not valid UTF-8");
        }
        skip_whitespace();
        Json result = parse_value();
        skip_whitespace();
        if (position_ != source_.size()) {
            fail("unexpected trailing characters");
        }
        return result;
    }

private:
    [[noreturn]] void fail(std::string message) const {
        throw JsonParseError(std::move(message), position_);
    }

    [[nodiscard]] char peek() const {
        if (position_ >= source_.size()) {
            fail("unexpected end of JSON input");
        }
        return source_[position_];
    }

    char consume() {
        const char result = peek();
        ++position_;
        return result;
    }

    void expect(char expected) {
        if (consume() != expected) {
            fail(std::string("expected '") + expected + "'");
        }
    }

    void skip_whitespace() {
        while (position_ < source_.size()) {
            const char ch = source_[position_];
            if (ch != ' ' && ch != '\t' && ch != '\r' && ch != '\n') {
                break;
            }
            ++position_;
        }
    }

    Json parse_value() {
        switch (peek()) {
        case 'n':
            parse_literal("null");
            return nullptr;
        case 't':
            parse_literal("true");
            return true;
        case 'f':
            parse_literal("false");
            return false;
        case '"':
            return parse_string();
        case '[':
            return parse_array();
        case '{':
            return parse_object();
        default:
            if (peek() == '-' || (peek() >= '0' && peek() <= '9')) {
                return parse_number();
            }
            fail("unexpected token");
        }
    }

    void parse_literal(std::string_view literal) {
        if (source_.substr(position_, literal.size()) != literal) {
            fail("invalid literal");
        }
        position_ += literal.size();
    }

    static int hex_digit(char ch) {
        if (ch >= '0' && ch <= '9') {
            return ch - '0';
        }
        if (ch >= 'a' && ch <= 'f') {
            return 10 + ch - 'a';
        }
        if (ch >= 'A' && ch <= 'F') {
            return 10 + ch - 'A';
        }
        return -1;
    }

    std::uint16_t parse_hex_quad() {
        if (position_ + 4 > source_.size()) {
            fail("incomplete Unicode escape");
        }
        std::uint16_t value = 0;
        for (int index = 0; index < 4; ++index) {
            const int digit = hex_digit(source_[position_++]);
            if (digit < 0) {
                fail("invalid Unicode escape");
            }
            value = static_cast<std::uint16_t>((value << 4U) | digit);
        }
        return value;
    }

    std::string parse_string() {
        expect('"');
        std::string result;
        while (true) {
            if (position_ >= source_.size()) {
                fail("unterminated string");
            }
            const unsigned char ch =
                static_cast<unsigned char>(source_[position_++]);
            if (ch == '"') {
                return result;
            }
            if (ch < 0x20U) {
                fail("unescaped control character in string");
            }
            if (ch != '\\') {
                result.push_back(static_cast<char>(ch));
                continue;
            }

            if (position_ >= source_.size()) {
                fail("incomplete escape sequence");
            }
            const char escaped = source_[position_++];
            switch (escaped) {
            case '"': result.push_back('"'); break;
            case '\\': result.push_back('\\'); break;
            case '/': result.push_back('/'); break;
            case 'b': result.push_back('\b'); break;
            case 'f': result.push_back('\f'); break;
            case 'n': result.push_back('\n'); break;
            case 'r': result.push_back('\r'); break;
            case 't': result.push_back('\t'); break;
            case 'u': {
                const std::uint16_t first = parse_hex_quad();
                if (first >= 0xd800U && first <= 0xdbffU) {
                    if (position_ + 2 > source_.size()
                        || source_[position_] != '\\'
                        || source_[position_ + 1] != 'u') {
                        fail("high surrogate is not followed by a low surrogate");
                    }
                    position_ += 2;
                    const std::uint16_t second = parse_hex_quad();
                    if (second < 0xdc00U || second > 0xdfffU) {
                        fail("invalid low surrogate");
                    }
                    const std::uint32_t code_point = 0x10000U
                        + ((static_cast<std::uint32_t>(first) - 0xd800U) << 10U)
                        + (static_cast<std::uint32_t>(second) - 0xdc00U);
                    append_utf8(result, code_point);
                } else if (first >= 0xdc00U && first <= 0xdfffU) {
                    fail("unexpected low surrogate");
                } else {
                    append_utf8(result, first);
                }
                break;
            }
            default:
                fail("invalid escape sequence");
            }
        }
    }

    Json parse_array() {
        expect('[');
        skip_whitespace();
        Json::array_t result;
        if (peek() == ']') {
            ++position_;
            return result;
        }
        while (true) {
            skip_whitespace();
            result.push_back(parse_value());
            skip_whitespace();
            const char separator = consume();
            if (separator == ']') {
                return result;
            }
            if (separator != ',') {
                fail("expected ',' or ']' in array");
            }
            skip_whitespace();
        }
    }

    Json parse_object() {
        expect('{');
        skip_whitespace();
        Json::object_t result;
        if (peek() == '}') {
            ++position_;
            return result;
        }
        while (true) {
            skip_whitespace();
            if (peek() != '"') {
                fail("object key must be a string");
            }
            std::string key = parse_string();
            skip_whitespace();
            expect(':');
            skip_whitespace();
            Json value = parse_value();
            if (!result.emplace(std::move(key), std::move(value)).second) {
                fail("duplicate object key");
            }
            skip_whitespace();
            const char separator = consume();
            if (separator == '}') {
                return result;
            }
            if (separator != ',') {
                fail("expected ',' or '}' in object");
            }
            skip_whitespace();
        }
    }

    Json parse_number() {
        const std::size_t begin = position_;
        if (peek() == '-') {
            ++position_;
        }
        if (position_ >= source_.size()) {
            fail("incomplete number");
        }
        if (source_[position_] == '0') {
            ++position_;
            if (position_ < source_.size()
                && source_[position_] >= '0' && source_[position_] <= '9') {
                fail("leading zero in number");
            }
        } else {
            if (source_[position_] < '1' || source_[position_] > '9') {
                fail("invalid number");
            }
            while (position_ < source_.size()
                   && source_[position_] >= '0' && source_[position_] <= '9') {
                ++position_;
            }
        }

        bool floating = false;
        if (position_ < source_.size() && source_[position_] == '.') {
            floating = true;
            ++position_;
            const std::size_t fraction_begin = position_;
            while (position_ < source_.size()
                   && source_[position_] >= '0' && source_[position_] <= '9') {
                ++position_;
            }
            if (fraction_begin == position_) {
                fail("fraction requires at least one digit");
            }
        }
        if (position_ < source_.size()
            && (source_[position_] == 'e' || source_[position_] == 'E')) {
            floating = true;
            ++position_;
            if (position_ < source_.size()
                && (source_[position_] == '+' || source_[position_] == '-')) {
                ++position_;
            }
            const std::size_t exponent_begin = position_;
            while (position_ < source_.size()
                   && source_[position_] >= '0' && source_[position_] <= '9') {
                ++position_;
            }
            if (exponent_begin == position_) {
                fail("exponent requires at least one digit");
            }
        }

        const std::string_view token = source_.substr(begin, position_ - begin);
        if (!floating) {
            std::int64_t integer = 0;
            const auto integer_result =
                std::from_chars(token.data(), token.data() + token.size(), integer);
            if (integer_result.ec == std::errc{}
                && integer_result.ptr == token.data() + token.size()) {
                return integer;
            }
        }

        double number = 0.0;
        const auto number_result =
            std::from_chars(token.data(), token.data() + token.size(), number,
                            std::chars_format::general);
        if (number_result.ec != std::errc{}
            || number_result.ptr != token.data() + token.size()
            || !std::isfinite(number)) {
            fail("number is outside the supported finite range");
        }
        return number;
    }

    std::string_view source_;
    std::size_t position_ = 0;
};

void dump_string(std::string& output, std::string_view value) {
    static constexpr char hex[] = "0123456789abcdef";
    output.push_back('"');
    for (const unsigned char ch : value) {
        switch (ch) {
        case '"': output += "\\\""; break;
        case '\\': output += "\\\\"; break;
        case '\b': output += "\\b"; break;
        case '\f': output += "\\f"; break;
        case '\n': output += "\\n"; break;
        case '\r': output += "\\r"; break;
        case '\t': output += "\\t"; break;
        default:
            if (ch < 0x20U) {
                output += "\\u00";
                output.push_back(hex[(ch >> 4U) & 0x0fU]);
                output.push_back(hex[ch & 0x0fU]);
            } else {
                output.push_back(static_cast<char>(ch));
            }
        }
    }
    output.push_back('"');
}

void dump_json(std::string& output, const Json& value) {
    if (value.is_null()) {
        output += "null";
    } else if (value.is_bool()) {
        output += value.as_bool() ? "true" : "false";
    } else if (value.is_integer()) {
        char buffer[32];
        const auto result = std::to_chars(std::begin(buffer), std::end(buffer),
                                          value.as_integer());
        output.append(buffer, result.ptr);
    } else if (value.is_number()) {
        char buffer[64];
        // The no-precision overload emits the shortest representation that
        // round-trips to the same binary64 value (for example 0.1, not the
        // noisier 0.10000000000000001).
        const auto result = std::to_chars(
            std::begin(buffer), std::end(buffer), value.as_number(),
            std::chars_format::general);
        if (result.ec != std::errc{}) {
            throw std::runtime_error("failed to serialize JSON number");
        }
        output.append(buffer, result.ptr);
    } else if (value.is_string()) {
        dump_string(output, value.as_string());
    } else if (value.is_array()) {
        output.push_back('[');
        bool first = true;
        for (const Json& item : value.as_array()) {
            if (!first) {
                output.push_back(',');
            }
            first = false;
            dump_json(output, item);
        }
        output.push_back(']');
    } else {
        output.push_back('{');
        bool first = true;
        for (const auto& [key, item] : value.as_object()) {
            if (!first) {
                output.push_back(',');
            }
            first = false;
            dump_string(output, key);
            output.push_back(':');
            dump_json(output, item);
        }
        output.push_back('}');
    }
}

} // namespace

JsonParseError::JsonParseError(std::string message, std::size_t offset)
    : std::runtime_error(std::move(message) + " at byte " + std::to_string(offset)),
      offset_(offset) {}

Json::Json() noexcept : value_(nullptr) {}
Json::Json(std::nullptr_t) noexcept : value_(nullptr) {}
Json::Json(bool value) noexcept : value_(value) {}
Json::Json(int value) noexcept : value_(static_cast<std::int64_t>(value)) {}
Json::Json(std::int64_t value) noexcept : value_(value) {}
Json::Json(double value) : value_(value) {
    if (!std::isfinite(value)) {
        throw std::invalid_argument("JSON numbers must be finite");
    }
}
Json::Json(const char* value) : value_(std::string(value)) {}
Json::Json(std::string value) : value_(std::move(value)) {}
Json::Json(array_t value) : value_(std::move(value)) {}
Json::Json(object_t value) : value_(std::move(value)) {}

Json Json::array(std::initializer_list<Json> values) {
    return array_t(values);
}

Json Json::object(
    std::initializer_list<std::pair<const std::string, Json>> values) {
    object_t result;
    for (const auto& [key, value] : values) {
        if (!result.emplace(key, value).second) {
            throw std::invalid_argument("duplicate JSON object key: " + key);
        }
    }
    return result;
}

Json Json::parse(std::string_view source) {
    return Parser(source).parse_document();
}

std::string Json::dump() const {
    std::string result;
    result.reserve(128);
    dump_json(result, *this);
    return result;
}

bool Json::is_null() const noexcept { return std::holds_alternative<std::nullptr_t>(value_); }
bool Json::is_bool() const noexcept { return std::holds_alternative<bool>(value_); }
bool Json::is_integer() const noexcept { return std::holds_alternative<std::int64_t>(value_); }
bool Json::is_number() const noexcept { return is_integer() || std::holds_alternative<double>(value_); }
bool Json::is_string() const noexcept { return std::holds_alternative<std::string>(value_); }
bool Json::is_array() const noexcept { return std::holds_alternative<array_t>(value_); }
bool Json::is_object() const noexcept { return std::holds_alternative<object_t>(value_); }

bool Json::as_bool() const {
    if (!is_bool()) throw_type("a boolean");
    return std::get<bool>(value_);
}

std::int64_t Json::as_integer() const {
    if (!is_integer()) throw_type("an integer");
    return std::get<std::int64_t>(value_);
}

double Json::as_number() const {
    if (is_integer()) {
        return static_cast<double>(std::get<std::int64_t>(value_));
    }
    if (!std::holds_alternative<double>(value_)) throw_type("a number");
    return std::get<double>(value_);
}

const std::string& Json::as_string() const {
    if (!is_string()) throw_type("a string");
    return std::get<std::string>(value_);
}

const Json::array_t& Json::as_array() const {
    if (!is_array()) throw_type("an array");
    return std::get<array_t>(value_);
}

Json::array_t& Json::as_array() {
    if (!is_array()) throw_type("an array");
    return std::get<array_t>(value_);
}

const Json::object_t& Json::as_object() const {
    if (!is_object()) throw_type("an object");
    return std::get<object_t>(value_);
}

Json::object_t& Json::as_object() {
    if (!is_object()) throw_type("an object");
    return std::get<object_t>(value_);
}

std::size_t Json::size() const {
    if (is_array()) return as_array().size();
    if (is_object()) return as_object().size();
    if (is_string()) return as_string().size();
    throw_type("a sized value");
}

bool Json::contains(std::string_view key) const {
    return find(key) != nullptr;
}

const Json* Json::find(std::string_view key) const noexcept {
    if (!is_object()) return nullptr;
    const auto iterator = as_object().find(key);
    return iterator == as_object().end() ? nullptr : &iterator->second;
}

Json* Json::find(std::string_view key) noexcept {
    if (!is_object()) return nullptr;
    const auto iterator = as_object().find(key);
    return iterator == as_object().end() ? nullptr : &iterator->second;
}

const Json& Json::at(std::string_view key) const {
    const Json* value = find(key);
    if (value == nullptr) {
        throw std::out_of_range("missing JSON object key: " + std::string(key));
    }
    return *value;
}

Json& Json::at(std::string_view key) {
    Json* value = find(key);
    if (value == nullptr) {
        throw std::out_of_range("missing JSON object key: " + std::string(key));
    }
    return *value;
}

Json& Json::operator[](std::string key) {
    if (!is_object()) {
        value_ = object_t{};
    }
    return as_object()[std::move(key)];
}

bool operator==(const Json& left, const Json& right) noexcept {
    if (left.is_number() && right.is_number()) {
        return left.as_number() == right.as_number();
    }
    return left.value_ == right.value_;
}

} // namespace cpp_adapter
