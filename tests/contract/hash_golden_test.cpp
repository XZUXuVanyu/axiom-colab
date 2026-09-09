// T01 AXH1 golden-vector test.
//
// The vectors live in contracts/hash-golden.json (frozen) and were produced
// independently of this code. This test binds the T01 build gate to the frozen
// byte encoding: prefix, null/false/true tags, IEEE754 binary64 big-endian with
// negative-zero normalisation, UTF-8 strings with uint64 big-endian length,
// array/object tags, and byte-sorted object keys.
//
// It verifies the contract's encoding, not the production C01 encoder (T03
// owns that). Passing here is a T01 gate result only.
#include <catch2/catch_test_macros.hpp>

#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "axh1.hpp"

namespace {

nlohmann::json load_golden() {
    const std::filesystem::path path =
        std::filesystem::path(AXIOM_SOURCE_DIR) /
        "implementation" / "specification" / "contracts" / "hash-golden.json";
    std::ifstream in(path, std::ios::binary);
    REQUIRE(in.good());
    return nlohmann::json::parse(in);
}

std::string to_hex(const std::vector<std::byte>& bytes) {
    static const char* kHex = "0123456789abcdef";
    std::string out;
    out.reserve(bytes.size() * 2);
    for (std::byte b : bytes) {
        const auto v = static_cast<unsigned>(b);
        out.push_back(kHex[v >> 4]);
        out.push_back(kHex[v & 0xf]);
    }
    return out;
}

}  // namespace

TEST_CASE("AXH1 golden vectors match the frozen encodings and digests",
          "[domain][build]") {
    const nlohmann::json golden = load_golden();
    REQUIRE(golden.at("schema_version") == 1);
    const auto& cases = golden.at("cases");
    REQUIRE(cases.size() == 12);

    for (const auto& test_case : cases) {
        const std::string name = test_case.at("name").get<std::string>();
        const std::string input = test_case.at("input").dump();
        const std::string expected_hex =
            test_case.at("encoded_with_prefix_hex").get<std::string>();
        const std::string expected_sha =
            test_case.at("sha256").get<std::string>();

        INFO("case: " << name);
        const std::vector<std::byte> encoded = axiom::test_support::axh1_encode(input);
        std::vector<std::byte> prefixed;
        for (char c : std::string("AXH1")) {
            prefixed.push_back(static_cast<std::byte>(static_cast<unsigned char>(c)));
        }
        prefixed.insert(prefixed.end(), encoded.begin(), encoded.end());

        REQUIRE(to_hex(prefixed) == expected_hex);
        REQUIRE(axiom::test_support::axh1_hash_hex(input) == expected_sha);
    }
}

TEST_CASE("negative zero and object key order are canonical", "[domain][build]") {
    // Compare encoded forms as hex: Catch2 3.8.1 declares but does not define
    // StringMaker<std::byte>::convert, so byte containers must not appear in
    // assertions.
    REQUIRE(to_hex(axiom::test_support::axh1_encode("-0.0")) ==
            to_hex(axiom::test_support::axh1_encode("0")));
    // Object member order must not affect the digest.
    REQUIRE(axiom::test_support::axh1_hash_hex("{\"b\":2,\"a\":1}") ==
            axiom::test_support::axh1_hash_hex("{\"a\":1,\"b\":2}"));
    // A different value must produce a different digest.
    REQUIRE(axiom::test_support::axh1_hash_hex("{\"a\":1}") !=
            axiom::test_support::axh1_hash_hex("{\"a\":2}"));
}

TEST_CASE("SHA-256 matches the published test vectors", "[domain][build]") {
    const auto digest = [](const std::string& text) {
        std::vector<std::byte> bytes;
        for (char c : text) {
            bytes.push_back(static_cast<std::byte>(static_cast<unsigned char>(c)));
        }
        return axiom::test_support::sha256_hex(bytes);
    };
    REQUIRE(digest("") ==
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    REQUIRE(digest("abc") ==
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
}
