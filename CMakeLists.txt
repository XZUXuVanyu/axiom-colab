# Axiom V1 root build definition (F007, T01).
#
# Contract: specs/02-architecture.md (12 components, fixed targets and
# dependency direction), specs/03-build-and-dependencies.md (explicit sources,
# no GLOB, presets, offline dependencies), specs/15-delivery.md.
#
# This file owns target names, source lists and the dependency direction only.
# Every component target is declared here exactly once; a target whose sources
# are not yet delivered by its owning task is reported as pending instead of
# being stubbed, so "not implemented" can never be mistaken for "built".

cmake_minimum_required(VERSION 3.25)

project(AxiomV1
    VERSION 0.1.0
    DESCRIPTION "Axiom V1 - user-owned laboratory with a versioned tool library"
    LANGUAGES C CXX
)

if(NOT WIN32)
    message(FATAL_ERROR
        "Axiom V1 targets Windows 11 x64 (specs/01). Refusing to configure on "
        "${CMAKE_SYSTEM_NAME}; Linux results are never used to sign Windows "
        "acceptance.")
endif()

if(CMAKE_SIZEOF_VOID_P EQUAL 8)
    set(AXIOM_TARGET_ARCH "x64")
else()
    message(FATAL_ERROR "Axiom V1 requires a 64-bit target (x64).")
endif()

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")

include(Warnings)                 # F010
include(Packaging)                # F011
include(Dependencies)             # F009
include(BootstrapDependencies)    # F016

axiom_load_lock()
axiom_add_bootstrap_target()

include(CTest)

# ---------------------------------------------------------------------------
# Options. Each component is enabled by its owning task; the phase variable is
# a convenience switch for "configure and build only what is delivered so far".
# A disabled component is reported as not_implemented and never counted as a
# passing test (specs/03).
# ---------------------------------------------------------------------------
set(AXIOM_BUILD_PHASE "m0" CACHE STRING
    "Highest milestone whose targets are enabled (m0/m1/m2/m3/m4/release)")
set_property(CACHE AXIOM_BUILD_PHASE PROPERTY STRINGS m0 m1 m2 m3 m4 release)

option(AXIOM_BUILD_AUDIO
    "Build the JUCE audio product targets (specs/03: AXIOM_BUILD_AUDIO)" OFF)

option(AXIOM_REQUIRE_QT
    "Require the frozen Qt 6.11.2 kit at configure time (M0 check, specs/03)" OFF)

if(AXIOM_REQUIRE_QT)
    # specs/03 M0: verify the Qt/MSVC combination before building Qt targets.
    # Fails if Qt 6.11.2 is absent, if the version differs, or if a forbidden
    # component (Sql/Qml/WebEngine) is present.
    axiom_find_qt()
    message(STATUS "axiom: Qt ${AXIOM_QT_VERSION} verified from ${Qt6_DIR}")
endif()

set_property(GLOBAL PROPERTY AXIOM_REGISTERED_TARGETS "")
set_property(GLOBAL PROPERTY AXIOM_PENDING_TARGETS "")

# Registers one first-party target.
#   axiom_target(<name> TYPE STATIC|SHARED|EXECUTABLE|INTERFACE
#                SOURCES ... [PUBLIC_INCLUDE ...] [PRIVATE_INCLUDE ...]
#                [LINK ...] [PHASE m1] [AUDIO] [OUTPUT_NAME ...])
# All listed sources must exist; otherwise the target is recorded as pending
# and skipped with a status message.
function(axiom_target name)
    set(options AUDIO)
    set(one_value_args TYPE PHASE OUTPUT_NAME)
    set(multi_value_args SOURCES PUBLIC_INCLUDE PRIVATE_INCLUDE LINK)
    cmake_parse_arguments(ARG "${options}" "${one_value_args}" "${multi_value_args}" ${ARGN})

    if(NOT ARG_TYPE)
        message(FATAL_ERROR "axiom_target(${name}): TYPE is required")
    endif()
    if(NOT ARG_SOURCES AND NOT ARG_TYPE STREQUAL "INTERFACE")
        message(FATAL_ERROR "axiom_target(${name}): SOURCES is required")
    endif()

    # Phase gate: only register a target whose owning milestone is enabled.
    set(_phase "${ARG_PHASE}")
    if(NOT _phase)
        set(_phase "m0")
    endif()
    set(_phase_order m0 0 m1 1 m2 2 m3 3 m4 4 release 5)
    list(FIND _phase_order "${_phase}" _phase_index)
    list(FIND _phase_order "${AXIOM_BUILD_PHASE}" _current_index)
    if(_phase_index EQUAL -1 OR _current_index EQUAL -1)
        message(FATAL_ERROR
            "axiom_target(${name}): unknown phase '${_phase}' or AXIOM_BUILD_PHASE "
            "'${AXIOM_BUILD_PHASE}'")
    endif()
    if(_phase_index GREATER _current_index)
        set_property(GLOBAL APPEND PROPERTY AXIOM_PENDING_TARGETS
            "${name} (phase ${_phase})")
        return()
    endif()

    if(ARG_AUDIO AND NOT AXIOM_BUILD_AUDIO)
        set_property(GLOBAL APPEND PROPERTY AXIOM_PENDING_TARGETS
            "${name} (AXIOM_BUILD_AUDIO=OFF)")
        return()
    endif()

    # Every declared source must be present; missing sources mean the owning
    # task has not delivered them yet.
    set(_missing "")
    foreach(_src IN LISTS ARG_SOURCES)
        if(NOT EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/${_src}")
            list(APPEND _missing "${_src}")
        endif()
    endforeach()
    if(_missing)
        set_property(GLOBAL APPEND PROPERTY AXIOM_PENDING_TARGETS
            "${name} (missing sources: ${_missing})")
        message(STATUS "axiom: target '${name}' not built yet - missing ${_missing}")
        return()
    endif()

    if(ARG_TYPE STREQUAL "INTERFACE")
        add_library(${name} INTERFACE)
    elseif(ARG_TYPE STREQUAL "EXECUTABLE")
        add_executable(${name} ${ARG_SOURCES})
    else()
        add_library(${name} ${ARG_TYPE} ${ARG_SOURCES})
    endif()

    if(ARG_OUTPUT_NAME AND NOT ARG_TYPE STREQUAL "INTERFACE")
        set_target_properties(${name} PROPERTIES OUTPUT_NAME "${ARG_OUTPUT_NAME}")
    endif()

    if(ARG_PUBLIC_INCLUDE)
        target_include_directories(${name} PUBLIC
            $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/${ARG_PUBLIC_INCLUDE}>
            $<INSTALL_INTERFACE:include>)
    endif()
    if(ARG_PRIVATE_INCLUDE)
        foreach(_inc IN LISTS ARG_PRIVATE_INCLUDE)
            target_include_directories(${name} PRIVATE
                "${CMAKE_CURRENT_SOURCE_DIR}/${_inc}")
        endforeach()
    endif()
    if(ARG_LINK AND NOT ARG_TYPE STREQUAL "INTERFACE")
        target_link_libraries(${name} PUBLIC ${ARG_LINK})
    elseif(ARG_LINK)
        target_link_libraries(${name} INTERFACE ${ARG_LINK})
    endif()

    if(NOT ARG_TYPE STREQUAL "INTERFACE")
        axiom_apply_warnings(${name})
    endif()
    set_property(GLOBAL APPEND PROPERTY AXIOM_REGISTERED_TARGETS "${name}")
endfunction()

# ---------------------------------------------------------------------------
# C01 Domain Contracts (axiom_domain) - T03 owns the sources.
# Forbidden dependencies: Qt, JUCE, SQLite.
# ---------------------------------------------------------------------------
axiom_target(axiom_domain
    TYPE STATIC
    PHASE m1
    SOURCES
        libs/domain/src/ids.cpp
        libs/domain/src/error.cpp
        libs/domain/src/json_validate.cpp
        libs/domain/src/axh1.cpp
        libs/domain/src/sha256.cpp
        libs/domain/src/units.cpp
        libs/domain/src/graph_validate.cpp
    PUBLIC_INCLUDE libs/domain/include
    LINK axiom_nlohmann_json
)

# ---------------------------------------------------------------------------
# C10 Workspace Store (axiom_store) - T04. Depends on domain and SQLite.
# ---------------------------------------------------------------------------
axiom_target(axiom_store
    TYPE STATIC
    PHASE m1
    SOURCES
        libs/store/src/sqlite_handle.cpp
        libs/store/src/object_repository.cpp
        libs/store/src/audit_log.cpp
        libs/store/src/recovery.cpp
    PUBLIC_INCLUDE libs/store/include
    LINK axiom_domain axiom_sqlite3
)

# ---------------------------------------------------------------------------
# C06 Tool SDK (axiom_sdk, axiom-worker) - T06. Depends on domain only.
# ---------------------------------------------------------------------------
axiom_target(axiom_sdk
    TYPE STATIC
    PHASE m1
    SOURCES
        libs/sdk/src/tool_registry.cpp
        libs/sdk/src/call_context.cpp
    PUBLIC_INCLUDE libs/sdk/include
    LINK axiom_domain
)

axiom_target(axiom-worker
    TYPE EXECUTABLE
    PHASE m1
    SOURCES
        libs/sdk/src/worker_main.cpp
    PRIVATE_INCLUDE libs/sdk/include
    LINK axiom_sdk
)

# ---------------------------------------------------------------------------
# C07 Runner (axiom_runner) - T07. domain + QtCore + Windows API.
# ---------------------------------------------------------------------------
axiom_target(axiom_runner
    TYPE STATIC
    PHASE m2
    SOURCES
        libs/runner/src/windows_sandbox.cpp
        libs/runner/src/process_runner.cpp
        libs/runner/src/resource_budget.cpp
    PUBLIC_INCLUDE libs/runner/include
    LINK axiom_domain Qt6::Core
)

# ---------------------------------------------------------------------------
# C03 MCP Gateway (axiom_mcp, axiom-mcp) - T08. domain + ipc.
# ---------------------------------------------------------------------------
axiom_target(axiom_ipc
    TYPE STATIC
    PHASE m1
    SOURCES
        libs/ipc/src/local_socket.cpp
        libs/ipc/src/frame_codec.cpp
    PUBLIC_INCLUDE libs/ipc/include
    LINK axiom_domain Qt6::Core Qt6::Network
)

axiom_target(axiom_mcp
    TYPE STATIC
    PHASE m2
    SOURCES
        libs/mcp/src/json_rpc.cpp
        libs/mcp/src/tool_catalog.cpp
        libs/mcp/src/mcp_server.cpp
    PUBLIC_INCLUDE libs/mcp/include
    LINK axiom_domain axiom_ipc
)

axiom_target(axiom-mcp
    TYPE EXECUTABLE
    PHASE m2
    SOURCES
        libs/mcp/src/main.cpp
    PRIVATE_INCLUDE libs/mcp/include
    LINK axiom_mcp
)

# ---------------------------------------------------------------------------
# C05 Project Collaboration (axiom_project) - T09.
# ---------------------------------------------------------------------------
axiom_target(axiom_project
    TYPE STATIC
    PHASE m2
    SOURCES
        libs/project/src/snapshot.cpp
        libs/project/src/worktree.cpp
        libs/project/src/proposal.cpp
    PUBLIC_INCLUDE libs/project/include
    LINK axiom_domain axiom_store axiom_runner
)

# ---------------------------------------------------------------------------
# C08 Candidate Validation (axiom_validation) - T10.
# ---------------------------------------------------------------------------
axiom_target(axiom_validation
    TYPE STATIC
    PHASE m2
    SOURCES
        libs/validation/src/candidate.cpp
        libs/validation/src/validation_record.cpp
        libs/validation/src/oracle.cpp
    PUBLIC_INCLUDE libs/validation/include
    LINK axiom_domain axiom_store axiom_runner
)

# ---------------------------------------------------------------------------
# C09 Tool Library (axiom_library) - T11.
# ---------------------------------------------------------------------------
axiom_target(axiom_library
    TYPE STATIC
    PHASE m2
    SOURCES
        libs/library/src/package.cpp
        libs/library/src/publication.cpp
        libs/library/src/revocation.cpp
    PUBLIC_INCLUDE libs/library/include
    LINK axiom_domain axiom_store
)

# ---------------------------------------------------------------------------
# C11 Workflow (axiom_workflow) - T12. domain + store + sdk types only.
# ---------------------------------------------------------------------------
axiom_target(axiom_workflow
    TYPE STATIC
    PHASE m3
    SOURCES
        libs/workflow/src/graph.cpp
        libs/workflow/src/plan.cpp
        libs/workflow/src/run_snapshot.cpp
    PUBLIC_INCLUDE libs/workflow/include
    LINK axiom_domain axiom_store axiom_sdk
)

# ---------------------------------------------------------------------------
# C02 Host Session (axiom_hostlib, axiom-host) - T05. Composition root.
# ---------------------------------------------------------------------------
axiom_target(axiom_hostlib
    TYPE STATIC
    PHASE m1
    SOURCES
        libs/host/src/host_service.cpp
        libs/host/src/session.cpp
        libs/host/src/command_router.cpp
    PUBLIC_INCLUDE libs/host/include
    LINK axiom_domain axiom_store axiom_ipc
)

axiom_target(axiom-host
    TYPE EXECUTABLE
    PHASE m1
    SOURCES
        libs/host/src/main.cpp
    PRIVATE_INCLUDE libs/host/include
    LINK axiom_hostlib Qt6::Core
)

# ---------------------------------------------------------------------------
# C04 Review App (axiom_review, axiom-review) - T13. QtWidgets.
# ---------------------------------------------------------------------------
axiom_target(axiom_review
    TYPE STATIC
    PHASE m3
    SOURCES
        apps/review/src/host_client.cpp
        apps/review/src/main_window.cpp
        apps/review/src/project_panel.cpp
        apps/review/src/canvas_view.cpp
    PUBLIC_INCLUDE apps/review/include
    LINK axiom_domain axiom_ipc Qt6::Widgets
)

axiom_target(axiom-review
    TYPE EXECUTABLE
    PHASE m3
    SOURCES
        apps/review/src/main.cpp
    PRIVATE_INCLUDE apps/review/include
    LINK axiom_review
)

# ---------------------------------------------------------------------------
# C12 Delivery Diagnostics (axiom-diagnostics) - T14.
# ---------------------------------------------------------------------------
axiom_target(axiom-diagnostics
    TYPE EXECUTABLE
    PHASE m3
    SOURCES
        apps/diagnostics/src/main.cpp
        apps/diagnostics/src/doctor.cpp
        apps/diagnostics/src/backup.cpp
    PRIVATE_INCLUDE apps/diagnostics/src
    LINK axiom_domain axiom_store
)

# ---------------------------------------------------------------------------
# Products (produced with the Axiom workflow, not host core) - T15-T17.
# ---------------------------------------------------------------------------
axiom_target(physical_string_dsp
    TYPE STATIC
    PHASE m4
    SOURCES
        products/dsp/src/modal_string.cpp
        products/dsp/src/string_parameters.cpp
    PUBLIC_INCLUDE products/dsp/include
)

axiom_target(physical_string_tools
    TYPE STATIC
    PHASE m4
    SOURCES
        products/tools/src/string_render_tool.cpp
        products/tools/src/spectrum_analysis_tool.cpp
        products/tools/src/decay_analysis_tool.cpp
        products/tools/src/experiment_report_tool.cpp
    PUBLIC_INCLUDE products/tools/include
    LINK physical_string_dsp axiom_sdk
)

# ---------------------------------------------------------------------------
# Tests. One test executable per component family; each is registered with
# CTest and labelled so the gates can run by label (specs/15).
# ---------------------------------------------------------------------------
if(BUILD_TESTING)
    axiom_third_party_catch2()
    axiom_third_party_nlohmann_json()
    axiom_third_party_sqlite()

    # T01 test support: AXH1 encoder + SHA-256 used to check the frozen golden
    # vectors. The production implementation is owned by C01 (T03).
    axiom_target(axiom_test_support
        TYPE STATIC
        PHASE m0
        SOURCES
            tests/support/axh1.cpp
        PUBLIC_INCLUDE tests/support
        LINK axiom_nlohmann_json
    )

    axiom_target(axiom_build_contract_tests
        TYPE EXECUTABLE
        PHASE m0
        SOURCES
            tests/contract/build_contract_test.cpp
            tests/contract/hash_golden_test.cpp
        PRIVATE_INCLUDE tests/support
        LINK Catch2::Catch2WithMain axiom_test_support axiom_sqlite3
    )
    if(TARGET axiom_build_contract_tests)
        target_compile_definitions(axiom_build_contract_tests PRIVATE
            AXIOM_SOURCE_DIR="${CMAKE_CURRENT_SOURCE_DIR}"
            AXIOM_DEPS_ROOT="${AXIOM_DEPS_ROOT}"
            AXIOM_CXX_COMPILER_ID="${CMAKE_CXX_COMPILER_ID}"
            AXIOM_CXX_COMPILER_VERSION="${CMAKE_CXX_COMPILER_VERSION}"
            AXIOM_GENERATOR="${CMAKE_GENERATOR}"
            AXIOM_BUILD_TYPE="${CMAKE_BUILD_TYPE}")
        add_test(NAME axiom_build_contract
                 COMMAND axiom_build_contract_tests)
        set_tests_properties(axiom_build_contract PROPERTIES
            LABELS "domain;build")
    endif()
endif()

# ---------------------------------------------------------------------------
# Summary: registered vs pending, so an incomplete tree is visible instead of
# silently "passing".
# ---------------------------------------------------------------------------
get_property(_registered GLOBAL PROPERTY AXIOM_REGISTERED_TARGETS)
get_property(_pending GLOBAL PROPERTY AXIOM_PENDING_TARGETS)
message(STATUS "axiom: phase=${AXIOM_BUILD_PHASE} audio=${AXIOM_BUILD_AUDIO}")
message(STATUS "axiom: registered targets: ${_registered}")
if(_pending)
    message(STATUS "axiom: pending targets (not implemented yet): ${_pending}")
endif()

# ---------------------------------------------------------------------------
# Install rules (F011).
# ---------------------------------------------------------------------------
axiom_install_licences()
foreach(_tgt IN LISTS _registered)
    get_target_property(_type ${_tgt} TYPE)
    if(_type STREQUAL "EXECUTABLE" OR _type STREQUAL "STATIC" OR _type STREQUAL "SHARED")
        axiom_install_runtime(${_tgt})
    endif()
endforeach()
