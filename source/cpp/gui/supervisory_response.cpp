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
    if (version != "1.1") {
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

SupervisoryGoalList parse_goal_list_result(
    const SupervisoryResponse& response,
    std::string_view expected_workspace_id) {
    if (!response.ok) fail("cannot decode goal list from an error response");
    const auto& result = require_object(response.result, "goal list result");
    require_exact_fields(result, {"workspaceId", "goals"});
    const std::string& workspace_id = require_string(
        response.result.at("workspaceId"), "workspaceId");
    if (!valid_identity(workspace_id, "workspace:")
        || workspace_id != expected_workspace_id) {
        fail("goal list workspace does not match the selection");
    }
    const Json& goals_value = response.result.at("goals");
    if (!goals_value.is_array()) fail("goals must be an array");
    std::vector<std::string> goals;
    std::set<std::string, std::less<>> seen;
    for (const Json& value : goals_value.as_array()) {
        const std::string& id = require_string(value, "goal identity");
        if (!valid_identity(id, "goal:")) fail("goal identity is malformed");
        if (!seen.insert(id).second) fail("goal list contains a duplicate identity");
        goals.push_back(id);
    }
    return {.workspace_id = workspace_id, .goals = std::move(goals)};
}

SupervisoryWorkspaceInspection parse_workspace_inspection_result(
    const SupervisoryResponse& response, std::string_view expected_workspace_id,
    std::optional<std::string_view> expected_goal_id) {
    if (!response.ok) fail("cannot decode inspection from an error response");
    const auto& result = require_object(response.result, "inspection result");
    require_exact_fields(result, {"workspaceId", "goalId", "currentPlan", "progress", "observations", "memory", "tools",
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
    const Json& progress = response.result.at("progress");
    if (!progress.is_null() && !progress.is_object()) fail("progress must be null or an object");
    for (const std::string_view field : {"observations", "tools", "candidates", "timeline"}) {
        if (!response.result.at(field).is_array()) fail(std::string(field) + " must be an array");
    }
    require_object(response.result.at("resources"), "resources");
    const auto& memory = require_object(response.result.at("memory"), "memory");
    require_exact_fields(memory, {"compute", "working", "artifacts"});
    for (const std::string_view field : {"compute", "working", "artifacts"}) {
        if (!response.result.at("memory").at(field).is_array()) {
            fail(std::string("memory.") + std::string(field) + " must be an array");
        }
    }
    require_object(response.result.at("controls"), "controls");
    return {
        .workspace_id = workspace_id, .goal_id = std::move(goal_id),
        .current_plan = plan, .progress = progress,
        .observations = response.result.at("observations"),
        .memory = response.result.at("memory"), .tools = response.result.at("tools"),
        .resources = response.result.at("resources"),
        .candidates = response.result.at("candidates"),
        .timeline = response.result.at("timeline"),
        .controls = response.result.at("controls"),
    };
}

SupervisoryToolExecution parse_tool_execution_result(
    const SupervisoryResponse& response, std::string_view expected_workspace_id,
    std::string_view expected_goal_id, std::string_view expected_tool) {
    if (!response.ok) fail("cannot decode Tool execution from an error response");
    const auto& result = require_object(response.result, "Tool execution result");
    require_exact_fields(result, {"workspaceId", "goalId", "callId", "tool", "result",
                                  "reportArtifactId", "reportHash"});
    const auto& workspace_id = require_string(response.result.at("workspaceId"), "workspaceId");
    const auto& goal_id = require_string(response.result.at("goalId"), "goalId");
    const auto& call_id = require_string(response.result.at("callId"), "callId");
    const auto& tool = require_string(response.result.at("tool"), "tool");
    const auto& artifact_id = require_string(response.result.at("reportArtifactId"), "reportArtifactId");
    const auto& report_hash = require_string(response.result.at("reportHash"), "reportHash");
    if (workspace_id != expected_workspace_id || !valid_identity(workspace_id, "workspace:")
        || goal_id != expected_goal_id || !valid_identity(goal_id, "goal:")
        || tool != expected_tool || !valid_identity(call_id, "call:")
        || !valid_identity(artifact_id, "object:")
        || !report_hash.starts_with("sha256:") || report_hash.size() != 71) {
        fail("Tool execution result does not match the requested authority binding");
    }
    return {.workspace_id = workspace_id, .goal_id = goal_id, .call_id = call_id,
            .tool = tool, .result = response.result.at("result"),
            .report_artifact_id = artifact_id, .report_hash = report_hash};
}

SupervisoryInstallationDecision parse_installation_decision_result(
    const SupervisoryResponse& response, std::string_view expected_workspace_id,
    std::string_view expected_proposal_id, std::string_view expected_proposal_hash,
    std::string_view expected_decision) {
    if (!response.ok) fail("cannot decode installation decision from an error response");
    const auto& result = require_object(response.result, "installation decision result");
    require_exact_fields(result, {"workspaceId", "proposalId", "proposalHash", "decision"});
    const auto& workspace_id = require_string(response.result.at("workspaceId"), "workspaceId");
    const auto& proposal_id = require_string(response.result.at("proposalId"), "proposalId");
    const auto& proposal_hash = require_string(response.result.at("proposalHash"), "proposalHash");
    const auto& decision = require_string(response.result.at("decision"), "decision");
    if (workspace_id != expected_workspace_id || !valid_identity(workspace_id, "workspace:")
        || proposal_id != expected_proposal_id || !valid_identity(proposal_id, "proposal:")
        || proposal_hash != expected_proposal_hash || !proposal_hash.starts_with("sha256:")
        || proposal_hash.size() != 71 || decision != expected_decision
        || (decision != "approved" && decision != "rejected")) {
        fail("installation decision result does not match the exact displayed proposal");
    }
    return {.workspace_id = workspace_id, .proposal_id = proposal_id,
            .proposal_hash = proposal_hash, .decision = decision};
}

SupervisoryHiddenChallengeResult parse_hidden_challenge_result(
    const SupervisoryResponse& response, std::string_view expected_workspace_id,
    std::string_view expected_revision_id, std::string_view expected_candidate_hash) {
    if (!response.ok) fail("cannot decode hidden challenge from an error response");
    const auto& result = require_object(response.result, "hidden challenge result");
    require_exact_fields(result, {"workspaceId", "revisionId", "candidateHash",
        "validationId", "snapshotHash", "recordHash", "outcome", "promotable", "suites"});
    const auto& workspace_id = require_string(response.result.at("workspaceId"), "workspaceId");
    const auto& revision_id = require_string(response.result.at("revisionId"), "revisionId");
    const auto& candidate_hash = require_string(response.result.at("candidateHash"), "candidateHash");
    const auto& validation_id = require_string(response.result.at("validationId"), "validationId");
    const auto& snapshot_hash = require_string(response.result.at("snapshotHash"), "snapshotHash");
    const auto& record_hash = require_string(response.result.at("recordHash"), "recordHash");
    const auto& outcome = require_string(response.result.at("outcome"), "outcome");
    if (workspace_id != expected_workspace_id || !valid_identity(workspace_id, "workspace:")
        || revision_id != expected_revision_id || !valid_identity(revision_id, "evidence:")
        || candidate_hash != expected_candidate_hash || candidate_hash.size() != 71
        || validation_id.empty() || !valid_identity(validation_id, "validation:")
        || snapshot_hash.size() != 71 || !snapshot_hash.starts_with("sha256:")
        || record_hash.size() != 71 || !record_hash.starts_with("sha256:")
        || (outcome != "passed" && outcome != "failed" && outcome != "limited")
        || !response.result.at("promotable").is_bool()
        || !response.result.at("suites").is_array()) {
        fail("hidden challenge result does not match the exact selected candidate");
    }
    for (const Json& suite : response.result.at("suites").as_array()) {
        const auto& object = require_object(suite, "hidden challenge suite");
        require_exact_fields(object, {"kind", "outcome", "definitionHash", "commandCount", "hidden"});
        const auto& kind = require_string(suite.at("kind"), "suite kind");
        const auto& suite_outcome = require_string(suite.at("outcome"), "suite outcome");
        const auto& definition_hash = require_string(suite.at("definitionHash"), "definitionHash");
        if ((kind != "candidate" && kind != "standard" && kind != "challenge")
            || (suite_outcome != "passed" && suite_outcome != "failed" && suite_outcome != "limited")
            || definition_hash.size() != 71 || !definition_hash.starts_with("sha256:")
            || !suite.at("commandCount").is_integer() || !suite.at("hidden").is_bool()) {
            fail("hidden challenge suite is malformed");
        }
    }
    return {.workspace_id = workspace_id, .revision_id = revision_id,
        .candidate_hash = candidate_hash, .validation_id = validation_id,
        .snapshot_hash = snapshot_hash, .record_hash = record_hash,
        .outcome = outcome, .promotable = response.result.at("promotable").as_bool(),
        .suites = response.result.at("suites")};
}

SupervisoryCandidateRevisionResult parse_candidate_revision_result(
    const SupervisoryResponse& response, std::string_view expected_workspace_id,
    std::string_view expected_parent_revision_id,
    std::string_view expected_parent_candidate_hash) {
    if (!response.ok) fail("cannot decode candidate revision from an error response");
    const auto& result = require_object(response.result, "candidate revision result");
    require_exact_fields(result, {"protocolVersion", "revisionId", "candidateId", "workspaceId",
        "specificationId", "specificationHash", "revision", "parentRevisionId",
        "parentCandidateHash", "descriptorHash", "sourceHash", "sources", "candidateHash",
        "state", "createdAt", "createdBy"});
    const auto& workspace_id = require_string(response.result.at("workspaceId"), "workspaceId");
    const auto& revision_id = require_string(response.result.at("revisionId"), "revisionId");
    const auto& candidate_id = require_string(response.result.at("candidateId"), "candidateId");
    const auto& parent_revision_id = require_string(response.result.at("parentRevisionId"), "parentRevisionId");
    const auto& parent_candidate_hash = require_string(response.result.at("parentCandidateHash"), "parentCandidateHash");
    const auto& candidate_hash = require_string(response.result.at("candidateHash"), "candidateHash");
    const Json& revision = response.result.at("revision");
    const auto valid_hash = [](std::string_view value) { return value.starts_with("sha256:") && value.size() == 71; };
    if (require_string(response.result.at("protocolVersion"), "protocolVersion") != "1.0"
        || workspace_id != expected_workspace_id || !valid_identity(workspace_id, "workspace:")
        || !valid_identity(revision_id, "evidence:") || !valid_identity(candidate_id, "tool:")
        || parent_revision_id != expected_parent_revision_id
        || parent_candidate_hash != expected_parent_candidate_hash
        || !valid_hash(parent_candidate_hash) || !valid_hash(candidate_hash)
        || !revision.is_integer() || revision.as_integer() < 2
        || require_string(response.result.at("state"), "state") != "current"
        || !response.result.at("sources").is_array()) {
        fail("candidate revision result does not match the exact current parent");
    }
    for (const std::string_view field : {"specificationHash", "descriptorHash", "sourceHash"}) {
        if (!valid_hash(require_string(response.result.at(field), field))) fail("candidate revision result contains a malformed content hash");
    }
    return {.workspace_id = workspace_id, .revision_id = revision_id,
        .candidate_id = candidate_id, .parent_revision_id = parent_revision_id,
        .parent_candidate_hash = parent_candidate_hash, .candidate_hash = candidate_hash,
        .revision = revision.as_integer()};
}

SupervisoryInitialCandidateResult parse_initial_candidate_result(
    const SupervisoryResponse& response, std::string_view expected_workspace_id) {
    if (!response.ok) fail("cannot decode initial candidate from an error response");
    const auto& result = require_object(response.result, "initial candidate result");
    require_exact_fields(result, {"specification", "candidate"});
    const auto& specification = require_object(response.result.at("specification"), "Tool specification");
    require_exact_fields(specification, {"protocolVersion", "specificationId", "workspaceId",
        "createdAt", "createdBy", "problem", "publicName", "description", "inputSchema",
        "outputSchema", "requestedPermissions", "acceptanceCriteria", "constraints", "specificationHash"});
    const auto& candidate = require_object(response.result.at("candidate"), "initial candidate");
    require_exact_fields(candidate, {"protocolVersion", "revisionId", "candidateId", "workspaceId",
        "specificationId", "specificationHash", "revision", "parentRevisionId",
        "parentCandidateHash", "descriptorHash", "sourceHash", "sources", "candidateHash",
        "state", "createdAt", "createdBy"});
    const auto& workspace_id = require_string(response.result.at("specification").at("workspaceId"), "workspaceId");
    const auto& candidate_workspace = require_string(response.result.at("candidate").at("workspaceId"), "candidate workspaceId");
    const auto& specification_id = require_string(response.result.at("specification").at("specificationId"), "specificationId");
    const auto& candidate_specification_id = require_string(response.result.at("candidate").at("specificationId"), "candidate specificationId");
    const auto& specification_hash = require_string(response.result.at("specification").at("specificationHash"), "specificationHash");
    const auto& candidate_specification_hash = require_string(response.result.at("candidate").at("specificationHash"), "candidate specificationHash");
    const auto& revision_id = require_string(response.result.at("candidate").at("revisionId"), "revisionId");
    const auto& candidate_id = require_string(response.result.at("candidate").at("candidateId"), "candidateId");
    const auto& candidate_hash = require_string(response.result.at("candidate").at("candidateHash"), "candidateHash");
    const auto& descriptor_hash = require_string(response.result.at("candidate").at("descriptorHash"), "descriptorHash");
    const auto& source_hash = require_string(response.result.at("candidate").at("sourceHash"), "sourceHash");
    const auto valid_hash = [](std::string_view value) { return value.starts_with("sha256:") && value.size() == 71; };
    if (workspace_id != expected_workspace_id || candidate_workspace != workspace_id
        || !valid_identity(workspace_id, "workspace:") || !valid_identity(specification_id, "proposal:")
        || candidate_specification_id != specification_id || specification_hash != candidate_specification_hash
        || !valid_hash(specification_hash) || !valid_identity(revision_id, "evidence:")
        || !valid_identity(candidate_id, "tool:") || !valid_hash(candidate_hash)
        || !valid_hash(descriptor_hash) || !valid_hash(source_hash)
        || require_string(response.result.at("specification").at("protocolVersion"), "protocolVersion") != "1.0"
        || require_string(response.result.at("candidate").at("protocolVersion"), "protocolVersion") != "1.0"
        || !response.result.at("candidate").at("revision").is_integer()
        || response.result.at("candidate").at("revision").as_integer() != 1
        || !response.result.at("candidate").at("parentRevisionId").is_null()
        || !response.result.at("candidate").at("parentCandidateHash").is_null()
        || !response.result.at("candidate").at("sources").is_array()
        || !response.result.at("specification").at("requestedPermissions").is_array()
        || !response.result.at("specification").at("acceptanceCriteria").is_array()
        || !response.result.at("specification").at("constraints").is_array()
        || require_string(response.result.at("candidate").at("state"), "state") != "current") {
        fail("initial candidate result does not preserve its exact specification binding");
    }
    return {.workspace_id = workspace_id, .specification_id = specification_id,
        .specification_hash = specification_hash, .revision_id = revision_id,
        .candidate_id = candidate_id, .candidate_hash = candidate_hash};
}

} // namespace axiom_colab::gui
