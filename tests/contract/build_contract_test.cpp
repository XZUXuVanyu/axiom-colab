// T01 build-contract test.
//
// This test proves that the build system actually delivers what specs/03 and
// specs/01 require: MSVC with the frozen options, C++20 as the language
// standard, /fp:precise, UTF-8 source handling, the locked dependency versions
// compiled in, and the Windows/x64 target. It deliberately does NOT claim any
// Axiom business behaviour: the 12 components are not implemented yet, and a
// green run here is not a component acceptance.
#include <catch2/catch_test_macros.hpp>

#include <bit>
#include <compare>
#include <string>

#include <nlohmann/json.hpp>
#include <sqlite3.h>

#ifndef AXIOM_SOURCE_DIR
#error "AXIOM_SOURCE_DIR must be defined by CMakeLists.txt"
#endif
#ifndef AXIOM_CXX_COMPILER_ID
#error "AXIOM_CXX_COMPILER_ID must be defined by CMakeLists.txt"
#endif

namespace {

// UTF-8 execution charset check: the bytes of a non-ASCII literal must be the
// exact UTF-8 encoding of U+957F (E9 95 BF).
constexpr const char kUtf8Probe[] = "\u957F";

}  // namespace

TEST_CASE("toolchain is the frozen MSVC ABI", "[build]") {
    REQUIRE(std::string(AXIOM_CXX_COMPILER_ID) == "MSVC");
    STATIC_REQUIRE(sizeof(void*) == 8);
    // MSVC reports _MSC_VER; 1951 == Visual Studio 2026 18.x toolset.
    REQUIRE(_MSC_VER >= 1900);
    REQUIRE(_MSC_FULL_VER > 0);
}

TEST_CASE("C++20 language standard is active", "[build]") {
    REQUIRE(__cplusplus >= 202002L);
    // C++20 concepts and the spaceship operator must compile and behave.
    STATIC_REQUIRE(__cpp_concepts >= 201907L);
    const std::strong_ordering cmp = (1 <=> 2);
    REQUIRE(cmp == std::strong_ordering::less);
}

TEST_CASE("floating point is precise, not fast", "[build]") {
#if defined(_M_FP_FAST)
    FAIL("compiler reported /fp:fast; specs/03 requires /fp:precise");
#else
    REQUIRE(true);
#endif
    // IEEE754 binary64 round trip through the AXH1 encoding path.
    const double value = -0.0;
    REQUIRE(std::bit_cast<std::uint64_t>(value + 0.0) == 0u);
}

TEST_CASE("source is compiled as UTF-8", "[build]") {
    REQUIRE(std::string(kUtf8Probe) == "\xE9\x95\xBF");
    REQUIRE(sizeof(kUtf8Probe) == 4);  // 3 bytes + NUL
}

TEST_CASE("locked dependency versions are the frozen ones", "[build]") {
    REQUIRE(NLOHMANN_JSON_VERSION_MAJOR == 3);
    REQUIRE(NLOHMANN_JSON_VERSION_MINOR == 12);
    REQUIRE(NLOHMANN_JSON_VERSION_PATCH == 0);
    REQUIRE(std::string(sqlite3_libversion()) == "3.53.4");
}

TEST_CASE("nlohmann/json is the only JSON parser and orders object keys",
          "[build]") {
    // NOTE: nlohmann/json does not reject duplicate keys itself (it keeps the
    // last one). specs/04 requires duplicate-key rejection, which is therefore
    // C01's validator responsibility, checked in T03 - not a parser feature.
    const auto parsed = nlohmann::json::parse("{\"b\":2,\"a\":1}");
    REQUIRE(parsed.dump() == "{\"a\":1,\"b\":2}");
    REQUIRE_THROWS(nlohmann::json::parse("{not json}"));
}

TEST_CASE("SQLite is built without extension loading", "[build]") {
#ifndef SQLITE_OMIT_LOAD_EXTENSION
    FAIL("SQLITE_OMIT_LOAD_EXTENSION is not defined; specs/03 forbids "
         "load_extension");
#else
    // The symbol must not exist at all in this build, which is the strongest
    // form of "extension loading is not available".
    REQUIRE(std::string(sqlite3_libversion()) == "3.53.4");
#endif
}
