#pragma once

#include "supervisory_response.hpp"

#include <QByteArray>
#include <QProcess>
#include <QString>
#include <QStringList>

#include <cstddef>
#include <deque>
#include <functional>
#include <optional>
#include <string>
#include <string_view>

namespace axiom_colab::gui {

class SupervisoryProcessClient final {
public:
    using ResponseHandler =
        std::function<void(const SupervisoryResponse*, const std::string*)>;

    explicit SupervisoryProcessClient(std::size_t max_line_bytes = 64 * 1024);
    ~SupervisoryProcessClient();

    SupervisoryProcessClient(const SupervisoryProcessClient&) = delete;
    SupervisoryProcessClient& operator=(const SupervisoryProcessClient&) = delete;

    void start(const QString& program, const QStringList& arguments,
               const QString& working_directory = {});
    void start_local_supervisory_process(const QString& node_executable,
                                         const QString& repository_root,
                                         const QString& config_path);
    void stop();
    [[nodiscard]] bool is_running() const;
    [[nodiscard]] std::string list_workspaces(ResponseHandler handler);
    [[nodiscard]] std::string list_goals(
        std::string_view workspace_id, ResponseHandler handler);
    [[nodiscard]] std::string inspect(
        std::string_view workspace_id,
        std::optional<std::string_view> goal_id,
        ResponseHandler handler);
    [[nodiscard]] std::string execute_tool(
        std::string_view workspace_id, std::string_view goal_id,
        std::string_view tool, cpp_adapter::Json arguments,
        ResponseHandler handler);
    [[nodiscard]] std::string decide_installation(
        std::string_view workspace_id, std::string_view proposal_id,
        std::string_view proposal_hash, std::string_view decision,
        ResponseHandler handler);

private:
    struct PendingRequest final {
        std::string id;
        ResponseHandler handler;
    };

    void read_stdout();
    void accept_line(QByteArray line);
    void fail_pending(std::string message);
    [[nodiscard]] std::string send_request(cpp_adapter::Json request,
                                           ResponseHandler handler);

    QProcess process_;
    QByteArray stdout_buffer_;
    std::deque<PendingRequest> pending_;
    std::size_t max_line_bytes_;
    std::uint64_t next_request_id_{};
};

} // namespace axiom_colab::gui
