#pragma once

#include <QMainWindow>
#include <QProcess>
#include <QStringList>

class QLineEdit;
class QListWidget;
class QPlainTextEdit;
class QPushButton;
class QCheckBox;

class MainWindow final : public QMainWindow {
    Q_OBJECT

public:
    explicit MainWindow(QString supervisory_config_path = {},
                        QWidget* parent = nullptr);

protected:
    void dragEnterEvent(QDragEnterEvent* event) override;
    void dropEvent(QDropEvent* event) override;

private:
    void choose_project_directory();
    void choose_harness_directory();
    void choose_files();
    void choose_folder();
    void add_paths(const QStringList& paths);
    void import_sources();
    void import_and_build();
    void start_build();
    void start_hub();
    void stop_hub();
    void append_process_output();
    void append_hub_output();
    void build_finished(int exit_code, QProcess::ExitStatus exit_status);
    void hub_finished(int exit_code, QProcess::ExitStatus exit_status);
    [[nodiscard]] QString project_directory() const;
    [[nodiscard]] QStringList expanded_source_files() const;
    [[nodiscard]] bool validate_project(QString* error) const;
    [[nodiscard]] bool validate_sources(const QStringList& files,
                                        QString* error) const;
    [[nodiscard]] bool copy_sources(const QStringList& files, QString* error);
    void set_running(bool running);

    QLineEdit* m_project_edit{};
    QLineEdit* m_harness_edit{};
    QListWidget* m_source_list{};
    QPlainTextEdit* m_output{};
    QPushButton* m_import_button{};
    QPushButton* m_build_button{};
    QPushButton* m_import_build_button{};
    QPushButton* m_start_hub_button{};
    QPushButton* m_stop_hub_button{};
    QCheckBox* m_auto_start_hub{};
    QProcess* m_build_process{};
    QProcess* m_hub_process{};
    bool m_launch_hub_after_build{};
};
