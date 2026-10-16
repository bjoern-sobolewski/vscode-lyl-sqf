param(
    [Parameter(Mandatory=$true)][string]$Workspace,
    [Parameter(Mandatory=$true)][string]$Before,
    [Parameter(Mandatory=$true)][string]$After,
    [string]$Output = (Join-Path $PSScriptRoot '../test-results/performance/cli'),
    [int]$Runs = 3,
    [int]$Threads = 8
)
$ErrorActionPreference = 'Stop'
$Workspace = (Resolve-Path -LiteralPath $Workspace).Path
$Before = (Resolve-Path -LiteralPath $Before).Path
$After = (Resolve-Path -LiteralPath $After).Path
$Output = [IO.Path]::GetFullPath($Output)
if (!(Test-Path -LiteralPath (Join-Path $Workspace '.hemtt/project.toml'))) { throw 'Provide a disposable HEMTT project workspace.' }
if ($Runs -lt 1 -or $Threads -lt 1) { throw 'Runs and Threads must be positive.' }
New-Item -ItemType Directory -Force $Output | Out-Null
$results = @()
$expected = $null
foreach ($iteration in 1..$Runs) {
    foreach ($tool in @(@{Name='before';Path=$Before}, @{Name='after';Path=$After})) {
        $label = $tool.Name + '-' + $iteration
        $stdout = Join-Path $Output ($label + '.stdout.log')
        $stderr = Join-Path $Output ($label + '.stderr.log')
        $watch = [Diagnostics.Stopwatch]::StartNew()
        $process = Start-Process -FilePath $tool.Path -ArgumentList @('check', '--no-color', '-t', $Threads) -WorkingDirectory $Workspace -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
        $cpu = 0; $peak = 0
        while (!$process.WaitForExit(100)) {
            $process.Refresh()
            if (!$process.HasExited) { $cpu = $process.TotalProcessorTime.TotalSeconds; $peak = [Math]::Max($peak, $process.PeakWorkingSet64) }
        }
        $watch.Stop()
        try { $cpu = [Math]::Max($cpu, $process.TotalProcessorTime.TotalSeconds) } catch { }
        $log = [IO.File]::ReadAllText($stdout) + [IO.File]::ReadAllText($stderr)
        $headings = @([regex]::Matches($log, '(?m)^(?:error|warning|help|note)\[[^\]]+\]:[^\r\n]*') | ForEach-Object Value | Sort-Object)
        $annotations = Join-Path $Workspace '.hemttout/ci_annotations.txt'
        if (!(Test-Path -LiteralPath $annotations)) { throw 'CLI did not produce its existing local diagnostic report.' }
        $inventory = @(Get-Content -LiteralPath $annotations | Sort-Object)
        [Array]::Sort($headings, [StringComparer]::Ordinal)
        [Array]::Sort($inventory, [StringComparer]::Ordinal)
        $compiled = @([regex]::Matches($log, 'Compiled (\d+) sqf files') | ForEach-Object { [int]$_.Groups[1].Value })
        $fingerprint = [ordered]@{ exit=$process.ExitCode; compiled=$compiled; headings=$headings; diagnostics=$inventory } | ConvertTo-Json -Depth 5 -Compress
        $fingerprint | Set-Content -LiteralPath (Join-Path $Output ($label + '.inventory.json')) -Encoding UTF8
        if ($null -eq $expected) { $expected = $fingerprint }
        if ($expected -cne $fingerprint) { throw "Diagnostic inventory/exit changed in $label; retain logs and investigate." }
        $entry = @{label=$label;elapsedMs=$watch.Elapsed.TotalMilliseconds;cpuSeconds=$cpu;peakWorkingSetBytes=$peak;exit=$process.ExitCode;compiledSqfFiles=$compiled;diagnostics=$inventory.Count;headings=$headings.Count}
        $results += $entry
        $entry | ConvertTo-Json -Compress | Write-Output
        @{schema=1;workspace=$Workspace;threads=$Threads;runs=$results;beforeSha256=(Get-FileHash -LiteralPath $Before -Algorithm SHA256).Hash.ToLowerInvariant();afterSha256=(Get-FileHash -LiteralPath $After -Algorithm SHA256).Hash.ToLowerInvariant();sameDiagnosticInventory=$true} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $Output 'results.json') -Encoding UTF8
    }
}
