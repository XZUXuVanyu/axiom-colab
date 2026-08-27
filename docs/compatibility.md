# Compatibility

The supported baseline is intentionally narrow and is checked in CI where the
dependency can be installed without private credentials.

| Component | Supported baseline | Automated coverage |
| --- | --- | --- |
| Node.js | 24.x | Windows and Ubuntu CI |
| pnpm | 10.x with the committed lockfile | Windows and Ubuntu CI |
| CMake | 3.24 or newer | Hosted CMake on both CI systems |
| MSVC | Visual Studio 2022 or 2026, C++20 | Windows CI covers the hosted MSVC version; local script detects both |
| GCC | Hosted Ubuntu GCC with C++20 | Ubuntu CI |
| DeepSeek Harness | 0.1.0-rc.5 | Local contract inspection and real-session validation |
| PowerShell | Windows PowerShell 5.1 and PowerShell 7 | 5.1 locally; scripts are also exercised from Windows CI commands |

Harness is not fetched in public CI because the workflow cannot assume its
distribution or credentials. Run `proj/scripts/inspect-local-harness.ps1` against a
checkout before release. A new Harness version is unsupported until descriptor
projection, registration, and a real exported Tool-call session pass.

Compatibility changes require tests, an update to this matrix, and migration
notes when consumers must change configuration or code.
