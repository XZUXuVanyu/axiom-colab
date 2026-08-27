#include "bridge.hpp"

#include "cpp_adapter/errors.hpp"

#include <exception>
#include <set>

namespace cpp_adapter {
namespace {

Json request_id_or_null(const Json& request) {
    if (!request.is_object()) return nullptr;
    const Json* id = request.find("id");
    return id != nullptr && id->is_string() ? *id : Json(nullptr);
}

void validate_request_shape(const Json& request, bool accepts_trusted_context) {
    if (!request.is_object()) {
        throw ToolError("INVALID_REQUEST", "request must be a JSON object");
    }
    static const std::set<std::string, std::less<>> allowed = {
        "protocolVersion", "id", "tool", "arguments",
    };
    static const std::set<std::string, std::less<>> allowed_with_context = {
        "protocolVersion", "id", "tool", "arguments", "trustedContext",
    };
    const auto& permitted = accepts_trusted_context ? allowed_with_context : allowed;
    for (const auto& [key, value] : request.as_object()) {
        static_cast<void>(value);
        if (!permitted.contains(key)) {
            throw ToolError(
                "INVALID_REQUEST", "request contains an unknown field: " + key,
                Json::object({{"field", key}}));
        }
    }
    for (const std::string& required : allowed) {
        if (!request.contains(required)) {
            throw ToolError(
                "INVALID_REQUEST", "request is missing field: " + required,
                Json::object({{"field", required}}));
        }
    }
    if (!request.at("protocolVersion").is_string()
        || request.at("protocolVersion").as_string() != k_protocol_version) {
        throw ToolError(
            "UNSUPPORTED_PROTOCOL_VERSION",
            "protocolVersion must be exactly " + std::string(k_protocol_version),
            Json::object({{"expected", std::string(k_protocol_version)}}));
    }
    if (!request.at("id").is_string() || request.at("id").as_string().empty()
        || request.at("id").as_string().size() > 256) {
        throw ToolError("INVALID_REQUEST",
                        "id must be a non-empty string of at most 256 bytes");
    }
    if (!request.at("tool").is_string() || request.at("tool").as_string().empty()
        || request.at("tool").as_string().size() > 128) {
        throw ToolError("INVALID_REQUEST",
                        "tool must be a non-empty string of at most 128 bytes");
    }
    if (!request.at("arguments").is_object()) {
        throw ToolError("INVALID_REQUEST", "arguments must be a JSON object");
    }
    if (request.contains("trustedContext")
        && !request.at("trustedContext").is_object()) {
        throw ToolError("INVALID_TRUSTED_CONTEXT",
                        "trustedContext must be a JSON object");
    }
    if (request.contains("trustedContext")) {
        const Json& context = request.at("trustedContext");
        static const std::set<std::string, std::less<>> context_fields = {
            "protocolVersion", "workspaceId", "actorId", "toolId",
            "toolName", "toolVersion", "callId", "sessionGeneration", "memoryGrant",
        };
        for (const auto& [key, value] : context.as_object()) {
            static_cast<void>(value);
            if (!context_fields.contains(key)) {
                throw ToolError("INVALID_TRUSTED_CONTEXT",
                                "trustedContext contains an unknown field: " + key);
            }
        }
        for (const std::string& field : context_fields) {
            if (!context.contains(field)) {
                throw ToolError("INVALID_TRUSTED_CONTEXT",
                                "trustedContext is missing field: " + field);
            }
        }
        if (!context.at("protocolVersion").is_string()
            || context.at("protocolVersion").as_string() != k_protocol_version
            || !context.at("toolId").is_string()
            || context.at("toolId").as_string().empty()
            || !context.at("toolName").is_string()
            || context.at("toolName").as_string() != request.at("tool").as_string()
            || !context.at("callId").is_string()
            || context.at("callId").as_string() != request.at("id").as_string()
            || !context.at("workspaceId").is_string()
            || context.at("workspaceId").as_string().empty()
            || !context.at("actorId").is_string()
            || context.at("actorId").as_string().empty()
            || !context.at("toolVersion").is_string()
            || context.at("toolVersion").as_string().empty()
            || !context.at("sessionGeneration").is_number()
            || !context.at("memoryGrant").is_object()) {
            throw ToolError("INVALID_TRUSTED_CONTEXT",
                            "trustedContext does not bind valid host identities");
        }
    }
}

} // namespace

BridgeApp::BridgeApp(const ComponentRegistry& registry,
                     MemorySessionFactory* memory_sessions)
    : runtime_(registry.build()), memory_sessions_(memory_sessions) {}

Json BridgeApp::describe_tools() const {
    Json::array_t tools;
    for (const ToolDescriptor& descriptor : runtime_.descriptors()) {
        tools.push_back(descriptor_to_json(descriptor));
    }
    Json::array_t capabilities;
    for (const std::string_view capability : k_protocol_capabilities) {
        capabilities.emplace_back(std::string(capability));
    }
    return Json::object({
        {"protocolVersion", std::string(k_protocol_version)},
        {"capabilities", std::move(capabilities)},
        {"tools", tools},
    });
}

Json BridgeApp::dispatch_request(const Json& request) const {
    validate_request_shape(request, memory_sessions_ != nullptr);
    std::unique_ptr<MemoryClient> memory_client;
    if (request.contains("trustedContext")) {
        memory_client = memory_sessions_->create_session(
            request.at("trustedContext"), request.at("tool").as_string(),
            request.at("id").as_string());
    }
    ToolCallContext context{
        .call_id = request.at("id").as_string(),
        .memory_client = memory_client.get(),
        .started_at = std::chrono::steady_clock::now(),
    };
    Json result = runtime_.execute(request.at("tool").as_string(),
                                   request.at("arguments"), context);
    return Json::object({
        {"protocolVersion", std::string(k_protocol_version)},
        {"id", request.at("id")},
        {"ok", true},
        {"result", std::move(result)},
    });
}

Json BridgeApp::handle_request(const Json& request) const {
    const Json id = request_id_or_null(request);
    try {
        return dispatch_request(request);
    } catch (const ToolError& error) {
        return make_error_response(id, error.code(), error.what(), error.details());
    } catch (const std::exception& error) {
        return make_error_response(
            id, "CPP_EXCEPTION", "C++ tool raised an exception",
            Json::object({{"diagnostic", error.what()}}));
    } catch (...) {
        return make_error_response(id, "CPP_EXCEPTION",
                                   "C++ tool raised a non-standard exception");
    }
}

std::string BridgeApp::handle_request_text(std::string_view input) const {
    try {
        return handle_request(Json::parse(input)).dump();
    } catch (const JsonParseError& error) {
        return make_error_response(
                   nullptr, "MALFORMED_JSON", "stdin is not valid JSON",
                   Json::object({
                       {"offset", static_cast<std::int64_t>(error.offset())},
                       {"diagnostic", error.what()},
                   }))
            .dump();
    } catch (const std::exception& error) {
        return make_error_response(
                   nullptr, "BRIDGE_FAILURE", "bridge could not process request",
                   Json::object({{"diagnostic", error.what()}}))
            .dump();
    } catch (...) {
        return make_error_response(nullptr, "BRIDGE_FAILURE",
                                   "bridge raised a non-standard exception")
            .dump();
    }
}

Json make_error_response(const Json& id, const std::string& code,
                         const std::string& message, Json details) {
    return Json::object({
        {"protocolVersion", std::string(k_protocol_version)},
        {"id", id},
        {"ok", false},
        {"error", Json::object({
            {"code", code},
            {"message", message},
            {"details", std::move(details)},
        })},
    });
}

} // namespace cpp_adapter
