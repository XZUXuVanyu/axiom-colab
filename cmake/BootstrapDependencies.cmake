# Axiom V1 dependency bootstrap (F016, T01).
#
# Contract: specs/03-build-and-dependencies.md
#   * A user-authorised bootstrap runs outside the sandbox, fetches only the
#     locked official versions, and verifies their bytes; the candidate build
#     afterwards reads the frozen cache and never touches the network.
#   * No model-provided command string is executed: this file only invokes the
#     repository script with arguments that come from deps/lock.json.
#   * Missing or different bytes block the normal build; hashes are never
#     fabricated and no alternate version is silently substituted.
#
# This target is OFF by default and is never part of the normal build.

include_guard(GLOBAL)

option(AXIOM_ENABLE_BOOTSTRAP
    "Register the networked dependency bootstrap target (requires user authorisation)" OFF)

set(AXIOM_BOOTSTRAP_SCRIPT
    "${CMAKE_CURRENT_LIST_DIR}/../tools/bootstrap-deps.ps1" CACHE FILEPATH
    "Script that fetches locked dependency bytes")

function(axiom_add_bootstrap_target)
    if(NOT AXIOM_ENABLE_BOOTSTRAP)
        message(STATUS
            "axiom-bootstrap not registered (AXIOM_ENABLE_BOOTSTRAP=OFF). "
            "Enable it explicitly when you intend to fetch dependency bytes.")
        return()
    endif()

    if(NOT EXISTS "${AXIOM_BOOTSTRAP_SCRIPT}")
        message(FATAL_ERROR
            "Bootstrap script '${AXIOM_BOOTSTRAP_SCRIPT}' does not exist.")
    endif()

    find_package(PowerShell QUIET)
    find_program(AXIOM_POWERSHELL_EXECUTABLE
        NAMES pwsh powershell
        HINTS "$ENV{ProgramFiles}/PowerShell/7")
    if(NOT AXIOM_POWERSHELL_EXECUTABLE)
        message(FATAL_ERROR "No PowerShell interpreter found for the bootstrap.")
    endif()

    add_custom_target(axiom-bootstrap
        COMMAND "${AXIOM_POWERSHELL_EXECUTABLE}"
                -NoProfile -ExecutionPolicy Bypass
                -File "${AXIOM_BOOTSTRAP_SCRIPT}"
                -LockFile "${AXIOM_DEPS_ROOT}/lock.json"
                -Destination "${AXIOM_DEPS_SOURCES}"
        WORKING_DIRECTORY "${CMAKE_CURRENT_LIST_DIR}/.."
        COMMENT "Fetching and verifying locked dependency bytes into deps/sources"
        VERBATIM)

    add_custom_target(axiom-bootstrap-verify
        COMMAND "${AXIOM_POWERSHELL_EXECUTABLE}"
                -NoProfile -ExecutionPolicy Bypass
                -File "${AXIOM_BOOTSTRAP_SCRIPT}"
                -LockFile "${AXIOM_DEPS_ROOT}/lock.json"
                -Destination "${AXIOM_DEPS_SOURCES}"
                -VerifyOnly
        WORKING_DIRECTORY "${CMAKE_CURRENT_LIST_DIR}/.."
        COMMENT "Re-verifying the frozen dependency cache against deps/lock.json"
        VERBATIM)
endfunction()
