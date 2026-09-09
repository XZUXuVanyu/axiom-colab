# DCR-0002 — Project licence AGPL-3.0-or-later

- Status: **approved** (owner, 2026-09-09)
- Raised by: implementation model, 2026-09-09
- Clauses affected: `specs/03-build-and-dependencies.md` 许可 paragraph (LICENSE-DECISION.md
  and the release gate), `specs/15-delivery.md` 许可路线 paragraph
- New specification version to record: `1.0.0` + this DCR (see `DECISIONS.md` D-005)

## 1. Conflict and evidence

`specs/15` says the licence route is undecided until the owner confirms, and that
external distribution stays blocked until then. `specs/03` says the model must not buy a
licence or unilaterally relicense the repository.

The owner decided the project is open source and instructed: use the licence that fits
both Qt's and JUCE's rules.

Measured licence facts:

| Component | Licence | Evidence |
| --- | --- | --- |
| Qt 6.11.2 | LGPL-3.0 / GPL-3.0 options | `C:\Qt\licenseInfo.txt` = `License type [Opensource]`; SBOM ids `LGPL-3.0-only`, `GPL-3.0-only`, `GPL-2.0-only`, `Qt-GPL-exception-1.0`, `BSD-3-Clause`; `QT_CONFIG += shared` |
| JUCE 8.0.14 | AGPLv3 option (commercial alternative) | declared in `contracts/dependencies-baseline.json`; **its `LICENSE.md` has not been read yet** (DNS blocks juce.com / raw.githubusercontent.com) — must be verified from the locked bytes in T15 |
| nlohmann/json v3.12.0 | MIT | `deps/sources/nlohmann_json/LICENSE.MIT` |
| Catch2 v3.8.1 | BSL-1.0 | `deps/sources/catch2/LICENSE.txt` |
| SQLite 3.53.4 | public domain | `deps/sources/sqlite/sqlite3.h` header |

## 2. Minimal revision proposed and approved

The project is licensed **AGPL-3.0-or-later**:

- permissive licences would require commercial Qt *and* JUCE licences;
- GPL-3.0 cannot absorb an AGPLv3 work (JUCE 8);
- AGPL-3.0 accepts JUCE's AGPLv3 route and, through LGPLv3's GPLv3 supplement, Qt's
  LGPLv3 option.

Obligations recorded in `docs/LICENSE-DECISION.md` and `deps/THIRD-PARTY-NOTICES.md`:
keep Qt dynamically linked, ship Qt licence texts and the source/modification offer,
retain notices, and re-open the decision if distribution becomes closed-source.

## 3. Affected files / tests

- `LICENSE` (AGPL-3.0 full text, 661 lines, sha256
  `8486a10c4393cee1c25392769ddd3b2d6c242d6ec7928e1414efff7dfb2f07ef`)
- `docs/LICENSE-DECISION.md`, `deps/THIRD-PARTY-NOTICES.md`
- `cmake/Packaging.cmake` (installs licence texts), T18 packaging gate

## 4. Alternative and cost

Keeping the licence undecided leaves `specs/15`'s external-distribution gate blocked and
prevents any public release. A permissive licence requires paid Qt and JUCE licences,
which the owner has not authorised.

## 5. Approval

Owner instruction, verbatim, 2026-09-09: `3. yes, this project will be opensource` and
`1. use the one that fits both Qt and JUCE's rules`. Recorded by the implementation model;
the model did not author the approval and gives no legal opinion.
