# Axiom V1 warning, CRT and floating-point consistency (F010, T01).
#
# Contract: specs/03-build-and-dependencies.md
#   /W4 /permissive- /utf-8; Debug uses /MDd, Release uses /MD;
#   floating point default /fp:precise; /fp:fast is not allowed.
# The same options must apply to every first-party target so that a candidate
# built by the runner is byte-comparable with a build produced by VS or by the
# command line (docs/BUILD.md).
#
# Private details of this file (helper names, guard variables) are free to
# change; the enforced option set is the contract.

include_guard(GLOBAL)

if(NOT MSVC)
    message(FATAL_ERROR
        "Axiom V1 targets Windows 11 x64 with the frozen MSVC toolchain "
        "(specs/01, specs/03). CMAKE_CXX_COMPILER_ID is "
        "'${CMAKE_CXX_COMPILER_ID}'. Refusing to configure a non-MSVC build "
        "instead of silently changing the ABI.")
endif()

# CRT selection is owned by CMAKE_MSVC_RUNTIME_LIBRARY so that it cannot drift
# per target. Debug=/MDd, Release=/MD, RelWithDebInfo=/MD, MinSizeRel=/MD.
if(NOT DEFINED CMAKE_MSVC_RUNTIME_LIBRARY OR CMAKE_MSVC_RUNTIME_LIBRARY STREQUAL "")
    set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded\$<\$<CONFIG:Debug>:Debug>DLL")
endif()

# Reject an explicit /fp:fast in the cache: the spec forbids it.
string(REPLACE ";" " " _axiom_cxx_flags_str "${CMAKE_CXX_FLAGS}")
if(_axiom_cxx_flags_str MATCHES "/fp:fast")
    message(FATAL_ERROR
        "CMAKE_CXX_FLAGS contains /fp:fast; specs/03 requires /fp:precise.")
endif()

# DCR-0001 (owner-approved 2026-09-09): the V1 toolchain is MSVC 14.44 (v143
# series), which is ABI-identical to the Qt 6.11.2 binaries (QT_MSVC 19.44).
# MSVC 14.51 is also installed, but must not be used for V1 builds: mixing it
# with the Qt binaries would silently switch the ABI, which specs/01 forbids.
if(MSVC)
    set(AXIOM_REQUIRE_MSVC_1444 ON CACHE BOOL
        "Fail configure unless the MSVC toolset is the frozen 14.44 (DCR-0001)")
    if(AXIOM_REQUIRE_MSVC_1444 AND NOT MSVC_VERSION EQUAL 1944)
        message(FATAL_ERROR
            "MSVC ${MSVC_VERSION} selected, but DCR-0001 freezes the 14.44 "
            "toolset (MSVC_VERSION 1944). Start the shell with "
            "'vcvars64.bat -vcvars_ver=14.44' from "
            "'E:/Microsoft Visual Studio/VC/Auxiliary/Build', or set "
            "AXIOM_REQUIRE_MSVC_1444=OFF for a deliberate experiment and record it.")
    endif()
    if(NOT MSVC_VERSION EQUAL 1944)
        message(WARNING
            "axiom: building with MSVC ${MSVC_VERSION}; the frozen V1 toolset is "
            "14.44. This build is an experiment, not a gate result.")
    endif()
endif()

set(AXIOM_MSVC_WARNING_OPTIONS
    /W4
    /permissive-
    /utf-8
    /EHsc
    /fp:precise
    /Zc:__cplusplus
    /Zc:preprocessor
    /Zc:inline
    /Zc:wchar_t
    /Zc:forScope
    /diagnostics:caret
    /MP
)

# Warnings-as-errors is opt-in per preset (win-release enables it) but the
# warning set itself is fixed.
option(AXIOM_WARNINGS_AS_ERRORS "Treat MSVC warnings as errors" OFF)

# Applies the contract options to one first-party target.
function(axiom_apply_warnings target)
    target_compile_features(${target} PUBLIC cxx_std_20)
    target_compile_options(${target} PRIVATE ${AXIOM_MSVC_WARNING_OPTIONS})
    if(AXIOM_WARNINGS_AS_ERRORS)
        target_compile_options(${target} PRIVATE /WX)
    endif()
    # No exceptions across a DLL/host callback boundary is enforced in code;
    # /EHsc keeps standard C++ exception semantics for the batch domain.
    set_property(TARGET ${target} PROPERTY CXX_STANDARD 20)
    set_property(TARGET ${target} PROPERTY CXX_STANDARD_REQUIRED ON)
    set_property(TARGET ${target} PROPERTY CXX_EXTENSIONS OFF)
endfunction()
