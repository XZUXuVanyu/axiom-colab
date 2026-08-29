#include "supervisory_view.hpp"

#include <QComboBox>
#include <QFont>
#include <QGridLayout>
#include <QGroupBox>
#include <QHBoxLayout>
#include <QLabel>
#include <QListWidget>
#include <QPushButton>
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
        connection_status_->setText("Connected (read-only)");
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
        "Read-only projection of host-verified workspace state. This view cannot approve, install, or mutate laboratory state.",
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

    auto* summaries = new QGridLayout();
    summaries->addWidget(list_group("Discovered Tools", &tools_, this), 0, 0);
    summaries->addWidget(list_group("Tool candidates", &candidates_, this), 0, 1);
    summaries->addWidget(list_group("Observed Tool results", &observations_, this), 1, 0);
    summaries->addWidget(list_group("Immutable activity timeline", &timeline_, this), 1, 1);
    summaries->addWidget(list_group("Compute memory", &compute_memory_, this), 2, 0);
    summaries->addWidget(list_group("Approved working revisions", &working_memory_, this), 2, 1);
    summaries->addWidget(list_group("Artifact lineage and provenance", &artifacts_, this), 3, 0, 1, 2);
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
        connection_status_->setText("Connected (read-only)");
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
                        connection_status_->setText("Connected (read-only)");
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
    for (const Json& tool : inspection.tools.as_array()) {
        require_object(tool, "tool");
        const QString name = text(string_field(tool, "name"));
        const QString source = text(string_field(tool, "source"));
        auto* item = new QListWidgetItem(QString("%1  [%2]").arg(name, source), tools_);
        const Json& evidence = tool.at("installationEvidenceHash");
        if (!evidence.is_null()) {
            if (!evidence.is_string()) throw SupervisoryResponseError(
                "installationEvidenceHash must be null or a string");
            item->setToolTip("Verified installation evidence: " + text(evidence.as_string()));
        }
    }

    candidates_->clear();
    for (const Json& candidate : inspection.candidates.as_array()) {
        require_object(candidate, "candidate");
        const QString candidate_id = text(string_field(candidate, "candidateId"));
        const QString state = text(string_field(candidate, "state"));
        const QString validation = optional_state(candidate, "validation", "outcome");
        const QString approval = optional_state(candidate, "approval", "decision");
        const QString installation = optional_state(candidate, "installation", "outcome");
        auto* item = new QListWidgetItem(
            QString("%1  [%2] | validation: %3 | user decision: %4 | installation: %5")
                .arg(candidate_id, state, validation, approval, installation),
            candidates_);
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
    }


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
}

} // namespace axiom_colab::gui
