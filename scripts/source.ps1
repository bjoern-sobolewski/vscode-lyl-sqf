param([Parameter(Mandatory=$true)][string]$ForkPath)
$ErrorActionPreference = 'Stop'
$extensionRoot = Split-Path -Parent $PSScriptRoot
$revision = (& git -C $ForkPath rev-parse HEAD).Trim()
$sourceRoot = Join-Path $extensionRoot ('test-results/corresponding-source/' + $revision)
$vendor = Join-Path $sourceRoot 'vendor'
New-Item -ItemType Directory -Force $sourceRoot,(Join-Path $extensionRoot 'source') | Out-Null
Push-Location $ForkPath
try {
    & cargo vendor --locked --versioned-dirs $vendor > (Join-Path $sourceRoot 'vendor-config.toml')
    if ($LASTEXITCODE) { throw 'Could not vendor corresponding dependency source.' }
    # Retain the exact embedded wiki data and its original build script. The
    # source-package convenience patch makes a rebuild independent of a moving
    # remote wiki branch; it does not change server/parser source.
    $wikiCrate = Join-Path $vendor 'arma3-wiki-0.4.5'
    $wikiOutput = Get-ChildItem -LiteralPath (Join-Path $ForkPath 'target/x86_64-pc-windows-msvc/release/build') -Directory |
        Where-Object { $_.Name -like 'arma3-wiki-*' -and (Test-Path -LiteralPath (Join-Path $_.FullName 'out/arma3-wiki')) } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (!$wikiOutput) { throw 'Cannot locate the wiki data embedded by this build.' }
    $dist = Join-Path $wikiCrate 'lyl-embedded-dist'
    New-Item -ItemType Directory -Force $dist | Out-Null
    $builtWiki = Join-Path $wikiOutput.FullName 'out/arma3-wiki'
    Get-ChildItem -LiteralPath $builtWiki -Force | Where-Object { $_.Name -ne '.git' } | Copy-Item -Destination $dist -Recurse -Force
    Copy-Item -LiteralPath (Join-Path $wikiCrate 'build.rs') -Destination (Join-Path $wikiCrate 'build.rs.upstream') -Force
    $offlineBuild = @'
// Corresponding-source convenience patch; original in build.rs.upstream.
fn main() {
    let source = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("lyl-embedded-dist");
    let destination = std::path::Path::new(&std::env::var("OUT_DIR").expect("OUT_DIR")).join("arma3-wiki");
    if destination.exists() { fs_err::remove_dir_all(&destination).expect("remove old data"); }
    fs_extra::dir::copy(source, destination, &fs_extra::dir::CopyOptions::new().content_only(true)).expect("copy embedded wiki");
}
'@
    [IO.File]::WriteAllText((Join-Path $wikiCrate 'build.rs'), $offlineBuild, [Text.UTF8Encoding]::new($false))
    $checksumPath = Join-Path $wikiCrate '.cargo-checksum.json'
    $checksums = Get-Content -LiteralPath $checksumPath -Raw | ConvertFrom-Json
    foreach ($file in [IO.Directory]::EnumerateFiles($wikiCrate, '*', [IO.SearchOption]::AllDirectories)) {
        if ($file -eq $checksumPath) { continue }
        $relative = $file.Substring($wikiCrate.TrimEnd('\','/').Length + 1).Replace('\','/')
        $checksums.files | Add-Member -NotePropertyName $relative -NotePropertyValue (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -Force
    }
    [IO.File]::WriteAllText($checksumPath, ($checksums | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
    $archive = Join-Path $extensionRoot 'source/HEMTT-source.zip'
    & git archive --format=zip -o $archive HEAD
    if ($LASTEXITCODE) { throw 'Could not archive exact HEMTT fork source.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::Open($archive, [IO.Compression.ZipArchiveMode]::Update)
    try {
        foreach ($file in [IO.Directory]::EnumerateFiles($vendor, '*', [IO.SearchOption]::AllDirectories)) {
            $relative = $file.Substring($vendor.TrimEnd('\','/').Length + 1).Replace('\','/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file, ('vendor/' + $relative), [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
        $config = $zip.CreateEntry('.cargo/config.toml')
        $writer = [IO.StreamWriter]::new($config.Open(), [Text.UTF8Encoding]::new($false))
        # cargo vendor also emits replacements for Git dependencies. Preserve all
        # of them so --locked --offline does not reach out to a remote checkout.
        $vendorConfig = Get-Content -LiteralPath (Join-Path $sourceRoot 'vendor-config.toml') -Raw
        $vendorConfig = [regex]::Replace($vendorConfig, '(?m)^directory\s*=.*$', 'directory = "vendor"')
        try { $writer.Write($vendorConfig) } finally { $writer.Dispose() }
        $readme = $zip.CreateEntry('CORRESPONDING-SOURCE.md')
        $writer = [IO.StreamWriter]::new($readme.Open(), [Text.UTF8Encoding]::new($false))
        try { $writer.Write("Exact HEMTT fork source $revision with Cargo.lock and checksum-bearing vendored crate source.`n`nOn Windows x64 with Rust/MSVC, extract this archive, set CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS=-C target-feature=+crt-static and run cargo build -p hemtt-language-server --release --locked --offline --target x86_64-pc-windows-msvc. See LYL.md and LICENSE.`n`nPackaging convenience patch: vendor/arma3-wiki-0.4.5/build.rs copies the included lyl-embedded-dist data used by this binary instead of fetching a moving remote branch. Original build.rs.upstream is retained; per-file vendor hashes record this patch. Server/parser sources are unchanged.`n") } finally { $writer.Dispose() }
    } finally { $zip.Dispose() }
    $sourceStamp = @{ revision=$revision; sha256=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() } | ConvertTo-Json
    [IO.File]::WriteAllText((Join-Path $extensionRoot 'source/HEMTT-source.json'), $sourceStamp, [Text.UTF8Encoding]::new($false))
    Write-Output "Corresponding source: $archive"
} finally { Pop-Location }
