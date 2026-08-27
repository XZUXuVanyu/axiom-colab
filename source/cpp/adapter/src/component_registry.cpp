#include "cpp_adapter/component_registry.hpp"

#include "cpp_adapter/json_schema.hpp"

#include <algorithm>
#include <exception>
#include <optional>
#include <set>
#include <sstream>
#include <unordered_set>

namespace cpp_adapter {
namespace {

std::string join_path(const std::vector<std::string>& path) {
    std::string result;
    for (const std::string& item : path) {
        if (!result.empty()) result += " -> ";
        result += item;
    }
    return result;
}

std::vector<std::string> named_path(
    const std::vector<std::size_t>& indexes,
    const std::vector<ComponentRegistration>& registrations) {
    std::vector<std::string> result;
    result.reserve(indexes.size());
    for (const std::size_t index : indexes) {
        result.push_back(registrations[index].type_name);
    }
    return result;
}

std::optional<std::vector<std::size_t>> find_dependency_path(
    std::size_t current, std::size_t target,
    const std::vector<ComponentRegistration>& registrations,
    const std::unordered_map<std::type_index, std::size_t>& by_type,
    std::unordered_set<std::size_t>& visited) {
    if (!visited.insert(current).second) return std::nullopt;
    if (current == target) return std::vector<std::size_t>{current};
    for (const DependencyRef& dependency : registrations[current].dependencies) {
        const auto iterator = by_type.find(dependency.type);
        if (iterator == by_type.end()) continue;
        auto child = find_dependency_path(iterator->second, target, registrations,
                                          by_type, visited);
        if (child.has_value()) {
            child->insert(child->begin(), current);
            return child;
        }
    }
    return std::nullopt;
}

std::vector<std::string> construction_path(
    std::size_t target, const std::vector<ComponentRegistration>& registrations,
    const std::unordered_map<std::type_index, std::size_t>& by_type) {
    for (std::size_t root = 0; root < registrations.size(); ++root) {
        if (root == target || registrations[root].kind != ComponentKind::PublicTool) {
            continue;
        }
        std::unordered_set<std::size_t> visited;
        const auto path = find_dependency_path(root, target, registrations,
                                               by_type, visited);
        if (path.has_value()) return named_path(*path, registrations);
    }
    return {registrations[target].type_name};
}

} // namespace

bool DependencyContainer::contains(std::type_index type) const noexcept {
    return instances_.contains(type);
}

void DependencyContainer::insert(std::type_index type,
                                 std::shared_ptr<void> instance,
                                 std::string type_name) {
    if (instance == nullptr) {
        throw std::invalid_argument("component factory returned null for "
                                    + type_name);
    }
    if (!instances_.emplace(type, std::move(instance)).second) {
        throw std::logic_error("component was constructed twice: " + type_name);
    }
    construction_order_.push_back(std::move(type_name));
}

void* DependencyContainer::require_raw(std::type_index type) const {
    const auto iterator = instances_.find(type);
    if (iterator == instances_.end()) {
        throw std::logic_error(
            "dependency container requested an instance before construction");
    }
    return iterator->second.get();
}

ToolRuntime::ToolRuntime(DependencyContainer container,
                         std::vector<RuntimeTool> tools)
    : container_(std::move(container)), tools_(std::move(tools)) {
    std::sort(tools_.begin(), tools_.end(), [](const RuntimeTool& left,
                                               const RuntimeTool& right) {
        return left.descriptor.name < right.descriptor.name;
    });
}

std::vector<ToolDescriptor> ToolRuntime::descriptors() const {
    std::vector<ToolDescriptor> result;
    result.reserve(tools_.size());
    for (const RuntimeTool& tool : tools_) result.push_back(tool.descriptor);
    return result;
}

const ToolDescriptor* ToolRuntime::find_descriptor(
    const std::string& tool_name) const noexcept {
    const auto iterator = std::lower_bound(
        tools_.begin(), tools_.end(), tool_name,
        [](const RuntimeTool& tool, const std::string& name) {
            return tool.descriptor.name < name;
        });
    return iterator == tools_.end() || iterator->descriptor.name != tool_name
        ? nullptr
        : &iterator->descriptor;
}

Json ToolRuntime::execute(const std::string& tool_name, const Json& arguments,
                          ToolCallContext& context) const {
    const auto iterator = std::lower_bound(
        tools_.begin(), tools_.end(), tool_name,
        [](const RuntimeTool& tool, const std::string& name) {
            return tool.descriptor.name < name;
        });
    if (iterator == tools_.end() || iterator->descriptor.name != tool_name) {
        throw ToolError("UNKNOWN_TOOL", "unknown tool: " + tool_name,
                        Json::object({{"tool", tool_name}}));
    }

    const auto argument_violations = JsonSchemaValidator::validate(
        iterator->descriptor.parameters, arguments, "$.arguments");
    if (!argument_violations.empty()) {
        throw ToolError(
            "INVALID_ARGUMENTS", "tool arguments failed JSON Schema validation",
            Json::object({
                {"tool", tool_name},
                {"violations", violations_to_json(argument_violations)},
            }));
    }

    void* instance = container_.require_raw(iterator->type);
    Json result = iterator->execute(instance, arguments, context);
    const auto output_violations = JsonSchemaValidator::validate(
        iterator->descriptor.output, result, "$.result");
    if (!output_violations.empty()) {
        throw ToolError(
            "INVALID_TOOL_OUTPUT",
            "C++ tool returned a value that violates its output schema",
            Json::object({
                {"tool", tool_name},
                {"violations", violations_to_json(output_violations)},
            }));
    }
    return result;
}

void ComponentRegistry::add(ComponentRegistration registration) {
    std::lock_guard lock(mutex_);
    registrations_.push_back(std::move(registration));
}

std::size_t ComponentRegistry::registration_count() const {
    std::lock_guard lock(mutex_);
    return registrations_.size();
}

ToolRuntime ComponentRegistry::build() const {
    std::vector<ComponentRegistration> registrations;
    {
        std::lock_guard lock(mutex_);
        registrations = registrations_;
    }

    std::unordered_map<std::type_index, std::size_t> by_type;
    for (std::size_t index = 0; index < registrations.size(); ++index) {
        const ComponentRegistration& registration = registrations[index];
        if (registration.type_name.empty()) {
            throw RegistryError("INVALID_REGISTRATION",
                                "component registration has an empty type name");
        }
        if (!registration.factory) {
            throw RegistryError("INVALID_REGISTRATION",
                                "component has no factory: "
                                    + registration.type_name,
                                {registration.type_name});
        }
        if (registration.lifetime != ComponentLifetime::WorkerSingleton) {
            throw RegistryError(
                "UNSUPPORTED_LIFETIME",
                "component requests a lifetime not implemented by protocol 1.0: "
                    + registration.type_name,
                {registration.type_name});
        }
        const auto [iterator, inserted] = by_type.emplace(registration.type, index);
        if (!inserted) {
            throw RegistryError(
                "DUPLICATE_COMPONENT_TYPE",
                "duplicate component type: " + registrations[iterator->second].type_name
                    + " and " + registration.type_name,
                {registrations[iterator->second].type_name, registration.type_name});
        }
    }

    std::vector<std::optional<ToolDescriptor>> descriptors(registrations.size());
    std::unordered_map<std::string, std::size_t> by_tool_name;
    for (std::size_t index = 0; index < registrations.size(); ++index) {
        const ComponentRegistration& registration = registrations[index];
        if (registration.kind != ComponentKind::PublicTool) continue;
        if (!registration.descriptor || !registration.execute) {
            throw RegistryError("INVALID_REGISTRATION",
                                "public tool is missing descriptor or execute: "
                                    + registration.type_name,
                                {registration.type_name});
        }
        try {
            descriptors[index] = registration.descriptor();
            validate_descriptor(*descriptors[index]);
        } catch (const std::exception& error) {
            throw RegistryError(
                "INVALID_DESCRIPTOR",
                "descriptor failed for " + registration.type_name + ": "
                    + error.what(),
                {registration.type_name});
        }
        const std::string& name = descriptors[index]->name;
        const auto [iterator, inserted] = by_tool_name.emplace(name, index);
        if (!inserted) {
            throw RegistryError(
                "DUPLICATE_TOOL_NAME",
                "duplicate tool name \"" + name + "\" from "
                    + registrations[iterator->second].type_name + " and "
                    + registration.type_name,
                {registrations[iterator->second].type_name, registration.type_name},
                Json::object({{"tool", name}}));
        }
    }

    enum class VisitState { Unvisited, Visiting, Visited };
    std::vector<VisitState> state(registrations.size(), VisitState::Unvisited);
    std::vector<std::size_t> stack;
    std::vector<std::size_t> order;
    order.reserve(registrations.size());

    const std::function<void(std::size_t)> visit = [&](std::size_t index) {
        if (state[index] == VisitState::Visited) return;
        if (state[index] == VisitState::Visiting) {
            const auto cycle_begin =
                std::find(stack.begin(), stack.end(), index);
            std::vector<std::size_t> cycle(cycle_begin, stack.end());
            cycle.push_back(index);
            const auto path = named_path(cycle, registrations);
            throw RegistryError("CIRCULAR_DEPENDENCY",
                                "circular dependency: " + join_path(path), path);
        }
        state[index] = VisitState::Visiting;
        stack.push_back(index);
        for (const DependencyRef& dependency : registrations[index].dependencies) {
            const auto dependency_index = by_type.find(dependency.type);
            if (dependency_index == by_type.end()) {
                std::vector<std::string> path = named_path(stack, registrations);
                path.push_back(dependency.fallback_type_name);
                throw RegistryError(
                    "MISSING_DEPENDENCY",
                    "missing dependency along path: " + join_path(path), path);
            }
            visit(dependency_index->second);
        }
        stack.pop_back();
        state[index] = VisitState::Visited;
        order.push_back(index);
    };

    for (std::size_t index = 0; index < registrations.size(); ++index) {
        visit(index);
    }

    DependencyContainer container;
    for (const std::size_t index : order) {
        const ComponentRegistration& registration = registrations[index];
        try {
            container.insert(registration.type,
                             registration.factory(container),
                             registration.type_name);
        } catch (const RegistryError&) {
            throw;
        } catch (const std::exception& error) {
            const auto path = construction_path(index, registrations, by_type);
            throw RegistryError(
                "CONSTRUCTION_FAILED",
                "failed to construct dependency path " + join_path(path)
                    + ": " + error.what(),
                path,
                Json::object({{"component", registration.type_name}}));
        } catch (...) {
            const auto path = construction_path(index, registrations, by_type);
            throw RegistryError(
                "CONSTRUCTION_FAILED",
                "failed to construct dependency path " + join_path(path)
                    + ": non-standard exception",
                path,
                Json::object({{"component", registration.type_name}}));
        }
    }

    std::vector<ToolRuntime::RuntimeTool> runtime_tools;
    runtime_tools.reserve(by_tool_name.size());
    for (std::size_t index = 0; index < registrations.size(); ++index) {
        if (!descriptors[index].has_value()) continue;
        runtime_tools.push_back(ToolRuntime::RuntimeTool{
            std::move(*descriptors[index]),
            registrations[index].type,
            registrations[index].execute,
        });
    }
    return ToolRuntime(std::move(container), std::move(runtime_tools));
}

ComponentRegistry& default_registry() {
    static ComponentRegistry registry;
    return registry;
}

AutoRegistrar::AutoRegistrar(ComponentRegistration registration) {
    default_registry().add(std::move(registration));
}

} // namespace cpp_adapter
