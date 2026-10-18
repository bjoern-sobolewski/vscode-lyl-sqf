# LiveYourLife SQF for VS Code

Windows x64 extension built on the [LYL HEMTT fork](https://github.com/bjoern-sobolewski/HEMTT).
This repository owns the editor client, protocol host, build scripts, tests and
GitHub VSIX releases. Project layouts, command contracts, shared analyzer, test
runner and installation/bootstrap stay in the separate LiveYourLife Arma repository.
No Git CI or Marketplace publication is used.

## Install on a new computer

Use a full Arma repository checkout, Windows x64, Git and VS Code 1.96 or newer.
From the **Arma repository root**, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/vscode-lyl-sqf/install.ps1 -ConfigureWorkspace
```

The Arma repository's `release.json` pins a versioned GitHub release URL and
SHA-256. Its installer downloads into a per-user cache, verifies the exact hash
before installation, and supports `-Offline` after the first download. The pin
never follows `latest`. The extension source checkout is not needed to install.
The VSIX bundles the pinned language server, self-contained shared analysis host,
GPL corresponding source and notices. Activation verifies its tool hashes again.
Normal use needs no Node, Python, Rust, .NET SDK, admin rights or PATH changes.

The Arma installation guide explains `-CodePath`, isolated installation directories,
`-DownloadOnly`, `-VsixPath`, workspace associations and UTF-8 defaults. Workspace
JSONC settings should be configured manually without `-ConfigureWorkspace`.

Open the Arma repository, trust the workspace, and inspect **Output â†’ LYL SQF**.
Disable competing HEMTT/SQF lint/wiki extensions for this workspace to avoid
duplicate diagnostics and conflicting hover text. Untrusted/virtual workspaces
are intentionally unsupported because analysis executes local tools.
For an isolated installation test, supply `-ExtensionsDirectory` and
`-UserDataDirectory` with temporary directories; omit `-ConfigureWorkspace`.

Game headers come from the installed Arma `addons/ui_f.pbo`, `addons/3den.pbo`
and `orange/addons/ui_f_orange.pbo`, using the launcher's
existing installation detection. Set `lylSqf.armaDirectory` if necessary (and use
the same path with the command-line `--arma-directory` option). Missing game
headers and unsupported compressed headers remain compatibility findings; no
fake headers are created. Arma content is not distributed in the package.

## Analysis and commands

### Syntax colors and indentation

SQF and Arma config grammars distinguish control flow, callable names, variables,
classes, directives, macro declarations, numbers, strings and comments using
standard theme scopes. Scientific/hex numbers, doubled quotes and literal
backslash paths retain their Arma spelling. Blocks, arrays and parentheses have
indentation rules; Enter also continues documentation comments. This supplies
editing indentation, not a whole-document formatter or format-on-save provider.

Semantic highlighting adds the shared host's engine-command names, the pinned
BIS catalog and the existing exact-root CfgFunctions registration index. Dirty
config updates and discard refresh those function colors alongside completion.
Locally defined macros are case-sensitive and stop being classified after
`#undef`; includes are not expanded by the color provider. Explicit `params`
names and subsequent uses in that same code block receive parameter tokens.
Nested callbacks, private shadow declarations and dynamic parameter lists do not
gain guessed parameter bindings. Coloring establishes no runtime/type contract
and does not change validation or provisional registration findings.

The selected theme and `editor.semanticHighlighting.enabled` control appearance;
no theme, fixed palette or font styling is forced. To opt into italic SQF
parameters, add this user setting:

```json
"editor.semanticTokenColorCustomizations": {
  "rules": { "parameter:sqf": { "italic": true } }
}
```

### Authoring and reference coverage (0.2.0)

**Open BI Wiki Documentation** opens the canonical command or BIS function under
the cursor, or a safely URL-encoded selected page name. It is available in the
Command Palette, the SQF editor context menu and on **Ctrl+Shift+Q**. Page text
cannot change the destination origin, query or fragment. Separate Palette actions
open unit event handlers, UI event handlers and the scripting-command index.

The packaged SQF snippets include if/else/exit, forEach/range/while, switch, params,
typed params, call, spawn, execVM, waitUntil and object/mission event handlers.
They use numbered tabstops and editor indentation. Scheduling caveats are in
their descriptions; handlers do not invent event parameters or machine roles.

Completion and hover distinguish **BIS functions** from engine commands and
project functions. The offline catalog includes 1,667 documented Arma 3 BIS
functions, preserving available descriptions, syntax, parameters, optional fields
and returns. It is a historical documentation snapshot, not a claim that every
function exists in an installed game. Missing fields remain unspecified. The
import source/version/hash, BI Wiki attribution and original MIT notice are
recorded in `data/bis-functions.json`, `NOTICE.md` and `licenses/SQFLint.txt`.
An explicit maintainer import is `node scripts/import-bis.js PATH_TO_REVIEWED_SQFLINT_0.12.4`.
Do not silently refresh this data during activation.

Project function completion reads **`tests/sqf/functions.json` in the Arma
checkout**, which declares exact mission/addon config roots and virtual prefixes.
HEMTT's `hemtt/config/structure` preprocesses each requested root using the same
includes, macros and unsaved source database as diagnostics, then exposes its
ordered parsed structure. The client interprets registered tags/categories,
same-scope inheritance and literal category/function file/extension overrides.
Names come from CfgFunctions registrations, never `fn_*.sqf` directory scans.
Existing mapped function files support Go to Definition. Duplicate names retain
their separate config-root provenance; registration does not establish argument,
return, role or scheduling contracts.

Dirty config/header edits invalidate the cached function index, as do disk
changes, discard and source/layout rebuilds. Missing roots, failed preprocessing
or parsing, unresolved/external inheritance, dynamic tags, absent/nonliteral file
locations and unavailable registered files are explicit **unresolved registration**
findings on their config roots. Known registered names can still complete when
their location is unresolved. Implicit default directories and runtime-generated
registrations are not guessed. Fix the declaration/evidence or inspect the
finding; empty/unavailable discovery is not a successful complete index.

The structural endpoint can retain literal registrations when a config contains
unsupported `__EXEC(...)` bodies, unresolved macro values (PE9), or parser-recovered analysis findings. It never
executes those bodies or guesses their effects: all registrations from that root
are marked provisional/unresolved, with compatibility findings on the root.
Dynamic expression fields remain unknown. Normal diagnostics and the local gate
retain their failures; completion is not evidence that a config is valid.
If unrelated config syntax prevents a full parse, the adapter requests a generic
top-level `CfgFunctions` projection. It still preprocesses the actual complete root
and parses selected declarations with HEMTT's config parser. Balanced boundaries
are required, and the original root failure remains explicit/provisional. No
mission path or registration rule is built into HEMTT's generic projection.

Engine-command parameter hints use the same shared host documentation and reviewed
contracts as hover and the local gate, including corrected overload types. They
trigger on spaces, `[`/`(`/`,` and manual **Trigger Parameter Hints**. Unary/binary
SQF syntax and documented argument-array shapes determine candidates; alternatives
remain when types cannot be established. The active parameter follows balanced
arrays/parentheses and ignores comment/string delimiters. Nested expressions count
as one outer argument. If the documentation shape cannot establish the active
parameter, no parameter is guessed. This is a conservative lexical editor aid,
not type inference or a second parser. Existing HLS macro signature help remains
registered alongside it.

The selected replacement coverage excludes an RPT viewer, custom theme,
CBA/ACE integration and the old extensions' unrelated debugger features.

For the **Arma3** VS Code profile, run the Arma installer with
`-Profile Arma3 -ConfigureWorkspace`. Before removing old extensions, validate the
packaged feature coverage and retain profile/settings inventories. Then remove
only `blackfisch.sqf-language`, `eelislynne.sqf-wiki` and `skacekachna.sqflint` from
that profile using VS Code's `--profile Arma3` CLI option. Other profiles and
extensions stay intact. Reload the window after installation.

The adapter reads `tests/sqf/syntax.json`, including ordered shared/component
overlays and the mission root. It stages byte-preserving disposable copies;
the language server analyzes those copies with its existing source database,
preprocessor, config/SQF checkers, macro definitions, signature help and path
completion. Native command completion extends the existing macro completion.
Git inventories loose tracked/nonignored source and test fixtures separately,
retaining repository-relative include paths. The layout manifest, reviewed
contexts and contracts are the same ones used by agent tooling and the gate.
The adapter exports their complete corrected command snapshot to HEMTT's generic
`.hemtt/command-reference.json` input. Both CLI and language server use it instead
of a machine-dependent Git wiki cache. Malformed snapshots fail explicitly.

The fork now rechecks dirty SQF/config buffers and dependent includes, restores
disk content on close/discard, handles full/UTF-16 edits, and merges config/SQF
diagnostics instead of letting one erase the other. Each physical shared header
can have several virtual aliases; edits update all of them. URI translation
maps diagnostics and macro navigation back to the original files. Header disk
changes refresh consumers; create/delete/rename and rule/layout changes rebuild
the disposable workspace and replay open buffers. Use **Rebuild Analysis
Workspace** after an installed game header/PBO changes.

New files need a file on disk to enter the source inventory. Until then the
editor explicitly reports missing live-analysis coverage. Untitled documents
and dynamic runtime includes/compiled strings have no invented source context.

Command hover uses the same offline command reference and reviewed corrections
as `LYL TEST.ps1 -Command`. It retains all overloads, argument/return types,
version metadata, argument/effect locality and documentation prose. Reviewed
role/scheduling restrictions are shown separately, with unspecified fields
explicitly unknown. Wiki markup is retained in full where it cannot be rendered
without losing information. Hover content is untrusted Markdown.

The conservative C# context analyzer is shared directly with the gate. It uses
`tests/sqf/commands/contexts.json`, never directory names to assign roles. Server,
HC and player client differ; stored callbacks and unknown entry/suspension
contexts remain unresolved. The scanner does not resolve macros or whole-program
call graphs. Unresolved findings remain visible and fail command-line review.

Use the Command Palette or Explorer selection:

| Command | Scope |
| --- | --- |
| Verify Selected Files | Same HEMTT/context verifier as agents; no automatic SQF-VM parsing |
| Verify Changed Files | Same Git selection/header expansion as manual `-VerifyChanged` |
| Run Relevant Existing Tests | Uses dependency declarations (including transitive dependencies) and offers only existing suite/runtime pairs |
| Show Preprocessed Buffer | Fork's existing macro-expanded preview, including unsaved text |
| Rebuild Analysis Workspace | Restarts analysis and reloads layout, game headers and reviewed rules |

Verification/test commands require saved source, report exit status and the
existing JSON report path in Output. They never silently save buffers. No mapped
test is a coverage gap, not a pass. Arma tests use the existing isolated native
runner; choose SQF-VM explicitly when offered. Native server/HC tests do not
verify real player networking, locality or UI paths.

Version 0.2.5 shares the saved-source verification service with the launcher.
Manual verification retains a separate HEMTT process and prepared workspace for
ten idle minutes. It hashes saved sources, include probes, rules, configuration,
tool executables and installed game headers before reuse. Unchanged complete
reports retain their original failures and explicitly identify reuse; source
edits recheck affected units. Literal header edits invalidate their transitive
consumers across aliases and missing include probes. Unchanged context/parser
results and prepared aliases are retained. Configuration, rules and inventory
changes conservatively rebuild; dynamic includes disable reuse. HEMTT retains
unchanged raw header tokens and loads each effective saved source once per request.
The editor's dirty-buffer language-server session remains separate. Set
`LYL_VERIFY_FRESH=1` for an independent fresh command, or pass
`--verification-stop` to the shared test host to stop its current-version service.
Commit hooks remain disabled. See PERFORMANCE.md for measured scope and limits.

Diagnostics retain original code/severity and carry the following labels:

| Label | Meaning |
| --- | --- |
| potential defect | Error-severity argument/format/broken-command findings, structurally invalid config or established context violations; inspect actual branch and engine behavior |
| compatibility limitation | Explicitly unsupported preprocessing capability; missing includes need investigation |
| requires review | Uncertain type inference, unresolved context, parser rejection or unknown diagnostic category |
| recommendation | Advisory findings, including unused format arguments and ordinary deprecated public-variable handlers |
| policy | Explicit encoding/reserved-assignment/include-style/configuration policy findings; inspect the original rule and severity |

HEMTT .5 accepts skipped format indices and keeps real missing-argument/unescaped-percent findings.
The shared adapter checks included config fragments through their consumers with exact bytes/macros.
Raw CLI, independent SQF/config findings, coverage and compatibility classifications remain separate.
SQF-VM is for focused named suites; explicit Check File is an optional VM compatibility probe.
No category is suppressed. `BOM` is a blocking **policy** finding: save Arma source/config files as UTF-8
without BOM. The CLI and HLS reject leading markers in files, included headers
and dirty buffers. The adapter preserves a disk BOM hidden by VS Code's text
model, so opening a file does not silently clear the finding. Save with encoding
**UTF-8** to remove an encoding BOM. Unicode contents remain supported. This
conservative policy does not assert that every native Arma loader rejects BOMs.

The Arma repository has an existing diagnostic backlog,
including scratch/non-SQF files with SQF extensions and deliberate negative test
fixtures. A successful editor test does not mean the entire repository passes
lint or native multiplayer testing. Report those results separately.

## Shared implementation and maintenance

`SqfAnalysisWorkspace`, `SqfCommandReference`, `SqfCommandContextCheck`,
`SqfExecutionContexts`, `SqfFileVerification` and `SqfChangedFiles` live in
`z_cmd/Arma3.DevTools/Arma3.DevTools.Core`. The extension-owned `host/` references that
project through the explicit `ArmaRepository` MSBuild property and delegates verification/suites to `SqfTestCommand`. Project policy
and layout stay outside HEMTT's general parser. The CLI now stages the complete
production config/header layout even for selected SQF, so macro-generated
include targets and real config roots remain available. This can reveal findings
that the old literal-include-only staging missed.

Reviewed metadata corrections are in `contracts.json`, separate from the pinned
upstream reference: `addWeapon`'s Boolean autoselect, canonical `setDammage`
overloads, and the browser command's bounded native evidence. Do not edit the
raw snapshot to disguise provenance. Preserve unresolved restrictions.

The VSIX's `server/tools.json` pins the fork commit, executable hashes and
normalized hashes of shared analysis sources. Activation refuses a stale build
if those sources differ from the checkout; line-ending differences are ignored.
Data-only changes to contracts, contexts or layout need no binary build.

Maintainer prerequisites: Git, Rust/MSVC, .NET 10 SDK and Node/npm, plus a separate
full Arma checkout. Do not copy mission code, contracts, local logs or credentials
into this public repository. Commit reviewed fork changes first. From this directory:

```powershell
./build.ps1 -ArmaRepository D:/LyL/arma3 -ForkPath D:/LyL/a3_software/HEMTT
```

This builds the fork with static CRT, publishes the self-contained shared host,
installs locked npm dependencies, collects third-party notices, runs unit and
actual-LSP regression tests, packages the VSIX locally, and writes its checksum.
`-SkipRustBuild` reuses a just-built executable; use only after building the exact
recorded clean fork revision. Never update hashes to bless an unexplained binary.
`-SkipSourceBundle` reuses an archive only when its revision and SHA-256 stamp
match; regenerate it after fork or corresponding-source packaging changes.
Rebuild/release after shared C# changes, update the Arma release pin, reinstall,
and republish the Arma repository launcher
with its existing publish workflow so agent and pre-commit commands run the same
code. Do not replace the pinned HEMTT CLI with upstream's update suggestion.

Local validation commands (the VS Code test downloads a separate pinned portable
VS Code 1.105.1, or accepts `LYL_VSCODE_EXE`):

```powershell
$env:LYL_ARMA_REPOSITORY = 'D:/LyL/arma3'
npm.cmd ci
npm.cmd test
npm.cmd run test:integration
node test/run-vscode.js
```

`test:integration` uses the actual bundled Rust server/host with dirty-buffer,
header/config, navigation/completion, context and fork-compatibility regressions.
The VS Code test extracts the built VSIX and starts a separate clean extension
host against the explicitly selected Arma repository; buffers are changed/reverted without saving.
Logs/reports are in ignored `test-results/`. Rust tests remain in the fork;
run its workspace/HLS/preprocessor/SQF tests and the shared C# tests after
infrastructure changes. Clear inherited `NO_COLOR` only for Rust snapshot tests.

Source grammars, configurations and protocol integration derive from HEMTT's
existing `hls` extension (whose client manifest declares MIT). The Rust HEMTT
server/libraries are **GPL-2.0**, preserved in `licenses/HEMTT.txt`; the VSIX
includes `source/HEMTT-source.zip` with the exact fork source, Cargo.lock,
vendored dependencies and local build instructions as corresponding source.
`licenses/catalog.json` and adjacent notices preserve packaged dependency
licenses; the command-reference attribution is also included. The new extension's
MIT license covers the new client code and does not replace upstream or
repository component obligations. Keep the source archive and notices with any
redistributed package.

## Performance maintenance

See `PERFORMANCE.md` for measured before/after results and the
repeatable local workload. `npm.cmd run profile -- --label current` records
phase timings, process CPU/memory, diagnostic traffic and a Node `.cpuprofile`
in ignored `test-results/performance/`. Compare runs with
`node test/compare-performance.js BASELINE/results.json CURRENT/results.json`;
it fails if any finding changes after normalizing the disposable snapshot path.
Run benchmarks sequentially with builds/tests finished.

HLS publishes only changed file diagnostic sets and indexes include consumers;
header changes still refresh every affected root. Command documentation/context
metadata is cached once per shared-host session. Contract/context/layout changes
restart that session and replay open buffers through the existing watcher.
`Rebuild Analysis Workspace` also reloads the data explicitly. New command-line
gate invocations read fresh metadata. No diagnostic category is disabled for
performance. The CLI and HLS both reuse prepared lint runners/configurations.

## Release and project boundary

Build and run the real-HLS and packaged VS Code tests locally against the intended
Arma checkout. Inspect `server/tools.json` for its shared-source hashes and exact
HEMTT commit. Commit this repository, tag `v<package version>`, and create a GitHub
release containing `lyl-sqf-<version>.vsix` and its `.sha256` file. The VSIX retains
the GPL server's complete corresponding source. Keep binary/generated directories
ignored; no mission/config source or project command contracts belong in Git here.

After validating the uploaded asset, change **only** the version, immutable URL
and SHA-256 in the Arma checkout's `tools/vscode-lyl-sqf/release.json`. Run its
installer tests and a clean-cache download/install there. Retain an old pin for
rollback; release assets must not be replaced under an existing version.

The shared analyzer remains in the Arma repository. `host/Program.cs` only exposes
its protocol and existing test entry point; do not create a second implementation
of project rules. Changing shared C# code requires a matching VSIX release and
launcher rebuild. Changing project JSON data requires a session restart, without
publishing mission-specific policy to this public repository.

## Upstream integration 0.2.1

This release uses the upstream-main merge in HEMTT v1.22.1-lyl.1, retaining the
completed 0.2.0 authoring features. The source pins Rust 1.99.1. Generic parser,
command-reference, BOM, incremental/dirty-buffer and provisional config-structure
behavior stays in the fork; Arma project policy stays in the shared adapter.

Raw SQF/config TOML lints now observe dirty buffers and repairs through the real
HLS. The protocol regression also checks upstream path-copy alongside our custom
endpoints. Known include-slash and lint-configuration diagnostics are shown as
policy findings. No finding is suppressed. The saved CLI benchmark refuses to
report a compiler workload when preprocessing/config failures compile no SQF.

Use immutable GitHub releases: upload every asset while the release is a draft,
then publish once and verify public digests. Keep exact executable/source pins,
vendored corresponding source, embedded wiki data and all license notices. The
source archive documents offline builds for both CLI and HLS. See VALIDATION.md
and PERFORMANCE.md for this update's findings, regressions and measured limits.
