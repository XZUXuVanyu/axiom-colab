#include "cpp_adapter/memory_client.hpp"

#include "cpp_adapter/errors.hpp"

#include <utility>

namespace cpp_adapter {

std::string_view memory_operation_name(MemoryOperation operation) noexcept {
    switch (operation) {
    case MemoryOperation::ComputeCreate: return "compute.create";
    case MemoryOperation::ComputeRead: return "compute.read";
    case MemoryOperation::ComputeUpdate: return "compute.update";
    case MemoryOperation::ComputeSnapshot: return "compute.snapshot";
    case MemoryOperation::ComputeRelease: return "compute.release";
    case MemoryOperation::WorkingRead: return "working.read";
    case MemoryOperation::WorkingPropose: return "working.propose";
    case MemoryOperation::ArtifactRead: return "artifact.read";
    case MemoryOperation::ArtifactCreate: return "artifact.create";
    case MemoryOperation::ArtifactDerive: return "artifact.derive";
    }
    return "unknown";
}

MemoryClient::MemoryClient(TrustedInvocationContext context, MemoryGrant grant,
                           MemoryTransport& transport,
                           std::chrono::system_clock::time_point now)
    : context_(std::move(context)), grant_(std::move(grant)),
      transport_(&transport) {
    if (grant_.operations.empty()) {
        throw ToolError("INVALID_CAPABILITY",
                        "memory grant must permit at least one operation");
    }
    if (grant_.capability_id.empty() || grant_.max_operations == 0
        || grant_.max_request_bytes == 0) {
        throw ToolError("INVALID_CAPABILITY",
                        "memory grant identity and quotas must be non-empty");
    }
    authorize(*grant_.operations.begin(), now);
}

void MemoryClient::authorize(MemoryOperation operation,
                             std::chrono::system_clock::time_point now) const {
    if (grant_.workspace_id != context_.workspace_id) {
        throw ToolError("CROSS_WORKSPACE_ACCESS",
                        "memory grant belongs to another workspace");
    }
    if (grant_.actor_id != context_.actor_id) {
        throw ToolError("ACTOR_MISMATCH",
                        "memory grant belongs to another actor");
    }
    if (grant_.tool_id != context_.tool_id
        || grant_.tool_version != context_.tool_version) {
        throw ToolError("TOOL_IDENTITY_MISMATCH",
                        "memory grant belongs to another Tool identity or version");
    }
    if (grant_.call_id != context_.call_id) {
        throw ToolError("CALL_IDENTITY_MISMATCH",
                        "memory grant cannot be replayed by another call");
    }
    if (grant_.session_generation != context_.session_generation) {
        throw ToolError("STALE_CAPABILITY",
                        "memory grant belongs to a stale session generation");
    }
    if (grant_.expires_at <= grant_.issued_at) {
        throw ToolError("INVALID_CAPABILITY",
                        "memory grant expiry must follow issuance");
    }
    if (now < grant_.issued_at) {
        throw ToolError("CAPABILITY_NOT_YET_VALID",
                        "memory grant is not yet valid");
    }
    if (now >= grant_.expires_at) {
        throw ToolError("CAPABILITY_EXPIRED", "memory grant has expired");
    }
    if (!grant_.operations.contains(operation)) {
        throw ToolError("OPERATION_NOT_PERMITTED",
                        "memory grant does not permit "
                            + std::string(memory_operation_name(operation)));
    }
}

Json MemoryClient::invoke(MemoryOperation operation, const Json& request) {
    authorize(operation, std::chrono::system_clock::now());
    if (operations_used_ >= grant_.max_operations) {
        throw ToolError("MEMORY_OPERATION_QUOTA_EXCEEDED",
                        "memory session operation quota is exhausted");
    }
    if (request.dump().size() > grant_.max_request_bytes) {
        throw ToolError("MEMORY_REQUEST_TOO_LARGE",
                        "memory request exceeds the session byte limit");
    }
    ++operations_used_;
    return transport_->invoke(grant_.capability_id, operation, request);
}

} // namespace cpp_adapter
