#include "cpp_adapter/errors.hpp"

#include <utility>

namespace cpp_adapter {
namespace {

Json path_to_json(const std::vector<std::string>& path) {
    Json::array_t values;
    values.reserve(path.size());
    for (const std::string& item : path) {
        values.emplace_back(item);
    }
    return values;
}

} // namespace

ToolError::ToolError(std::string code, std::string message, Json details)
    : std::runtime_error(std::move(message)),
      code_(std::move(code)),
      details_(std::move(details)) {
    if (!details_.is_object()) {
        throw std::invalid_argument("ToolError details must be a JSON object");
    }
}

RegistryError::RegistryError(std::string code, std::string message,
                             std::vector<std::string> dependency_path,
                             Json extra_details)
    : ToolError(
          std::move(code), std::move(message),
          [&] {
              if (!extra_details.is_object()) {
                  throw std::invalid_argument(
                      "RegistryError extra details must be a JSON object");
              }
              if (!dependency_path.empty()) {
                  extra_details["dependencyPath"] = path_to_json(dependency_path);
              }
              return extra_details;
          }()),
      dependency_path_(std::move(dependency_path)) {}

Json error_to_json(const ToolError& error) {
    return Json::object({
        {"code", error.code()},
        {"message", error.what()},
        {"details", error.details()},
    });
}

} // namespace cpp_adapter
