#pragma once

#include "cpp_adapter/json.hpp"

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

} // namespace axiom_colab::gui
