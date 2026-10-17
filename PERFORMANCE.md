# Local performance verification



Measured on 2026-10-16 on this Windows x64 host using the actual repository and

installed Arma headers. Baseline fork `4e21e9b9` / release `v1.22.0-lyl.2`;

optimized fork `aeea383b` / `v1.22.0-lyl.3`. Raw profiles and snapshots are

ignored local output. Scalar observations are in `performance-results.json`.



## Results



Two baseline runs and two final runs, sequential, same workload. Values below

are medians across runs. All 4,832 final findings matched exactly after replacing

only each run's disposable snapshot prefix; no category was suppressed.



| Measurement | Before | After | Reduction |

| --- | ---: | ---: | ---: |





| Initial analysis | 12.12 s | 9.27 s | 23.6% |

| Edit/repair completion | 262.88 ms | 21.98 ms | 91.6% |

| 20 command hovers | 659.62 ms | 7.33 ms | 98.9% |

| 20 context checks | 559.20 ms | 13.72 ms | 97.5% |

| Shared-header change | 3.85 s | 2.98 s | 22.7% |

| HLS process CPU, full workload | 94.16 s | 79.33 s | 15.8% |

| Diagnostic notifications | 85,906.00  | 878.00  | 99.0% |

| Diagnostic payload | 71.01 MiB | 1.35 MiB | 98.1% |

| HLS peak working set | 994.78 MiB | 944.73 MiB | 5.0% |

| Adapter end-of-run RSS | 219.91 MiB | 65.08 MiB | 70.4% |



Initial analysis ranged 11.60â€“12.65 s before and 8.96â€“9.57 s after. Shared-header

changes ranged 3.69â€“4.01 s before and 2.71â€“3.24 s after. Adapter CPU in the repeat

baseline was 4.063 s; final runs were 0.640/0.827 s. Original baseline did not

capture process CPU for Node, so no two-run CPU median is claimed for it.

Node/Rust startup overhead and filesystem/background variation remain visible;

small connection/initialization differences are noise. The script's 20 ms poll

limits edit timing precision. Do not infer a universal speedup from this sample.



The measured changes are incremental diagnostic publication, reverse include

indexing, one project configuration read per check, prepared shared lint runners

and configurations, session-scoped C# metadata, indexed staged aliases and cached

URI conversion with structural sharing for unchanged protocol values. Remaining

HLS time is mostly preprocessing and SQF parser/lint work; header edits still

correctly reanalyze consumers. No persistent content/result cache was added.



Saved-file CLI check: three alternating runs per version, eight threads, the
existing 1,833-source SQF audit workspace with installed headers and four
generated addon configs. Median wall time 22.08 to
21.08 s (4.5% lower); CPU
50.95 to 47.27 s
(7.2% lower). Wall ranges overlap, so this is a
modest measured CLI improvement. Each run compiled all 1,833 sources, retained
4,101 diagnostic annotation records and 4,857 diagnostic headings, and returned
exit 1. This historical SQF audit layout is narrower than today's full config
gate; it is not a clean-repository claim. Exact headings and annotation records
matched; parallel diagnostic ordering and inherited nondeterministic macro-help
suggestion ordering are not compared as bytes. No production source was changed.

## Reproduce



Build the exact clean fork revision and shared host with `build.ps1` first. Finish

builds and tests before measuring. From the separate extension checkout, set `$env:LYL_ARMA_REPOSITORY` to the Arma checkout first:



```powershell

npm.cmd run profile -- --label current

node test/compare-performance.js BASELINE/results.json CURRENT/results.json

```



The workload prepares the actual repository mounts and installed game headers,

waits for both initial scans and every physical-file alias, edits and repairs

three unsaved buffers, requests 20 command hovers and context checks, and opens

and changes a shared header. All updates go to disposable snapshots; it asserts

production bytes stay unchanged. It captures a Node inspector `.cpuprofile`,

process CPU/working set, opt-in Rust phases, notification traffic, event-loop

delay and the final sorted diagnostic inventory in `test-results/performance/`.

The comparator normalizes only each run's generated snapshot prefix, then fails

on any finding, range, severity or message difference. It has no flaky timing

threshold. The 20 ms polling interval bounds precision for short edit responses;

wall times include a 300 ms diagnostic quiet period where applicable. This is a

protocol/adapter workload, separate from the packaged VS Code correctness test

and the configured 350 ms context-check debounce.



For a saved CLI workload, provide an existing disposable HEMTT project:



```powershell

./test/performance-cli.ps1 -Workspace DISPOSABLE_PROJECT -Before OLD_HEMTT.exe -After NEW_HEMTT.exe

```



It alternates three old/new runs with eight threads, retains output and measures

wall time, sampled process CPU/peak memory, exit status and diagnostics. It checks

both diagnostic headings and HEMTT's existing local annotation report. That

report filename is inherited; no Git CI is configured or required. A failed

analysis workload remains a failure. This script does not construct or modify

production sources; HEMTT writes its normal `.hemttout` in the supplied project.



For comparisons retain baseline `shared.js`, `transport.js`, server and host

before rebuilding, then pass `--client DIRECTORY --hls EXE --host EXE` to the

editor workload. Keep the same repository bytes, metadata, game installation,

Node runtime and workload. Prefer multiple sequential runs; use medians and

report variation. A warm filesystem cache and background host activity influence

these numbers. Rust aggregate timers include parallel/nested work and lock waits;

they are not process CPU or wall time. Set `HEMTT_PROFILE=1` only for local HLS

profiling and request `hemtt/performance` to retrieve counters. Ordinary editor

sessions have profiling disabled. No script contents are included in Rust timers;

CPU profiles/logs can contain local paths and should remain local.


## Upstream-main integration, 2026-10-17

Published lyl.6/0.2.0 baseline versus HEMTT 1.22.1-lyl.1 and extension 0.2.1,
using the same current Arma bytes, command snapshot, installed game headers and
Node 24.19.0. All measurements ran sequentially with builds/tests finished. Four
real-HLS runs per version include reversed old/new ordering. Scalar results are
in `upstream-performance-results.json`; raw inventories/profiles stay private.

| HLS workload median | Before | After |
| --- | ---: | ---: |
| Initial analysis | 7.32 s | 8.04 s |
| Dirty edit/repair completion | 21.57 ms | 21.58 ms |
| Shared-header change | 2.92 s | 2.93 s |
| HLS process CPU, full workload | 78.94 s | 78.57 s |
| Peak working set | 1,062.99 MiB | 1,113.98 MiB |
| End working set | 797.34 MiB | 798.01 MiB |
| Final findings | 4,832 | 4,835 |

Startup is 9.8% slower (before range 6.96-7.63s; after 7.69-8.48s), and transient
peak memory rises 51MiB/4.8%. Reversing order confirmed the increase. Startup
process CPU remains around 38s; aggregate lint/preprocessor phase totals did not
increase comparably, and final memory is nearly unchanged. The available timers
include parallel work/lock waits and do not isolate the critical-path cause.
This startup/transient-memory cost is retained as an explicit limitation of the
upstream/toolchain/dependency update. No claim of universal editor speedup is
made. Dirty edits, consumer invalidation and retained incremental publication
performance remain intact; no check was removed to improve these numbers.

Inventories match exactly within each version. Cross-version comparators correctly
fail on three added L-S05 recommendations and zero removals. Upstream narrowed
its broad isNil exemption to skip only a returned variable matching the guarded
name. The three locations were reviewed and left unchanged; these are static
recommendations, not proof that eager select is safe in every execution context.
No normalization was required for HLS inventories beyond disposable path prefixes.

The original historical CLI workspace now fails on 85 leading BOMs before SQF
compilation in both versions. Its roughly 0.7s warm preflight timings are not SQF
compiler evidence. The benchmark now rejects zero-compilation runs. A separate
copy refreshes all 1,833 historical selected source files with their unchanged
current bytes, retaining the same four synthetic addon configs and installed
headers. This is a narrower compiler workload, separate from the failed full
production-config gate; no production source or lint setting was changed.

Three alternating CLI runs per version all compile 1,833 files and exit 1. Median
wall time is 13.75s before/12.42s after (9.7% lower); median CPU 38.08s/37.69s
(1.0% lower). Wall ranges 13.55-13.76s/11.05-13.35s show host variation. Annotation
records rise 4,101 to 4,104 and headings 4,857 to 4,860 solely for the same three
L-S05 additions. Raw strict comparison failure is retained; repeated inventories
within each version are exact. Staged and production source hashes are unchanged.
These findings are not passing-file counts or native/multiplayer evidence.

## Release 0.2.2: explicit verification throughput

The shared verifier batches at most 64 parse-only SQF inputs per pinned VM
process, with a conservative Windows command-line budget. Every file uses a
fresh preprocessor macro instance. Failed/noisy batches are subdivided until
per-file diagnostics are reproduced; diagnostic paths guide subdivision but
never establish a passing result. Unknown output, crashes, timeout, cancellation
and unreproduced batch diagnostics cannot pass. SQF is never executed by parsing.
Combined verification reuses its command-context stage instead of running it
twice. Large selections log summaries and retain diagnostic reports, requiring
complete captured output rather than silently accepting a truncated stream.

One controlled sequential before/after run on the same Windows host selected
1,713 SQF files. Total manual verification fell from 69.19s to 28.17s (59.3%);
parser time fell from 54.38s to 12.16s, using 129 VM processes instead of 1,713.
These are single-run measurements, not medians or editor startup timings.
The prior 27.02s candidate preceded the complete-output safeguard; it is not the
final shipped timing. Header-triggered selection remains deliberately broad.

All 3,427 unique stage keys/outcomes are unchanged: 3,078 passing and 349 failing,
with zero infrastructure errors. Removed rows were 1,713 identical duplicate
command-context results. Context/parser details match after generated-path
normalization; HEMTT's 2,188 annotation records and heading inventories match
after sorting only its inherited CCHU expected-token alternatives. Raw differences
and reports stay in the private Arma checkout. HEMTT still fails during config
preflight, so this does not establish full SQF compilation or native execution.

## Release 0.2.3: bounded concurrent verification

The independent HEMTT/context and parse-only stages now run concurrently with
serialized caller logging and deterministic report ordering. Context analysis
overlaps dependency/snapshot preparation and is joined before HEMTT starts.
Up to four VM workers own disjoint batches and their diagnostic subdivision;
source overlays preserve their order, with bounded copies within each overlay.
The workspace uses its existing physical-to-virtual index rather than rescanning
all aliases for each selected input. All workers are joined before report output,
including provisioning failure/cancellation paths. No result cache was introduced.

Other development changed production inputs during this work. The controlled
comparison therefore freezes 1,721 selected SQF files and the same metadata/game
headers in a disposable checkout. The 0.2.2 build takes 23.36s on that snapshot;
three 0.2.3 explicit full-selection runs take 8.29, 8.86 and 7.86s (median 8.29s).
Two complete changed-file invocations, including Git selection and broad header
expansion, take 8.28 and 8.32s on the same fixed production inputs. These are warm
verified dependency caches; downloaded binaries are still hash-checked, and every
selected source is checked again. Host load and first-use setup can increase time.

All 3,443 unique keys/outcomes and normalized context/parser details match across
the explicit comparison: 3,095 pass, 348 fail, zero infrastructure errors.
All 2,188 HEMTT annotations/headings and 3,794 staged source files match, normalizing
only generated paths and inherited CCHU expected-token ordering. The changed scope
from 0.2.2's earlier 1,713-file record includes independent development; its one
fewer context failure is already present in both frozen versions, not an effect
of this optimization. Original input hashes remain unchanged throughout the runs.

These timings describe the existing verification pipeline: all selected SQF is
parsed by the VM, while HEMTT still fails during config analysis. They do not
measure complete HEMTT SQF compilation or native gameplay. Early fixture probes
without a valid Git commit/ignore rules were discarded; accepted comparisons
require nonempty matching HEMTT heading and annotation inventories.

## Release 0.2.4: persistent saved verification and Rust lexing

The shared host keeps a per-user saved-source verifier and separate HEMTT
`--verify-stdio` process alive for ten idle minutes. Content hashes cover sources,
literal/missing includes, rules, configuration, executable bytes and installed
game headers. Whole-report reuse retains all failures and is explicitly marked.
Source edits invalidate affected analysis units and parser results; header/rule,
configuration and membership changes conservatively rebuild. Dynamic includes
disable whole-report reuse. Transient infrastructure failures are retried.
Dirty editor buffers continue to use their independent HLS session.

The new analyzer stage runs SQF and config units independently alongside the
existing CLI gate. A failed config gate no longer hides the selected SQF analysis.
It uses HEMTT's shared checkers and preserves complete diagnostic severities,
messages, ranges, notes, help and suggestions. Project blocking-warning policy
remains in the Arma adapter. Failed findings remain failures.

Sequential complete-command measurements use a valid committed frozen checkout,
1,713 production SQF inputs, 92 config units, identical tool/game inputs and no
overlapping builds/tests. Warm dependency caches exclude initial downloads.
The command includes Git selection, content validation and report writing:

| Workload | Seconds | Analysis work |
| --- | ---: | --- |
| Fresh service/full verification | 19.30 | 1,805 units checked |
| Unchanged repeats | 2.05 / 2.03 / 1.99 | Complete prior report reused after content checks |
| One saved SQF edit | 6.19 | 1 checked / 1,804 reused; one VM input reparsed |
| Independent fresh check of same SQF edit | 17.90 | All units checked |
| Shared-header edit | 18.91 | All units checked |
| Independent fresh check of same header edit | 18.03 | All units checked |

All 3,428 stage records/outcomes, context/parser details and complete analyzer
inventories match fresh results. CLI text inventories match after generated-path
normalization and sorting only inherited CCHU expected-token alternatives; raw
reports/differences remain local. Durations and process/report IDs are excluded
from diagnostic comparison. All runs finish with existing config/context/parser
and analysis failures, exit 1, and zero infrastructure failures. Successful
completion describes coverage, not a passing repository.

The five-second target is demonstrated for unchanged repeats only. A source edit
still exceeds it; global invalidation and fresh full verification remain much
slower. The CLI gate, context scanning, content hashing, workspace preparation and
report serialization remain costs. Earlier 0.2.3 timings excluded the newly
added complete SQF/config analysis and are not an equivalent full-analysis baseline.

Rust profiling identified lexing as the largest measured parser subphase
(11.45 aggregate seconds versus grammar 3.00, inspection 3.45, analysis 2.58;
preprocessing 8.67). Parallel aggregate timers are not wall time. The common-token
lexer dispatcher preserves the reference implementation for malformed/unusual
input and UTF-8 spans, verified by 12,000 generated differential cases.
`HEMTT_REFERENCE_LEXER=1` selects that reference in the same binary.

On a separate frozen valid-config compiler workload (1,833 actual SQF files,
four passing synthetic configs), three alternating reference runs took
8.267 / 8.459 / 8.248 seconds; optimized runs took 4.502 / 4.471 / 4.688.
Medians improve **8.267 to 4.502 seconds (45.5%)**. All six complete diagnostic
inventories match exactly, and source hashes remain unchanged. This narrower
workload is separate from production config validation. Earlier raw comparison
exposed 315 nondeterministic tied spelling-help strings in 138 units; lexical
tie-breaking now stabilizes them without removing findings.

Scalar results are in `persistent-performance-results.json`. Private raw reports,
frozen Git commits and source hashes stay in the consuming repository under
`z_cmd/.generated/verification-persistent-20261017/`. No mission sources/game
archives are distributed here. No native Arma or multiplayer claim is made.

Post-publication consumer validation uses the exact public pins and final
repository launcher on committed frozen sources. Fresh full verification takes
**19.007s**; three unchanged repeats take **2.184/2.198/2.261s**. All 3,428 stage
records/findings match the accepted candidate, and 2,188 CLI annotation records
are retained verbatim across repeats. These final-consumer measurements confirm
the unchanged-repeat target; the separate source/header edit limitations remain.
The scalar file includes these final launcher measurements.
