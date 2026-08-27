#pragma once

#include "cpp_adapter/errors.hpp"
#include "cpp_adapter/json.hpp"
#include "cpp_adapter/memory_client.hpp"
#include "cpp_adapter/tool_descriptor.hpp"

#include <chrono>
#include <concepts>
#include <cstddef>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <type_traits>
#include <typeindex>
#include <unordered_map>
#include <utility>
#include <vector>

namespace cpp_adapter {

template <typename... Types>
struct TypeList final {};

enum class ComponentKind {
    Internal,
    PublicTool,
};

// Version 1 constructs worker singletons. Keeping lifetime in the registration
// contract makes a future per-call scope an additive container policy instead
// of a breaking Tool Class change.
enum class ComponentLifetime {
    WorkerSingleton,
    PerCall,
};

struct ToolCallContext final {
    std::string call_id;
    MemoryClient* memory_client = nullptr;
    std::chrono::steady_clock::time_point started_at =
        std::chrono::steady_clock::now();
};

struct DependencyRef final {
    std::type_index type{typeid(void)};
    std::string fallback_type_name;
};

class DependencyContainer final {
public:
    DependencyContainer() = default;
    DependencyContainer(DependencyContainer&&) noexcept = default;
    DependencyContainer& operator=(DependencyContainer&&) noexcept = default;
    DependencyContainer(const DependencyContainer&) = delete;
    DependencyContainer& operator=(const DependencyContainer&) = delete;

    template <typename Type>
    Type& require() const {
        void* instance = require_raw(std::type_index(typeid(Type)));
        return *static_cast<Type*>(instance);
    }

    [[nodiscard]] bool contains(std::type_index type) const noexcept;
    [[nodiscard]] const std::vector<std::string>& construction_order() const noexcept {
        return construction_order_;
    }

private:
    friend class ComponentRegistry;
    friend class ToolRuntime;

    explicit DependencyContainer(const DependencyContainer* parent)
        : parent_(parent) {}

    void insert(std::type_index type, std::shared_ptr<void> instance,
                std::string type_name);
    [[nodiscard]] void* require_raw(std::type_index type) const;

    std::unordered_map<std::type_index, std::shared_ptr<void>> instances_;
    std::vector<std::string> construction_order_;
    const DependencyContainer* parent_ = nullptr;
};

using ComponentFactory =
    std::function<std::shared_ptr<void>(DependencyContainer&)>;
using DescriptorFactory = std::function<ToolDescriptor()>;
using ErasedToolExecutor =
    std::function<Json(void*, const Json&, ToolCallContext&)>;

struct ComponentRegistration final {
    std::type_index type{typeid(void)};
    std::string type_name;
    ComponentKind kind = ComponentKind::Internal;
    std::vector<DependencyRef> dependencies;
    ComponentFactory factory;
    DescriptorFactory descriptor;
    ErasedToolExecutor execute;
    ComponentLifetime lifetime = ComponentLifetime::WorkerSingleton;
};

class ToolRuntime final {
public:
    ToolRuntime(ToolRuntime&&) noexcept = default;
    ToolRuntime& operator=(ToolRuntime&&) noexcept = default;
    ToolRuntime(const ToolRuntime&) = delete;
    ToolRuntime& operator=(const ToolRuntime&) = delete;

    [[nodiscard]] std::vector<ToolDescriptor> descriptors() const;
    [[nodiscard]] const ToolDescriptor* find_descriptor(
        const std::string& tool_name) const noexcept;
    [[nodiscard]] Json execute(const std::string& tool_name,
                               const Json& arguments,
                               ToolCallContext& context) const;
    [[nodiscard]] const DependencyContainer& container() const noexcept {
        return container_;
    }

private:
    friend class ComponentRegistry;

    struct RuntimeTool final {
        ToolDescriptor descriptor;
        std::type_index type{typeid(void)};
        ErasedToolExecutor execute;
        std::size_t registration_index = 0;
    };

    ToolRuntime(DependencyContainer container, std::vector<RuntimeTool> tools,
                std::vector<ComponentRegistration> registrations,
                std::vector<std::size_t> construction_order,
                std::vector<bool> call_scoped);

    DependencyContainer container_;
    std::vector<RuntimeTool> tools_;
    std::vector<ComponentRegistration> registrations_;
    std::vector<std::size_t> construction_order_;
    std::vector<bool> call_scoped_;
};

class ComponentRegistry final {
public:
    void add(ComponentRegistration registration);
    [[nodiscard]] std::size_t registration_count() const;
    [[nodiscard]] ToolRuntime build() const;

private:
    mutable std::mutex mutex_;
    std::vector<ComponentRegistration> registrations_;
};

[[nodiscard]] ComponentRegistry& default_registry();

class AutoRegistrar final {
public:
    explicit AutoRegistrar(ComponentRegistration registration);
};

namespace detail {

template <typename Type>
std::string readable_type_name() {
#if defined(_MSC_VER)
    std::string name = __FUNCSIG__;
    const std::string prefix = "readable_type_name<";
    const auto begin = name.find(prefix) + prefix.size();
    return name.substr(begin, name.find(">(void)", begin) - begin);
#elif defined(__clang__) || defined(__GNUC__)
    std::string name = __PRETTY_FUNCTION__;
    const std::string prefix = "Type = ";
    const auto begin = name.find(prefix) + prefix.size();
    return name.substr(begin, name.find_first_of(";]", begin) - begin);
#else
    return typeid(Type).name();
#endif
}

template <typename... Dependencies>
std::vector<DependencyRef> dependency_refs(TypeList<Dependencies...>) {
    return {
        DependencyRef{std::type_index(typeid(Dependencies)),
                      readable_type_name<Dependencies>()}...,
    };
}

template <typename Type, typename... Dependencies>
std::shared_ptr<void> construct_component(DependencyContainer& container,
                                          TypeList<Dependencies...>) {
    static_assert(std::is_constructible_v<Type, Dependencies&...>,
                  "Component constructor must accept its declared dependencies "
                  "as non-owning references in declaration order");
    return std::make_shared<Type>(container.require<Dependencies>()...);
}

template <typename Type>
concept ComponentContract = requires {
    typename Type::Dependencies;
};

template <typename Type, typename... Dependencies>
consteval bool constructor_matches(TypeList<Dependencies...>) {
    return std::is_constructible_v<Type, Dependencies&...>;
}

template <typename Type>
concept PublicToolContract = ComponentContract<Type>
    && requires(const Json& arguments, ToolCallContext& context, Type& instance) {
           { Type::descriptor() } -> std::same_as<ToolDescriptor>;
           { instance.execute(arguments, context) } -> std::same_as<Json>;
       };

} // namespace detail

template <detail::PublicToolContract Type>
ComponentRegistration make_public_tool_registration(std::string type_name) {
    static_assert(detail::constructor_matches<Type>(typename Type::Dependencies{}),
                  "Tool constructor must accept every declared dependency as a non-owning reference, in TypeList order");
    return ComponentRegistration{
        std::type_index(typeid(Type)),
        std::move(type_name),
        ComponentKind::PublicTool,
        detail::dependency_refs(typename Type::Dependencies{}),
        [](DependencyContainer& container) {
            return detail::construct_component<Type>(
                container, typename Type::Dependencies{});
        },
        [] { return Type::descriptor(); },
        [](void* instance, const Json& arguments, ToolCallContext& context) {
            return static_cast<Type*>(instance)->execute(arguments, context);
        },
    };
}

template <detail::ComponentContract Type>
ComponentRegistration make_internal_component_registration(std::string type_name) {
    static_assert(detail::constructor_matches<Type>(typename Type::Dependencies{}),
                  "Component constructor must accept every declared dependency as a non-owning reference, in TypeList order");
    return ComponentRegistration{
        std::type_index(typeid(Type)),
        std::move(type_name),
        ComponentKind::Internal,
        detail::dependency_refs(typename Type::Dependencies{}),
        [](DependencyContainer& container) {
            return detail::construct_component<Type>(
                container, typename Type::Dependencies{});
        },
        {},
        {},
    };
}

#define CPP_ADAPTER_DETAIL_JOIN_IMPL(left, right) left##right
#define CPP_ADAPTER_DETAIL_JOIN(left, right) CPP_ADAPTER_DETAIL_JOIN_IMPL(left, right)

#define CPP_ADAPTER_REGISTER_PUBLIC_TOOL(Type)                                \
    namespace {                                                               \
    [[maybe_unused]] const ::cpp_adapter::AutoRegistrar                       \
        CPP_ADAPTER_DETAIL_JOIN(cpp_adapter_public_registrar_, __COUNTER__)(  \
            ::cpp_adapter::make_public_tool_registration<Type>(#Type));       \
    }

#define CPP_ADAPTER_REGISTER_INTERNAL_COMPONENT(Type)                         \
    namespace {                                                               \
    [[maybe_unused]] const ::cpp_adapter::AutoRegistrar                       \
        CPP_ADAPTER_DETAIL_JOIN(cpp_adapter_internal_registrar_, __COUNTER__)(\
            ::cpp_adapter::make_internal_component_registration<Type>(#Type));\
    }

} // namespace cpp_adapter
