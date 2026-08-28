#include "bridge.hpp"
#include "cpp_adapter/component_registry.hpp"
#include "cpp_adapter/errors.hpp"
#include "cpp_adapter/json.hpp"
#include "cpp_adapter/memory_client.hpp"
#include "supervisory_response.hpp"

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
using cpp_adapter::MemorySessionFactory;
using cpp_adapter::MemoryTransport;
using cpp_adapter::RegistryError;
using cpp_adapter::ToolCallContext;
using cpp_adapter::ToolDescriptor;
using cpp_adapter::ToolError;
using axiom_colab::gui::SupervisoryResponseError;
using axiom_colab::gui::parse_supervisory_response;
using axiom_colab::gui::parse_goal_list_result;
using axiom_colab::gui::parse_workspace_inspection_result;
using axiom_colab::gui::parse_workspace_list_result;

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

template <typename Callable>
void check_supervisory_response_error(Callable&& callable) {
    try {
        std::forward<Callable>(callable)();
    } catch (const SupervisoryResponseError&) {
        return;
    }
    throw TestFailure("expected SupervisoryResponseError");
}

void test_supervisory_response_parser() {
    const auto success = parse_supervisory_response(
        R"({"protocolVersion":"1.0","id":"request:1","ok":true,"result":{"workspaces":["workspace:one"]}})",
        "request:1");
    CHECK(success.ok);
    const auto workspaces = parse_workspace_list_result(success);
    CHECK(workspaces.size() == 1);
    CHECK(workspaces[0] == "workspace:one");

    const auto goal_response = parse_supervisory_response(
        R"({"protocolVersion":"1.0","id":"request:goals","ok":true,"result":{"workspaceId":"workspace:one","goals":["goal:one"]}})",
        "request:goals");
    const auto goals = parse_goal_list_result(goal_response, "workspace:one");
    CHECK(goals.workspace_id == "workspace:one");
    CHECK(goals.goals.size() == 1);
    CHECK(goals.goals[0] == "goal:one");
    check_supervisory_response_error([&] {
        (void)parse_goal_list_result(goal_response, "workspace:other");
    });
    check_supervisory_response_error([] {
        const auto duplicate_goals = parse_supervisory_response(
            R"({"protocolVersion":"1.0","id":"request:goals","ok":true,"result":{"workspaceId":"workspace:one","goals":["goal:one","goal:one"]}})",
            "request:goals");
        (void)parse_goal_list_result(duplicate_goals, "workspace:one");
    });

    const auto failure = parse_supervisory_response(
        R"({"protocolVersion":"1.0","id":"request:2","ok":false,"error":{"code":"GOAL_NOT_FOUND","message":"missing"}})",
        "request:2");
    CHECK(!failure.ok);
    CHECK(failure.error_code == "GOAL_NOT_FOUND");
    CHECK(failure.error_message == "missing");

    check_supervisory_response_error([] {
        (void)parse_supervisory_response(
            R"({"protocolVersion":"1.0","id":"other","ok":true,"result":null})",
            "request:1");
    });
    check_supervisory_response_error([] {
        (void)parse_supervisory_response(
            R"({"protocolVersion":"1.0","id":"request:1","ok":true,"result":null,"approval":true})",
            "request:1");
    });
    check_supervisory_response_error([] {
        (void)parse_supervisory_response(
            R"({"protocolVersion":"2.0","id":"request:1","ok":true,"result":null})",
            "request:1");
    });
    check_supervisory_response_error([] {
        (void)parse_supervisory_response(
            R"({"protocolVersion":"1.0","id":"request:1","result":null})",
            "request:1");
    });

    const auto inspection_response = parse_supervisory_response(
        R"({"protocolVersion":"1.0","id":"request:3","ok":true,"result":{"workspaceId":"workspace:one","goalId":null,"currentPlan":null,"tools":[],"resources":{},"candidates":[],"timeline":[],"controls":{}}})",
        "request:3");
    const auto inspection = parse_workspace_inspection_result(
        inspection_response, "workspace:one", std::nullopt);
    CHECK(inspection.workspace_id == "workspace:one");
    CHECK(!inspection.goal_id.has_value());
    CHECK(inspection.tools.as_array().empty());
    check_supervisory_response_error([&] {
        (void)parse_workspace_inspection_result(
            inspection_response, "workspace:other", std::nullopt);
    });
    check_supervisory_response_error([] {
        const auto duplicate = parse_supervisory_response(
            R"({"protocolVersion":"1.0","id":"request:4","ok":true,"result":{"workspaces":["workspace:one","workspace:one"]}})",
            "request:4");
        (void)parse_workspace_list_result(duplicate);
    });
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
struct MemoryDependentTool {
    explicit MemoryDependentTool(MemoryClient& memory) : memory_(&memory) {}
    MemoryClient* memory_;
};

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
    const auto runtime = registry.build();
    CHECK(!runtime.container().contains(std::type_index(typeid(NodeA))));
}

struct TestMemorySessionFactory final : MemorySessionFactory {
    FakeMemoryTransport transport;
    std::unique_ptr<MemoryClient> create_session(
        const Json& trusted_context, std::string_view tool_name,
        std::string_view call_id) override {
        const auto now = std::chrono::system_clock::now();
        CHECK(trusted_context.at("workspaceId").as_string() == "workspace:one");
        CHECK(trusted_context.at("toolName").as_string() == tool_name);
        auto context = memory_context();
        context.tool_id = trusted_context.at("toolId").as_string();
        context.call_id = std::string(call_id);
        auto grant = memory_grant(now);
        grant.tool_id = context.tool_id;
        grant.call_id = context.call_id;
        return std::make_unique<MemoryClient>(std::move(context),
                                              std::move(grant), transport, now);
    }
};

void test_bridge_constructs_memory_dependency_per_call() {
    ComponentRegistry registry;
    registry.add(ComponentRegistration{
        std::type_index(typeid(MemoryDependentTool)), "MemoryDependentTool",
        ComponentKind::PublicTool,
        {{std::type_index(typeid(MemoryClient)), "cpp_adapter::MemoryClient"}},
        [](DependencyContainer& container) {
            return std::make_shared<MemoryDependentTool>(
                container.require<MemoryClient>());
        },
        [] { return fake_descriptor("memory_tool"); },
        [](void* instance, const Json&, ToolCallContext&) {
            auto* tool = static_cast<MemoryDependentTool*>(instance);
            return tool->memory_->invoke(
                MemoryOperation::ComputeRead,
                Json::object({{"id", "object:shared"}}));
        },
    });
    TestMemorySessionFactory sessions;
    BridgeApp bridge(registry, &sessions);
    const Json request = Json::object({
        {"protocolVersion", "1.0"}, {"id", "call:memory"},
        {"tool", "memory_tool"}, {"arguments", Json::object()},
        {"trustedContext", Json::object({
            {"protocolVersion", "1.0"}, {"workspaceId", "workspace:one"},
            {"actorId", "actor:model"}, {"toolId", "tool:memory-test"},
            {"toolName", "memory_tool"}, {"toolVersion", "1.0.0"},
            {"callId", "call:memory"},
            {"sessionGeneration", 7}, {"memoryGrant", Json::object()},
        })},
    });
    const Json response = bridge.handle_request(request);
    CHECK(response.at("ok").as_bool());
    CHECK(response.at("result").at("id").as_string() == "object:shared");

    BridgeApp without_sessions(registry);
    const Json denied = without_sessions.handle_request(Json::object({
        {"protocolVersion", "1.0"}, {"id", "call:no-memory"},
        {"tool", "memory_tool"}, {"arguments", Json::object()},
    }));
    CHECK(denied.at("error").at("code").as_string()
          == "MEMORY_SESSION_REQUIRED");
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
        [&] { static_cast<void>(client.invoke(
            MemoryOperation::ComputeRead, Json::object())); },
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
        {"strict supervisory response parsing", test_supervisory_response_parser},
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
        {"Bridge per-call memory dependency", test_bridge_constructs_memory_dependency_per_call},
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
