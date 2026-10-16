param(
    [Parameter(Mandatory=$true)][string]$ArmaRepository,
    [string]$ForkPath,
    [switch]$SkipRustBuild,
    [switch]$SkipSourceBundle
)
$ErrorActionPreference = 'Stop'
$extensionRoot = $PSScriptRoot
$repoRoot = (Resolve-Path -LiteralPath $ArmaRepository).Path
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'tests/sqf/syntax.json'))) { throw 'ArmaRepository must be a full LiveYourLife checkout.' }
$savedRepository = [Environment]::GetEnvironmentVariable('LYL_ARMA_REPOSITORY', 'Process')
$env:LYL_ARMA_REPOSITORY = $repoRoot
if (-not $ForkPath) { $ForkPath = Join-Path (Split-Path $extensionRoot -Parent) 'HEMTT' }
$ForkPath = (Resolve-Path -LiteralPath $ForkPath).Path
$sharedSources = @(
    'z_cmd/Arma3.DevTools/Directory.Build.props',
    'z_cmd/Arma3.DevTools/Arma3.DevTools.Core/Arma3.DevTools.Core.csproj'
)
$core = 'z_cmd/Arma3.DevTools/Arma3.DevTools.Core/'
foreach ($name in @('SqfAnalysisWorkspace', 'SqfEditorAnalysis', 'SqfCommandReference', 'SqfCommandContextCheck', 'SqfExecutionContexts', 'SqfStaticCheck', 'SqfSyntaxCheck', 'SqfFileVerification', 'SqfChangedFiles', 'SqfTestCommand', 'SqfTestSources', 'SqfTestDependencies', 'DependencyProvisioning')) { $sharedSources += $core + $name + '.cs' }
function SourceHashes {
    $hashes = [ordered]@{}
    foreach ($file in $sharedSources) {
        $bytes = [Text.Encoding]::UTF8.GetBytes([IO.File]::ReadAllText((Join-Path $repoRoot $file)).Replace("`r`n", "`n"))
        $algorithm = [Security.Cryptography.SHA256]::Create()
        try { $hashes[$file] = ([BitConverter]::ToString($algorithm.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() } finally { $algorithm.Dispose() }
    }
    return $hashes
}
$sourceHashes = SourceHashes
$revision = (& git -C $ForkPath rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve fork revision.' }
if (& git -C $ForkPath status --porcelain) { throw 'Commit reviewed fork changes before packaging so the binary has a reproducible source revision.' }
$savedFlags = [Environment]::GetEnvironmentVariable('CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS', 'Process')
Push-Location $extensionRoot
try {
    if (-not $SkipRustBuild) {
        $env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS = '-C target-feature=+crt-static'
        Push-Location $ForkPath
        try { & cargo build -p hemtt-language-server --release --locked --target x86_64-pc-windows-msvc; if ($LASTEXITCODE) { throw 'HEMTT language server build failed.' } }
        finally { Pop-Location }
    }
    New-Item -ItemType Directory -Force server | Out-Null
    Copy-Item -LiteralPath (Join-Path $ForkPath 'target/x86_64-pc-windows-msvc/release/hemtt-language-server.exe') -Destination server/hemtt-language-server.exe -Force
    & dotnet publish (Join-Path $extensionRoot 'host/LYL.Sqf.EditorHost.csproj') "-p:ArmaRepository=$repoRoot" -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true -p:SkipLYLWatchPublish=true -p:DebugType=None -o (Join-Path $extensionRoot 'server')
    if ($LASTEXITCODE) { throw 'Editor host publish failed.' }
    if ((SourceHashes | ConvertTo-Json -Compress) -ne ($sourceHashes | ConvertTo-Json -Compress)) { throw 'Shared sources changed during build. Rebuild the package.' }
    if ((& git -C $ForkPath rev-parse HEAD).Trim() -ne $revision -or (& git -C $ForkPath status --porcelain)) { throw 'Fork changed during build.' }
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE) { throw 'Pinned npm install failed.' }
    & node scripts/licenses.js $ForkPath $repoRoot
    if ($LASTEXITCODE) { throw 'License collection failed.' }
    if (-not $SkipSourceBundle) { & (Join-Path $extensionRoot 'scripts/source.ps1') -ForkPath $ForkPath }
    else {
        $stamp = Get-Content -LiteralPath (Join-Path $extensionRoot 'source/HEMTT-source.json') -Raw | ConvertFrom-Json
        $actualSourceHash = (Get-FileHash -LiteralPath (Join-Path $extensionRoot 'source/HEMTT-source.zip') -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($stamp.revision -ne $revision -or $stamp.sha256 -ne $actualSourceHash) { throw 'Corresponding source archive does not match this fork revision/hash.' }
    }
    $tools = [ordered]@{}
    foreach ($item in @(@{Name='hls';File='hemtt-language-server.exe'}, @{Name='host';File='LYL.Sqf.EditorHost.exe'})) {
        $tools[$item.Name] = @{ file=$item.File; sha256=(Get-FileHash -LiteralPath (Join-Path $extensionRoot ('server/' + $item.File)) -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
    $sourceHash = (Get-FileHash -LiteralPath (Join-Path $extensionRoot 'source/HEMTT-source.zip') -Algorithm SHA256).Hash.ToLowerInvariant()
    $manifest = @{schema=1;forkRevision=$revision;forkRepository='https://github.com/bjoern-sobolewski/HEMTT';correspondingSourceSha256=$sourceHash;sharedSources=$sourceHashes;tools=$tools} | ConvertTo-Json -Depth 5
    [IO.File]::WriteAllText((Join-Path $extensionRoot 'server/tools.json'), $manifest, [Text.UTF8Encoding]::new($false))
    & npm.cmd test
    if ($LASTEXITCODE) { throw 'Extension unit tests failed.' }
    & npm.cmd run test:integration
    if ($LASTEXITCODE) { throw 'Actual HLS integration tests failed.' }
    if ((SourceHashes | ConvertTo-Json -Compress) -ne ($sourceHashes | ConvertTo-Json -Compress)) { throw 'Shared sources changed during validation. Rebuild before packaging.' }
    & npm.cmd run package
    if ($LASTEXITCODE) { throw 'VSIX package failed.' }
    $version = (Get-Content -Raw (Join-Path $extensionRoot 'package.json') | ConvertFrom-Json).version
    $vsix = Join-Path $extensionRoot ("lyl-sqf-$version.vsix")
    ((Get-FileHash -LiteralPath $vsix -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + [IO.Path]::GetFileName($vsix)) | Set-Content -LiteralPath ($vsix + '.sha256') -Encoding Ascii
    Write-Output "Local package: $vsix"
} finally {
    Pop-Location
    [Environment]::SetEnvironmentVariable('CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS', $savedFlags, 'Process')
    [Environment]::SetEnvironmentVariable('LYL_ARMA_REPOSITORY', $savedRepository, 'Process')
}
