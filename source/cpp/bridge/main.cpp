#include "bridge.hpp"

#include "cpp_adapter/errors.hpp"

#include <iostream>
#include <iterator>
#include <string>

namespace {

constexpr std::size_t max_stdin_bytes = 4U * 1024U * 1024U;
constexpr std::size_t max_stdout_bytes = 8U * 1024U * 1024U;

int write_stdout(const cpp_adapter::Json& document) {
    std::string output = document.dump();
    if (output.size() > max_stdout_bytes) {
        output = cpp_adapter::make_error_response(
                     nullptr, "OUTPUT_TOO_LARGE",
                     "bridge response exceeded the configured stdout limit",
                     cpp_adapter::Json::object({
                         {"limitBytes", static_cast<std::int64_t>(max_stdout_bytes)},
                     }))
                     .dump();
    }
    std::cout << output;
    std::cout.flush();
    return std::cout.good() ? 0 : 3;
}

} // namespace

int main(int argc, char** argv) {
    try {
        cpp_adapter::BridgeApp bridge;
        if (argc == 2 && std::string_view(argv[1]) == "--describe-tools") {
            return write_stdout(bridge.describe_tools());
        }
        if (argc != 1) {
            std::cerr << "cpp-tool-bridge: unknown command-line argument\n";
            const int write_result = write_stdout(cpp_adapter::make_error_response(
                nullptr, "INVALID_CLI", "unknown command-line argument"));
            return write_result == 0 ? 2 : write_result;
        }

        std::string input(std::istreambuf_iterator<char>(std::cin), {});
        if (input.size() > max_stdin_bytes) {
            return write_stdout(cpp_adapter::make_error_response(
                nullptr, "INPUT_TOO_LARGE",
                "stdin request exceeded the configured input limit",
                cpp_adapter::Json::object({
                    {"limitBytes", static_cast<std::int64_t>(max_stdin_bytes)},
                })));
        }
        return write_stdout(cpp_adapter::Json::parse(
            bridge.handle_request_text(input)));
    } catch (const cpp_adapter::ToolError& error) {
        std::cerr << "cpp-tool-bridge initialization failed [" << error.code()
                  << "]: " << error.what() << '\n';
        write_stdout(cpp_adapter::make_error_response(
            nullptr, error.code(), error.what(), error.details()));
        return 2;
    } catch (const std::exception& error) {
        std::cerr << "cpp-tool-bridge initialization failed: " << error.what()
                  << '\n';
        write_stdout(cpp_adapter::make_error_response(
            nullptr, "BRIDGE_INITIALIZATION_FAILED", error.what()));
        return 2;
    } catch (...) {
        std::cerr << "cpp-tool-bridge initialization failed with a non-standard exception\n";
        write_stdout(cpp_adapter::make_error_response(
            nullptr, "BRIDGE_INITIALIZATION_FAILED",
            "non-standard exception during bridge initialization"));
        return 2;
    }
}
