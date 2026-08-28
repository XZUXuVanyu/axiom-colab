#include "main_window.hpp"
#include "supervisory_view.hpp"

#include <QDir>
#include <QCheckBox>
#include <QDragEnterEvent>
#include <QFile>
#include <QFileDialog>
#include <QFileInfo>
#include <QFont>
#include <QGroupBox>
#include <QHBoxLayout>
#include <QLabel>
#include <QLineEdit>
#include <QListWidget>
#include <QMessageBox>
#include <QMimeData>
#include <QPlainTextEdit>
#include <QProcess>
#include <QPushButton>
#include <QSet>
#include <QStatusBar>
#include <QTextCursor>
#include <QTabWidget>
#include <QtAlgorithms>
#include <QUrl>
#include <QVBoxLayout>

#include <utility>

namespace {

bool is_source_file(const QString& path) {
    const QString suffix = QFileInfo(path).suffix().toLower();
    return suffix == "cpp" || suffix == "cc" || suffix == "cxx"
           || suffix == "h" || suffix == "hpp" || suffix == "hxx";
}

QString default_project_directory() {
    return QDir::cleanPath(QString::fromUtf8(CPP_ADAPTER_SOURCE_DIR));
}

} // namespace

MainWindow::MainWindow(QString supervisory_config_path, QWidget* parent)
    : QMainWindow(parent) {
    setWindowTitle("Axiom CoLab");
    resize(980, 720);
    setAcceptDrops(true);

    auto* tabs = new QTabWidget(this);
    auto* central = new QWidget(tabs);
    auto* page = new QVBoxLayout(central);
    page->setContentsMargins(20, 18, 20, 18);
    page->setSpacing(14);

    auto* heading = new QLabel("C++ Tool Authoring", central);
    QFont heading_font = heading->font();
    heading_font.setPointSize(17);
    heading_font.setBold(true);
    heading->setFont(heading_font);
    page->addWidget(heading);
    page->addWidget(new QLabel(
        "Import a conforming C++ Tool pair, then configure, build, test, and verify discovery.",
        central));

    auto* project_group = new QGroupBox("Adapter project", central);
    auto* project_layout = new QHBoxLayout(project_group);
    m_project_edit = new QLineEdit(default_project_directory(), project_group);
    m_project_edit->setToolTip("Directory containing CMakeLists.txt and proj/scripts/build-and-test.ps1");
    auto* browse_project = new QPushButton("Browse…", project_group);
    connect(browse_project, &QPushButton::clicked, this,
            &MainWindow::choose_project_directory);
    project_layout->addWidget(m_project_edit, 1);
    project_layout->addWidget(browse_project);
    page->addWidget(project_group);

    auto* harness_group = new QGroupBox("DeepSeek Harness", central);
    auto* harness_layout = new QVBoxLayout(harness_group);
    auto* harness_path_layout = new QHBoxLayout();
    m_harness_edit = new QLineEdit(harness_group);
    m_harness_edit->setPlaceholderText(
        "Harness checkout directory (or leave empty to use proj/config/adapter.local.json)");
    auto* browse_harness = new QPushButton("Browseâ€¦", harness_group);
    connect(browse_harness, &QPushButton::clicked, this,
            &MainWindow::choose_harness_directory);
    harness_path_layout->addWidget(m_harness_edit, 1);
    harness_path_layout->addWidget(browse_harness);
    harness_layout->addLayout(harness_path_layout);
    auto* harness_actions = new QHBoxLayout();
    m_auto_start_hub = new QCheckBox("Start Hub after successful import/build", harness_group);
    m_auto_start_hub->setChecked(true);
    m_start_hub_button = new QPushButton("Start Hub", harness_group);
    m_stop_hub_button = new QPushButton("Stop Hub", harness_group);
    m_stop_hub_button->setEnabled(false);
    connect(m_start_hub_button, &QPushButton::clicked, this, &MainWindow::start_hub);
    connect(m_stop_hub_button, &QPushButton::clicked, this, &MainWindow::stop_hub);
    harness_actions->addWidget(m_auto_start_hub);
    harness_actions->addStretch();
    harness_actions->addWidget(m_start_hub_button);
    harness_actions->addWidget(m_stop_hub_button);
    harness_layout->addLayout(harness_actions);
    page->addWidget(harness_group);

    auto* source_group = new QGroupBox("Source files — drag files or a folder here", central);
    auto* source_layout = new QVBoxLayout(source_group);
    m_source_list = new QListWidget(source_group);
    m_source_list->setSelectionMode(QAbstractItemView::ExtendedSelection);
    source_layout->addWidget(m_source_list, 1);
    auto* source_buttons = new QHBoxLayout();
    auto* add_files = new QPushButton("Add files…", source_group);
    auto* add_folder = new QPushButton("Add folder…", source_group);
    auto* remove = new QPushButton("Remove selected", source_group);
    auto* clear = new QPushButton("Clear", source_group);
    connect(add_files, &QPushButton::clicked, this, &MainWindow::choose_files);
    connect(add_folder, &QPushButton::clicked, this, &MainWindow::choose_folder);
    connect(remove, &QPushButton::clicked, this, [this] {
        qDeleteAll(m_source_list->selectedItems());
    });
    connect(clear, &QPushButton::clicked, m_source_list, &QListWidget::clear);
    source_buttons->addWidget(add_files);
    source_buttons->addWidget(add_folder);
    source_buttons->addWidget(remove);
    source_buttons->addStretch();
    source_buttons->addWidget(clear);
    source_layout->addLayout(source_buttons);
    page->addWidget(source_group, 1);

    auto* actions = new QHBoxLayout();
    m_import_button = new QPushButton("Import", central);
    m_build_button = new QPushButton("Build & Check", central);
    m_import_build_button = new QPushButton("Import, Build & Check", central);
    m_import_build_button->setObjectName("primaryButton");
    connect(m_import_button, &QPushButton::clicked, this, &MainWindow::import_sources);
    connect(m_build_button, &QPushButton::clicked, this, &MainWindow::start_build);
    connect(m_import_build_button, &QPushButton::clicked,
            this, &MainWindow::import_and_build);
    actions->addStretch();
    actions->addWidget(m_import_button);
    actions->addWidget(m_build_button);
    actions->addWidget(m_import_build_button);
    page->addLayout(actions);

    auto* output_group = new QGroupBox("Build output", central);
    auto* output_layout = new QVBoxLayout(output_group);
    m_output = new QPlainTextEdit(output_group);
    m_output->setReadOnly(true);
    m_output->setMaximumBlockCount(10000);
    QFont output_font("Cascadia Mono");
    output_font.setStyleHint(QFont::Monospace);
    m_output->setFont(output_font);
    output_layout->addWidget(m_output);
    page->addWidget(output_group, 1);

    tabs->addTab(new axiom_colab::gui::SupervisoryView(
                     default_project_directory(),
                     std::move(supervisory_config_path), tabs),
                 "Laboratory");
    tabs->addTab(central, "Tool authoring");
    setCentralWidget(tabs);
    statusBar()->showMessage("Ready");

    m_build_process = new QProcess(this);
    m_build_process->setProcessChannelMode(QProcess::MergedChannels);
    connect(m_build_process, &QProcess::readyReadStandardOutput,
            this, &MainWindow::append_process_output);
    connect(m_build_process, &QProcess::finished,
            this, &MainWindow::build_finished);
    connect(m_build_process, &QProcess::errorOccurred, this,
            [this](QProcess::ProcessError) {
                m_output->appendPlainText("\nFailed to start build: "
                                          + m_build_process->errorString());
            });

    m_hub_process = new QProcess(this);
    m_hub_process->setProcessChannelMode(QProcess::MergedChannels);
    connect(m_hub_process, &QProcess::readyReadStandardOutput,
            this, &MainWindow::append_hub_output);
    connect(m_hub_process, &QProcess::finished,
            this, &MainWindow::hub_finished);
    connect(m_hub_process, &QProcess::errorOccurred, this,
            [this](QProcess::ProcessError) {
                m_output->appendPlainText("\nFailed to start Hub: "
                                          + m_hub_process->errorString());
                m_start_hub_button->setEnabled(true);
                m_stop_hub_button->setEnabled(false);
            });
}

void MainWindow::dragEnterEvent(QDragEnterEvent* event) {
    if (event->mimeData()->hasUrls()) {
        event->acceptProposedAction();
    }
}

void MainWindow::dropEvent(QDropEvent* event) {
    QStringList paths;
    for (const QUrl& url : event->mimeData()->urls()) {
        if (url.isLocalFile()) {
            paths.push_back(url.toLocalFile());
        }
    }
    add_paths(paths);
    event->acceptProposedAction();
}

void MainWindow::choose_project_directory() {
    const QString directory = QFileDialog::getExistingDirectory(
        this, "Select adapter project", project_directory());
    if (!directory.isEmpty()) {
        m_project_edit->setText(QDir::cleanPath(directory));
    }
}

void MainWindow::choose_harness_directory() {
    const QString directory = QFileDialog::getExistingDirectory(
        this, "Select DeepSeek Harness checkout", m_harness_edit->text().trimmed());
    if (!directory.isEmpty()) {
        m_harness_edit->setText(QDir::cleanPath(directory));
    }
}

void MainWindow::choose_files() {
    add_paths(QFileDialog::getOpenFileNames(
        this, "Select C++ Tool sources", {},
        "C++ sources (*.cpp *.cc *.cxx *.h *.hpp *.hxx)"));
}

void MainWindow::choose_folder() {
    const QString directory = QFileDialog::getExistingDirectory(
        this, "Select source folder");
    if (!directory.isEmpty()) {
        add_paths({directory});
    }
}

void MainWindow::add_paths(const QStringList& paths) {
    QSet<QString> known;
    for (int index = 0; index < m_source_list->count(); ++index) {
        known.insert(m_source_list->item(index)->text());
    }
    for (const QString& path : paths) {
        const QString clean = QDir::cleanPath(QFileInfo(path).absoluteFilePath());
        if ((QFileInfo(clean).isDir() || is_source_file(clean)) && !known.contains(clean)) {
            m_source_list->addItem(clean);
            known.insert(clean);
        }
    }
}

QString MainWindow::project_directory() const {
    return QDir::cleanPath(m_project_edit->text().trimmed());
}

QStringList MainWindow::expanded_source_files() const {
    QSet<QString> files;
    const QStringList filters{"*.cpp", "*.cc", "*.cxx", "*.h", "*.hpp", "*.hxx"};
    for (int index = 0; index < m_source_list->count(); ++index) {
        const QString path = m_source_list->item(index)->text();
        const QFileInfo info(path);
        if (info.isDir()) {
            const QDir directory(path);
            for (const QFileInfo& entry : directory.entryInfoList(
                     filters, QDir::Files | QDir::Readable, QDir::Name)) {
                files.insert(entry.absoluteFilePath());
            }
        } else if (info.isFile() && is_source_file(path)) {
            files.insert(info.absoluteFilePath());
        }
    }
    return files.values();
}

bool MainWindow::validate_project(QString* error) const {
    const QDir root(project_directory());
    if (!root.exists("CMakeLists.txt")
        || !QFileInfo::exists(root.filePath("proj/scripts/build-and-test.ps1"))) {
        *error = "The project directory must contain CMakeLists.txt and "
                 "proj/scripts/build-and-test.ps1.";
        return false;
    }
    return true;
}

bool MainWindow::validate_sources(const QStringList& files, QString* error) const {
    bool has_implementation = false;
    bool has_header = false;
    for (const QString& file : files) {
        const QString suffix = QFileInfo(file).suffix().toLower();
        has_implementation = has_implementation || suffix == "cpp" || suffix == "cc"
                             || suffix == "cxx";
        has_header = has_header || suffix == "h" || suffix == "hpp" || suffix == "hxx";
    }
    if (files.isEmpty() || !has_implementation || !has_header) {
        *error = "Select at least one C++ implementation and one header file.";
        return false;
    }
    return true;
}

bool MainWindow::copy_sources(const QStringList& files, QString* error) {
    QDir root(project_directory());
    if (!root.mkpath("source/cpp/tools")) {
        *error = "Could not create source/cpp/tools in the selected project.";
        return false;
    }
    const QString destination = root.filePath("source/cpp/tools");
    for (const QString& source : files) {
        const QString target = QDir(destination).filePath(QFileInfo(source).fileName());
        if (QFileInfo(source).absoluteFilePath() == QFileInfo(target).absoluteFilePath()) {
            continue;
        }
        if (QFileInfo::exists(target)) {
            const auto answer = QMessageBox::question(
                this, "Replace existing source?",
                QString("%1 already exists in source/cpp/tools. Replace it?")
                    .arg(QFileInfo(target).fileName()),
                QMessageBox::Yes | QMessageBox::No | QMessageBox::Cancel,
                QMessageBox::No);
            if (answer == QMessageBox::Cancel) {
                *error = "Import cancelled.";
                return false;
            }
            if (answer == QMessageBox::No) {
                continue;
            }
            if (!QFile::remove(target)) {
                *error = "Could not replace " + target;
                return false;
            }
        }
        if (!QFile::copy(source, target)) {
            *error = "Could not copy " + source + " to " + target;
            return false;
        }
        m_output->appendPlainText("Imported: " + target);
    }
    return true;
}

void MainWindow::import_sources() {
    QString error;
    const QStringList files = expanded_source_files();
    if (!validate_project(&error) || !validate_sources(files, &error)
        || !copy_sources(files, &error)) {
        QMessageBox::warning(this, "Import failed", error);
        return;
    }
    statusBar()->showMessage("Import complete", 5000);
    if (m_auto_start_hub->isChecked()) {
        start_hub();
    }
}

void MainWindow::import_and_build() {
    QString error;
    const QStringList files = expanded_source_files();
    if (!validate_project(&error) || !validate_sources(files, &error)
        || !copy_sources(files, &error)) {
        QMessageBox::warning(this, "Import failed", error);
        return;
    }
    start_build();
}

void MainWindow::start_build() {
    QString error;
    if (!validate_project(&error)) {
        QMessageBox::warning(this, "Build unavailable", error);
        return;
    }
    if (m_build_process->state() != QProcess::NotRunning) {
        return;
    }

    m_output->appendPlainText("\n=== Build and check ===");
    m_launch_hub_after_build = m_auto_start_hub->isChecked();
    const QString script = QDir(project_directory()).filePath("proj/scripts/build-and-test.ps1");
    m_build_process->setWorkingDirectory(project_directory());
    set_running(true);
    m_build_process->start(
        "powershell.exe",
        {"-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script,
         "-SkipHarnessInspection", "-SkipGuiBuild"});
}

void MainWindow::start_hub() {
    QString error;
    if (!validate_project(&error)) {
        QMessageBox::warning(this, "Hub unavailable", error);
        return;
    }
    if (m_hub_process->state() != QProcess::NotRunning) {
        statusBar()->showMessage("Hub is already running", 5000);
        return;
    }

    const QString harness_root = QDir::cleanPath(m_harness_edit->text().trimmed());
    if (!harness_root.isEmpty() && !QDir(harness_root).exists()) {
        QMessageBox::warning(this, "Hub unavailable",
                             "The selected DeepSeek Harness directory does not exist.");
        return;
    }

    m_output->appendPlainText("\n=== Starting DeepSeek Harness Hub ===");
    const QString script = QDir(project_directory()).filePath("proj/scripts/start-dsh.ps1");
    QStringList arguments{
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script,
    };
    if (!harness_root.isEmpty()) {
        arguments.append({"-HarnessRoot", harness_root});
    }
    m_hub_process->setWorkingDirectory(project_directory());
    m_start_hub_button->setEnabled(false);
    m_stop_hub_button->setEnabled(true);
    statusBar()->showMessage("Starting Hubâ€¦");
    m_hub_process->start("powershell.exe", arguments);
}

void MainWindow::stop_hub() {
    if (m_hub_process->state() == QProcess::NotRunning) {
        return;
    }
    m_output->appendPlainText("\n=== Stopping DeepSeek Harness Hub ===");
    m_hub_process->terminate();
    if (!m_hub_process->waitForFinished(3000)) {
        m_hub_process->kill();
    }
}

void MainWindow::append_process_output() {
    m_output->moveCursor(QTextCursor::End);
    m_output->insertPlainText(QString::fromLocal8Bit(m_build_process->readAllStandardOutput()));
    m_output->moveCursor(QTextCursor::End);
}

void MainWindow::append_hub_output() {
    m_output->moveCursor(QTextCursor::End);
    m_output->insertPlainText(QString::fromLocal8Bit(m_hub_process->readAllStandardOutput()));
    m_output->moveCursor(QTextCursor::End);
}

void MainWindow::build_finished(int exit_code, QProcess::ExitStatus exit_status) {
    append_process_output();
    const bool success = exit_status == QProcess::NormalExit && exit_code == 0;
    m_output->appendPlainText(success
                                 ? "\n=== Build and check passed ==="
                                 : QString("\n=== Build failed (exit %1) ===").arg(exit_code));
    statusBar()->showMessage(success ? "Build and check passed" : "Build failed");
    set_running(false);
    if (success && m_launch_hub_after_build) {
        start_hub();
    }
    m_launch_hub_after_build = false;
}

void MainWindow::hub_finished(int exit_code, QProcess::ExitStatus exit_status) {
    append_hub_output();
    const bool normal = exit_status == QProcess::NormalExit;
    m_output->appendPlainText(
        QString("\n=== Hub stopped (%1 %2) ===")
            .arg(normal ? "exit" : "crash")
            .arg(exit_code));
    m_start_hub_button->setEnabled(true);
    m_stop_hub_button->setEnabled(false);
    statusBar()->showMessage("Hub stopped", 5000);
}

void MainWindow::set_running(bool running) {
    m_project_edit->setEnabled(!running);
    m_harness_edit->setEnabled(!running);
    m_import_button->setEnabled(!running);
    m_build_button->setEnabled(!running);
    m_import_build_button->setEnabled(!running);
    if (running) {
        statusBar()->showMessage("Building…");
    }
}
