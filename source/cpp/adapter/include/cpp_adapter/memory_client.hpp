#pragma once

#include "cpp_adapter/json.hpp"

#include <chrono>
#include <cstddef>
#include <cstdint>
#include <set>
#include <string>
#include <string_view>

namespace cpp_adapter {

enum class MemoryOperation {
    ComputeCreate,
    ComputeRead,
    ComputeUpdate,
    ComputeSnapshot,
    ComputeRelease,
    WorkingRead,
    WorkingPropose,
    ArtifactRead,
    ArtifactCreate,
    ArtifactDerive,
};

[[nodiscard]] std::string_view memory_operation_name(
    MemoryOperation operation) noexcept;

// This context is supplied by the trusted host beside Tool arguments. It is
// deliberately absent from the model-authored JSON argument object.
struct TrustedInvocationContext final {
    std::string workspace_id;
    std::string actor_id;
    std::string tool_id;
    std::string tool_version;
    std::string call_id;
    std::uint64_t session_generation = 0;
};

struct MemoryGrant final {
    std::string capability_id;
    std::string workspace_id;
    std::string actor_id;
    std::string tool_id;
    std::string tool_version;
    std::string call_id;
    std::set<MemoryOperation> operations;
    std::uint64_t session_generation = 0;
    std::chrono::system_clock::time_point issued_at;
    std::chrono::system_clock::time_point expires_at;
    std::size_t max_operations = 0;
    std::size_t max_request_bytes = 0;
};

class MemoryTransport {
public:
    virtual ~MemoryTransport() = default;
    [[nodiscard]] virtual Json invoke(std::string_view capability_id,
                                      MemoryOperation operation,
                                      const Json& request) = 0;
};

// A MemoryClient is a short-lived session view. It owns no path, credential,
// socket, or workspace-wide authority; all physical access stays behind the
// host-owned transport.
class MemoryClient final {
public:
    MemoryClient(TrustedInvocationContext context, MemoryGrant grant,
                 MemoryTransport& transport,
                 std::chrono::system_clock::time_point now =
                     std::chrono::system_clock::now());

    [[nodiscard]] const TrustedInvocationContext& context() const noexcept {
        return context_;
    }
    [[nodiscard]] const MemoryGrant& grant() const noexcept { return grant_; }
    [[nodiscard]] std::size_t operations_used() const noexcept {
        return operations_used_;
    }

    [[nodiscard]] Json invoke(MemoryOperation operation, const Json& request);

private:
    void authorize(MemoryOperation operation,
                   std::chrono::system_clock::time_point now) const;

    TrustedInvocationContext context_;
    MemoryGrant grant_;
    MemoryTransport* transport_;
    std::size_t operations_used_ = 0;
};

} // namespace cpp_adapter
