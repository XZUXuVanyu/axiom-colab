# Axiom V1 install/packaging rules (F011, T01).
#
# Contract: specs/15-delivery.md
#   * dist/win-release holds host/mcp/review/diagnostics/worker, the required Qt
#     DLLs and platform plugins, licences/third-party list, default
#     non-sensitive config, the MCP plugin directory and the user guide.
#   * No private suite, no data root, no user path tokens.
#   * audio/ holds the standalone and the .vst3 bundle; the exact VST3
#     structure is produced by the JUCE target, never by renaming a DLL.
#   * T18 only completes the final artefact manifest; T01 fixes the rules.
#
# Licences: the project is AGPL-3.0-or-later (docs/LICENSE-DECISION.md); Qt is
# used under LGPLv3 and must stay dynamically linked, so the Qt licence texts
# and the third-party notice file are installed next to the binaries.

include_guard(GLOBAL)

include(GNUInstallDirs)

set(AXIOM_INSTALL_BINDIR "bin" CACHE STRING "Install destination for executables")
set(AXIOM_INSTALL_LIBDIR "lib" CACHE STRING "Install destination for libraries")
set(AXIOM_INSTALL_DOCDIR "docs" CACHE STRING "Install destination for documentation")
set(AXIOM_INSTALL_PLUGINDIR "plugins/axiom-colab" CACHE STRING
    "Install destination for the MCP/agent plugin package")
set(AXIOM_INSTALL_LICENSEDIR "licenses" CACHE STRING
    "Install destination for licence texts and third-party notices")

# Installs the licence evidence that must travel with every package.
function(axiom_install_licences)
    install(FILES
        "${CMAKE_CURRENT_LIST_DIR}/../LICENSE"
        "${CMAKE_CURRENT_LIST_DIR}/../docs/LICENSE-DECISION.md"
        DESTINATION "${AXIOM_INSTALL_LICENSEDIR}"
        OPTIONAL)
    if(EXISTS "${CMAKE_CURRENT_LIST_DIR}/../deps/THIRD-PARTY-NOTICES.md")
        install(FILES "${CMAKE_CURRENT_LIST_DIR}/../deps/THIRD-PARTY-NOTICES.md"
            DESTINATION "${AXIOM_INSTALL_LICENSEDIR}")
    endif()
    # Qt is LGPLv3: its own licence texts must be redistributed.
    if(DEFINED Qt6_DIR AND EXISTS "${Qt6_DIR}/../../../Licenses")
        get_filename_component(_qt_root "${Qt6_DIR}/../../.." ABSOLUTE)
        install(DIRECTORY "${_qt_root}/Licenses/"
            DESTINATION "${AXIOM_INSTALL_LICENSEDIR}/qt"
            OPTIONAL)
    endif()
endfunction()

# Deploys the Qt runtime next to the installed executables (windeployqt), so a
# copied install directory still runs. Never silently skips a missing tool.
function(axiom_install_qt_runtime target)
    if(NOT WIN32)
        return()
    endif()
    find_program(AXIOM_WINDEPLOYQT_EXECUTABLE
        NAMES windeployqt6 windeployqt
        HINTS "${Qt6_DIR}/../../../bin")
    if(NOT AXIOM_WINDEPLOYQT_EXECUTABLE)
        message(WARNING
            "windeployqt was not found; the Qt runtime will not be deployed "
            "into the install tree. Record this as a packaging gap, do not "
            "treat the package as self-contained.")
        return()
    endif()
    install(CODE "
        execute_process(
            COMMAND \"${AXIOM_WINDEPLOYQT_EXECUTABLE}\"
                    --no-translations --no-system-d3d-compiler --no-opengl-sw
                    \"\$ENV{DESTDIR}\${CMAKE_INSTALL_PREFIX}/${AXIOM_INSTALL_BINDIR}/$<TARGET_FILE_NAME:${target}>\"
            RESULT_VARIABLE _wd_result)
        if(NOT _wd_result EQUAL 0)
            message(FATAL_ERROR \"windeployqt failed with \${_wd_result}\")
        endif()
    ")
endfunction()

# Registers one first-party runtime target with the standard install layout.
function(axiom_install_runtime target)
    install(TARGETS ${target}
        RUNTIME DESTINATION "${AXIOM_INSTALL_BINDIR}"
        LIBRARY DESTINATION "${AXIOM_INSTALL_LIBDIR}"
        ARCHIVE DESTINATION "${AXIOM_INSTALL_LIBDIR}")
endfunction()
