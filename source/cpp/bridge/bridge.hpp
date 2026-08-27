#pragma once

#include "cpp_adapter/component_registry.hpp"

#include <memory>
#include <string>
#include <string_view>

namespace cpp_adapter {

class MemorySessionFactory {
public:
    virtual ~MemorySessionFactory() = default;
    [[nodiscard]] virtual std::unique_ptr<MemoryClient> create_session(
        const Json& trusted_context, std::string_view tool_name,
        std::string_view call_id) = 0;
};

class BridgeApp final {
public:
    explicit BridgeApp(const ComponentRegistry& registry = default_registry(),
                       MemorySessionFactory* memory_sessions = nullptr);

    [[nodiscard]] Json describe_tools() const;
    [[nodiscard]] Json handle_request(const Json& request) const;
    [[nodiscard]] std::string handle_request_text(std::string_view input) const;

private:
    [[nodiscard]] Json dispatch_request(const Json& request) const;

    ToolRuntime runtime_;
    MemorySessionFactory* memory_sessions_;
};

[[nodiscard]] Json make_error_response(const Json& id,
                                       const std::string& code,
                                       const std::string& message,
                                       Json details = Json::object());

} // namespace cpp_adapter
