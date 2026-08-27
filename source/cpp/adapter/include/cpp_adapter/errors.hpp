#pragma once

#include "cpp_adapter/json.hpp"

#include <stdexcept>
#include <string>
#include <vector>

namespace cpp_adapter {

class ToolError : public std::runtime_error {
public:
    ToolError(std::string code, std::string message,
              Json details = Json::object());

    [[nodiscard]] const std::string& code() const noexcept { return code_; }
    [[nodiscard]] const Json& details() const noexcept { return details_; }

private:
    std::string code_;
    Json details_;
};

class RegistryError final : public ToolError {
public:
    RegistryError(std::string code, std::string message,
                  std::vector<std::string> dependency_path = {},
                  Json extra_details = Json::object());

    [[nodiscard]] const std::vector<std::string>& dependency_path() const noexcept {
        return dependency_path_;
    }

private:
    std::vector<std::string> dependency_path_;
};

[[nodiscard]] Json error_to_json(const ToolError& error);

} // namespace cpp_adapter
