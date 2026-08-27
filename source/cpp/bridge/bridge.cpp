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

void validate_request_shape(const Json& request) {
    if (!request.is_object()) {
        throw ToolError("INVALID_REQUEST", "request must be a JSON object");
    }
    static const std::set<std::string, std::less<>> allowed = {
        "protocolVersion", "id", "tool", "arguments",
    };
    for (const auto& [key, value] : request.as_object()) {
        static_cast<void>(value);
        if (!allowed.contains(key)) {
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
}

} // namespace

BridgeApp::BridgeApp(const ComponentRegistry& registry)
    : runtime_(registry.build()) {}

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
    validate_request_shape(request);
    ToolCallContext context{
        .call_id = request.at("id").as_string(),
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
