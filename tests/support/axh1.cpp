#include "axh1.hpp"

#include <array>
#include <bit>
#include <cstring>
#include <map>
#include <stdexcept>

#include <nlohmann/json.hpp>

namespace axiom::test_support {
namespace {

constexpr std::array<std::uint32_t, 64> kK = {
    0x428a2f98u, 0x71374491u, 0xb5c0fbcfu, 0xe9b5dba5u, 0x3956c25bu, 0x59f111f1u,
    0x923f82a4u, 0xab1c5ed5u, 0xd807aa98u, 0x12835b01u, 0x243185beu, 0x550c7dc3u,
    0x72be5d74u, 0x80deb1feu, 0x9bdc06a7u, 0xc19bf174u, 0xe49b69c1u, 0xefbe4786u,
    0x0fc19dc6u, 0x240ca1ccu, 0x2de92c6fu, 0x4a7484aau, 0x5cb0a9dcu, 0x76f988dau,
    0x983e5152u, 0xa831c66du, 0xb00327c8u, 0xbf597fc7u, 0xc6e00bf3u, 0xd5a79147u,
    0x06ca6351u, 0x14292967u, 0x27b70a85u, 0x2e1b2138u, 0x4d2c6dfcu, 0x53380d13u,
    0x650a7354u, 0x766a0abbu, 0x81c2c92eu, 0x92722c85u, 0xa2bfe8a1u, 0xa81a664bu,
    0xc24b8b70u, 0xc76c51a3u, 0xd192e819u, 0xd6990624u, 0xf40e3585u, 0x106aa070u,
    0x19a4c116u, 0x1e376c08u, 0x2748774cu, 0x34b0bcb5u, 0x391c0cb3u, 0x4ed8aa4au,
    0x5b9cca4fu, 0x682e6ff3u, 0x748f82eeu, 0x78a5636fu, 0x84c87814u, 0x8cc70208u,
    0x90befffau, 0xa4506cebu, 0xbef9a3f7u, 0xc67178f2u};

constexpr std::uint32_t rotr(std::uint32_t x, int n) {
    return (x >> n) | (x << (32 - n));
}

void encode_u64_be(std::vector<std::byte>& out, std::uint64_t v) {
    for (int i = 7; i >= 0; --i) {
        out.push_back(static_cast<std::byte>((v >> (i * 8)) & 0xffu));
    }
}

void encode_f64_be(std::vector<std::byte>& out, double v) {
    if (v == 0.0) {
        v = 0.0;  // normalise negative zero
    }
    encode_u64_be(out, std::bit_cast<std::uint64_t>(v));
}

void encode_value(std::vector<std::byte>& out, const nlohmann::json& value);

void encode_object(std::vector<std::byte>& out, const nlohmann::json& value) {
    // Keys sorted by raw UTF-8 bytes; nlohmann's default std::map ordering is
    // byte-wise for std::string, which matches the contract.
    std::vector<std::pair<std::string, const nlohmann::json*>> members;
    members.reserve(value.size());
    for (auto it = value.begin(); it != value.end(); ++it) {
        members.emplace_back(it.key(), &it.value());
    }
    out.push_back(static_cast<std::byte>(6));
    encode_u64_be(out, members.size());
    for (const auto& [key, member] : members) {
        out.push_back(static_cast<std::byte>(4));
        encode_u64_be(out, key.size());
        for (char c : key) {
            out.push_back(static_cast<std::byte>(static_cast<unsigned char>(c)));
        }
        encode_value(out, *member);
    }
}

void encode_value(std::vector<std::byte>& out, const nlohmann::json& value) {
    switch (value.type()) {
        case nlohmann::json::value_t::null:
            out.push_back(static_cast<std::byte>(0));
            break;
        case nlohmann::json::value_t::boolean:
            out.push_back(static_cast<std::byte>(value.get<bool>() ? 2 : 1));
            break;
        case nlohmann::json::value_t::number_integer:
        case nlohmann::json::value_t::number_unsigned:
        case nlohmann::json::value_t::number_float:
            out.push_back(static_cast<std::byte>(3));
            encode_f64_be(out, value.get<double>());
            break;
        case nlohmann::json::value_t::string: {
            const std::string s = value.get<std::string>();
            out.push_back(static_cast<std::byte>(4));
            encode_u64_be(out, s.size());
            for (char c : s) {
                out.push_back(static_cast<std::byte>(static_cast<unsigned char>(c)));
            }
            break;
        }
        case nlohmann::json::value_t::array:
            out.push_back(static_cast<std::byte>(5));
            encode_u64_be(out, value.size());
            for (const auto& element : value) {
                encode_value(out, element);
            }
            break;
        case nlohmann::json::value_t::object:
            encode_object(out, value);
            break;
        default:
            throw std::invalid_argument("AXH1: unsupported JSON type");
    }
}

}  // namespace

std::string sha256_hex(std::span<const std::byte> bytes) {
    std::vector<std::uint8_t> data;
    data.reserve(bytes.size() + 72);
    for (std::byte b : bytes) {
        data.push_back(static_cast<std::uint8_t>(b));
    }
    const std::uint64_t bit_length = static_cast<std::uint64_t>(data.size()) * 8u;
    data.push_back(0x80u);
    while (data.size() % 64 != 56) {
        data.push_back(0x00u);
    }
    for (int i = 7; i >= 0; --i) {
        data.push_back(static_cast<std::uint8_t>((bit_length >> (i * 8)) & 0xffu));
    }

    std::array<std::uint32_t, 8> h = {0x6a09e667u, 0xbb67ae85u, 0x3c6ef372u,
                                      0xa54ff53au, 0x510e527fu, 0x9b05688cu,
                                      0x1f83d9abu, 0x5be0cd19u};
    for (std::size_t chunk = 0; chunk < data.size(); chunk += 64) {
        std::array<std::uint32_t, 64> w{};
        for (int i = 0; i < 16; ++i) {
            const std::size_t o = chunk + static_cast<std::size_t>(i) * 4;
            w[i] = (static_cast<std::uint32_t>(data[o]) << 24) |
                   (static_cast<std::uint32_t>(data[o + 1]) << 16) |
                   (static_cast<std::uint32_t>(data[o + 2]) << 8) |
                   static_cast<std::uint32_t>(data[o + 3]);
        }
        for (int i = 16; i < 64; ++i) {
            const std::uint32_t s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
            const std::uint32_t s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16] + s0 + w[i - 7] + s1;
        }
        std::uint32_t a = h[0], b = h[1], c = h[2], d = h[3];
        std::uint32_t e = h[4], f = h[5], g = h[6], hh = h[7];
        for (int i = 0; i < 64; ++i) {
            const std::uint32_t s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const std::uint32_t ch = (e & f) ^ (~e & g);
            const std::uint32_t t1 = hh + s1 + ch + kK[i] + w[i];
            const std::uint32_t s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const std::uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
            const std::uint32_t t2 = s0 + maj;
            hh = g;
            g = f;
            f = e;
            e = d + t1;
            d = c;
            c = b;
            b = a;
            a = t1 + t2;
        }
        h[0] += a; h[1] += b; h[2] += c; h[3] += d;
        h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
    }

    static const char* kHex = "0123456789abcdef";
    std::string out;
    out.reserve(64);
    for (std::uint32_t word : h) {
        for (int i = 7; i >= 0; --i) {
            const std::uint8_t nibble = static_cast<std::uint8_t>((word >> (i * 4)) & 0xfu);
            out.push_back(kHex[nibble]);
        }
    }
    return out;
}

std::vector<std::byte> axh1_encode(const std::string& json_text) {
    const nlohmann::json value = nlohmann::json::parse(json_text);
    std::vector<std::byte> out;
    encode_value(out, value);
    return out;
}

std::string axh1_hash_hex(const std::string& json_text) {
    const std::vector<std::byte> encoded = axh1_encode(json_text);
    std::vector<std::byte> prefixed;
    prefixed.reserve(encoded.size() + 4);
    for (char c : std::string("AXH1")) {
        prefixed.push_back(static_cast<std::byte>(static_cast<unsigned char>(c)));
    }
    prefixed.insert(prefixed.end(), encoded.begin(), encoded.end());
    return sha256_hex(prefixed);
}

}  // namespace axiom::test_support
