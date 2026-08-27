#include "bridge.hpp"
#include "cpp_adapter/component_registry.hpp"
#include "cpp_adapter/errors.hpp"
#include "cpp_adapter/json.hpp"
#include "cpp_adapter/memory_client.hpp"

#include <functional>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <typeindex>
#include <utility>
#include <vector>

namespace {

using cpp_adapter::BridgeApp;
using cpp_adapter::ComponentKind;
using cpp_adapter::ComponentLifetime;
using cpp_adapter::ComponentRegistration;
using cpp_adapter::ComponentRegistry;
using cpp_adapter::DependencyContainer;
using cpp_adapter::DependencyRef;
using cpp_adapter::Json;
using cpp_adapter::MemoryClient;
using cpp_adapter::MemoryGrant;
using cpp_adapter::MemoryOperation;
using cpp_adapter::MemoryTransport;
using cpp_adapter::RegistryError;
using cpp_adapter::ToolCallContext;
using cpp_adapter::ToolDescriptor;
using cpp_adapter::ToolError;

struct TestFailure final : std::runtime_error {
    using std::runtime_error::runtime_error;
};

#define CHECK(condition)                                                      \
    do {                                                                      \
        if (!(condition)) {                                                   \
            throw TestFailure(std::string("CHECK failed at ") + __FILE__     \
                              + ":" + std::to_string(__LINE__) + ": "       \
                              + #condition);                                  \
        }                                                                     \
    } while (false)

template <typename Callable>
void check_error_code(Callable&& callable, const std::string& expected_code) {
    try {
        std::forward<Callable>(callable)();
    } catch (const ToolError& error) {
        CHECK(error.code() == expected_code);
        return;
    }
    throw TestFailure("expected ToolError code " + expected_code);
}

ToolDescriptor fake_descriptor(std::string name) {
    return ToolDescriptor{
        .name = std::move(name),
        .description = "test descriptor",
        .when_to_use = "only in tests",
        .parameters = Json::object({
            {"type", "object"},
            {"additionalProperties", true},
        }),
        .output = Json::object({
            {"type", "object"},
            {"additionalProperties", true},
        }),
        .side_effect = false,
        .timeout_ms = 1000,
        .allow_parallel = true,
    };
}

template <typename Type>
ComponentRegistration internal_registration(
    std::string name, std::vector<DependencyRef> dependencies = {},
    std::function<std::shared_ptr<void>(DependencyContainer&)> factory = {}) {
    if (!factory) {
        factory = [](DependencyContainer&) {
            return std::make_shared<Type>();
        };
    }
    return ComponentRegistration{
        std::type_index(typeid(Type)), std::move(name), ComponentKind::Internal,
        std::move(dependencies), std::move(factory), {}, {},
    };
}

template <typename Type>
ComponentRegistration public_registration(
    std::string type_name, std::string tool_name,
    std::function<Json(void*, const Json&, ToolCallContext&)> execute) {
    return ComponentRegistration{
        std::type_index(typeid(Type)), std::move(type_name),
        ComponentKind::PublicTool, {},
        [](DependencyContainer&) { return std::make_shared<Type>(); },
        [name = std::move(tool_name)] { return fake_descriptor(name); },
        std::move(execute),
    };
}

struct NodeA {};
struct NodeB {};
struct NodeC {};
struct MissingNode {};
struct DuplicateType {};
struct ToolOne {};
struct ToolTwo {};
struct ThrowingTool {};
struct InvalidOutputTool {};
struct FailingConstructor {};

struct FakeMemoryTransport final : MemoryTransport {
    std::string capability_id;
    MemoryOperation operation = MemoryOperation::ComputeCreate;
    Json invoke(std::string_view capability, MemoryOperation requested,
                const Json& request) override {
        capability_id = capability;
        operation = requested;
        return request;
    }
};

cpp_adapter::TrustedInvocationContext memory_context() {
    return {"workspace:one", "actor:model", "tool:memory-test", "1.2.3",
            "call:one", 7};
}

MemoryGrant memory_grant(std::chrono::system_clock::time_point now) {
    return {"capability:one", "workspace:one", "actor:model",
            "tool:memory-test", "1.2.3", "call:one",
            {MemoryOperation::ComputeRead}, 7,
            now - std::chrono::seconds(1), now + std::chrono::minutes(1),
            1, 128};
}

struct MatchingDependencyConsumer {
    using Dependencies = cpp_adapter::TypeList<NodeA, NodeB>;
    MatchingDependencyConsumer(NodeA&, NodeB&) {}
};

struct MismatchedDependencyConsumer {
    using Dependencies = cpp_adapter::TypeList<NodeA, NodeB>;
    explicit MismatchedDependencyConsumer(NodeB&) {}
};

static_assert(cpp_adapter::detail::constructor_matches<MatchingDependencyConsumer>(
    MatchingDependencyConsumer::Dependencies{}));
static_assert(!cpp_adapter::detail::constructor_matches<MismatchedDependencyConsumer>(
    MismatchedDependencyConsumer::Dependencies{}));

void test_json_round_trip() {
    const Json value = Json::parse(
        R"({"a":[1,2.5,true,null,"\u03bb"],"b":{"x":"y"}})");
    CHECK(Json::parse(value.dump()) == value);
    CHECK(value.at("a").as_array()[4].as_string() == "λ");
}

void test_descriptor_builders() {
    using cpp_adapter::ToolDescriptorBuilder;
    using cpp_adapter::schema::Schema;
    const ToolDescriptor descriptor = ToolDescriptorBuilder(
        "builder_test", "builder test", "only in tests")
        .parameters(Schema::object().property(
            "value", Schema::number().minimum(0).description("A value."), true))
        .output(Schema::array(Schema::string()).min_items(1))
        .timeout_ms(250)
        .allow_parallel()
        .build();
    CHECK(descriptor.parameters.at("required").as_array()[0].as_string()
          == "value");
    CHECK(descriptor.parameters.at("additionalProperties").as_bool() == false);
    CHECK(descriptor.output.at("items").at("type").as_string() == "string");
    CHECK(descriptor.timeout_ms == 250);
    CHECK(descriptor.allow_parallel);
}

void test_topological_sort() {
    ComponentRegistry registry;
    registry.add(internal_registration<NodeC>(
        "NodeC", {{std::type_index(typeid(NodeB)), "NodeB"}},
        [](DependencyContainer& container) {
            static_cast<void>(container.require<NodeB>());
            return std::make_shared<NodeC>();
        }));
    registry.add(internal_registration<NodeB>(
        "NodeB", {{std::type_index(typeid(NodeA)), "NodeA"}},
        [](DependencyContainer& container) {
            static_cast<void>(container.require<NodeA>());
            return std::make_shared<NodeB>();
        }));
    registry.add(internal_registration<NodeA>("NodeA"));

    const auto runtime = registry.build();
    const auto& order = runtime.container().construction_order();
    CHECK(order.size() == 3);
    CHECK(order[0] == "NodeA");
    CHECK(order[1] == "NodeB");
    CHECK(order[2] == "NodeC");
}

void test_missing_dependency() {
    ComponentRegistry registry;
    registry.add(internal_registration<NodeA>(
        "NodeA", {{std::type_index(typeid(MissingNode)), "MissingNode"}}));
    try {
        static_cast<void>(registry.build());
    } catch (const RegistryError& error) {
        CHECK(error.code() == "MISSING_DEPENDENCY");
        CHECK(error.dependency_path().size() == 2);
        CHECK(error.dependency_path().front() == "NodeA");
        CHECK(error.dependency_path().back().find("MissingNode")
              != std::string::npos);
        CHECK(std::string(error.what()).find("NodeA ->") != std::string::npos);
        return;
    }
    throw TestFailure("expected missing dependency error");
}

void test_circular_dependency() {
    ComponentRegistry registry;
    registry.add(internal_registration<NodeA>(
        "NodeA", {{std::type_index(typeid(NodeB)), "NodeB"}}));
    registry.add(internal_registration<NodeB>(
        "NodeB", {{std::type_index(typeid(NodeA)), "NodeA"}}));
    try {
        static_cast<void>(registry.build());
    } catch (const RegistryError& error) {
        CHECK(error.code() == "CIRCULAR_DEPENDENCY");
        CHECK(error.dependency_path()
              == std::vector<std::string>({"NodeA", "NodeB", "NodeA"}));
        return;
    }
    throw TestFailure("expected circular dependency error");
}

void test_lifetime_extension_point() {
    ComponentRegistry registry;
    ComponentRegistration registration = internal_registration<NodeA>("NodeA");
    registration.lifetime = ComponentLifetime::PerCall;
    registry.add(std::move(registration));
    check_error_code([&] { static_cast<void>(registry.build()); },
                     "UNSUPPORTED_LIFETIME");
}

void test_duplicate_type() {
    ComponentRegistry registry;
    registry.add(internal_registration<DuplicateType>("First"));
    registry.add(internal_registration<DuplicateType>("Second"));
    check_error_code([&] { static_cast<void>(registry.build()); },
                     "DUPLICATE_COMPONENT_TYPE");
}

void test_duplicate_tool_name() {
    ComponentRegistry registry;
    registry.add(public_registration<ToolOne>(
        "ToolOne", "same_tool",
        [](void*, const Json&, ToolCallContext&) { return Json::object(); }));
    registry.add(public_registration<ToolTwo>(
        "ToolTwo", "same_tool",
        [](void*, const Json&, ToolCallContext&) { return Json::object(); }));
    check_error_code([&] { static_cast<void>(registry.build()); },
                     "DUPLICATE_TOOL_NAME");
}

void test_construction_failure() {
    ComponentRegistry registry;
    registry.add(internal_registration<FailingConstructor>(
        "FailingConstructor", {}, [](DependencyContainer&) -> std::shared_ptr<void> {
            throw std::runtime_error("constructor exploded");
        }));
    check_error_code([&] { static_cast<void>(registry.build()); },
                     "CONSTRUCTION_FAILED");
}

Json call(BridgeApp& bridge, std::string id, std::string tool, Json arguments) {
    return bridge.handle_request(Json::object({
        {"protocolVersion", "1.0"},
        {"id", std::move(id)},
        {"tool", std::move(tool)},
        {"arguments", std::move(arguments)},
    }));
}

void test_request_response_and_schema_validation() {
    BridgeApp bridge;
    const Json unknown = call(bridge, "unknown-1", "not_registered",
                              Json::object());
    CHECK(unknown.at("error").at("code").as_string() == "UNKNOWN_TOOL");

    const Json malformed = Json::parse(bridge.handle_request_text("{broken"));
    CHECK(malformed.at("error").at("code").as_string() == "MALFORMED_JSON");
    CHECK(malformed.at("id").is_null());
}

void test_cpp_exception_conversion() {
    ComponentRegistry registry;
    registry.add(public_registration<ThrowingTool>(
        "ThrowingTool", "throwing_tool",
        [](void*, const Json&, ToolCallContext&) -> Json {
            throw std::runtime_error("implementation detail");
        }));
    BridgeApp bridge(registry);
    const Json response = call(bridge, "throw-1", "throwing_tool", Json::object());
    CHECK(!response.at("ok").as_bool());
    CHECK(response.at("error").at("code").as_string() == "CPP_EXCEPTION");
}

void test_invalid_output_conversion() {
    ComponentRegistry registry;
    registry.add(public_registration<InvalidOutputTool>(
        "InvalidOutputTool", "invalid_output",
        [](void*, const Json&, ToolCallContext&) -> Json {
            return "not an object";
        }));
    BridgeApp bridge(registry);
    const Json response = call(bridge, "output-1", "invalid_output", Json::object());
    CHECK(!response.at("ok").as_bool());
    CHECK(response.at("error").at("code").as_string()
          == "INVALID_TOOL_OUTPUT");
}

void test_scoped_memory_client() {
    const auto now = std::chrono::system_clock::now();
    FakeMemoryTransport transport;
    MemoryClient client(memory_context(), memory_grant(now), transport, now);
    CHECK(client.invoke(MemoryOperation::ComputeRead,
                        Json::object({{"id", "object:one"}}))
          == Json::object({{"id", "object:one"}}));
    CHECK(transport.capability_id == "capability:one");
    CHECK(transport.operation == MemoryOperation::ComputeRead);
    check_error_code(
        [&] { client.invoke(MemoryOperation::ComputeRead, Json::object()); },
        "MEMORY_OPERATION_QUOTA_EXCEEDED");
}

void test_memory_client_rejects_forged_and_stale_grants() {
    const auto now = std::chrono::system_clock::now();
    FakeMemoryTransport transport;
    auto check_grant = [&](MemoryGrant grant, const std::string& code) {
        check_error_code(
            [&] { MemoryClient client(memory_context(), std::move(grant),
                                      transport, now); },
            code);
    };
    auto cross_workspace = memory_grant(now);
    cross_workspace.workspace_id = "workspace:other";
    check_grant(std::move(cross_workspace), "CROSS_WORKSPACE_ACCESS");
    auto forged_call = memory_grant(now);
    forged_call.call_id = "call:other";
    check_grant(std::move(forged_call), "CALL_IDENTITY_MISMATCH");
    auto stale = memory_grant(now);
    stale.session_generation = 6;
    check_grant(std::move(stale), "STALE_CAPABILITY");
    auto expired = memory_grant(now);
    expired.issued_at = now - std::chrono::minutes(2);
    expired.expires_at = now - std::chrono::minutes(1);
    check_grant(std::move(expired), "CAPABILITY_EXPIRED");
}

using Test = std::pair<const char*, std::function<void()>>;

} // namespace

int main() {
    const std::vector<Test> tests = {
        {"json round trip", test_json_round_trip},
        {"descriptor builders", test_descriptor_builders},
        {"dependency topological sort", test_topological_sort},
        {"missing dependency", test_missing_dependency},
        {"circular dependency", test_circular_dependency},
        {"lifetime extension point", test_lifetime_extension_point},
        {"duplicate type", test_duplicate_type},
        {"duplicate tool name", test_duplicate_tool_name},
        {"construction failure", test_construction_failure},
        {"request response and schema", test_request_response_and_schema_validation},
        {"C++ exception conversion", test_cpp_exception_conversion},
        {"invalid output conversion", test_invalid_output_conversion},
        {"scoped memory client", test_scoped_memory_client},
        {"memory grant adversarial binding", test_memory_client_rejects_forged_and_stale_grants},
    };

    std::size_t failed = 0;
    for (const auto& [name, test] : tests) {
        try {
            test();
            std::cout << "[PASS] " << name << '\n';
        } catch (const std::exception& error) {
            ++failed;
            std::cerr << "[FAIL] " << name << ": " << error.what() << '\n';
        } catch (...) {
            ++failed;
            std::cerr << "[FAIL] " << name << ": non-standard exception\n";
        }
    }
    std::cout << (tests.size() - failed) << "/" << tests.size()
              << " tests passed\n";
    return failed == 0 ? 0 : 1;
}
