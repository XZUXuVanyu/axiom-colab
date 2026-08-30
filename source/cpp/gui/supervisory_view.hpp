#pragma once

#include "supervisory_process_client.hpp"

#include <QWidget>

#include <QStringList>

class QComboBox;
class QLabel;
class QLineEdit;
class QListWidget;
class QPushButton;
class QPlainTextEdit;

namespace axiom_colab::gui {

struct SupervisoryProcessLaunch final {
    QString program;
    QStringList arguments;
    QString working_directory;
};

class SupervisoryView final : public QWidget {
    Q_OBJECT

public:
    SupervisoryView(QString repository_root, QString config_path,
                    QWidget* parent = nullptr);
    explicit SupervisoryView(SupervisoryProcessLaunch launch,
                             QWidget* parent = nullptr);

private:
    void build_ui();
    void start_process();
    void load_workspaces();
    void load_goals();
    void create_workspace();
    void create_goal();
    void inspect_selected_workspace();
    void execute_selected_tool();
    void decide_selected_installation(bool approve);
    void submit_selected_hidden_challenge();
    void revise_selected_candidate();
    void create_initial_candidate();
    void change_goal_state(bool stop);
    void revoke_selected_capability();
    void recover_selected_workspace();
    void render(const SupervisoryWorkspaceInspection& inspection);
    void show_error(const QString& message);
    void set_busy(bool busy);

    QString repository_root_;
    QString config_path_;
    SupervisoryProcessClient client_;
    QLabel* connection_status_{};
    QComboBox* workspace_selector_{};
    QComboBox* goal_selector_{};
    QPushButton* refresh_button_{};
    QLineEdit* new_workspace_id_{};
    QPushButton* create_workspace_{};
    QLineEdit* new_goal_id_{};
    QPlainTextEdit* new_goal_objective_{};
    QPushButton* create_goal_{};
    QLabel* creation_result_{};
    QLabel* resources_{};
    QLabel* approved_plan_{};
    QLabel* goal_progress_{};
    QPushButton* stop_goal_{};
    QPushButton* resume_goal_{};
    QListWidget* revocable_capabilities_{};
    QPushButton* revoke_capability_{};
    QPushButton* recover_workspace_{};
    QLabel* lifecycle_result_{};
    QListWidget* tools_{};
    QListWidget* candidates_{};
    QPlainTextEdit* candidate_details_{};
    QPushButton* approve_candidate_{};
    QPushButton* reject_candidate_{};
    QPlainTextEdit* hidden_challenge_input_{};
    QPushButton* submit_hidden_challenge_{};
    QLabel* hidden_challenge_result_{};
    QPlainTextEdit* candidate_revision_input_{};
    QPushButton* revise_candidate_{};
    QLabel* candidate_revision_result_{};
    QPlainTextEdit* initial_candidate_input_{};
    QPushButton* create_candidate_{};
    QLabel* initial_candidate_result_{};
    QListWidget* timeline_{};
    QListWidget* observations_{};
    QListWidget* compute_memory_{};
    QListWidget* working_memory_{};
    QListWidget* artifacts_{};
    QComboBox* execution_tool_selector_{};
    QPlainTextEdit* execution_arguments_{};
    QPushButton* execute_button_{};
    QLabel* execution_result_{};
    bool busy_{};
    bool can_stop_goal_{};
    bool can_resume_goal_{};
    bool recovery_required_{};
    std::string plan_revision_id_;
    std::string plan_hash_;
};

} // namespace axiom_colab::gui
