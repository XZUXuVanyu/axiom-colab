#include "supervisory_response.hpp"

#include <cctype>
#include <initializer_list>
#include <set>

namespace axiom_colab::gui {
namespace {

using cpp_adapter::Json;

[[noreturn]] void fail(std::string message) {
    throw SupervisoryResponseError(std::move(message));
}

void require_exact_fields(const Json::object_t& object,
                          std::initializer_list<std::string_view> fields) {
    if (object.size() != fields.size()) {
        fail("supervisory response has missing or unknown fields");
    }
    for (const auto field : fields) {
        if (!object.contains(field)) {
            fail("supervisory response has missing or unknown fields");
        }
    }
}

void require_fields(const Json::object_t& object,
                    std::initializer_list<std::string_view> fields) {
    for (const auto field : fields) {
        if (!object.contains(field)) {
            fail("supervisory response is missing a required field");
        }
    }
}

const Json::object_t& require_object(const Json& value, std::string_view name) {
    if (!value.is_object()) {
        fail(std::string(name) + " must be an object");
    }
    return value.as_object();
}

const std::string& require_string(const Json& value, std::string_view name) {
    if (!value.is_string()) {
        fail(std::string(name) + " must be a string");
    }
    return value.as_string();
}

bool valid_identity(std::string_view value, std::string_view prefix) {
    if (!value.starts_with(prefix) || value.size() <= prefix.size()
        || value.size() > prefix.size() + 128) return false;
    if (!std::isalnum(static_cast<unsigned char>(value[prefix.size()]))) return false;
    for (const char character : value.substr(prefix.size())) {
        const auto byte = static_cast<unsigned char>(character);
        if (!std::isalnum(byte) && character != '.' && character != '_'
            && character != '-') return false;
    }
    return true;
}

} // namespace

SupervisoryResponse parse_supervisory_response(
    std::string_view text, std::string_view expected_request_id) {
    Json value;
    try {
        value = Json::parse(text);
    } catch (const std::exception&) {
        fail("supervisory response is not valid JSON");
    }

    const auto& object = require_object(value, "supervisory response");
    require_fields(object, {"protocolVersion", "id", "ok"});
    const auto& version = require_string(value.at("protocolVersion"),
                                         "protocolVersion");
    if (version != "1.0") {
        fail("supervisory protocol version is unsupported");
    }
    const auto& request_id = require_string(value.at("id"), "response id");
    if (request_id != expected_request_id) {
        fail("supervisory response id does not match the pending request");
    }
    if (!value.at("ok").is_bool()) {
        fail("ok must be a boolean");
    }

    if (value.at("ok").as_bool()) {
        require_exact_fields(object, {"protocolVersion", "id", "ok", "result"});
        return SupervisoryResponse{.ok = true, .result = value.at("result")};
    }

    require_exact_fields(object, {"protocolVersion", "id", "ok", "error"});
    const auto& error = require_object(value.at("error"), "error");
    require_exact_fields(error, {"code", "message"});
    return SupervisoryResponse{
        .ok = false,
        .result = Json{},
        .error_code = require_string(value.at("error").at("code"), "error code"),
        .error_message = require_string(value.at("error").at("message"),
                                        "error message"),
    };
}

std::vector<std::string> parse_workspace_list_result(
    const SupervisoryResponse& response) {
    if (!response.ok) fail("cannot decode workspace list from an error response");
    const auto& result = require_object(response.result, "workspace list result");
    require_exact_fields(result, {"workspaces"});
    const Json& workspaces_value = response.result.at("workspaces");
    if (!workspaces_value.is_array()) fail("workspaces must be an array");
    std::vector<std::string> workspaces;
    std::set<std::string, std::less<>> seen;
    for (const Json& value : workspaces_value.as_array()) {
        const std::string& id = require_string(value, "workspace identity");
        if (!valid_identity(id, "workspace:")) fail("workspace identity is malformed");
        if (!seen.insert(id).second) fail("workspace list contains a duplicate identity");
        workspaces.push_back(id);
    }
    return workspaces;
}

SupervisoryWorkspaceInspection parse_workspace_inspection_result(
    const SupervisoryResponse& response, std::string_view expected_workspace_id,
    std::optional<std::string_view> expected_goal_id) {
    if (!response.ok) fail("cannot decode inspection from an error response");
    const auto& result = require_object(response.result, "inspection result");
    require_exact_fields(result, {"workspaceId", "goalId", "currentPlan", "tools",
                                  "resources", "candidates", "timeline", "controls"});
    const std::string& workspace_id = require_string(
        response.result.at("workspaceId"), "workspaceId");
    if (!valid_identity(workspace_id, "workspace:")
        || workspace_id != expected_workspace_id) {
        fail("inspection workspace does not match the selection");
    }
    const Json& goal = response.result.at("goalId");
    std::optional<std::string> goal_id;
    if (!goal.is_null()) {
        const std::string& value = require_string(goal, "goalId");
        if (!valid_identity(value, "goal:")) fail("goal identity is malformed");
        goal_id = value;
    }
    if (goal_id.has_value() != expected_goal_id.has_value()
        || (goal_id.has_value() && *goal_id != *expected_goal_id)) {
        fail("inspection goal does not match the selection");
    }
    const Json& plan = response.result.at("currentPlan");
    if (!plan.is_null() && !plan.is_object()) fail("currentPlan must be null or an object");
    for (const std::string_view field : {"tools", "candidates", "timeline"}) {
        if (!response.result.at(field).is_array()) fail(std::string(field) + " must be an array");
    }
    require_object(response.result.at("resources"), "resources");
    require_object(response.result.at("controls"), "controls");
    return {
        .workspace_id = workspace_id, .goal_id = std::move(goal_id),
        .current_plan = plan, .tools = response.result.at("tools"),
        .resources = response.result.at("resources"),
        .candidates = response.result.at("candidates"),
        .timeline = response.result.at("timeline"),
        .controls = response.result.at("controls"),
    };
}

} // namespace axiom_colab::gui
