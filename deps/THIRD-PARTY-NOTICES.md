# Third-party notices — Axiom V1

This file lists every third-party component the Axiom V1 build consumes, with the
licence that applies, the exact version, and the digest of the bytes actually
fetched on 2026-09-09. It is generated from `deps/lock.json` and the licence
files inside `deps/sources/<name>` — not from memory.

The Axiom V1 project itself is licensed **AGPL-3.0-or-later**; see `LICENSE`
and `docs/LICENSE-DECISION.md`.

## Build-time dependencies (frozen in `deps/lock.json`, bytes under `deps/sources/`)

### nlohmann/json — v3.12.0 — MIT

- Source: <https://github.com/nlohmann/json/releases/download/v3.12.0/json.tar.xz>
- Archive SHA-256: `42f6e95cad6ec532fd372391373363b62a14af6d771056dbfc86160e6dfff7aa`
- Extracted tree SHA-256: `8f5e9a0414dd3060cabfb0d81664f170c2329360e1ba5bbbe5660b64bd8e002e`
- Licence text: `deps/sources/nlohmann_json/LICENSE.MIT` (MIT License,
  Copyright (c) 2013-2025 Niels Lohmann)
- Used as the only JSON parser (specs/03).

### Catch2 — v3.8.1 — BSL-1.0

- Source: <https://github.com/catchorg/Catch2/archive/refs/tags/v3.8.1.tar.gz>
- Archive SHA-256: `18b3f70ac80fccc340d8c6ff0f339b2ae64944782f8d2fca2bd705cf47cadb79`
- Extracted tree SHA-256: `c1f95462a36846d4a87c95c85d0d1779b16e88bbc291b6f361488657f628b574`
- Licence text: `deps/sources/catch2/LICENSE.txt` (Boost Software License 1.0)
- Test-only dependency; not linked into any shipped binary.

### SQLite — 3.53.4 — public domain

- Source: <https://www.sqlite.org/2026/sqlite-amalgamation-3530400.zip>
- Archive SHA-256: `1e71ddf93849c6a6ecf58b827c0692073d2dd7ee40196158068f7b29f422e87d`
- Extracted tree SHA-256: `d7c6b8935ca493fff703ac98986932ff1b54028f6e300e3a2e5d299532fdbf0a`
- `sqlite3.c` SHA3-256: `67f423e9ebbbdc473cbc4772c872ee6b89f31fde4ed0279a5c25d5f65c043a16`
  (matches `contracts/dependencies-baseline.json`)
- Licence: `deps/sources/sqlite/sqlite3.h` header — the author disclaims
  copyright and dedicates the code to the public domain.
- Compiled with `SQLITE_OMIT_LOAD_EXTENSION=1` (specs/03).

## Preinstalled dependency (not redistributed as source)

### Qt — 6.11.2 (msvc2022_64) — LGPL-3.0 (open-source option)

- Location on the build machine: `C:\Qt\6.11.2\msvc2022_64`
- `C:\Qt\licenseInfo.txt`: `License type [Opensource]`
- SBOM licence identifiers (`sbom/qtbase-6.11.2.cdx.json`): `LGPL-3.0-only`,
  `GPL-2.0-only`, `GPL-3.0-only`, `Qt-GPL-exception-1.0`, `BSD-3-Clause`
- Licence texts shipped with Qt: `C:\Qt\Licenses\` (installed into
  `<prefix>/licenses/qt/` by `cmake/Packaging.cmake`)
- Components used: **Core, Network (local IPC only), Gui, Widgets**.
  `Qt6Sql`, `Qt6Qml` and `Qt6WebEngine*` are forbidden by specs/03 and are
  rejected at configure time if introduced.
- Linkage: **shared** (`QT_CONFIG += shared`). LGPLv3 requires that users can
  replace the Qt libraries, so Axiom V1 must stay dynamically linked against Qt.

## Dependencies fetched for the audio product (not yet linked)

### JUCE — 8.0.14 — **AGPLv3 or commercial (dual-licensed)**

- Source: <https://github.com/juce-framework/JUCE/archive/refs/tags/8.0.14.tar.gz>
- Archive SHA-256: `ceb18e4ac9ab5ea71f3f20240d5852707767a1789ab43d06656a296da9e62f3e`
- Extracted tree SHA-256: `2ceee3c3a757c2aba82f37cfe9289f0f44f79dd7c6e27ca98ca8329fd055f331`
- Extracted tree: `deps/sources/JUCE` (4,425 files); CMake project version verified as `8.0.14`
- Licence text: `deps/sources/JUCE/LICENSE.md` (4,971 bytes, sha256
  `2633539bb26d244f0966fbc4df59400ea99bdf575fa96291851c1c3ff3456146`).
  Verbatim: the JUCE Framework modules are **dual-licensed under AGPLv3 and the
  commercial JUCE licence**.
- Axiom V1 uses the **AGPLv3** option, which is why the project itself is
  AGPL-3.0-or-later (DCR-0002). No commercial JUCE licence is purchased.
- Not yet linked into any target; the audio smoke shell and product targets
  (T02, T15–T17) will consume it. Keep this notice in sync if the version changes.

## Runtime/system components

- Microsoft Visual C++ runtime (`/MD` / `/MDd`), Windows SDK 10.0.26100.0,
  and Windows system libraries (BCrypt for SHA-256/RNG, Windows API for the
  runner). These are Microsoft components redistributed under their own terms;
  the MSVC runtime is deployed with the application by the packaging rules.

## Obligations for distribution (not yet discharged)

1. Ship `LICENSE` (AGPL-3.0-or-later), this file, and the Qt licence texts with
   every package.
2. Keep Qt dynamically linked and allow relinking.
3. Offer the corresponding source for the Axiom V1 binaries.
4. Re-check this file whenever `deps/lock.json` changes.
