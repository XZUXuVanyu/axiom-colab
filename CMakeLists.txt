cmake_minimum_required(VERSION 3.24)

project(general_ts_cpp_adapter VERSION 0.1.0 LANGUAGES CXX)

include(CTest)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(CPP_ADAPTER_WARNINGS_AS_ERRORS "Treat compiler warnings as errors" ON)
option(CPP_ADAPTER_BUILD_GUI "Build the optional Qt authoring GUI" ON)

function(cpp_adapter_target_defaults target)
    target_compile_features(${target} PUBLIC cxx_std_20)
    if(MSVC)
        target_compile_options(${target} PRIVATE /W4 /permissive- /EHsc /utf-8)
        if(CPP_ADAPTER_WARNINGS_AS_ERRORS)
            target_compile_options(${target} PRIVATE /WX)
        endif()
    else()
        target_compile_options(${target} PRIVATE -Wall -Wextra -Wpedantic)
        if(CPP_ADAPTER_WARNINGS_AS_ERRORS)
            target_compile_options(${target} PRIVATE -Werror)
        endif()
    endif()
endfunction()

add_library(cpp_adapter_core STATIC
    source/cpp/adapter/src/component_registry.cpp
    source/cpp/adapter/src/errors.cpp
    source/cpp/adapter/src/json.cpp
    source/cpp/adapter/src/json_schema.cpp
    source/cpp/adapter/src/memory_client.cpp
    source/cpp/adapter/src/tool_descriptor.cpp
)
target_include_directories(cpp_adapter_core PUBLIC source/cpp/adapter/include)
cpp_adapter_target_defaults(cpp_adapter_core)

# CONFIGURE_DEPENDS asks CMake to re-scan this directory when a tool .cpp is
# added or removed. This trades a small configure-time scan for the desired
# extension rule: a new tool only adds its own .hpp/.cpp and local registrar.
file(GLOB CPP_ADAPTER_TOOL_SOURCES CONFIGURE_DEPENDS
    "${CMAKE_CURRENT_SOURCE_DIR}/source/cpp/tools/*.cpp"
)

# Tool translation units are OBJECT files, not members pulled from a static
# archive. Every registrar object is therefore placed on the final link line in
# Debug and Release, avoiding MSVC /OPT:REF and archive extraction surprises.
add_library(cpp_adapter_tools OBJECT ${CPP_ADAPTER_TOOL_SOURCES})
target_include_directories(cpp_adapter_tools PRIVATE
    source/cpp/adapter/include source/cpp/tools
)
target_link_libraries(cpp_adapter_tools PRIVATE cpp_adapter_core)
cpp_adapter_target_defaults(cpp_adapter_tools)

add_library(cpp_adapter_bridge STATIC source/cpp/bridge/bridge.cpp)
target_include_directories(cpp_adapter_bridge PUBLIC source/cpp/bridge PRIVATE source/cpp/adapter/include)
target_link_libraries(cpp_adapter_bridge PUBLIC cpp_adapter_core)
cpp_adapter_target_defaults(cpp_adapter_bridge)

add_executable(cpp-tool-bridge
    source/cpp/bridge/main.cpp
    $<TARGET_OBJECTS:cpp_adapter_tools>
)
target_include_directories(cpp-tool-bridge PRIVATE
    source/cpp/adapter/include source/cpp/bridge source/cpp/tools
)
target_link_libraries(cpp-tool-bridge PRIVATE cpp_adapter_bridge cpp_adapter_core)
cpp_adapter_target_defaults(cpp-tool-bridge)

if(BUILD_TESTING)
    add_executable(cpp-adapter-tests
        tests/cpp/test_main.cpp
        $<TARGET_OBJECTS:cpp_adapter_tools>
    )
    target_include_directories(cpp-adapter-tests PRIVATE
        source/cpp/adapter/include source/cpp/bridge source/cpp/tools
    )
    target_link_libraries(cpp-adapter-tests PRIVATE
        cpp_adapter_bridge cpp_adapter_core
    )
    cpp_adapter_target_defaults(cpp-adapter-tests)
    add_test(NAME cpp-adapter-tests COMMAND cpp-adapter-tests)
endif()

install(TARGETS cpp-tool-bridge RUNTIME DESTINATION bin)

if(CPP_ADAPTER_BUILD_GUI)
    if(WIN32 AND NOT Qt6_DIR)
        find_program(CPP_ADAPTER_QMAKE_EXECUTABLE qmake)
        if(CPP_ADAPTER_QMAKE_EXECUTABLE)
            execute_process(
                COMMAND "${CPP_ADAPTER_QMAKE_EXECUTABLE}" -query QT_INSTALL_PREFIX
                OUTPUT_VARIABLE CPP_ADAPTER_QT_PREFIX
                OUTPUT_STRIP_TRAILING_WHITESPACE
            )
            list(APPEND CMAKE_PREFIX_PATH "${CPP_ADAPTER_QT_PREFIX}")
        endif()
    endif()
    find_package(Qt6 QUIET COMPONENTS Widgets)
    if(Qt6Widgets_FOUND)
        qt_standard_project_setup()
        qt_add_executable(cpp-adapter-gui WIN32
            source/cpp/gui/main.cpp
            source/cpp/gui/main_window.cpp
            source/cpp/gui/main_window.hpp
        )
        target_link_libraries(cpp-adapter-gui PRIVATE Qt6::Widgets)
        target_compile_definitions(cpp-adapter-gui PRIVATE
            CPP_ADAPTER_SOURCE_DIR="${CMAKE_CURRENT_SOURCE_DIR}"
        )
        cpp_adapter_target_defaults(cpp-adapter-gui)
        install(TARGETS cpp-adapter-gui RUNTIME DESTINATION bin)
    else()
        message(STATUS "Qt6 Widgets not found; cpp-adapter-gui will not be built")
    endif()
endif()
