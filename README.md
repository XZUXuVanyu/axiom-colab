# Axiom CoLab

Axiom CoLab is a user-owned laboratory where an LLM can reason, invoke typed
deterministic C++ tools, share structured memory with those tools, inspect
evidence, and propose new tools while trust and approval transitions remain
visible and user-controlled.

Stages 0 through 9 are complete. The local laboratory now includes restart-safe
structured memory and goal checkpoints, scoped process-per-call C++ Tools,
independent candidate validation, the constrained Tool workshop, exact-hash
installation, the supervisory Qt IDE, and immutable review-only goal
distillation. Stage 10 is proving the clean-install workflow and release
operations. Root validation entry points are:

```powershell
pnpm.cmd test

powershell.exe -ExecutionPolicy Bypass `
  -File .\proj\scripts\build-and-test.ps1
```

The optional Qt frontend is built by the CMake project when Qt 6 Widgets is
available. Its supervisory inspection and constrained built-in Tool workflow plus explicit local config
are documented in [docs/gui.md](docs/gui.md). The default direct validator
remains non-promotable; production must
explicitly compose the enforcing validator, durable repository, installation
root, and installed-Tool registry before exposing the workflow in the UI.

See `docs/built-in-tools-and-goals.md` for the built-in/fixture boundary and
minimal goal flow, and `docs/candidate-validation.md` for the current validation
boundary. `docs/tool-workshop.md` records the current workshop boundary. Read
`docs/operations.md` for offline backup, verification, and restore. Read
`AGENTS.md` and `for-agent/HANDOFF.md` before changing the project.
