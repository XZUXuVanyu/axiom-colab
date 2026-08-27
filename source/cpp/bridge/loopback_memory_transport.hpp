#pragma once

#include "bridge.hpp"

#include <memory>
#include <vector>

namespace cpp_adapter {

class LoopbackHttpMemoryTransport final : public MemoryTransport {
public:
    LoopbackHttpMemoryTransport(std::string endpoint, std::string bearer_token,
                                TrustedInvocationContext context,
                                std::string tool_version,
                                std::uint64_t session_generation);

    [[nodiscard]] Json invoke(std::string_view capability_id,
                              MemoryOperation operation,
                              const Json& request) override;

private:
    std::string host_;
    std::string port_;
    std::string path_;
    std::string bearer_token_;
    TrustedInvocationContext context_;
    std::string tool_version_;
    std::uint64_t session_generation_;
};

class LoopbackMemorySessionFactory final : public MemorySessionFactory {
public:
    [[nodiscard]] std::unique_ptr<MemoryClient> create_session(
        const Json& trusted_context, std::string_view tool_name,
        std::string_view call_id) override;

private:
    // A Bridge handles one request. Retaining transports here guarantees they
    // outlive the MemoryClient references for the complete call-scoped graph.
    std::vector<std::unique_ptr<LoopbackHttpMemoryTransport>> transports_;
};

} // namespace cpp_adapter
