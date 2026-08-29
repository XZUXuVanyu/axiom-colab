#pragma once

#include "supervisory_process_client.hpp"

#include <QWidget>

#include <QStringList>

class QComboBox;
class QLabel;
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
    void inspect_selected_workspace();
    void execute_selected_tool();
    void decide_selected_installation(bool approve);
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
    QLabel* resources_{};
    QLabel* approved_plan_{};
    QLabel* goal_progress_{};
    QListWidget* tools_{};
    QListWidget* candidates_{};
    QPlainTextEdit* candidate_details_{};
    QPushButton* approve_candidate_{};
    QPushButton* reject_candidate_{};
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
};

} // namespace axiom_colab::gui
