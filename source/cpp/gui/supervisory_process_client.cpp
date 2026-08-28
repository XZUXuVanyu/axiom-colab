#include "supervisory_process_client.hpp"

#include "cpp_adapter/json.hpp"

#include <QDir>
#include <QFileInfo>

#include <algorithm>
#include <cctype>
#include <utility>

namespace axiom_colab::gui {

using cpp_adapter::Json;

namespace {

bool valid_identity(std::string_view value, std::string_view prefix) {
    if (!value.starts_with(prefix) || value.size() <= prefix.size()
        || value.size() > prefix.size() + 128) {
        return false;
    }
    return std::isalnum(static_cast<unsigned char>(value[prefix.size()])) != 0
        && std::all_of(value.begin() + static_cast<std::ptrdiff_t>(prefix.size()),
                       value.end(), [](char character) {
                           return std::isalnum(static_cast<unsigned char>(character)) != 0
                               || character == '.' || character == '_'
                               || character == '-';
                       });
}

} // namespace

SupervisoryProcessClient::SupervisoryProcessClient(std::size_t max_line_bytes)
    : max_line_bytes_(max_line_bytes) {
    if (max_line_bytes_ < 256) {
        throw std::invalid_argument("max_line_bytes must be at least 256");
    }
    process_.setProcessChannelMode(QProcess::SeparateChannels);
    QObject::connect(&process_, &QProcess::readyReadStandardOutput, [&] {
        read_stdout();
    });
    QObject::connect(&process_, &QProcess::errorOccurred,
                     [&](QProcess::ProcessError) {
                         fail_pending(process_.errorString().toStdString());
                     });
    QObject::connect(
        &process_, qOverload<int, QProcess::ExitStatus>(&QProcess::finished),
        [&](int exit_code, QProcess::ExitStatus status) {
            fail_pending(status == QProcess::CrashExit
                             ? "supervisory process crashed"
                             : "supervisory process exited with code "
                                   + std::to_string(exit_code));
        });
}

SupervisoryProcessClient::~SupervisoryProcessClient() {
    stop();
}

void SupervisoryProcessClient::start(const QString& program,
                                     const QStringList& arguments,
                                     const QString& working_directory) {
    if (is_running()) {
        throw std::logic_error("supervisory process is already running");
    }
    stdout_buffer_.clear();
    if (!working_directory.isEmpty()) {
        process_.setWorkingDirectory(working_directory);
    }
    process_.start(program, arguments, QIODevice::ReadWrite);
}

void SupervisoryProcessClient::start_local_supervisory_process(
    const QString& node_executable, const QString& repository_root,
    const QString& config_path) {
    const QFileInfo root(repository_root);
    const QFileInfo config(config_path);
    const QString script = QDir(repository_root).filePath(
        "proj/scripts/run-supervisory.mjs");
    if (!root.isAbsolute() || !root.isDir() || !config.isAbsolute()
        || !config.isFile() || !QFileInfo::exists(script)) {
        throw std::invalid_argument(
            "local supervisory launch requires an absolute repository, script, and config");
    }
    start(node_executable, {script, config.absoluteFilePath()},
          root.absoluteFilePath());
}

void SupervisoryProcessClient::stop() {
    if (!is_running()) return;
    process_.closeWriteChannel();
    process_.terminate();
    if (!process_.waitForFinished(3000)) {
        process_.kill();
        process_.waitForFinished(3000);
    }
}

bool SupervisoryProcessClient::is_running() const {
    return process_.state() != QProcess::NotRunning;
}

std::string SupervisoryProcessClient::list_workspaces(ResponseHandler handler) {
    return send_request(Json::object({
        {"protocolVersion", "1.0"},
        {"operation", "list-workspaces"},
    }), std::move(handler));
}

std::string SupervisoryProcessClient::list_goals(
    std::string_view workspace_id, ResponseHandler handler) {
    if (!valid_identity(workspace_id, "workspace:")) {
        throw std::invalid_argument("workspace identity is malformed");
    }
    return send_request(Json::object({
        {"protocolVersion", "1.0"},
        {"operation", "list-goals"},
        {"workspaceId", std::string(workspace_id)},
    }), std::move(handler));
}

std::string SupervisoryProcessClient::inspect(
    std::string_view workspace_id, std::optional<std::string_view> goal_id,
    ResponseHandler handler) {
    if (!valid_identity(workspace_id, "workspace:")) {
        throw std::invalid_argument("workspace identity is malformed");
    }
    if (goal_id.has_value() && !valid_identity(*goal_id, "goal:")) {
        throw std::invalid_argument("goal identity is malformed");
    }
    return send_request(Json::object({
        {"protocolVersion", "1.0"},
        {"operation", "inspect"},
        {"workspaceId", std::string(workspace_id)},
        {"goalId", goal_id.has_value() ? Json(std::string(*goal_id)) : Json(nullptr)},
    }), std::move(handler));
}

std::string SupervisoryProcessClient::send_request(Json request,
                                                   ResponseHandler handler) {
    if (!is_running()) {
        throw std::logic_error("supervisory process is not running");
    }
    const std::string id = "qt:" + std::to_string(++next_request_id_);
    request["id"] = id;
    const std::string encoded = request.dump() + "\n";
    pending_.push_back(PendingRequest{id, std::move(handler)});
    if (process_.write(encoded.data(), static_cast<qint64>(encoded.size())) < 0) {
        PendingRequest pending = std::move(pending_.back());
        pending_.pop_back();
        throw std::runtime_error(process_.errorString().toStdString());
    }
    return id;
}

void SupervisoryProcessClient::read_stdout() {
    stdout_buffer_.append(process_.readAllStandardOutput());
    while (true) {
        const qsizetype newline = stdout_buffer_.indexOf('\n');
        if (newline < 0) break;
        QByteArray line = stdout_buffer_.left(newline);
        stdout_buffer_.remove(0, newline + 1);
        if (line.endsWith('\r')) line.chop(1);
        if (!line.isEmpty()) accept_line(std::move(line));
    }
    if (static_cast<std::size_t>(stdout_buffer_.size()) > max_line_bytes_) {
        stdout_buffer_.clear();
        fail_pending("supervisory response exceeds the line limit");
        process_.kill();
    }
}

void SupervisoryProcessClient::accept_line(QByteArray line) {
    if (static_cast<std::size_t>(line.size()) > max_line_bytes_) {
        fail_pending("supervisory response exceeds the line limit");
        process_.kill();
        return;
    }
    if (pending_.empty()) {
        fail_pending("supervisory process emitted an unsolicited response");
        process_.kill();
        return;
    }
    PendingRequest pending = std::move(pending_.front());
    pending_.pop_front();
    try {
        const std::string text(line.constData(), static_cast<std::size_t>(line.size()));
        const SupervisoryResponse response =
            parse_supervisory_response(text, pending.id);
        pending.handler(&response, nullptr);
    } catch (const std::exception& error) {
        const std::string message = error.what();
        pending.handler(nullptr, &message);
        fail_pending("supervisory response stream lost correlation");
        process_.kill();
    }
}

void SupervisoryProcessClient::fail_pending(std::string message) {
    while (!pending_.empty()) {
        PendingRequest pending = std::move(pending_.front());
        pending_.pop_front();
        pending.handler(nullptr, &message);
    }
}

} // namespace axiom_colab::gui
