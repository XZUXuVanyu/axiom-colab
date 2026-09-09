# Error registry (long-term)

Every error that cost time or changed a decision. Format: symptom → root cause →
resolution → evidence. A recurring error means a rule in `RULES.md` is missing.

## E-001 — `D:\Dev` does not exist (spec vs machine)

- **Symptom:** `specs/15` and `00-START-HERE` name `D:\Dev\Axiom-V1-Prompt-Pack` and
  `D:\Dev\axiom-colab`; `Test-Path 'D:\Dev'` returned `False`.
- **Root cause:** the prompt pack was unpacked to `D:\Axiom-V1-Prompt-Pack` and the repo
  lives at `D:\axiom-colab`; no `D:\Dev` tree was ever created.
- **Resolution:** owner approved keeping the real paths (DCR-0001). The local rules'
  required reading of `D:\Dev\tools\general-ts-cpp-adapter` and
  `D:\Dev\tools\general-agent-memory` is waived as unreachable — recorded, not faked.

## E-002 — git over HTTPS failed with `SEC_E_NO_CREDENTIALS`

- **Symptom:** `git ls-remote https://github.com/...` exited 128 with
  `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030e)`.
- **Root cause:** the default schannel TLS backend cannot initialise in this shell.
- **Resolution:** always use `git -c http.sslBackend=openssl …` for network git operations.

## E-003 — `git tag -a` refused: "Committer identity unknown"

- **Symptom:** annotated tag creation failed; global/system/repo `user.name`/`user.email`
  are all empty.
- **Root cause:** no git identity configured anywhere (and `RULES.md` forbids changing
  global identity).
- **Resolution:** supply `GIT_COMMITTER_NAME`/`GIT_COMMITTER_EMAIL` (and author variants)
  as one-command environment variables. Never write git config.

## E-004 — CMake could not find Ninja, then `cl`, then failed to read presets

- **Symptom:** `CMake was unable to find a build program corresponding to "Ninja"`, then
  `No CMAKE_CXX_COMPILER could be found`, then `Could not read presets from
  D:/Axiom-V1-Prompt-Pack`.
- **Root cause:** VS-bundled `cmake`/`ninja` are not on the machine PATH; `cl` only exists
  inside the x64 Native Tools environment; and `cmd /c` inherits the current directory,
  which was not the repository.
- **Resolution:** run `vcvars64.bat` first, invoke CMake by full path, and `cd /d` to the
  repository in the same `cmd /c` invocation. Documented in `docs/BUILD.md`.

## E-005 — `list(GLOB …)` is not a CMake command

- **Symptom:** configure failed with `list does not recognize sub-command GLOB`.
- **Root cause:** a leftover helper call in `CMakeLists.txt`; `specs/03` forbids GLOB
  source discovery anyway.
- **Resolution:** removed the call; explicit source lists only.

## E-006 — `add_library(... ALIAS Catch2::Catch2WithMain)` rejected

- **Symptom:** `add_library cannot create ALIAS target "axiom_catch2" because target
  "Catch2::Catch2WithMain" is itself an ALIAS`.
- **Root cause:** CMake cannot alias an alias.
- **Resolution:** link `Catch2::Catch2WithMain` directly.

## E-007 — `CMake can not determine linker language for target: axiom_sqlite3`

- **Symptom:** generate step failed for the SQLite amalgamation target.
- **Root cause:** the project declared only `LANGUAGES CXX`, but `sqlite3.c` is C.
- **Resolution:** `LANGUAGES C CXX`.

## E-008 — `const int cmp = (1 <=> 2)` does not compile

- **Symptom:** `error C2440: cannot convert from 'std::strong_ordering' to 'int'`.
- **Root cause:** three-way comparison returns `std::strong_ordering`, not an integer.
- **Resolution:** compare against `std::strong_ordering::less`.

## E-009 — `sizeof(const char*) == 4` assertion failed

- **Symptom:** the UTF-8 test failed with `8 == 4`.
- **Root cause:** the probe was a pointer, not an array; `sizeof` measured the pointer.
- **Resolution:** declare `constexpr const char kUtf8Probe[]`.

## E-010 — nlohmann/json does not reject duplicate keys

- **Symptom:** `REQUIRE_THROWS(json::parse("{\"a\":1,\"a\":2}"))` failed.
- **Root cause:** the library keeps the last duplicate by default; it is not a validator.
- **Resolution:** duplicate-key rejection is C01's validator responsibility (`specs/04`),
  implemented in T03. The test was corrected — the claim was wrong, not the library.

## E-011 — Catch2 3.8.1 declares but never defines `StringMaker<std::byte>::convert`

- **Symptom:** `unresolved external symbol … StringMaker<enum std::byte>::convert` when a
  `std::byte` container appeared in an assertion.
- **Root cause:** upstream Catch2 gap; the specialisation is declared, not defined.
- **Resolution:** never put `std::byte` containers in assertions; compare hex strings.
  A local specialisation attempt failed too (`C2766` already defined) — do not retry it.

## E-012 — `SQLITE_OMIT_LOAD_EXTENSION` removes `sqlite3_enable_load_extension`

- **Symptom:** link error referencing `sqlite3_enable_load_extension`.
- **Root cause:** the build defines `SQLITE_OMIT_LOAD_EXTENSION=1`, so the symbol does not
  exist — which is the desired property, not a defect.
- **Resolution:** assert the compile definition and the version instead of taking the
  address of an intentionally absent function.

## E-013 — MSVC 19.51 does not match the Qt 6.11.2 ABI

- **Symptom:** Qt 6.11.2 MSVC binaries report `QT_MSVC 19.44.35227` while the C: Build
  Tools compiler is 19.51.36256.
- **Root cause:** the machine has two VS installs; the Build Tools one only ships 14.51.
- **Resolution:** VS Insiders 2026 on `E:\Microsoft Visual Studio` ships the **14.44**
  toolset (`cl 19.44.35228`, selected with `vcvars64.bat -vcvars_ver=14.44`). Axiom
  configure+build+ctest was proven green with it. See DCR-0001.

## E-014 — This shell's DNS blocks several documentation hosts

- **Symptom:** `web_fetch` failed with "resolves to a non-public IP address" for
  `juce.com`, `raw.githubusercontent.com`, `www.gnu.org`, `www.qt.io`, `browse.dgit.debian.org`.
- **Root cause:** environment DNS/proxy policy, not a project problem.
- **Resolution:** use reachable endpoints (`api.github.com`, `github.com` releases) or the
  bytes already in `deps/sources/`. JUCE's `LICENSE.md` must be read from its fetched
  bytes in T15 — never asserted from memory.
