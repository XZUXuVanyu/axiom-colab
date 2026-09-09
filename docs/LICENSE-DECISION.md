# Licence decision (F015, T01)

- Status: **owner-decided**, recorded 2026-09-09. Not legal advice.
- Owner instruction (verbatim, DSH host session 2026-09-09):
  `3. yes, this project will be opensource` and
  `1. use the one that fits both Qt and JUCE's rules`
- Full ruling and reasoning: `implementation/records/APPROVALS-2026-09-09.md`.

## Decision

**The Axiom V1 project is licensed AGPL-3.0-or-later.**

| Component | Version | Licence route used | Obligation |
| --- | --- | --- | --- |
| Axiom V1 (this repository) | 0.1.0 | AGPL-3.0-or-later | source available to users; network use clause (not applicable to a local desktop app, but retained) |
| Qt | 6.11.2 | LGPL-3.0 (open-source option) | **must stay dynamically linked**; ship Qt licence texts; offer Qt source/modifications; allow relinking |
| JUCE | 8.0.14 | AGPLv3 (open-source option) | audio product targets only (T15-T17) |
| nlohmann/json | v3.12.0 | MIT | retain notice |
| SQLite | 3.53.4 | public domain | none |
| Catch2 | v3.8.1 | BSL-1.0 | retain notice (test-only dependency) |

Why this is the only open-source option that fits both: a permissive project
licence would require commercial Qt and commercial JUCE licences; GPL-3.0 cannot
absorb an AGPLv3 work (JUCE 8). AGPL-3.0 accepts JUCE's AGPLv3 route and, via
LGPLv3's GPLv3 supplement, Qt's LGPLv3 option.

## Evidence collected (real files on this machine)

| Evidence | Value |
| --- | --- |
| `C:\Qt\licenseInfo.txt` | `License type [Opensource]` |
| Qt SBOM `sbom/qtbase-6.11.2.cdx.json` licence ids | `LGPL-3.0-only`, `GPL-2.0-only`, `GPL-3.0-only`, `Qt-GPL-exception-1.0`, `BSD-3-Clause` |
| Qt build linkage (`mkspecs/qconfig.pri`) | `QT_CONFIG += shared no-pkg-config debug_and_release openssl release debug` |
| Qt licence texts present | `C:\Qt\Licenses\{LICENSE,COPYING.txt,LICENSE.FDL,Copyright.txt}` |
| Qt platform plugin | `plugins/platforms/qwindows.dll` (must ship in `dist/`) |

## Owner decisions still outstanding

1. The root `LICENSE` file has **not** been added yet: it is not part of the T01
   file list. It is required before any external distribution.
2. Third-party notice file `deps/THIRD-PARTY-NOTICES.md` is not yet assembled
   (T18 packaging gate; `cmake/Packaging.cmake` installs it when present).
3. If distribution ever becomes closed-source, the JUCE commercial licence must
   be purchased and the Qt route re-evaluated - a new DCR.

## Not verified (must not be claimed as compliant)

- JUCE 8.0.14's own `LICENSE.md` text was **not obtained** during T01: this
  machine's DNS blocks `juce.com` and `raw.githubusercontent.com`. Its exact
  terms must be read from the locked bytes in `deps/sources/JUCE` when T15
  fetches them, and recorded in `deps/lock.json`.
- No legal review has been performed. This file records the engineering
  decision and the evidence, not a legal opinion.
