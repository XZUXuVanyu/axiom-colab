# DCR-0003 — Long-term context folder, DCR location and manifest additions

- Status: **approved** (owner, 2026-09-09)
- Raised by: implementation model, 2026-09-09
- Clauses affected: `AGENTS.md` rule 16 (progress record locations) and the legacy
  operating-contract clause "each logical commit must update `for-agent/HANDOFF.md`";
  `FILE-MANIFEST.csv` (new file entries); `templates/HANDOFF.md` usage
- New specification version to record: `1.0.0` + this DCR (see `DECISIONS.md` D-007, D-008)

## 1. Conflict and evidence

The legacy repository contract (still in the repo's git history and referenced by
`docs/release.md` line 18) requires every commit to refresh `for-agent/HANDOFF.md` and
`for-agent/PROGRESS.md`. Pack rule 16 restricts progress records to
`implementation/records`, `implementation/progress.json` and approved
`implementation/change-requests`.

Measured facts:

```text
for-agent/HANDOFF.md   76120 bytes   (legacy, V0 content)
for-agent/PROGRESS.md  69155 bytes   (legacy, V0 content)
FILE-MANIFEST.csv rows matching change-request|dcr|DCR : 0
FILE-MANIFEST.csv rows under for-agent/ or long-term/  : 0
```

So: there was no sanctioned location for a DCR, and two competing handoff conventions.
The owner asked for a restructured long-term folder that holds **rules, progress and
errors**, and for DCRs to live there.

## 2. Minimal revision proposed and approved

1. Create `implementation/long-term/` as the durable context for every successor:

   | File | Purpose |
   | --- | --- |
   | `README.md` | what this folder is and how to start work |
   | `RULES.md` | governing rule set, precedence, non-negotiables, approved deviations |
   | `PROGRESS.md` | narrative state with SHAs, blockers, next action |
   | `ERRORS.md` | error registry (symptom → cause → resolution) |
   | `DECISIONS.md` | owner decisions and approved DCRs with approval sources |
   | `DCR-*.md` | one design change request per file |

2. **DCR location:** `implementation/long-term/DCR-<nnnn>-<slug>.md`. Status may only be
   `proposed` until the owner approves; an approved DCR records the owner's verbatim text.
3. **Manifest additions** (appended to the frozen manifest copy, recorded here because the
   frozen text itself is not edited in place):

   | file_id | task | kind | path | responsibility |
   | --- | --- | --- | --- | --- |
   | F185 | T00 | config | `implementation/long-term/README.md` | long-term context entry |
   | F186 | T00 | config | `implementation/long-term/RULES.md` | governing rules |
   | F187 | T00 | config | `implementation/long-term/PROGRESS.md` | narrative progress |
   | F188 | T00 | config | `implementation/long-term/ERRORS.md` | error registry |
   | F189 | T00 | config | `implementation/long-term/DECISIONS.md` | decision index |
   | F190 | T00 | config | `implementation/long-term/DCR-0001-toolchain-baseline.md` | approved DCR |
   | F191 | T00 | config | `implementation/long-term/DCR-0002-licence-agpl.md` | approved DCR |
   | F192 | T00 | config | `implementation/long-term/DCR-0003-long-term-context.md` | approved DCR |
   | F193 | T01 | config | `LICENSE` | project licence text (AGPL-3.0) |
   | F194 | T01 | config | `deps/THIRD-PARTY-NOTICES.md` | third-party licences and digests |
   | F195 | T01 | config | `tools/bootstrap-deps.ps1` | locked-byte bootstrap implementation |
   | F196 | T01 | test | `tests/support/axh1.hpp` | AXH1/SHA-256 test support (T03 replaces) |
   | F197 | T01 | test | `tests/support/axh1.cpp` | AXH1/SHA-256 test support (T03 replaces) |
   | F198 | T01 | test | `tests/contract/build_contract_test.cpp` | build contract gate |
   | F199 | T01 | test | `tests/contract/hash_golden_test.cpp` | AXH1 golden-vector gate |

4. `for-agent/` is **not** modified. It remains legacy content; the pointer question is
   left open in `DECISIONS.md` until the owner rules.
5. `AGENTS.md` gains a short pointer section to this folder (rule text itself unchanged).

## 3. Affected files / tests

`AGENTS.md`, `implementation/long-term/*`, `implementation/specification/FILE-MANIFEST.csv`
(appended entries), `implementation/progress.json`, `implementation/records/*`.
No production source and no gate oracle is touched.

## 4. Alternative and cost

Keeping the legacy convention would require every commit to update two 70 KB legacy files
that describe the *previous* product (V0), which would corrupt their historical meaning and
still leave DCRs homeless. Keeping rule 16 alone would leave successors without a single
entry point. The chosen structure keeps the legacy files frozen and gives V1 one durable
context folder.

## 5. Approval

Owner instruction, verbatim, 2026-09-09:

```text
1. C3: The key is to keep long term context consistent. I would prefer the legacy /long term choice, but you can restructure/redesign a better /long term folder that holds the rule、progress and errors for the project.
2. yes, a dcr is needed. also add them into long-term for agents to refer.
```

Recorded by the implementation model; the model did not author the approval.
