#pragma once

#include "cpp_adapter/component_registry.hpp"

#include <string>
#include <string_view>

namespace cpp_adapter {

class BridgeApp final {
public:
    explicit BridgeApp(const ComponentRegistry& registry = default_registry());

    [[nodiscard]] Json describe_tools() const;
    [[nodiscard]] Json handle_request(const Json& request) const;
    [[nodiscard]] std::string handle_request_text(std::string_view input) const;

private:
    [[nodiscard]] Json dispatch_request(const Json& request) const;

    ToolRuntime runtime_;
};

[[nodiscard]] Json make_error_response(const Json& id,
                                       const std::string& code,
                                       const std::string& message,
                                       Json details = Json::object());

} // namespace cpp_adapter
