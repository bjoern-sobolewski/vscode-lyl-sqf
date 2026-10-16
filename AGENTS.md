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
