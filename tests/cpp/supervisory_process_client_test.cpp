#include "supervisory_process_client.hpp"

#include <QCoreApplication>
#include <QDir>
#include <QEventLoop>
#include <QTimer>

#include <iostream>
#include <string>

int main(int argc, char* argv[]) {
    QCoreApplication application(argc, argv);
    axiom_colab::gui::SupervisoryProcessClient client;
    const QString root = QString::fromUtf8(CPP_ADAPTER_SOURCE_DIR);
    client.start(
        "node",
        {QDir(root).filePath("tests/fixtures/supervisory-transport-child.mjs")},
        root);

    QEventLoop loop;
    QTimer timeout;
    timeout.setSingleShot(true);
    QObject::connect(&timeout, &QTimer::timeout, &loop, &QEventLoop::quit);

    int received = 0;
    std::string failure;
    const std::string request_id = client.list_workspaces(
        [&](const axiom_colab::gui::SupervisoryResponse* response,
            const std::string* error) {
            if (error != nullptr) {
                failure = *error;
            } else if (response == nullptr || !response->ok) {
                failure = "list-workspaces did not return a success response";
            } else {
                const auto workspaces =
                    axiom_colab::gui::parse_workspace_list_result(*response);
                if (workspaces.size() != 2
                    || workspaces[0] != "workspace:alpha"
                    || workspaces[1] != "workspace:beta") {
                    failure = "list-workspaces returned unexpected content";
                }
            }
            if (++received == 3) loop.quit();
        });
    const std::string goals_id = client.list_goals(
        "workspace:alpha",
        [&](const axiom_colab::gui::SupervisoryResponse* response,
            const std::string* error) {
            if (error != nullptr) {
                failure = *error;
            } else if (response == nullptr || !response->ok) {
                failure = "list-goals did not return a success response";
            } else {
                const auto goals = axiom_colab::gui::parse_goal_list_result(
                    *response, "workspace:alpha");
                if (goals.goals.size() != 1 || goals.goals[0] != "goal:one") {
                    failure = "list-goals returned unexpected content";
                }
            }
            if (++received == 3) loop.quit();
        });
    const std::string inspect_id = client.inspect(
        "workspace:alpha", std::nullopt,
        [&](const axiom_colab::gui::SupervisoryResponse* response,
            const std::string* error) {
            if (error != nullptr) {
                failure = *error;
            } else if (response == nullptr || !response->ok) {
                failure = "inspect did not return a success response";
            } else {
                const auto inspection =
                    axiom_colab::gui::parse_workspace_inspection_result(
                        *response, "workspace:alpha", std::nullopt);
                if (inspection.workspace_id != "workspace:alpha"
                    || inspection.goal_id.has_value()) {
                    failure = "inspect did not return the selected workspace";
                }
            }
            if (++received == 3) loop.quit();
        });

    timeout.start(5000);
    loop.exec();
    client.stop();

    if (received != 3) failure = "timed out waiting for supervisory responses";
    if (request_id != "qt:1") failure = "request ID sequence is not deterministic";
    if (goals_id != "qt:2") failure = "goal request ID sequence is not deterministic";
    if (inspect_id != "qt:3") failure = "inspect request ID sequence is not deterministic";
    if (!failure.empty()) {
        std::cerr << "[FAIL] " << failure << '\n';
        return 1;
    }
    std::cout << "[PASS] real supervisory process workspace, goal, and inspection reads\n";
    return 0;
}
