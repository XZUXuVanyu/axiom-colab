#include "supervisory_view.hpp"

#include <QComboBox>
#include <QFont>
#include <QGridLayout>
#include <QGroupBox>
#include <QHBoxLayout>
#include <QLabel>
#include <QListWidget>
#include <QPushButton>
#include <QPlainTextEdit>
#include <QVBoxLayout>

#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <utility>

namespace axiom_colab::gui {
namespace {

using cpp_adapter::Json;

const Json::object_t& require_object(const Json& value, std::string_view field) {
    if (!value.is_object()) {
        throw SupervisoryResponseError(std::string(field) + " must be an object");
    }
    return value.as_object();
}

const std::string& string_field(const Json& value, std::string_view field) {
    const Json& member = value.at(field);
    if (!member.is_string()) {
        throw SupervisoryResponseError(std::string(field) + " must be a string");
    }
    return member.as_string();
}

std::int64_t integer_field(const Json& value, std::string_view field) {
    const Json& member = value.at(field);
    if (!member.is_integer()) {
        throw SupervisoryResponseError(std::string(field) + " must be an integer");
    }
    return member.as_integer();
}

bool boolean_field(const Json& value, std::string_view field) {
    const Json& member = value.at(field);
    if (!member.is_bool()) {
        throw SupervisoryResponseError(std::string(field) + " must be a boolean");
    }
    return member.as_bool();
}

void exact_fields(const Json::object_t& object,
                  std::initializer_list<std::string_view> fields,
                  std::string_view name) {
    if (object.size() != fields.size()) {
        throw SupervisoryResponseError(std::string(name) + " has missing or unknown fields");
    }
    for (const auto field : fields) if (!object.contains(field)) {
        throw SupervisoryResponseError(std::string(name) + " has missing or unknown fields");
    }
}

QString text(const std::string& value) {
    return QString::fromUtf8(value.data(), static_cast<qsizetype>(value.size()));
}

QString optional_state(const Json& value, std::string_view field,
                       std::string_view nested_field) {
    const Json& member = value.at(field);
    if (member.is_null()) return "none";
    require_object(member, field);
    return text(string_field(member, nested_field));
}

QGroupBox* list_group(const QString& title, QListWidget** list, QWidget* parent) {
    auto* group = new QGroupBox(title, parent);
    auto* layout = new QVBoxLayout(group);
    *list = new QListWidget(group);
    (*list)->setAlternatingRowColors(true);
    layout->addWidget(*list);
    return group;
}

} // namespace

SupervisoryView::SupervisoryView(QString repository_root, QString config_path,
                                 QWidget* parent)
    : QWidget(parent), repository_root_(std::move(repository_root)),
      config_path_(std::move(config_path)) {
    build_ui();
    start_process();
}

SupervisoryView::SupervisoryView(SupervisoryProcessLaunch launch,
                                 QWidget* parent)
    : QWidget(parent) {
    build_ui();
    try {
        client_.start(launch.program, launch.arguments, launch.working_directory);
        connection_status_->setText("Connected (supervised)");
        load_workspaces();
    } catch (const std::exception& error) {
        show_error(QString::fromUtf8(error.what()));
        refresh_button_->setEnabled(false);
    }
}

void SupervisoryView::build_ui() {
    auto* page = new QVBoxLayout(this);
    page->setContentsMargins(20, 18, 20, 18);
    page->setSpacing(12);

    auto* heading = new QLabel("Laboratory supervision", this);
    QFont heading_font = heading->font();
    heading_font.setPointSize(17);
    heading_font.setBold(true);
    heading->setFont(heading_font);
    page->addWidget(heading);
    page->addWidget(new QLabel(
        "Host-verified workspace state with a constrained policy-scoped Tool command path. This view cannot approve or install.",
        this));

    auto* selection = new QHBoxLayout();
    connection_status_ = new QLabel(this);
    connection_status_->setObjectName("connectionStatus");
    workspace_selector_ = new QComboBox(this);
    workspace_selector_->setObjectName("workspaceSelector");
    workspace_selector_->setMinimumWidth(280);
    goal_selector_ = new QComboBox(this);
    goal_selector_->setObjectName("goalSelector");
    goal_selector_->setMinimumWidth(240);
    refresh_button_ = new QPushButton("Refresh", this);
    selection->addWidget(new QLabel("Workspace", this));
    selection->addWidget(workspace_selector_);
    selection->addWidget(new QLabel("Goal", this));
    selection->addWidget(goal_selector_);
    selection->addWidget(refresh_button_);
    selection->addStretch();
    selection->addWidget(connection_status_);
    page->addLayout(selection);

    auto* resource_group = new QGroupBox("Resources", this);
    auto* resource_layout = new QVBoxLayout(resource_group);
    resources_ = new QLabel("No workspace selected", resource_group);
    resources_->setObjectName("resourceSummary");
    resources_->setTextInteractionFlags(Qt::TextSelectableByMouse);
    resource_layout->addWidget(resources_);
    page->addWidget(resource_group);

    auto* plan_group = new QGroupBox("Approved plan", this);
    auto* plan_layout = new QVBoxLayout(plan_group);
    approved_plan_ = new QLabel("Select a goal to inspect its approved plan.", plan_group);
    approved_plan_->setObjectName("approvedPlan");
    approved_plan_->setWordWrap(true);
    approved_plan_->setTextInteractionFlags(Qt::TextSelectableByMouse);
    plan_layout->addWidget(approved_plan_);
    goal_progress_ = new QLabel("No checkpointed progress.", plan_group);
    goal_progress_->setObjectName("goalProgress");
    goal_progress_->setWordWrap(true);
    goal_progress_->setTextInteractionFlags(Qt::TextSelectableByMouse);
    plan_layout->addWidget(goal_progress_);
    page->addWidget(plan_group);

    auto* execution_group = new QGroupBox("Execute host-authorized built-in Tool", this);
    auto* execution_layout = new QGridLayout(execution_group);
    execution_tool_selector_ = new QComboBox(execution_group);
    execution_tool_selector_->setObjectName("executionToolSelector");
    execution_arguments_ = new QPlainTextEdit("{}", execution_group);
    execution_arguments_->setObjectName("executionArguments");
    execution_arguments_->setMaximumHeight(90);
    execute_button_ = new QPushButton("Execute", execution_group);
    execute_button_->setObjectName("executeTool");
    execution_result_ = new QLabel("Select a goal and a host-authorized built-in Tool.", execution_group);
    execution_result_->setObjectName("executionResult");
    execution_result_->setWordWrap(true);
    execution_result_->setTextInteractionFlags(Qt::TextSelectableByMouse);
    execution_layout->addWidget(new QLabel("Tool", execution_group), 0, 0);
    execution_layout->addWidget(execution_tool_selector_, 0, 1);
    execution_layout->addWidget(execute_button_, 0, 2);
    execution_layout->addWidget(new QLabel("JSON arguments", execution_group), 1, 0);
    execution_layout->addWidget(execution_arguments_, 1, 1, 1, 2);
    execution_layout->addWidget(execution_result_, 2, 0, 1, 3);
    page->addWidget(execution_group);

    auto* summaries = new QGridLayout();
    summaries->addWidget(list_group("Discovered Tools", &tools_, this), 0, 0);
    summaries->addWidget(list_group("Tool candidates", &candidates_, this), 0, 1);
    summaries->addWidget(list_group("Observed Tool results", &observations_, this), 1, 0);
    summaries->addWidget(list_group("Immutable activity timeline", &timeline_, this), 1, 1);
    summaries->addWidget(list_group("Compute memory", &compute_memory_, this), 2, 0);
    summaries->addWidget(list_group("Approved working revisions", &working_memory_, this), 2, 1);
    summaries->addWidget(list_group("Artifact lineage and provenance", &artifacts_, this), 3, 0, 1, 2);
    auto* candidate_evidence = new QGroupBox("Selected candidate source manifest and validation evidence", this);
    auto* candidate_evidence_layout = new QVBoxLayout(candidate_evidence);
    auto* candidate_actions = new QHBoxLayout();
    approve_candidate_ = new QPushButton("Approve exact proposal", candidate_evidence);
    approve_candidate_->setObjectName("approveCandidate");
    reject_candidate_ = new QPushButton("Reject exact proposal", candidate_evidence);
    reject_candidate_->setObjectName("rejectCandidate");
    approve_candidate_->setEnabled(false);
    reject_candidate_->setEnabled(false);
    candidate_actions->addWidget(approve_candidate_);
    candidate_actions->addWidget(reject_candidate_);
    submit_hidden_challenge_ = new QPushButton("Run hidden challenge", candidate_evidence);
    submit_hidden_challenge_->setObjectName("submitHiddenChallenge");
    submit_hidden_challenge_->setEnabled(false);
    candidate_actions->addWidget(submit_hidden_challenge_);
    candidate_actions->addStretch();
    candidate_evidence_layout->addLayout(candidate_actions);
    candidate_details_ = new QPlainTextEdit(candidate_evidence);
    candidate_details_->setObjectName("candidateDetails");
    candidate_details_->setReadOnly(true);
    candidate_details_->setPlaceholderText("Select a Tool candidate to inspect its exact source and observed validation bindings.");
    candidate_details_->setMaximumHeight(220);
    candidate_evidence_layout->addWidget(candidate_details_);
    hidden_challenge_input_ = new QPlainTextEdit(candidate_evidence);
    hidden_challenge_input_->setObjectName("hiddenChallengeInput");
    hidden_challenge_input_->setPlaceholderText(
        R"({"fixtures":[{"path":"tests/private.txt","contentBase64":"..."}],"commands":[{"commandId":"hidden-test","executable":"/usr/bin/ctest","args":[],"cwd":"candidate"}]})");
    hidden_challenge_input_->setMaximumHeight(110);
    candidate_evidence_layout->addWidget(new QLabel(
        "Private challenge JSON (cleared immediately after submission; output is never displayed)", candidate_evidence));
    candidate_evidence_layout->addWidget(hidden_challenge_input_);
    hidden_challenge_result_ = new QLabel("Select a current candidate to submit a hidden challenge.", candidate_evidence);
    hidden_challenge_result_->setObjectName("hiddenChallengeResult");
    hidden_challenge_result_->setWordWrap(true);
    hidden_challenge_result_->setTextInteractionFlags(Qt::TextSelectableByMouse);
    candidate_evidence_layout->addWidget(hidden_challenge_result_);
    candidate_revision_input_ = new QPlainTextEdit(candidate_evidence);
    candidate_revision_input_->setObjectName("candidateRevisionInput");
    candidate_revision_input_->setPlaceholderText(
        R"({"descriptor":{"name":"candidate_tool"},"sources":[{"path":"src/tool.cpp","contentBase64":"..."}]})");
    candidate_revision_input_->setMaximumHeight(110);
    candidate_evidence_layout->addWidget(new QLabel(
        "Exact-parent candidate revision JSON (source bytes are cleared after submission)", candidate_evidence));
    candidate_evidence_layout->addWidget(candidate_revision_input_);
    revise_candidate_ = new QPushButton("Create immutable revision", candidate_evidence);
    revise_candidate_->setObjectName("reviseCandidate");
    revise_candidate_->setEnabled(false);
    candidate_evidence_layout->addWidget(revise_candidate_);
    candidate_revision_result_ = new QLabel(
        "Select a current candidate to create a hash-chained revision.", candidate_evidence);
    candidate_revision_result_->setObjectName("candidateRevisionResult");
    candidate_revision_result_->setWordWrap(true);
    candidate_revision_result_->setTextInteractionFlags(Qt::TextSelectableByMouse);
    candidate_evidence_layout->addWidget(candidate_revision_result_);
    summaries->addWidget(candidate_evidence, 4, 0, 1, 2);
    compute_memory_->setObjectName("computeMemory");
    working_memory_->setObjectName("workingMemory");
    artifacts_->setObjectName("artifactLineage");
    summaries->setRowStretch(0, 1);
    summaries->setRowStretch(1, 1);
    page->addLayout(summaries, 1);

    connect(refresh_button_, &QPushButton::clicked, this,
            &SupervisoryView::load_workspaces);
    connect(workspace_selector_, qOverload<int>(&QComboBox::currentIndexChanged), this,
            [this](int index) {
                if (index >= 0 && !busy_) load_goals();
            });
    connect(goal_selector_, qOverload<int>(&QComboBox::currentIndexChanged), this,
            [this](int index) {
                if (index >= 0 && !busy_) inspect_selected_workspace();
            });
    connect(execute_button_, &QPushButton::clicked, this,
            &SupervisoryView::execute_selected_tool);
    connect(candidates_, &QListWidget::currentRowChanged, this,
            [this](int row) {
                auto* item = row < 0 ? nullptr : candidates_->item(row);
                candidate_details_->setPlainText(
                    item == nullptr ? QString{} : item->data(Qt::UserRole).toString());
                const bool pending = item != nullptr
                    && !item->data(Qt::UserRole + 1).toString().isEmpty();
                approve_candidate_->setEnabled(pending && !busy_);
                reject_candidate_->setEnabled(pending && !busy_);
                const bool current = item != nullptr
                    && !item->data(Qt::UserRole + 3).toString().isEmpty();
                submit_hidden_challenge_->setEnabled(current && !busy_);
                revise_candidate_->setEnabled(current && !busy_);
            });
    connect(approve_candidate_, &QPushButton::clicked, this,
            [this] { decide_selected_installation(true); });
    connect(reject_candidate_, &QPushButton::clicked, this,
            [this] { decide_selected_installation(false); });
    connect(submit_hidden_challenge_, &QPushButton::clicked, this,
            &SupervisoryView::submit_selected_hidden_challenge);
    connect(revise_candidate_, &QPushButton::clicked, this,
            &SupervisoryView::revise_selected_candidate);
}

void SupervisoryView::start_process() {
    if (config_path_.isEmpty()) {
        show_error("Not connected: start with --supervisory-config <absolute-config.json>");
        refresh_button_->setEnabled(false);
        return;
    }
    try {
        client_.start_local_supervisory_process(
            "node", repository_root_, config_path_);
        connection_status_->setText("Connected (supervised)");
        load_workspaces();
    } catch (const std::exception& error) {
        show_error(QString::fromUtf8(error.what()));
        refresh_button_->setEnabled(false);
    }
}

void SupervisoryView::load_workspaces() {
    set_busy(true);
    try {
        (void)client_.list_workspaces(
            [this](const SupervisoryResponse* response, const std::string* error) {
                if (error != nullptr) {
                    show_error(text(*error));
                    set_busy(false);
                    return;
                }
                try {
                    const auto workspaces = parse_workspace_list_result(*response);
                    const QString previous = workspace_selector_->currentText();
                    workspace_selector_->blockSignals(true);
                    workspace_selector_->clear();
                    for (const auto& workspace : workspaces) {
                        workspace_selector_->addItem(text(workspace));
                    }
                    const int previous_index = workspace_selector_->findText(previous);
                    if (previous_index >= 0) workspace_selector_->setCurrentIndex(previous_index);
                    workspace_selector_->blockSignals(false);
                    set_busy(false);
                    if (workspace_selector_->count() == 0) {
                        resources_->setText("No visible workspaces");
                        tools_->clear();
                        candidates_->clear();
                        observations_->clear();
                        compute_memory_->clear();
                        working_memory_->clear();
                        artifacts_->clear();
                        timeline_->clear();
                    } else {
                        load_goals();
                    }
                } catch (const std::exception& decode_error) {
                    show_error(QString::fromUtf8(decode_error.what()));
                    set_busy(false);
                }
            });
    } catch (const std::exception& error) {
        show_error(QString::fromUtf8(error.what()));
        set_busy(false);
    }

}

void SupervisoryView::load_goals() {
    const QString selected = workspace_selector_->currentText();
    if (selected.isEmpty()) return;
    set_busy(true);
    try {
        const std::string workspace = selected.toStdString();
        (void)client_.list_goals(
            workspace,
            [this, workspace](const SupervisoryResponse* response,
                              const std::string* error) {
                if (error != nullptr) {
                    show_error(text(*error));
                    set_busy(false);
                    return;
                }
                try {
                    const auto result = parse_goal_list_result(*response, workspace);
                    if (workspace_selector_->currentText() != text(workspace)) {
                        set_busy(false);
                        return;
                    }
                    goal_selector_->blockSignals(true);
                    goal_selector_->clear();
                    goal_selector_->addItem("Workspace overview");
                    for (const auto& goal : result.goals) {
                        goal_selector_->addItem(text(goal));
                    }
                    goal_selector_->blockSignals(false);
                    set_busy(false);
                    inspect_selected_workspace();
                } catch (const std::exception& decode_error) {
                    show_error(QString::fromUtf8(decode_error.what()));
                    set_busy(false);
                }
            });
    } catch (const std::exception& error) {
        show_error(QString::fromUtf8(error.what()));
        set_busy(false);
    }
}

void SupervisoryView::inspect_selected_workspace() {
    const QString selected = workspace_selector_->currentText();
    if (selected.isEmpty()) return;
    set_busy(true);
    try {
        const std::string workspace = selected.toStdString();
        const std::optional<std::string> goal = goal_selector_->currentIndex() > 0
            ? std::optional<std::string>(goal_selector_->currentText().toStdString())
            : std::nullopt;
        (void)client_.inspect(
            workspace,
            goal.has_value()
                ? std::optional<std::string_view>(*goal) : std::nullopt,
            [this, workspace, goal](const SupervisoryResponse* response,
                              const std::string* error) {
                if (error != nullptr) {
                    show_error(text(*error));
                    set_busy(false);
                    return;
                }
                try {
                    const auto inspection = parse_workspace_inspection_result(
                        *response, workspace,
                        goal.has_value()
                            ? std::optional<std::string_view>(*goal) : std::nullopt);
                    const bool selection_matches = workspace_selector_->currentText() == text(workspace)
                        && ((goal_selector_->currentIndex() == 0 && !goal.has_value())
                            || (goal.has_value() && goal_selector_->currentText() == text(*goal)));
                    if (selection_matches) {
                        render(inspection);
                        connection_status_->setText("Connected (supervised)");
                    }
                } catch (const std::exception& decode_error) {
                    show_error(QString::fromUtf8(decode_error.what()));
                }
                set_busy(false);
            });
    } catch (const std::exception& error) {
        show_error(QString::fromUtf8(error.what()));
        set_busy(false);
    }
}

void SupervisoryView::execute_selected_tool() {
    if (workspace_selector_->currentText().isEmpty() || goal_selector_->currentIndex() <= 0
        || execution_tool_selector_->currentText().isEmpty()) {
        show_error("Select a workspace, goal, and executable Tool first");
        return;
    }
    Json arguments;
    try {
        arguments = Json::parse(execution_arguments_->toPlainText().toStdString());
        if (!arguments.is_object()) throw SupervisoryResponseError("Tool arguments must be a JSON object");
    } catch (const std::exception& error) {
        show_error(QString("Invalid Tool arguments: ") + QString::fromUtf8(error.what()));
        return;
    }
    const std::string workspace = workspace_selector_->currentText().toStdString();
    const std::string goal = goal_selector_->currentText().toStdString();
    const std::string tool = execution_tool_selector_->currentText().toStdString();
    set_busy(true);
    try {
        (void)client_.execute_tool(workspace, goal, tool, std::move(arguments),
            [this, workspace, goal, tool](const SupervisoryResponse* response,
                                          const std::string* error) {
                if (error != nullptr) {
                    show_error(text(*error)); set_busy(false); return;
                }
                try {
                    if (!response->ok) {
                        throw SupervisoryResponseError(response->error_code + ": " + response->error_message);
                    }
                    const auto execution = parse_tool_execution_result(*response, workspace, goal, tool);
                    execution_result_->setText(
                        "Observed result: " + text(execution.result.dump()));
                    execution_result_->setToolTip(
                        "Call: " + text(execution.call_id) + "\nReport: "
                        + text(execution.report_artifact_id) + "\nHash: " + text(execution.report_hash));
                    set_busy(false);
                    inspect_selected_workspace();
                } catch (const std::exception& decode_error) {
                    show_error(QString::fromUtf8(decode_error.what())); set_busy(false);
                }
            });
    } catch (const std::exception& error) {
        show_error(QString::fromUtf8(error.what())); set_busy(false);
    }
}

void SupervisoryView::decide_selected_installation(bool approve) {
    auto* item = candidates_->currentItem();
    if (item == nullptr || workspace_selector_->currentText().isEmpty()) {
        show_error("Select a pending exact installation proposal first");
        return;
    }
    const std::string workspace = workspace_selector_->currentText().toStdString();
    const std::string proposal_id = item->data(Qt::UserRole + 1).toString().toStdString();
    const std::string proposal_hash = item->data(Qt::UserRole + 2).toString().toStdString();
    const std::string decision = approve ? "approved" : "rejected";
    set_busy(true);
    try {
        (void)client_.decide_installation(
            workspace, proposal_id, proposal_hash, decision,
            [this, workspace, proposal_id, proposal_hash, decision](
                const SupervisoryResponse* response, const std::string* error) {
                if (error != nullptr) { show_error(text(*error)); set_busy(false); return; }
                try {
                    if (!response->ok) throw SupervisoryResponseError(
                        response->error_code + ": " + response->error_message);
                    (void)parse_installation_decision_result(
                        *response, workspace, proposal_id, proposal_hash, decision);
                    set_busy(false);
                    inspect_selected_workspace();
                } catch (const std::exception& decode_error) {
                    show_error(QString::fromUtf8(decode_error.what())); set_busy(false);
                }
            });
    } catch (const std::exception& error) {
        show_error(QString::fromUtf8(error.what())); set_busy(false);
    }
}

void SupervisoryView::submit_selected_hidden_challenge() {
    auto* item = candidates_->currentItem();
    if (item == nullptr || workspace_selector_->currentText().isEmpty()
        || item->data(Qt::UserRole + 3).toString().isEmpty()) {
        show_error("Select a current candidate revision first");
        return;
    }
    Json payload;
    try {
        payload = Json::parse(hidden_challenge_input_->toPlainText().toStdString());
        const auto& object = require_object(payload, "private challenge input");
        exact_fields(object, {"fixtures", "commands"}, "private challenge input");
        if (!payload.at("fixtures").is_array() || !payload.at("commands").is_array()
            || payload.at("commands").as_array().empty()) {
            throw SupervisoryResponseError("fixtures and non-empty commands must be arrays");
        }
    } catch (const std::exception& error) {
        show_error(QString("Invalid hidden challenge: ") + QString::fromUtf8(error.what()));
        return;
    }
    const std::string workspace = workspace_selector_->currentText().toStdString();
    const std::string revision = item->data(Qt::UserRole + 3).toString().toStdString();
    const std::string candidate_hash = item->data(Qt::UserRole + 4).toString().toStdString();
    Json fixtures = payload.at("fixtures");
    Json commands = payload.at("commands");
    hidden_challenge_input_->clear();
    hidden_challenge_input_->setPlaceholderText("Private challenge cleared after submission.");
    hidden_challenge_result_->setText("Hidden challenge running; private inputs and output remain undisclosed.");
    hidden_challenge_result_->setToolTip({});
    set_busy(true);
    try {
        (void)client_.submit_hidden_challenge(
            workspace, revision, candidate_hash, std::move(fixtures), std::move(commands),
            [this, workspace, revision, candidate_hash](
                const SupervisoryResponse* response, const std::string* error) {
                hidden_challenge_input_->clear();
                if (error != nullptr) { show_error(text(*error)); set_busy(false); return; }
                try {
                    if (!response->ok) throw SupervisoryResponseError(
                        response->error_code + ": " + response->error_message);
                    const auto result = parse_hidden_challenge_result(
                        *response, workspace, revision, candidate_hash);
                    hidden_challenge_result_->setText(QString(
                        "Observed validation: %1 | promotable: %2 | suites: %3")
                        .arg(text(result.outcome), result.promotable ? "yes" : "no")
                        .arg(result.suites.as_array().size()));
                    hidden_challenge_result_->setToolTip(
                        "Validation: " + text(result.validation_id)
                        + "\nSnapshot: " + text(result.snapshot_hash)
                        + "\nRecord: " + text(result.record_hash)
                        + "\nSuite commitments: " + text(result.suites.dump()));
                    set_busy(false);
                    inspect_selected_workspace();
                } catch (const std::exception& decode_error) {
                    show_error(QString::fromUtf8(decode_error.what())); set_busy(false);
                }
            });
    } catch (const std::exception& error) {
        hidden_challenge_input_->clear();
        show_error(QString::fromUtf8(error.what())); set_busy(false);
    }
}

void SupervisoryView::revise_selected_candidate() {
    auto* item = candidates_->currentItem();
    if (item == nullptr || workspace_selector_->currentText().isEmpty()
        || item->data(Qt::UserRole + 3).toString().isEmpty()) {
        show_error("Select a current candidate revision first"); return;
    }
    Json payload;
    try {
        payload = Json::parse(candidate_revision_input_->toPlainText().toStdString());
        const auto& object = require_object(payload, "candidate revision input");
        exact_fields(object, {"descriptor", "sources"}, "candidate revision input");
        if (!payload.at("descriptor").is_object() || !payload.at("sources").is_array()
            || payload.at("sources").as_array().empty()) {
            throw SupervisoryResponseError("descriptor must be an object and sources must be a non-empty array");
        }
    } catch (const std::exception& error) {
        show_error(QString("Invalid candidate revision: ") + QString::fromUtf8(error.what())); return;
    }
    const std::string workspace = workspace_selector_->currentText().toStdString();
    const std::string parent_revision = item->data(Qt::UserRole + 3).toString().toStdString();
    const std::string parent_hash = item->data(Qt::UserRole + 4).toString().toStdString();
    Json descriptor = payload.at("descriptor");
    Json sources = payload.at("sources");
    candidate_revision_input_->clear();
    candidate_revision_input_->setPlaceholderText("Submitted source bytes cleared.");
    candidate_revision_result_->setText("Creating immutable revision through the host workshop...");
    candidate_revision_result_->setToolTip({});
    set_busy(true);
    try {
        (void)client_.revise_candidate(workspace, parent_revision, parent_hash,
            std::move(descriptor), std::move(sources),
            [this, workspace, parent_revision, parent_hash](
                const SupervisoryResponse* response, const std::string* error) {
                candidate_revision_input_->clear();
                if (error != nullptr) { show_error(text(*error)); set_busy(false); return; }
                try {
                    if (!response->ok) throw SupervisoryResponseError(response->error_code + ": " + response->error_message);
                    const auto revised = parse_candidate_revision_result(
                        *response, workspace, parent_revision, parent_hash);
                    candidate_revision_result_->setText(QString(
                        "Created revision %1. Prior validation and proposal bindings are now stale.")
                        .arg(revised.revision));
                    candidate_revision_result_->setToolTip(
                        "Revision: " + text(revised.revision_id) + "\nCandidate: "
                        + text(revised.candidate_id) + "\nCandidate hash: " + text(revised.candidate_hash));
                    set_busy(false); inspect_selected_workspace();
                } catch (const std::exception& decode_error) {
                    show_error(QString::fromUtf8(decode_error.what())); set_busy(false);
                }
            });
    } catch (const std::exception& error) {
        candidate_revision_input_->clear(); show_error(QString::fromUtf8(error.what())); set_busy(false);
    }
}

void SupervisoryView::render(const SupervisoryWorkspaceInspection& inspection) {
    if (inspection.current_plan.is_null()) {
        if (inspection.goal_id.has_value()) {
            throw SupervisoryResponseError(
                "selected goal does not have an authoritative approved plan");
        }
        approved_plan_->setText("Workspace overview; select a goal to inspect its approved plan.");
        approved_plan_->setToolTip({});
    } else {
        const auto& plan = require_object(inspection.current_plan, "currentPlan");
        if (plan.size() != 4 || !plan.contains("revisionId")
            || !plan.contains("hash") || !plan.contains("objective")
            || !plan.contains("approved")) {
            throw SupervisoryResponseError(
                "currentPlan has missing or unknown fields");
        }
        if (!boolean_field(inspection.current_plan, "approved")) {
            throw SupervisoryResponseError("currentPlan is not approved");
        }
        approved_plan_->setText(text(string_field(inspection.current_plan, "objective")));
        approved_plan_->setToolTip(
            "Approved revision: " + text(string_field(inspection.current_plan, "revisionId"))
            + "\nHash: " + text(string_field(inspection.current_plan, "hash")));
    }

    if (inspection.progress.is_null()) {
        goal_progress_->setText("No checkpointed progress.");
        goal_progress_->setToolTip({});
    } else {
        const auto& progress = require_object(inspection.progress, "progress");
        if (progress.size() != 6 || !progress.contains("revisionId")
            || !progress.contains("hash") || !progress.contains("status")
            || !progress.contains("summary") || !progress.contains("completedCalls")
            || !progress.contains("totalCalls")) {
            throw SupervisoryResponseError("progress has missing or unknown fields");
        }
        goal_progress_->setText(QString("%1 — %2 (%3/%4 calls)")
            .arg(text(string_field(inspection.progress, "status")),
                 text(string_field(inspection.progress, "summary")))
            .arg(integer_field(inspection.progress, "completedCalls"))
            .arg(integer_field(inspection.progress, "totalCalls")));
        goal_progress_->setToolTip(
            "Checkpoint revision: " + text(string_field(inspection.progress, "revisionId"))
            + "\nHash: " + text(string_field(inspection.progress, "hash")));
    }

    require_object(inspection.resources, "resources");
    const Json& quota = inspection.resources.at("quota");
    require_object(quota, "resources.quota");
    resources_->setText(QString(
        "%1 bytes of %2 | %3 objects of %4 | %5 expired | %6 corrupt")
        .arg(integer_field(inspection.resources, "usedBytes"))
        .arg(integer_field(quota, "maxBytes"))
        .arg(integer_field(inspection.resources, "objectCount"))
        .arg(integer_field(quota, "maxObjects"))
        .arg(integer_field(inspection.resources, "expiredObjects"))
        .arg(integer_field(inspection.resources, "corruptObjects")));

    tools_->clear();
    execution_tool_selector_->clear();
    for (const Json& tool : inspection.tools.as_array()) {
        require_object(tool, "tool");
        const QString name = text(string_field(tool, "name"));
        const QString source = text(string_field(tool, "source"));
        auto* item = new QListWidgetItem(QString("%1  [%2]").arg(name, source), tools_);
        if (source == "built-in" && boolean_field(tool, "executable")) {
            execution_tool_selector_->addItem(name);
        }
        const Json& evidence = tool.at("installationEvidenceHash");
        if (!evidence.is_null()) {
            if (!evidence.is_string()) throw SupervisoryResponseError(
                "installationEvidenceHash must be null or a string");
            item->setToolTip("Verified installation evidence: " + text(evidence.as_string()));
        }
    }

    candidates_->clear();
    candidate_details_->clear();
    for (const Json& candidate : inspection.candidates.as_array()) {
        const auto& candidate_object = require_object(candidate, "candidate");
        exact_fields(candidate_object, {"candidateId", "revisionId", "revision", "candidateHash",
            "state", "modelClaim", "descriptor", "descriptorHash", "sourceHash", "sources",
            "proposal", "validation", "approval", "installation"}, "candidate");
        const QString candidate_id = text(string_field(candidate, "candidateId"));
        const QString state = text(string_field(candidate, "state"));
        const QString validation = optional_state(candidate, "validation", "outcome");
        const QString approval = optional_state(candidate, "approval", "decision");
        const QString installation = optional_state(candidate, "installation", "outcome");
        auto* item = new QListWidgetItem(
            QString("%1  [%2] | validation: %3 | user decision: %4 | installation: %5")
                .arg(candidate_id, state, validation, approval, installation),
            candidates_);
        if (state == "current") {
            item->setData(Qt::UserRole + 3, text(string_field(candidate, "revisionId")));
            item->setData(Qt::UserRole + 4, text(string_field(candidate, "candidateHash")));
        }
        const Json& claim = candidate.at("modelClaim");
        if (!claim.is_null()) {
            if (!claim.is_string()) throw SupervisoryResponseError(
                "modelClaim must be null or a string");
            item->setToolTip("Model claim (not evidence): " + text(claim.as_string()));
        }
        const Json& validation_value = candidate.at("validation");
        if (!validation_value.is_null()) {
            item->setText(item->text() + QString(" | promotable: %1")
                .arg(boolean_field(validation_value, "promotable") ? "yes" : "no"));
        }
        QString detail = QString("Candidate: %1\nRevision: %2 (%3)\nCandidate hash: %4\nDescriptor hash: %5\nSource hash: %6\nDescriptor claim:\n%7\n\nSource manifest:")
            .arg(candidate_id, text(string_field(candidate, "revisionId")))
            .arg(integer_field(candidate, "revision"))
            .arg(text(string_field(candidate, "candidateHash")),
                 text(string_field(candidate, "descriptorHash")),
                 text(string_field(candidate, "sourceHash")), text(candidate.at("descriptor").dump()));
        const Json& sources = candidate.at("sources");
        if (!sources.is_array()) throw SupervisoryResponseError("candidate sources must be an array");
        for (const Json& source_file : sources.as_array()) {
            const auto& source_object = require_object(source_file, "candidate source");
            exact_fields(source_object, {"path", "size", "hash"}, "candidate source");
            detail += QString("\n- %1 | %2 bytes | %3")
                .arg(text(string_field(source_file, "path")))
                .arg(integer_field(source_file, "size"))
                .arg(text(string_field(source_file, "hash")));
        }
        if (validation_value.is_null()) {
            detail += "\n\nValidation: none observed";
        } else {
            const auto& validation_object = require_object(validation_value, "candidate validation");
            exact_fields(validation_object, {"validationId", "snapshotHash", "recordHash", "outcome",
                "promotable", "completedAt", "toolchain", "toolchainHash", "policyHash",
                "confinement", "suites"}, "candidate validation");
            const Json& toolchain = validation_value.at("toolchain");
            const auto& toolchain_object = require_object(toolchain, "validation toolchain");
            exact_fields(toolchain_object, {"name", "version", "target"}, "validation toolchain");
            const Json& confinement = validation_value.at("confinement");
            require_object(confinement, "validation confinement");
            detail += QString("\n\nObserved validation: %1 | promotable: %2\nValidation: %3\nSnapshot: %4\nRecord: %5\nToolchain: %6 %7 (%8)\nToolchain hash: %9\nPolicy hash: %10\nConfinement backend: %11 | filesystem=%12 descendants=%13 network=%14 cpu=%15 memory=%16")
                .arg(text(string_field(validation_value, "outcome")), boolean_field(validation_value, "promotable") ? "yes" : "no",
                     text(string_field(validation_value, "validationId")), text(string_field(validation_value, "snapshotHash")),
                     text(string_field(validation_value, "recordHash")), text(string_field(toolchain, "name")),
                     text(string_field(toolchain, "version")), text(string_field(toolchain, "target")),
                     text(string_field(validation_value, "toolchainHash")), text(string_field(validation_value, "policyHash")),
                     text(string_field(confinement, "backend")))
                .arg(boolean_field(confinement, "filesystem")).arg(boolean_field(confinement, "descendantProcesses"))
                .arg(boolean_field(confinement, "network")).arg(boolean_field(confinement, "cpu"))
                .arg(boolean_field(confinement, "memory"));
            const Json& suites = validation_value.at("suites");
            if (!suites.is_array()) throw SupervisoryResponseError("validation suites must be an array");
            for (const Json& suite : suites.as_array()) {
                require_object(suite, "validation suite");
                detail += QString("\n\nSuite %1 [%2] | outcome=%3 | commands=%4 | hidden=%5\nDefinition hash: %6")
                    .arg(text(string_field(suite, "suiteId")), text(string_field(suite, "kind")),
                         text(string_field(suite, "outcome")))
                    .arg(integer_field(suite, "commandCount"))
                    .arg(boolean_field(suite, "hidden") ? "yes" : "no")
                    .arg(text(string_field(suite, "definitionHash")));
                const Json& processes = suite.at("processes");
                if (!processes.is_array()) throw SupervisoryResponseError("validation processes must be an array");
                for (const Json& process : processes.as_array()) {
                    require_object(process, "validation process");
                    detail += QString("\n  - %1: %2, exit=%3, %4 ms\n    stdout=%5 stderr=%6")
                        .arg(text(string_field(process, "commandId")), text(string_field(process, "outcome")))
                        .arg(process.at("exitCode").is_null() ? "none" : QString::number(integer_field(process, "exitCode")))
                        .arg(integer_field(process, "durationMs"))
                        .arg(text(string_field(process, "stdoutHash")), text(string_field(process, "stderrHash")));
                }
            }
        }
        item->setData(Qt::UserRole, detail);
        const Json& proposal = candidate.at("proposal");
        if (!proposal.is_null()) {
            require_object(proposal, "installation proposal");
            detail += QString("\n\nInstallation proposal: %1 [%2]\nProposal hash: %3\nValidation: %4\nValidation record: %5\nCandidate snapshot: %6\nRequested permissions: %7")
                .arg(text(string_field(proposal, "proposalId")), text(string_field(proposal, "state")),
                     text(string_field(proposal, "proposalHash")), text(string_field(proposal, "validationId")),
                     text(string_field(proposal, "validationRecordHash")), text(string_field(proposal, "candidateSnapshotHash")),
                     text(proposal.at("requestedPermissions").dump()));
            item->setData(Qt::UserRole, detail);
            if (string_field(proposal, "state") == "proposed") {
                item->setData(Qt::UserRole + 1, text(string_field(proposal, "proposalId")));
                item->setData(Qt::UserRole + 2, text(string_field(proposal, "proposalHash")));
            }
        }
    }
    if (candidates_->count() > 0) candidates_->setCurrentRow(0);


    observations_->clear();
    for (const Json& observation : inspection.observations.as_array()) {
        require_object(observation, "Tool observation");
        const QString tool = text(string_field(observation, "tool"));
        const QString call_id = text(string_field(observation, "callId"));
        auto* item = new QListWidgetItem(QString("%1  [%2]").arg(tool, call_id), observations_);
        item->setToolTip(
            "Hash-verified session report: " + text(string_field(observation, "reportHash"))
            + "\nArtifact: " + text(string_field(observation, "reportArtifactId")));
    }

    const Json& memory = inspection.memory;
    require_object(memory, "memory");
    compute_memory_->clear();
    for (const Json& object : memory.at("compute").as_array()) {
        require_object(object, "compute memory object");
        auto* item = new QListWidgetItem(
            QString("%1  [%2] | rev %3 | %4 bytes")
                .arg(text(string_field(object, "objectId")), text(string_field(object, "state")))
                .arg(integer_field(object, "revision")).arg(integer_field(object, "size")),
            compute_memory_);
        item->setToolTip("Content hash: " + text(string_field(object, "hash")));
    }

    working_memory_->clear();
    for (const Json& revision : memory.at("working").as_array()) {
        require_object(revision, "working-memory revision");
        auto* item = new QListWidgetItem(
            QString("%1  [rev %2] | %3")
                .arg(text(string_field(revision, "key")))
                .arg(integer_field(revision, "revision"))
                .arg(text(string_field(revision, "committedAt"))),
            working_memory_);
        item->setToolTip(
            "Revision: " + text(string_field(revision, "revisionId"))
            + "\nProposal: " + text(string_field(revision, "proposalId"))
            + "\nHash: " + text(string_field(revision, "hash")));
    }

    artifacts_->clear();
    for (const Json& artifact : memory.at("artifacts").as_array()) {
        require_object(artifact, "artifact projection");
        const Json& parents = artifact.at("parentIds");
        const Json& children = artifact.at("childIds");
        if (!parents.is_array() || !children.is_array()) {
            throw SupervisoryResponseError("artifact lineage edges must be arrays");
        }
        auto* item = new QListWidgetItem(
            QString("%1  [%2] | %3 bytes | %4 parent(s), %5 child(ren)")
                .arg(text(string_field(artifact, "artifactId")),
                     text(string_field(artifact, "operation")))
                .arg(integer_field(artifact, "size"))
                .arg(parents.as_array().size()).arg(children.as_array().size()),
            artifacts_);
        item->setToolTip(
            "Content hash: " + text(string_field(artifact, "hash"))
            + "\nSchema hash: " + text(string_field(artifact, "schemaHash"))
            + "\nParameters hash: " + text(string_field(artifact, "parametersHash"))
            + "\nSoftware: " + text(string_field(artifact, "softwareVersion")));
    }

    timeline_->clear();
    for (const Json& entry : inspection.timeline.as_array()) {
        require_object(entry, "timeline entry");
        const QString kind = text(string_field(entry, "kind"));
        const QString occurred_at = text(string_field(entry, "occurredAt"));
        const QString summary = text(string_field(entry, "summary"));
        auto* item = new QListWidgetItem(
            QString("%1  [%2] %3").arg(occurred_at, kind, summary), timeline_);
        const Json& hash = entry.at("authoritativeHash");
        if (!hash.is_null()) {
            if (!hash.is_string()) throw SupervisoryResponseError(
                "authoritativeHash must be null or a string");
            item->setToolTip("Authoritative hash: " + text(hash.as_string()));
        } else if (kind == "model-claim") {
            item->setToolTip("Model claim only; no authoritative evidence hash");
        }
    }
}

void SupervisoryView::show_error(const QString& message) {
    connection_status_->setText("Unavailable: " + message);
}

void SupervisoryView::set_busy(bool busy) {
    busy_ = busy;
    refresh_button_->setEnabled(!busy && client_.is_running());
    workspace_selector_->setEnabled(!busy);
    goal_selector_->setEnabled(!busy);
    execute_button_->setEnabled(!busy && client_.is_running()
                                && goal_selector_->currentIndex() > 0
                                && execution_tool_selector_->count() > 0);
    const bool pending_proposal = candidates_->currentItem() != nullptr
        && !candidates_->currentItem()->data(Qt::UserRole + 1).toString().isEmpty();
    approve_candidate_->setEnabled(!busy && pending_proposal && client_.is_running());
    reject_candidate_->setEnabled(!busy && pending_proposal && client_.is_running());
    const bool current_candidate = candidates_->currentItem() != nullptr
        && !candidates_->currentItem()->data(Qt::UserRole + 3).toString().isEmpty();
    submit_hidden_challenge_->setEnabled(
        !busy && current_candidate && client_.is_running());
    revise_candidate_->setEnabled(!busy && current_candidate && client_.is_running());
}

} // namespace axiom_colab::gui
