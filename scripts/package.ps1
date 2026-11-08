# Builds the zip for the Chrome Web Store.
# powershell -ExecutionPolicy Bypass -File scripts/package.ps1
#
# Adding entries by hand because Compress-Archive in PS 5.1 writes backslash paths
# and the store rejects those.

Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content "$root/manifest.json" -Raw | ConvertFrom-Json).version
$dist = Join-Path $root "dist"
$zipPath = Join-Path $dist "attention-sentry-$version.zip"

New-Item -ItemType Directory -Force $dist | Out-Null
if (Test-Path $zipPath) { Remove-Item $zipPath }

$include = "manifest.json", "background.js", "icons", "fonts", "popup", "content", "shared", "blocked"
$files = $include | ForEach-Object { Get-ChildItem (Join-Path $root $_) -File -Recurse }

$zip = [IO.Compression.ZipFile]::Open($zipPath, "Create")
try {
  foreach ($file in $files) {
    $entry = $file.FullName.Substring($root.Length + 1).Replace("\", "/")
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $entry) | Out-Null
  }
} finally {
  $zip.Dispose()
}

Write-Output "Created $zipPath"
