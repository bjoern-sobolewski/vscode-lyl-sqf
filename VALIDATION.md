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
