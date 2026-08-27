# Resolved Context

## Global naming rule

The recommended naming rule in `questions.md` is accepted, with these added
C++ variable-prefix constraints from `answer.md`:

- Avoid leading-underscore and trailing-underscore variable forms such as
  `_val_name` and `val_name_`.
- Prefix global values with `g_`.
- Prefix keywords with `k_` (wording preserved from the answer; do not silently
  reinterpret this as a different category).
- Prefix members with `m_`.

The accepted base rule is:

- Product/repository/package/plugin IDs use kebab-case.
- The C++ namespace is `cpp_adapter`; C++ types use `PascalCase`; C++ functions,
  variables, and files use `snake_case`; macros use
  `SCREAMING_SNAKE_CASE`.
- TypeScript types/classes use `PascalCase`; functions, variables, object
  fields, and JSON protocol fields use `camelCase`; TypeScript files use
  kebab-case.
- Public model Tool names use snake_case verbs or verb phrases.
- Protocol error codes and environment variables use
  `SCREAMING_SNAKE_CASE`.
- The CMake project identifier uses `general_ts_cpp_adapter`; CMake targets and
  binary names use kebab-case.
- Prose uses “C++-first TypeScript/C++ adapter”, “Bridge” for the executable
  protocol boundary, and “Tool” only for a public model-callable capability.

The answer did not separately state whether existing public names are frozen.
Because the proposed public names were accepted, preserve existing public names
unless a later explicit decision authorizes a compatibility-breaking rename.

## Live Harness verification

Always run the interactive Hub for live verification. The agent may launch and
observe it, but must not send the model prompts itself. The user performs the
interactive prompts.

## Documentation paths

Use general directory names in documentation rather than machine-specific
absolute paths. Do not pull the Stage 4 path-generation implementation into
Stage 1 merely to correct documentation examples.

## Stage boundary

The automated Stage 1 build and tests passed when this record was created. Live
interactive Harness registration and user-driven model calls remained to be
verified before Stage 2 could start.
