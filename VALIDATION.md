# Authoring coverage - 0.2.0

Local feature validation uses the actual Arma checkout and installed game headers.
The fork source and bundled binaries are pinned in `server/tools.json`; complete
corresponding source and original notices remain in the VSIX.

- Fifteen JavaScript unit scenarios cover safe canonical Wiki URLs, the attributed
  1,667-function BIS snapshot, nested/overloaded command hints, registration
  inheritance/overrides/unknowns, snippets and existing tooling protections.
- Fork Rust suites: 408 passed, one inherited ignored. These include quoted URL
  and comment delimiters, strict BOM policy, dirty includes, incomplete macro
  calls, and explicitly provisional structural projection with strict ordinary
  PE25/PE9 verification retained.
- Exact-root discovery finds 1,276 mission and 275 addon registrations. Mission
  entries are provisional because of unsupported EXEC, unresolved macro values
  and unrelated full-config parser limitations. This is not a clean-config claim.
- Actual-HLS integration exercises included macros, dirty tag/file overrides,
  discard, root include removal, unsupported constructs and preserved macro hints.
- The packaged VS Code workload tests command/BIS completion and hover, reviewed
  Boolean overload types, unary/binary/nested command hints, actual mission/addon
  functions, dirty included config completion/navigation, unresolved missing files,
  snippets, selected verification and the existing loot.matching SQF-VM suite.
  It requires auto-save off and checks source hashes after discarding edits.
  The final run passed against 1,551 registrations; both SQF and config buffers
  require effective language-specific auto-save off before any fixture edits.
  Selected verification returned exit 1 with existing findings retained, while
  the relevant loot.matching SQF-VM suite passed.
- Installer verification covers isolated Arma3 and Default profiles, valid/missing/
  corrupt offline caches, corrupt VSIX rejection and unrelated settings retention.
  The public download is checked against the committed checksum before profile
  installation. Other profile extension inventories are retained for comparison.
- The complete source archive for fork `5a407869a64ac1115d1e13533f4d80afd61537f6`
  passed extracted `cargo metadata --locked --offline`; its archive digest and
  all 15,105 wiki crate file hashes passed independent verification. The source
  packaging hashes the same files with at most four workers.

A separate native probe preserved the quoted wildcard URL but did not support
reinterpreting an incorrect macro arity as a new accepted signature. That negative
observation led to preserving PE9 and an unknown structural value, not relaxing
normal validation. No production mission, client receive path or multiplayer
behavior is newly validated by this authoring work.

Reproduce with `npm test`, `npm run test:integration` and `node test/run-vscode.js`
with `LYL_ARMA_REPOSITORY` set, then the Arma repository's `test-install.ps1`.
Generated logs, profiles, function-index evidence and reports remain ignored under
`test-results/` and Arma's `z_cmd/.generated/`. No Git CI or Marketplace publishing.

# Repository separation — 0.1.1

The extension client, protocol host, packaging, tests and releases now live in
`bjoern-sobolewski/vscode-lyl-sqf`. The Arma checkout retains installation/bootstrap,
the versioned release URL/checksum, shared analyzer, layouts, contracts and tests.
No production mission source or project contracts are copied to this repository.

Local verification on 2026-10-16:

- Built the extension-owned .NET host through an explicit `ArmaRepository`
  reference to the same shared analyzer, using the unchanged pinned HEMTT `.5`
  server and verified corresponding-source archive.
- Eight JavaScript tests pass, including explicit project selection, source-stamp
  drift detection, corrupt tooling rejection, BOM policy and protocol mapping.
- The real-HLS integration passes with the external Arma checkout, including
  dirty SQF/config, include invalidation, compatibility, navigation/completion,
  hover, HC/unscheduled violations and unresolved context.
- The packaged VSIX activates in isolated VS Code 1.105.1 against the actual Arma
  repository; unsaved diagnostics/repair, BOM policy, hover/completion, selected
  verification and the existing `loot.matching` SQF-VM suite pass their scenarios.
  The selected verifier returns exit 1 and preserves the existing backlog.
- The Arma installer passes isolated actual installation, offline valid/missing/
  corrupt cache, corrupt-package rejection and workspace-setting preservation.
- No new native Arma/multiplayer claim; no Git CI or Marketplace publication.

The release checksum and `server/tools.json` identify the delivered binaries.
Detailed test logs and disposable profiles remain in ignored `test-results/` and
in the Arma checkout's ignored `z_cmd/.generated/editor-install/` directory.
The GitHub release is consumed by the Arma installer's pinned public URL; it does
not depend on this extension source checkout being beside the Arma repository.

## Earlier BOM-policy validation

# Local validation â€” 2026-10-16

Earlier BOM-policy package: `lyl-sqf-0.1.0.vsix`, fork
`963d01051e5ad72f8bfaaeb70630c2e59a61c06a` (`v1.22.0-lyl.5`).
The adjacent checksum and `server/tools.json` identify the current binaries.

- Removed exactly three leading bytes from 87 repository sources (85 SQF, one
  HPP, one server CFG); every other byte and all line endings were preserved.
- Fork HLS/workspace/preprocessor/SQF collection: 300 passed, one inherited
  ignored. Leading BOMs fail with a named encoding-policy diagnostic; included
  headers fail too, while U+FEFF inside strings and Unicode text remain valid.
  Failed header lexing retains its dependency edges for editor repair.
- JavaScript collection: seven passed, including hidden disk BOM preservation,
  encoding-only repair and policy classification.
- Released CLI: disposable BOM SQF and header fixtures both returned exit 1;
  the same project returned exit 0 after BOM removal.
- New regression scenarios exercise dirty BOM insertion/repair, disk markers
  hidden by editor text normalization and affected SQF/config include consumers.
- First-use verification downloaded and checksum-verified the final `.5` release.
- Actual bundled HLS protocol: passed dirty SQF/config BOM insertion/repair,
  hidden disk BOM preservation, shared-header consumer refresh and all existing
  navigation/completion/context/compatibility regressions.
- Packaged VSIX in isolated portable VS Code: passed activation, verified
  provisioning, policy labeling/repair, Unicode retention, hover, completion,
  selected-file verification and the existing `loot.matching` SQF-VM suite.
- Isolated checksum-verifying installer: passed installation and UTF-8 defaults
  for both languages; unrelated workspace/language settings were preserved.
- Final `-VerifyChanged`: complete, exit 1, zero BOM errors. Other HEMTT/context/
  SQF-VM findings remain; this is not a clean-repository claim. Both stages had
  zero infrastructure errors. Static results: 1,424 pass / 301 fail records;
  context/parser stage: 3,098 pass / 350 fail records. These are stage records,
  not unique bugs or file counts.

Tested VSIX SHA-256:
`4dfc22046b0ba7f1f231e16f4f2848cc6284bcb6fdf165cf20c652f257cb8d5e`.
The final repository scan found no BOMs in tracked or non-ignored files; generated
negative fixtures are deliberately outside that scan. The 87 normalized files'
recorded post-conversion hashes were checked again. The real editor test also
confirmed that the production file it opened retained its original bytes.

Detailed current evidence: `z_cmd/.generated/bom-normalization.json`,
`bom-rust-tests-final.log`, `bom-cli-regression/`, `bom-extension-build-final.log`
and `bom-verify-changed-final.log`. Source packaging retains the exact fork revision and
GPL corresponding source. No new native Arma or multiplayer claim is made.
Additional evidence: `bom-vscode-final.log`, `bom-installer-final.log`, and
`test-results/vscode-1792163541576/results.json` in the extension directory.

## Previous performance baseline

Package: `lyl-sqf-0.1.0.vsix`, Windows x64. Fork source:
`aeea383b35c980ec396a6c303ce2f873bf362b39` (`v1.22.0-lyl.3`).
The adjacent VSIX checksum and `server/tools.json` pin the delivered artifacts.
No Git CI or Marketplace publication was used.

| Check | Result |
| --- | --- |
| Fork HLS/workspace/preprocessor/SQF Rust collection | 404 passed across HLS/workspace/preprocessor/SQF/config, one inherited ignored; two additional new targeted regressions passed |
| Shared C# SQF collection | 154 passed, zero skipped |
| JavaScript unit collection | Six passed: protocol structural sharing/immutability, categories, hover, URI aliases, corrupt provisioning/cache, shared-source drift and line endings |
| Real bundled HLS protocol | Passed dirty SQF/config, dirty and saved include invalidation, macro definition navigation, prefix/command completion, shared backend mounts, installed headers, reviewed HC/unscheduled failures and unresolved callbacks |
| Fork compatibility through LSP | Passed UTF-8 BOM, compact tokens, comma statements, Unicode/control characters, open trailing comments, `__has_include`, corrected command signatures and browser fallback |
| Packaged extension in portable VS Code 1.105.1 | Passed activation, automatic verified provisioning, dirty syntax/context diagnostics and repair, full command hover, completion, selected-file command and relevant suite selection/execution against this repository |
| Existing `loot.matching` suite through packaged host | SQF-VM: ten cases, 20 assertions passed |
| Isolated VS Code CLI installation | Actual VSIX installed successfully with the checksum-verifying repository installer; normal editor profile untouched |
| Corresponding source | Extracted archive passed `cargo metadata --locked --offline` and `cargo check -p hemtt-language-server --locked --offline --target x86_64-pc-windows-msvc` |
| Repository bytes | Real-editor tests assert effective auto-save is off before editing and verify original production-file SHA-256 after discard; source and workspace settings preserved |

The protocol and editor tests use the real compiled Rust server and shared .NET
host. Their test code is in `test/`. All test tools, VS Code profiles, stages and
raw logs are local. The complete GPL corresponding source, dependency notices and
original licenses are included in the VSIX. Its source archive retains the exact
embedded wiki data and all Cargo vendor source replacements, including the Git
dependency, for offline rebuilding with the required compiler toolchains.

The full repository has a diagnostic backlog. The local editor run retained
findings from 872 virtual diagnostic aliases; the visible category snapshot had
3,800 policy, 79 likely-runtime, 711 syntax and 242 compatibility findings.
These counts include shared config consumers, scratch sources and deliberate
negative fixtures. They are not unique gameplay bugs, passing-file counts or
proof that Arma rejects a script/config. Alias counts also differ from the
historical selected-SQF CLI audit.

The selected-file command returned **exit 1**, correctly preserving the inherited
CLI BOM rejection in `mission/ui/displays/farmdisplay.hpp`. The context and
SQF-VM parser stages passed. Including all production config/header sources can
expose this preflight even when the selected SQF is valid. The editor uses HLS
checks; explicit verification additionally runs CLI build preflights and, for
SQF, the existing SQF-VM parser. Shared layout, metadata, context rules, selectors
and suite runners do not imply identical scope for these distinct stages.

The current run adds **no native Arma or real multiplayer evidence**. Existing
native fork investigation results remain documented in the command guide.
No production source was changed to silence diagnostics, no category was
disabled, and unresolved role/scheduling restrictions remain review findings.

Detailed evidence is ignored generated data:

- `z_cmd/.generated/editor-core-tests-final.log`
- `z_cmd/.generated/editor-unit-final.log`
- `z_cmd/.generated/editor-protocol-indexed.log`
- `z_cmd/.generated/editor-vscode-indexed.log`
- `z_cmd/.generated/editor-source-verify/check.log`
- `tools/vscode-lyl-sqf/test-results/protocol.json`
- `tools/vscode-lyl-sqf/test-results/vscode-1792156914973/results.json`

Reproduce with the commands in [README.md](README.md). Rebuild the VSIX and
republish the launcher after changing shared analysis C#; update pins only after
reviewing and testing the corresponding fork source.

Performance update: two baseline and two final editor runs preserved all 4,832
findings. Three alternating CLI runs per version preserved 4,101 annotation
records and 4,857 headings while compiling all 1,833 audit sources (exit 1).
Measured timing/CPU/memory results and reproduction details are in
`PERFORMANCE.md` and `performance-results.json`. New diagnostic tests cover
unchanged publication, repair clearing, overlapping consumers, include-edge
replacement and workspace isolation. The C# regression verifies shared results
and metadata reload through a new session.

Current local evidence: `z_cmd/.generated/sqf-performance-*.log`,
`z_cmd/.generated/editor-source-performance/`, and
`test-results/performance/{profiled-baseline,baseline-repeat,final-1,final-2,cli-final}/`.
The package has a freshly generated source archive for the exact fork commit.
The repository launcher was republished with the shared C# implementation.

## Release 0.2.1, upstream main integration (2026-10-17)

HEMTT source `16dd5b0059fb62891b5c6c3c7f6cbc3d0d971016` merges upstream
`b888164616dbaf1007400485be4e4ee2b3521818` and completed lyl.6 features without
rewriting published history. The feature baseline 0.2.0 was committed/released by
its owning chat before this update touched the shared checkouts. Existing unrelated
Arma simulator/scratch work was preserved.

Local Rust validation: 589 unit/integration tests plus one documentation example
passed; two inherited upstream tests remain ignored (wiki examples and manual
SQFC A/B helper). Core/common/workspace/preprocessor/config/SQF/HLS tests ran in
the release test profile; CLI fixtures ran in their intended debug test profile
with nocapture. Supporting format/signing/audio suites and cargo fmt passed.
The stale upstream output-capture doctest type name was corrected. No lint or
regression was disabled.

The 15 JavaScript unit tests and actual bundled HLS protocol pass. New protocol
checks observe/clear raw TOML findings in dirty SQF/config buffers without writing
disk and retain upstream path-copy beside config-structure/performance endpoints.
Existing command metadata, BOM rejection/repair, shared failed/successful includes,
UTF-16, provisional function discovery, unsaved registrations and macro hints
remain covered. The packaged VS Code 1.105.1 suite validates the actual 0.2.1 VSIX
with isolated profile/storage and effective SQF/config auto-save disabled.

Full Arma staging maps 4,018 sources, hashes 2,171 original source/rule inputs and
installed game header archives, and reports no staging limitations. Full CLI
analysis fails before SQF compilation with 2,189 annotations in both lyl.6 and
this update. The sole raw difference is random ordering of the same CCHU expected
token alternatives; location/severity/token set are unchanged. Compared with old
lyl.5, correct quoted-comment handling exposes strict unsupported EXEC instead
of the swallowed-URL parse error. Full config failure is not a full SQF pass.

Full HLS workloads retain 4,832 findings and add three upstream L-S05
recommendations, with no removed/changed existing findings. The refreshed narrower
1,833-file saved-SQF workload similarly adds three annotations (4,101 to 4,104).
These follow upstream's narrower isNil exemption and were reviewed, not applied
blindly. Exact inventories repeat within each version; strict cross-version
comparators retain their expected failures. See PERFORMANCE.md and
upstream-performance-results.json for every scope/timing, including the measured
startup/transient-memory regression. Raw inventories and source hashes stay local.

The corresponding-source archive matches all 1,526 exact Git source files and
verifies 45,352 vendored file hashes across 561 packages. Locked offline dependency
resolution passes. It contains Rust 1.99.1 selection, Cargo.lock, all source
replacements, original licenses/notices and the exact embedded wiki data; offline
build instructions cover CLI and HLS. The archive/tool SHA-256 values and unchanged
Arma shared-source stamps are recorded in server/tools.json. No shared C# change
was made by this update, so the existing published launcher needs no rebuild.

This is static tooling/editor evidence. Packaged suite execution of loot.matching
is separately labelled SQF-VM. No new native Arma or real multiplayer coverage is
claimed; existing native investigation remains historical evidence. Full repository
static findings and unresolved contexts remain failures/reviews. No source,
execution-context contract or category was changed to obtain a pass. Releases
use local verification only, immutable GitHub assets and no Marketplace publishing.

## Release 0.2.2: matching shared verifier update (2026-10-17)

The package refreshes the shared host/source stamps for batched parse-only
verification, single-pass command-context analysis and bounded complete diagnostic
capture. The Arma launcher is republished from the same shared source. Manual
verification stays explicit; this package does not install a Git commit hook.
The Arma change-selection policy and unresolved execution contracts are retained.
See PERFORMANCE.md for the controlled timing and complete finding comparison.

The shared C# run passes 118 focused parser, selection, command-safety, editor and
process-runner tests. Real pinned-VM tests cover fresh macros across batched files,
physical includes, non-execution, mixed syntax/include failures and cancellation.
Editor validation uses the 15 JavaScript tests, actual bundled HLS protocol tests
and the packaged VS Code 1.105.1 suite in an isolated profile. Production sources
and ordinary profile settings are preserved by these tests.

The previously prepared HEMTT revision
`e8427928bfcd4d2e5537ac5a6f23c7a73663bebb` and its PBO extraction fix are retained.
Its corresponding-source archive SHA-256 is
`79eb34ab8848c5b634d4015a56694f3ade4524d845d2b1298651747aaa84c43f`;
the existing integrity evidence verifies 1,526 Git files and 33,276 vendored files
across 561 packages. Tools, licenses and exact source stamps remain bundled.
The separate Arma HEMTT CLI pin is unchanged by this editor release.

The full manual gate retains its 349 unique failing records (299 unresolved
command contexts, 49 parser failures and one HEMTT stage), with no infrastructure
errors or outcome changes. These are stage records, not unique bugs. No production
SQF/config or execution-context declaration was changed to obtain a pass.
This is tooling/static/editor evidence; no new native Arma or multiplayer
execution is claimed.

## Release 0.2.3: concurrent verifier (2026-10-17)

The shared host refresh adds bounded VM workers, ordered parallel overlay copies,
overlapping verification stages and indexed alias selection. Existing diagnostics,
macro/include isolation, parse-only behavior and source-stamp checks remain intact.
The focused C# run passes 120 tests, including a new 200-input mixed-failure test
across workers and combined-stage retention when static provisioning fails.
The parser's existing missing-file, cancellation, macro-isolation and diagnostic
regressions remain enabled. Static/syntax metrics expose setup and worker costs.

The fixed-source comparison in PERFORMANCE.md retains every unique result/detail,
all HEMTT annotations and all staged source hashes. Existing config/context/parser
failures remain failures. Independent production edits were frozen before the
comparison; no source or execution contract was altered to meet the time target.
The same HEMTT binary/source/archive and licenses as 0.2.2 are retained. The matching
launcher is rebuilt from the shared implementation. Editor validation continues
to use JavaScript units, real HLS integration and the packaged isolated VS Code
suite; it includes source preservation and the existing loot.matching VM suite.
There is no new native Arma or multiplayer claim.

## Release 0.2.4: saved-source service and compiler optimization

HEMTT source revision `b3bde43580a6a6756bb2fd20ebfbcfbde95009a5`
adds saved-source batch analysis and an optimized SQF lexer. The matching shared
host/source stamps include the new verification service. Source-byte inventories,
failed/new includes, headers, macros, command/rule metadata, configuration and
workspace membership govern invalidation. Restored timestamps cannot reuse stale
results. Infrastructure failures are incomplete and retried. Config analysis
failures do not prevent the new analyzer from checking selected SQF.

Rust common/workspace/config/preprocessor/SQF/HLS suites passed 538 tests with
two inherited ignored tests. The final service rerun passed 33 tests. Serial CLI
unit/integration suites passed; an inherited C++ example incorrectly marked as a
Rust doctest was corrected and its doctest rerun passed. CLI tests require serial
execution because the inherited temporary-directory helper races process CWD
restoration. No test or lint was disabled. The lexer differential test covers
12,000 generated inputs plus existing numeric/Unicode/compatibility fixtures.

The focused shared C# run passed 167 tests. Regressions cover content fingerprints,
restored mtimes, extensionless/missing/new includes, conservative dynamic includes,
deleted aliases, unchanged copies, rules and headers. The sequential complete
command comparison retains all 3,428 stage records and complete findings; the
separate compiler A/B retains every diagnostic across six runs. PERFORMANCE.md
reports fresh/repeated/edit timings and the remaining five-second limitations.

Matching editor validation requires JavaScript units, actual bundled HLS, isolated
packaged VS Code tests, source preservation and the existing loot.matching SQF-VM
suite. Corresponding source includes exact Git sources, locked vendored crates,
embedded wiki, original build script, documented offline convenience patch and
licenses. The Arma launcher is rebuilt from the same shared sources; Git commit
hooks remain disabled. Static/editor/VM evidence does not verify native Arma or
real multiplayer execution.

Final public-pin consumer validation passed 167 focused C# tests, 15 JavaScript
tests, actual-HLS regressions, 14 isolated packaged VS Code checks and six installer
checks, including the existing loot.matching VM suite. Empty caches downloaded
and verified the public CLI/analyzer/VM/editor pins; selected SQF/config analysis
completed with existing failures and zero infrastructure errors. Source audit:
1,528 exact Git files, 33,276 vendor file hashes across 561 packages, and extracted
locked offline CLI/HLS checking passed. The package is installed in Arma3;
settings, profile definitions, unrelated extensions and ten other profile inventories
are unchanged. All 16 installed shared-source stamps and tool/source hashes match.
The final launcher independently confirms 19.007s fresh / 2.184–2.261s unchanged
repeats with every diagnostic preserved. Public release source pins remain the
tested immutable tag revisions; this post-publication record changes documentation
and scalar evidence only.


## Saved-source header follow-up: 0.2.5

The Rust common/config/preprocessor/SQF/workspace/HLS suites pass 538 tests,
with two inherited tests ignored. Fresh/incremental header regressions cover
transitive consumers, macro changes, BOM failure/repair, missing includes,
configuration resets and infrastructure retries. Shared C# tests cover content
keys with restored timestamps, physical/virtual overlay aliases, missing and
extensionless probes, global rules included as text, selected overlay rejection
and retained parser/context findings. The matching consumer also requires real
HLS, packaged editor, source-bundle, installer and fresh-cache validation.

The controlled workload retains every complete finding: 3,428 stage records,
1,805 analyzer units and 2,188 CLI annotations. Raw CCHU alternative-order and
path-only differences are retained privately; only those alternatives, disposable
paths, ordering, timings and run IDs are normalized. No findings are suppressed.
PERFORMANCE.md distinguishes the achieved single-edit target from the remaining
broad-header and fresh-full latency. Static/editor/VM checks do not establish
native Arma or real multiplayer behavior.


Final public-pin 0.2.5 validation: all 14 packaged editor checks pass, including
selected source verification and the existing loot.matching SQF-VM suite. A fresh
dependency cache verifies the exact public CLI/analyzer/VM downloads and completes
SQF/config analysis with existing failures and no infrastructure errors. All six
installer checks pass; the fresh public VSIX upgrades the actual Arma3 profile.
Before/after inventories retain settings, unrelated extensions and the other ten
profiles. Installed binary/corresponding-source hashes and all 16 normalized shared
source stamps match. Reload existing editor windows to activate the update.
Final sequential launcher diagnostic comparisons preserve every finding; see the
final consumer table in PERFORMANCE.md for timings and five-second limitations.
No native Arma/multiplayer result is claimed. Commit hooks remain disabled.
