#pragma once

#include "cpp_adapter/json.hpp"

#include <cstdint>
#include <stdexcept>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace axiom_colab::gui {

class SupervisoryResponseError final : public std::runtime_error {
public:
    using std::runtime_error::runtime_error;
};

struct SupervisoryResponse final {
    bool ok{};
    cpp_adapter::Json result;
    std::string error_code;
    std::string error_message;
};

struct SupervisoryWorkspaceInspection final {
    std::string workspace_id;
    std::optional<std::string> goal_id;
    cpp_adapter::Json current_plan;
    cpp_adapter::Json progress;
    cpp_adapter::Json observations;
    cpp_adapter::Json memory;
    cpp_adapter::Json tools;
    cpp_adapter::Json resources;
    cpp_adapter::Json candidates;
    cpp_adapter::Json timeline;
    cpp_adapter::Json controls;
};

struct SupervisoryGoalList final {
    std::string workspace_id;
    std::vector<std::string> goals;
};

struct SupervisoryToolExecution final {
    std::string workspace_id;
    std::string goal_id;
    std::string call_id;
    std::string tool;
    cpp_adapter::Json result;
    std::string report_artifact_id;
    std::string report_hash;
};

struct SupervisoryInstallationDecision final {
    std::string workspace_id;
    std::string proposal_id;
    std::string proposal_hash;
    std::string decision;
};

struct SupervisoryHiddenChallengeResult final {
    std::string workspace_id;
    std::string revision_id;
    std::string candidate_hash;
    std::string validation_id;
    std::string snapshot_hash;
    std::string record_hash;
    std::string outcome;
    bool promotable{};
    cpp_adapter::Json suites;
};

struct SupervisoryCandidateRevisionResult final {
    std::string workspace_id;
    std::string revision_id;
    std::string candidate_id;
    std::string parent_revision_id;
    std::string parent_candidate_hash;
    std::string candidate_hash;
    std::int64_t revision{};
};

struct SupervisoryInitialCandidateResult final {
    std::string workspace_id;
    std::string specification_id;
    std::string specification_hash;
    std::string revision_id;
    std::string candidate_id;
    std::string candidate_hash;
};

struct SupervisoryLifecycleResult final {
    std::string workspace_id;
    std::optional<std::string> goal_id;
    std::optional<std::string> capability_id;
    std::string action;
};

[[nodiscard]] SupervisoryResponse parse_supervisory_response(
    std::string_view text, std::string_view expected_request_id);
[[nodiscard]] std::vector<std::string> parse_workspace_list_result(
    const SupervisoryResponse& response);
[[nodiscard]] SupervisoryGoalList parse_goal_list_result(
    const SupervisoryResponse& response,
    std::string_view expected_workspace_id);
[[nodiscard]] SupervisoryWorkspaceInspection parse_workspace_inspection_result(
    const SupervisoryResponse& response, std::string_view expected_workspace_id,
    std::optional<std::string_view> expected_goal_id);
[[nodiscard]] SupervisoryToolExecution parse_tool_execution_result(
    const SupervisoryResponse& response, std::string_view expected_workspace_id,
    std::string_view expected_goal_id, std::string_view expected_tool);
[[nodiscard]] SupervisoryInstallationDecision parse_installation_decision_result(
    const SupervisoryResponse& response, std::string_view expected_workspace_id,
    std::string_view expected_proposal_id, std::string_view expected_proposal_hash,
    std::string_view expected_decision);
[[nodiscard]] SupervisoryHiddenChallengeResult parse_hidden_challenge_result(
    const SupervisoryResponse& response, std::string_view expected_workspace_id,
    std::string_view expected_revision_id, std::string_view expected_candidate_hash);
[[nodiscard]] SupervisoryCandidateRevisionResult parse_candidate_revision_result(
    const SupervisoryResponse& response, std::string_view expected_workspace_id,
    std::string_view expected_parent_revision_id,
    std::string_view expected_parent_candidate_hash);
[[nodiscard]] SupervisoryInitialCandidateResult parse_initial_candidate_result(
    const SupervisoryResponse& response, std::string_view expected_workspace_id);
[[nodiscard]] SupervisoryLifecycleResult parse_lifecycle_result(
    const SupervisoryResponse& response, std::string_view expected_workspace_id,
    std::optional<std::string_view> expected_goal_id,
    std::optional<std::string_view> expected_capability_id,
    std::string_view expected_action);

} // namespace axiom_colab::gui
