#include "supervisory_view.hpp"

#include <QApplication>
#include <QComboBox>
#include <QDir>
#include <QElapsedTimer>
#include <QLabel>
#include <QListWidget>
#include <QThread>

#include <iostream>

int main(int argc, char* argv[]) {
    QApplication application(argc, argv);
    const QString root = QString::fromUtf8(CPP_ADAPTER_SOURCE_DIR);
    axiom_colab::gui::SupervisoryView view({
        .program = "node",
        .arguments = {
            QDir(root).filePath("tests/fixtures/supervisory-transport-child.mjs"),
        },
        .working_directory = root,
    });

    auto* workspaces = view.findChild<QComboBox*>("workspaceSelector");
    auto* goals = view.findChild<QComboBox*>("goalSelector");
    auto* resources = view.findChild<QLabel*>("resourceSummary");
    auto* plan = view.findChild<QLabel*>("approvedPlan");
    auto* status = view.findChild<QLabel*>("connectionStatus");
    auto* compute = view.findChild<QListWidget*>("computeMemory");
    auto* working = view.findChild<QListWidget*>("workingMemory");
    auto* artifacts = view.findChild<QListWidget*>("artifactLineage");
    if (workspaces == nullptr || goals == nullptr || resources == nullptr
        || plan == nullptr || status == nullptr || compute == nullptr
        || working == nullptr || artifacts == nullptr) {
        std::cerr << "[FAIL] supervisory widgets are not inspectable\n";
        return 1;
    }

    QElapsedTimer timer;
    timer.start();
    while (timer.elapsed() < 5000
           && !resources->text().startsWith("0 bytes of 10")) {
        application.processEvents();
        QThread::msleep(10);
    }

    if (workspaces->count() != 2
        || workspaces->itemText(0) != "workspace:alpha"
        || workspaces->itemText(1) != "workspace:beta") {
        std::cerr << "[FAIL] workspace selector did not render the decoded list\n";
        return 1;
    }
    if (resources->text()
        != "0 bytes of 10 | 0 objects of 1 | 0 expired | 0 corrupt") {
        std::cerr << "[FAIL] resource summary did not render the inspection\n";
        return 1;
    }
    if (goals->count() != 2 || goals->itemText(0) != "Workspace overview"
        || goals->itemText(1) != "goal:one") {
        std::cerr << "[FAIL] goal selector did not render the bound goal list\n";
        return 1;
    }
    goals->setCurrentIndex(1);
    timer.restart();
    while (timer.elapsed() < 5000
           && plan->text() != "Inspect authoritative state.") {
        application.processEvents();
        QThread::msleep(10);
    }
    if (plan->text() != "Inspect authoritative state."
        || !plan->toolTip().contains("object:plan")) {
        std::cerr << "[FAIL] approved plan did not render for the selected goal\n";
        return 1;
    }
    if (status->text() != "Connected (read-only)") {
        std::cerr << "[FAIL] supervisory view did not remain connected\n";
        return 1;
    }
    if (compute->count() != 1 || working->count() != 1 || artifacts->count() != 1
        || !artifacts->item(0)->text().contains("object:artifact")
        || !artifacts->item(0)->toolTip().contains("Schema hash")) {
        std::cerr << "[FAIL] memory and artifact lineage did not render\n";
        return 1;
    }
    std::cout << "[PASS] supervisory view renders workspace resources\n";
    return 0;
}
