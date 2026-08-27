---
name: general-ts-cpp-tools
description: Use model-facing capabilities implemented by the General TS/C++ Adapter's C++ Core.
whenToUse: Use when a discovered C++ Tool directly matches the user's requested calculation or expression-diagnostic task.
---

# General TS/C++ Tools

The advertised Tool schemas and results come from the C++ Core through the Bridge process. Treat a successful Tool result as evidence that the C++ implementation ran; do not claim a calculation was performed without a Tool Call.

Choose Tools by complete user-facing capability, not by presumed internal functions:

- Use `expression_patch` only when the user independently asks to validate, normalize, or diagnose an expression.
- Use `calculate_uncertainty` when the user wants uncertainty propagation. It invokes its injected `ExpressionPatcherTool` dependency inside C++; do not call `expression_patch` first or ask the user to coordinate that dependency.
- Ask for missing required inputs before calling a Tool.
- Report the key Tool error code and message faithfully. Do not silently invent a result after an error.
- Do not infer the C++ algorithm, dependency graph, or implementation details from one output value.
- Do not manually simulate hidden C++ steps or claim that an internal Helper Component is separately callable.

Tool granularity follows these rules: one public Tool maps to one C++ Tool Class; a Tool Class may contain multiple private functions; typed C++ methods are used for internal calls; and a Helper with no independent user scenario remains an Internal Component rather than a Model Tool. The Tool's public `execute()` method is the JSON boundary. Parameter and output definitions remain in the C++ Descriptor and are intentionally not duplicated here.
