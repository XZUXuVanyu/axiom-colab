#include "supervisory_view.hpp"

#include <QApplication>
#include <QComboBox>
#include <QDir>
#include <QElapsedTimer>
#include <QLabel>
#include <QListWidget>
#include <QLineEdit>
#include <QPlainTextEdit>
#include <QPushButton>
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
    auto* execute = view.findChild<QPushButton*>("executeTool");
    auto* arguments = view.findChild<QPlainTextEdit*>("executionArguments");
    auto* execution_result = view.findChild<QLabel*>("executionResult");
    auto* candidate_details = view.findChild<QPlainTextEdit*>("candidateDetails");
    auto* reject_candidate = view.findChild<QPushButton*>("rejectCandidate");
    auto* challenge_input = view.findChild<QPlainTextEdit*>("hiddenChallengeInput");
    auto* submit_challenge = view.findChild<QPushButton*>("submitHiddenChallenge");
    auto* challenge_result = view.findChild<QLabel*>("hiddenChallengeResult");
    auto* revision_input = view.findChild<QPlainTextEdit*>("candidateRevisionInput");
    auto* revise_candidate = view.findChild<QPushButton*>("reviseCandidate");
    auto* revision_result = view.findChild<QLabel*>("candidateRevisionResult");
    auto* initial_input = view.findChild<QPlainTextEdit*>("initialCandidateInput");
    auto* create_candidate = view.findChild<QPushButton*>("createCandidate");
    auto* initial_result = view.findChild<QLabel*>("initialCandidateResult");
    auto* stop_goal = view.findChild<QPushButton*>("stopGoal");
    auto* resume_goal = view.findChild<QPushButton*>("resumeGoal");
    auto* capabilities = view.findChild<QListWidget*>("revocableCapabilities");
    auto* revoke_capability = view.findChild<QPushButton*>("revokeCapability");
    auto* recover_workspace = view.findChild<QPushButton*>("recoverWorkspace");
    auto* lifecycle_result = view.findChild<QLabel*>("lifecycleResult");
    auto* new_workspace_id = view.findChild<QLineEdit*>("newWorkspaceId");
    auto* create_workspace = view.findChild<QPushButton*>("createWorkspace");
    auto* new_goal_id = view.findChild<QLineEdit*>("newGoalId");
    auto* new_goal_objective = view.findChild<QPlainTextEdit*>("newGoalObjective");
    auto* create_goal = view.findChild<QPushButton*>("createGoal");
    auto* creation_result = view.findChild<QLabel*>("creationResult");
    if (workspaces == nullptr || goals == nullptr || resources == nullptr
        || plan == nullptr || status == nullptr || compute == nullptr
        || working == nullptr || artifacts == nullptr) {
        std::cerr << "[FAIL] supervisory widgets are not inspectable\n";
        return 1;
    }
    if (execute == nullptr || arguments == nullptr || execution_result == nullptr
        || candidate_details == nullptr || reject_candidate == nullptr
        || challenge_input == nullptr || submit_challenge == nullptr
        || challenge_result == nullptr || revision_input == nullptr
        || revise_candidate == nullptr || revision_result == nullptr
        || initial_input == nullptr || create_candidate == nullptr
        || initial_result == nullptr || stop_goal == nullptr || resume_goal == nullptr
        || capabilities == nullptr || revoke_capability == nullptr
        || recover_workspace == nullptr || lifecycle_result == nullptr) {
        std::cerr << "[FAIL] Tool execution widgets are not inspectable\n";
        return 1;
    }
    if (new_workspace_id == nullptr || create_workspace == nullptr
        || new_goal_id == nullptr || new_goal_objective == nullptr
        || create_goal == nullptr || creation_result == nullptr) {
        std::cerr << "[FAIL] workspace and goal creation widgets are not inspectable\n";
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
    if (status->text() != "Connected (supervised)") {
        std::cerr << "[FAIL] supervisory view did not remain connected\n";
        return 1;
    }
    if (!stop_goal->isEnabled() || resume_goal->isEnabled()
        || capabilities->count() != 1 || !recover_workspace->isEnabled()) {
        std::cerr << "[FAIL] authoritative lifecycle controls did not render\n";
        return 1;
    }
    stop_goal->click();
    timer.restart();
    while (timer.elapsed() < 5000 && !resume_goal->isEnabled()) {
        application.processEvents(); QThread::msleep(10);
    }
    if (!lifecycle_result->text().contains("Goal stopped") || stop_goal->isEnabled()) {
        std::cerr << "[FAIL] host stop did not refresh lifecycle state\n";
        return 1;
    }
    capabilities->setCurrentRow(0);
    revoke_capability->click();
    timer.restart();
    while (timer.elapsed() < 5000 && capabilities->count() != 0) {
        application.processEvents(); QThread::msleep(10);
    }
    if (!lifecycle_result->text().contains("Capability revoked")) {
        std::cerr << "[FAIL] host capability revocation did not refresh state\n";
        return 1;
    }
    recover_workspace->click();
    timer.restart();
    while (timer.elapsed() < 5000
           && !lifecycle_result->text().contains("recovery completed")) {
        application.processEvents(); QThread::msleep(10);
    }
    if (!lifecycle_result->text().contains("recovery completed")) {
        std::cerr << "[FAIL] host workspace recovery did not refresh state\n";
        return 1;
    }
    timer.restart();
    while (timer.elapsed() < 5000 && !resume_goal->isEnabled()) {
        application.processEvents(); QThread::msleep(10);
    }
    resume_goal->click();
    timer.restart();
    while (timer.elapsed() < 5000 && !stop_goal->isEnabled()) {
        application.processEvents(); QThread::msleep(10);
    }
    if (!lifecycle_result->text().contains("Goal resumed")) {
        std::cerr << "[FAIL] host resume did not refresh lifecycle state\n";
        return 1;
    }
    if (compute->count() != 1 || working->count() != 1 || artifacts->count() != 1
        || !artifacts->item(0)->text().contains("object:artifact")
        || !artifacts->item(0)->toolTip().contains("Schema hash")) {
        std::cerr << "[FAIL] memory and artifact lineage did not render\n";
        return 1;
    }
    if (!candidate_details->toPlainText().contains("src/tool.cpp")
        || !candidate_details->toPlainText().contains("Suite standard-suite [standard] | outcome=failed")
        || !candidate_details->toPlainText().contains("promotable: no")) {
        std::cerr << "[FAIL] candidate source and observed validation evidence did not render\n";
        return 1;
    }
    if (!reject_candidate->isEnabled()
        || !candidate_details->toPlainText().contains("proposal:fixture [proposed]")) {
        std::cerr << "[FAIL] exact pending installation proposal was not actionable\n";
        return 1;
    }
    challenge_input->setPlainText(R"({"fixtures":[{"path":"tests/private.txt","contentBase64":"cHJpdmF0ZQ=="}],"commands":[{"commandId":"hidden-test","executable":"/usr/bin/ctest","args":[],"cwd":"candidate"}]})");
    submit_challenge->click();
    if (!challenge_input->toPlainText().isEmpty()) {
        std::cerr << "[FAIL] private hidden challenge remained in widget state after submission\n";
        return 1;
    }
    timer.restart();
    while (timer.elapsed() < 5000
           && (!challenge_result->text().contains("Observed validation: passed")
               || !reject_candidate->isEnabled())) {
        application.processEvents(); QThread::msleep(10);
    }
    if (!challenge_result->text().contains("promotable: yes")
        || !challenge_result->toolTip().contains("validation:hidden")
        || challenge_result->toolTip().contains("private")
        || !challenge_input->toPlainText().isEmpty()) {
        std::cerr << "[FAIL] hidden challenge did not render redacted evidence\n";
        return 1;
    }
    reject_candidate->click();
    timer.restart();
    while (timer.elapsed() < 5000
           && !candidate_details->toPlainText().contains("proposal:fixture [rejected]")) {
        application.processEvents();
        QThread::msleep(10);
    }
    if (!candidate_details->toPlainText().contains("proposal:fixture [rejected]")) {
        std::cerr << "[FAIL] exact installation rejection did not refresh authoritative state\n";
        return 1;
    }
    arguments->setPlainText(R"({"left":2,"right":3})");
    execute->click();
    timer.restart();
    while (timer.elapsed() < 5000 && !execution_result->text().contains("\"sum\":5")) {
        application.processEvents();
        QThread::msleep(10);
    }
    if (!execution_result->text().contains("\"sum\":5")
        || !execution_result->toolTip().contains("object:report")) {
        std::cerr << "[FAIL] observed Tool execution did not render\n";
        return 1;
    }
    timer.restart();
    while (timer.elapsed() < 5000 && !revise_candidate->isEnabled()) {
        application.processEvents(); QThread::msleep(10);
    }
    revision_input->setPlainText(R"({"descriptor":{"name":"candidate_tool"},"sources":[{"path":"src/tool.cpp","contentBase64":"cmV2aXNlZCBzb3VyY2U="}]})");
    revise_candidate->click();
    if (!revision_input->toPlainText().isEmpty()) {
        std::cerr << "[FAIL] submitted candidate source remained in widget state\n";
        return 1;
    }
    timer.restart();
    while (timer.elapsed() < 5000
           && !revision_result->text().contains("Created revision 2")) {
        application.processEvents(); QThread::msleep(10);
    }
    if (!revision_result->text().contains("Prior validation and proposal bindings are now stale")
        || !revision_result->toolTip().contains("evidence:revised")
        || !revision_input->toPlainText().isEmpty()) {
        std::cerr << "[FAIL] immutable candidate revision did not render or clear source input\n";
        return 1;
    }
    timer.restart();
    while (timer.elapsed() < 5000 && !create_candidate->isEnabled()) {
        application.processEvents(); QThread::msleep(10);
    }
    initial_input->setPlainText(R"({"specification":{"problem":"Need a Tool.","publicName":"new_tool","description":"New Tool.","inputSchema":{"type":"object"},"outputSchema":{"type":"object"},"requestedPermissions":[],"acceptanceCriteria":["It works."]},"descriptor":{"name":"new_tool"},"sources":[{"path":"src/new_tool.cpp","contentBase64":"aW5pdGlhbCBzb3VyY2U="}]})");
    create_candidate->click();
    if (!initial_input->toPlainText().isEmpty()) {
        std::cerr << "[FAIL] submitted initial candidate source remained in widget state\n";
        return 1;
    }
    timer.restart();
    while (timer.elapsed() < 5000
           && !initial_result->text().contains("immutable candidate revision 1")) {
        application.processEvents(); QThread::msleep(10);
    }
    if (!initial_result->text().contains("Validation is still required")
        || !initial_result->toolTip().contains("proposal:new")
        || !initial_result->toolTip().contains("evidence:initial")
        || !initial_input->toPlainText().isEmpty()) {
        std::cerr << "[FAIL] initial candidate creation did not render or clear source input\n";
        return 1;
    }
    timer.restart();
    while (timer.elapsed() < 5000 && !create_workspace->isEnabled()) {
        application.processEvents(); QThread::msleep(10);
    }
    new_workspace_id->setText("workspace:new");
    create_workspace->click();
    timer.restart();
    while (timer.elapsed() < 5000
           && workspaces->currentText() != "workspace:new") {
        application.processEvents(); QThread::msleep(10);
    }
    if (workspaces->currentText() != "workspace:new"
        || !creation_result->text().contains("host-owned store")) {
        std::cerr << "[FAIL] host workspace creation did not refresh selection: workspace="
                  << workspaces->currentText().toStdString() << " result="
                  << creation_result->text().toStdString() << " status="
                  << status->text().toStdString() << "\n";
        return 1;
    }
    timer.restart();
    while (timer.elapsed() < 5000 && !create_goal->isEnabled()) {
        application.processEvents(); QThread::msleep(10);
    }
    new_goal_id->setText("goal:new");
    new_goal_objective->setPlainText("Approve and inspect this plan.");
    create_goal->click();
    timer.restart();
    while (timer.elapsed() < 5000 && goals->currentText() != "goal:new") {
        application.processEvents(); QThread::msleep(10);
    }
    if (goals->currentText() != "goal:new"
        || !creation_result->text().contains("exact user approval")
        || !creation_result->toolTip().contains("object:new-plan")) {
        std::cerr << "[FAIL] approved goal creation did not refresh authoritative selection: goal="
                  << goals->currentText().toStdString() << " result="
                  << creation_result->text().toStdString() << " status="
                  << status->text().toStdString() << "\n";
        return 1;
    }
    std::cout << "[PASS] supervisory view renders workspace resources\n";
    return 0;
}
