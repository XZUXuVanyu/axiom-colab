#include "loopback_memory_transport.hpp"

#include "cpp_adapter/errors.hpp"

#include <charconv>
#include <chrono>
#include <cstdint>
#include <limits>
#include <set>
#include <string>
#include <system_error>

#ifdef _WIN32
#define NOMINMAX
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
using socket_handle = SOCKET;
constexpr socket_handle invalid_socket = INVALID_SOCKET;
#else
#include <netdb.h>
#include <sys/socket.h>
#include <unistd.h>
using socket_handle = int;
constexpr socket_handle invalid_socket = -1;
#endif

namespace cpp_adapter {
namespace {

[[noreturn]] void invalid_context(const std::string& message) {
    throw ToolError("INVALID_TRUSTED_CONTEXT", message);
}

const std::string& required_string(const Json& object, std::string_view field) {
    if (!object.contains(field) || !object.at(field).is_string()
        || object.at(field).as_string().empty()) {
        invalid_context(std::string(field) + " must be a non-empty string");
    }
    return object.at(field).as_string();
}

std::uint64_t required_uint(const Json& object, std::string_view field) {
    if (!object.contains(field) || !object.at(field).is_number()) {
        invalid_context(std::string(field) + " must be a non-negative integer");
    }
    const std::int64_t value = object.at(field).as_integer();
    if (value < 0) invalid_context(std::string(field) + " must be non-negative");
    return static_cast<std::uint64_t>(value);
}

std::size_t required_size(const Json& object, std::string_view field) {
    const std::uint64_t value = required_uint(object, field);
    if (value == 0 || value > std::numeric_limits<std::size_t>::max()) {
        invalid_context(std::string(field) + " must be a positive size");
    }
    return static_cast<std::size_t>(value);
}

std::chrono::system_clock::time_point timestamp(const std::string& value) {
    // Host grants use canonical ISO UTC milliseconds, e.g. 2026-08-27T00:00:00.000Z.
    if (value.size() != 24 || value[4] != '-' || value[7] != '-'
        || value[10] != 'T' || value[13] != ':' || value[16] != ':'
        || value[19] != '.' || value[23] != 'Z') {
        invalid_context("memory grant timestamps must be canonical ISO UTC milliseconds");
    }
    const auto number = [&](std::size_t offset, std::size_t count) {
        int result = 0;
        const char* begin = value.data() + offset;
        const auto parsed = std::from_chars(begin, begin + count, result);
        if (parsed.ec != std::errc{} || parsed.ptr != begin + count) {
            invalid_context("memory grant contains an invalid timestamp");
        }
        return result;
    };
    const std::chrono::year_month_day date{
        std::chrono::year(number(0, 4)),
        std::chrono::month(static_cast<unsigned>(number(5, 2))),
        std::chrono::day(static_cast<unsigned>(number(8, 2)))};
    if (!date.ok()) invalid_context("memory grant contains an invalid date");
    const int hour = number(11, 2), minute = number(14, 2), second = number(17, 2);
    if (hour > 23 || minute > 59 || second > 59) {
        invalid_context("memory grant contains an invalid time");
    }
    return std::chrono::sys_days(date) + std::chrono::hours(hour)
        + std::chrono::minutes(minute) + std::chrono::seconds(second)
        + std::chrono::milliseconds(number(20, 3));
}

MemoryOperation operation(const std::string& name) {
    static const std::pair<std::string_view, MemoryOperation> values[] = {
        {"compute.create", MemoryOperation::ComputeCreate},
        {"compute.read", MemoryOperation::ComputeRead},
        {"compute.update", MemoryOperation::ComputeUpdate},
        {"compute.snapshot", MemoryOperation::ComputeSnapshot},
        {"compute.release", MemoryOperation::ComputeRelease},
        {"working.read", MemoryOperation::WorkingRead},
        {"working.propose", MemoryOperation::WorkingPropose},
        {"artifact.read", MemoryOperation::ArtifactRead},
        {"artifact.create", MemoryOperation::ArtifactCreate},
        {"artifact.derive", MemoryOperation::ArtifactDerive},
    };
    for (const auto& [text, value] : values) if (text == name) return value;
    invalid_context("memory grant contains an unknown operation");
}

void close_socket(socket_handle socket) noexcept {
#ifdef _WIN32
    closesocket(socket);
#else
    close(socket);
#endif
}

struct SocketRuntime final {
    SocketRuntime() {
#ifdef _WIN32
        WSADATA data{};
        if (WSAStartup(MAKEWORD(2, 2), &data) != 0) {
            throw ToolError("MEMORY_TRANSPORT_ERROR", "could not initialize sockets");
        }
#endif
    }
    ~SocketRuntime() {
#ifdef _WIN32
        WSACleanup();
#endif
    }
};

std::string http_post(const std::string& host, const std::string& port,
                      const std::string& path, const std::string& token,
                      const std::string& body) {
    SocketRuntime runtime;
    addrinfo hints{};
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    hints.ai_protocol = IPPROTO_TCP;
    hints.ai_flags = AI_NUMERICHOST | AI_NUMERICSERV;
    addrinfo* addresses = nullptr;
    if (getaddrinfo(host.c_str(), port.c_str(), &hints, &addresses) != 0) {
        throw ToolError("MEMORY_TRANSPORT_ERROR", "could not resolve loopback endpoint");
    }
    socket_handle connected = invalid_socket;
    for (addrinfo* current = addresses; current != nullptr; current = current->ai_next) {
        const socket_handle candidate = socket(current->ai_family, current->ai_socktype,
                                               current->ai_protocol);
        if (candidate == invalid_socket) continue;
        if (connect(candidate, current->ai_addr,
                    static_cast<int>(current->ai_addrlen)) == 0) {
            connected = candidate;
            break;
        }
        close_socket(candidate);
    }
    freeaddrinfo(addresses);
    if (connected == invalid_socket) {
        throw ToolError("MEMORY_TRANSPORT_ERROR", "could not connect to memory service");
    }
    const std::string authority = host.find(':') == std::string::npos
        ? host + ":" + port : "[" + host + "]:" + port;
    const std::string request = "POST " + path + " HTTP/1.1\r\nHost: " + authority
        + "\r\nAuthorization: Bearer " + token
        + "\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: "
        + std::to_string(body.size()) + "\r\n\r\n" + body;
    std::size_t sent = 0;
    while (sent < request.size()) {
        const int count = send(connected, request.data() + sent,
                               static_cast<int>(request.size() - sent), 0);
        if (count <= 0) { close_socket(connected); throw ToolError(
            "MEMORY_TRANSPORT_ERROR", "memory request send failed"); }
        sent += static_cast<std::size_t>(count);
    }
    std::string response;
    char buffer[8192];
    for (;;) {
        const int count = recv(connected, buffer, static_cast<int>(sizeof(buffer)), 0);
        if (count == 0) break;
        if (count < 0) { close_socket(connected); throw ToolError(
            "MEMORY_TRANSPORT_ERROR", "memory response receive failed"); }
        response.append(buffer, static_cast<std::size_t>(count));
        if (response.size() > 8U * 1024U * 1024U) {
            close_socket(connected);
            throw ToolError("MEMORY_TRANSPORT_ERROR", "memory response is too large");
        }
    }
    close_socket(connected);
    const std::size_t separator = response.find("\r\n\r\n");
    if (separator == std::string::npos || response.rfind("HTTP/1.1 ", 0) != 0) {
        throw ToolError("MEMORY_TRANSPORT_ERROR", "memory service returned malformed HTTP");
    }
    return response.substr(separator + 4);
}

} // namespace

LoopbackHttpMemoryTransport::LoopbackHttpMemoryTransport(
    std::string endpoint, std::string bearer_token,
    TrustedInvocationContext context, std::string tool_version,
    std::uint64_t session_generation)
    : bearer_token_(std::move(bearer_token)), context_(std::move(context)),
      tool_version_(std::move(tool_version)), session_generation_(session_generation) {
    constexpr std::string_view prefix = "http://";
    if (!endpoint.starts_with(prefix)) invalid_context("memory endpoint must use HTTP loopback");
    std::string authority_and_path = endpoint.substr(prefix.size());
    const std::size_t slash = authority_and_path.find('/');
    if (slash == std::string::npos) invalid_context("memory endpoint must contain a route");
    path_ = authority_and_path.substr(slash);
    const std::string authority = authority_and_path.substr(0, slash);
    if (authority.starts_with('[')) {
        const std::size_t bracket = authority.find(']');
        if (bracket == std::string::npos || bracket + 2 > authority.size()
            || authority[bracket + 1] != ':') invalid_context("invalid IPv6 memory endpoint");
        host_ = authority.substr(1, bracket - 1);
        port_ = authority.substr(bracket + 2);
    } else {
        const std::size_t colon = authority.rfind(':');
        if (colon == std::string::npos) invalid_context("memory endpoint must include a port");
        host_ = authority.substr(0, colon);
        port_ = authority.substr(colon + 1);
    }
    if ((host_ != "127.0.0.1" && host_ != "::1") || port_.empty()
        || path_ != "/v1/memory/invoke" || bearer_token_.empty()) {
        invalid_context("memory endpoint and bearer token must be scoped loopback values");
    }
}

Json LoopbackHttpMemoryTransport::invoke(std::string_view capability_id,
                                         MemoryOperation operation_value,
                                         const Json& request) {
    const Json body = Json::object({
        {"capabilityId", std::string(capability_id)},
        {"context", Json::object({
            {"workspaceId", context_.workspace_id}, {"actorId", context_.actor_id},
            {"toolId", context_.tool_id}, {"callId", context_.call_id},
        })},
        {"toolVersion", tool_version_},
        {"sessionGeneration", static_cast<std::int64_t>(session_generation_)},
        {"operation", std::string(memory_operation_name(operation_value))},
        {"request", request},
    });
    Json response;
    try { response = Json::parse(http_post(host_, port_, path_, bearer_token_, body.dump())); }
    catch (const JsonParseError&) {
        throw ToolError("MEMORY_TRANSPORT_ERROR", "memory service returned malformed JSON");
    }
    if (!response.is_object() || !response.contains("ok")
        || !response.at("ok").is_bool()) {
        throw ToolError("MEMORY_TRANSPORT_ERROR", "memory service returned an invalid envelope");
    }
    if (response.at("ok").as_bool()) {
        if (!response.contains("result")) throw ToolError(
            "MEMORY_TRANSPORT_ERROR", "memory service response omitted result");
        return response.at("result");
    }
    if (!response.contains("error") || !response.at("error").is_object()) {
        throw ToolError("MEMORY_TRANSPORT_ERROR", "memory service response omitted error");
    }
    const Json& error = response.at("error");
    throw ToolError(required_string(error, "code"), required_string(error, "message"));
}

std::unique_ptr<MemoryClient> LoopbackMemorySessionFactory::create_session(
    const Json& trusted, std::string_view tool_name, std::string_view call_id) {
    const Json& grant_json = trusted.at("memoryGrant");
    TrustedInvocationContext context{
        required_string(trusted, "workspaceId"), required_string(trusted, "actorId"),
        required_string(trusted, "toolId"), required_string(trusted, "toolVersion"),
        required_string(trusted, "callId"), required_uint(trusted, "sessionGeneration")};
    if (trusted.at("toolName").as_string() != tool_name || context.call_id != call_id) {
        invalid_context("trusted context does not bind the invoked Tool Call");
    }
    MemoryGrant grant;
    grant.capability_id = required_string(grant_json, "capabilityId");
    grant.workspace_id = required_string(grant_json, "workspaceId");
    grant.actor_id = required_string(grant_json, "actorId");
    grant.tool_id = required_string(grant_json, "toolId");
    grant.tool_version = required_string(grant_json, "toolVersion");
    grant.call_id = required_string(grant_json, "callId");
    grant.session_generation = required_uint(grant_json, "sessionGeneration");
    grant.issued_at = timestamp(required_string(grant_json, "issuedAt"));
    grant.expires_at = timestamp(required_string(grant_json, "expiresAt"));
    grant.max_operations = required_size(grant_json, "maxOperations");
    grant.max_request_bytes = required_size(grant_json, "maxRequestBytes");
    if (!grant_json.contains("operations") || !grant_json.at("operations").is_array()) {
        invalid_context("memory grant operations must be an array");
    }
    for (const Json& item : grant_json.at("operations").as_array()) {
        if (!item.is_string() || !grant.operations.insert(operation(item.as_string())).second) {
            invalid_context("memory grant operations must be unique strings");
        }
    }
    auto transport = std::make_unique<LoopbackHttpMemoryTransport>(
        required_string(grant_json, "endpoint"), required_string(grant_json, "bearerToken"),
        context, context.tool_version, context.session_generation);
    LoopbackHttpMemoryTransport& transport_ref = *transport;
    transports_.push_back(std::move(transport));
    return std::make_unique<MemoryClient>(std::move(context), std::move(grant), transport_ref);
}

} // namespace cpp_adapter
