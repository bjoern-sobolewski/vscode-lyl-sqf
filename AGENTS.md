# LiveYourLife SQF extension

Read README.md before changes. This is the public editor repository; the separate
Arma checkout owns project rules, command contracts, shared analysis and tests,
and the checksum-pinned installer. Never copy production mission source, project
contracts, credentials, game archives, local diagnostic reports or snapshots here.

Build with `./build.ps1 -ArmaRepository PATH -ForkPath PATH`. Integration/editor
and profiling runs require `LYL_ARMA_REPOSITORY`. Keep project rules in the shared
Arma analyzer, not the client or general HEMTT parser. Preserve unresolved findings,
unsaved buffer handling, include invalidation, BOM policy and source-stamp checks.

Run npm unit tests, actual-HLS integration and packaged VS Code tests against the
selected Arma checkout. Use isolated profiles and preserve production file bytes.
No Git CI or Marketplace publishing. For releases retain all original notices and
GPL corresponding source; update the Arma release pin only after release validation.
Keep generated binaries, source archives, node_modules and test results ignored.

Authoring data: command hints/lookup must use the shared host reference and
reviewed corrections, never a duplicate command-contract table. BIS function
documentation is a separately attributed pinned dataset with unknown fields
preserved. Project function names must come from HEMTT's exact-root config AST;
root declarations stay in Arma's tests/sqf/functions.json. Test dirty includes,
unresolved registrations, nested command arguments and existing macro hints in
the packaged editor. Keep excluded theme/RPT/CBA/ACE features out of this scope.
