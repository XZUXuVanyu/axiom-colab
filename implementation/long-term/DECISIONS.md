# Decision index (long-term)

Every owner decision and approved design change, with its approval source. A decision
without a source line is **not** approved, whatever the implementation claims.

| ID | Subject | Status | Approval source | Affects |
| --- | --- | --- | --- | --- |
| D-001 | Preserve legacy main before the V1 rebuild; create `legacy` + `legacy-v0-20260909-a79f478` | approved | owner message 2026-09-09 ("Authorize: push legacy branch + legacy-v0-20260909-a79f478 tag, then verify with ls-remote") | git refs, `implementation/migration-plan.md` |
| D-002 | Keep the production repo at `D:\axiom-colab`; remote consistency is the authority | approved | owner message 2026-09-09 ("keep D:\axiom-colab at local machine, the important thing is the consistency in remote repo") | DCR-0001, all paths |
| D-003 | Toolchain: use the installed VS 2026 toolchain instead of the VS 2022 17.14 baseline | approved (superseded in part by D-006) | owner message 2026-09-09 ("Approve switch version") | `implementation/toolchain.json`, `specs/03` |
| D-004 | Qt 6.11.2 installed at `C:\Qt`; installation verified by read-only probe | approved | owner message 2026-09-09 ("Installed Qt at C:Qt, verify it") | DCR-0001, C02/C04/C07/C11 |
| D-005 | Project licence is AGPL-3.0-or-later | approved | owner message 2026-09-09 ("use the one that fits both Qt and JUCE's rules") | DCR-0002, `LICENSE`, `deps/THIRD-PARTY-NOTICES.md` |
| D-006 | Use VS Insiders 2026 at `E:\Microsoft Visual Studio` (IDE + MSVC 14.44 toolset) | approved | owner message 2026-09-09 ("I have Visual Studio insiders 2026 under E:\Microsoft Visual Studio, use this") | DCR-0001, `docs/BUILD.md` |
| D-007 | Replace the legacy `for-agent/` handoff rule with a long-term context folder holding rules, progress and errors | approved | owner message 2026-09-09 ("I would prefer the legacy /long term choice, but you can restructure/redesign a better /long term folder that holds the rule、progress and errors for the project") | DCR-0003, `implementation/long-term/` |
| D-008 | A DCR is required for the pending design changes, and DCRs live in the long-term context | approved | owner message 2026-09-09 ("yes, a dcr is needed. also add them into long-term for agents to refer") | DCR-0003, this folder |
| D-009 | Dependency cache lives at `D:\axiom-colab\deps\sources` | approved | owner message 2026-09-09 ("2. D:\axiom-colab\deps\sources") | `deps/lock.json`, `cmake/Dependencies.cmake` |
| D-010 | Add root `LICENSE` and `deps/THIRD-PARTY-NOTICES.md` | approved | owner message 2026-09-09 ("add one LICENSE and THIRD-PARTY-NOTICES.md") | delivered in commit `2860646` |
| D-011 | Ignore the legacy `tools`/reference paths rather than reading them | approved | owner message 2026-09-09 ("ignore these legacy \tools\*") | waives C2 |

## Design change requests

| DCR | Title | Status | File |
| --- | --- | --- | --- |
| DCR-0001 | Toolchain baseline, repository path and IDE entry point | approved | `DCR-0001-toolchain-baseline.md` |
| DCR-0002 | Project licence AGPL-3.0-or-later | approved | `DCR-0002-licence-agpl.md` |
| DCR-0003 | Long-term context folder and DCR location; manifest additions | approved | `DCR-0003-long-term-context.md` |

## Still awaiting an owner decision

| Item | Question |
| --- | --- |
| C3 legacy rule text | whether the legacy `for-agent/HANDOFF.md` gets a one-line pointer to this folder, or stays frozen |
| `for-agent/` removal | legacy `for-agent/`, TS sources, `dist/`, `proj/`, `tests/ts` are still tracked on `main`; removal needs an explicit commit instruction |
