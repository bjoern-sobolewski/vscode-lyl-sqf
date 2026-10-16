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

