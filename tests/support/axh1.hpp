// T01 test support: SHA-256 and the frozen AXH1 byte encoding.
//
// Scope note: specs/04-contracts-and-science.md assigns the production AXH1
// encoder and SHA-256 wrapper to C01 (T03). This header exists so that the T01
// build gate can verify the frozen golden vectors
// (contracts/hash-golden.json) against a real encoder today, using the same
// contract semantics. T03 owns the production implementation; this support
// code is replaced by it and is not part of any public header.
#pragma once

#include <cstdint>
#include <span>
#include <string>
#include <vector>

namespace axiom::test_support {

// Lowercase hex SHA-256 of the given bytes (specs/04: 64 lowercase hex chars).
std::string sha256_hex(std::span<const std::byte> bytes);

// AXH1 canonical byte encoding of a JSON value (specs/04):
//   null=0; false=1; true=2; number=3 + 8 big-endian IEEE754 binary64 bytes
//   (negative zero normalised to positive zero); string=4 + uint64 big-endian
//   length + raw UTF-8 bytes; array=5 + length + members; object=6 + member
//   count + members sorted by raw key bytes. Duplicate keys are rejected.
// The "AXH1" prefix is part of the hash, not of the encoding: call
// axh1_hash_hex for SHA256("AXH1" || encoding).
std::vector<std::byte> axh1_encode(const std::string& json_text);

// SHA256("AXH1" || axh1_encode(json_text)).
std::string axh1_hash_hex(const std::string& json_text);

}  // namespace axiom::test_support
