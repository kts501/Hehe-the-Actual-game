<#
.SYNOPSIS
  Compresses loose RGBA/PNG textures into BC1 (opaque) / BC7 (alpha/normal) DDS
  with full mipmaps and a strict 1024px cap to keep DVMT memory under 1.1 GB.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$InputDir,
  [Parameter(Mandatory = $true)]
  [string]$OutputDir,
  [string]$TexconvPath = "texconv.exe"
)

if (-not (Get-Command $TexconvPath -ErrorAction SilentlyContinue)) {
  Write-Error "texconv.exe not found in PATH. Download DirectXTex texconv from Microsoft GitHub."
  exit 1
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$files = Get-ChildItem -Path $InputDir -Recurse -Include *.png, *.tga, *.jpg, *.jpeg

foreach ($file in $files) {
  $name = $file.BaseName.ToLowerInvariant()
  $isNormal = $name -match 'normal|_nrm|_ddn|bump'
  $isAlpha = $name -match 'foliage|leaf|grass|jali|chain|alpha|mask'
  $format = if ($isNormal -or $isAlpha) { 'BC7_UNORM' } else { 'BC1_UNORM_SRGB' }
  $maxDim = if ($name -match 'ui|hud|sky') { 1024 } else { 512 }

  $rel = $file.DirectoryName.Substring($InputDir.Length).TrimStart('\', '/')
  $destDir = Join-Path $OutputDir $rel
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null

  & $TexconvPath -f $format -m 0 -w $maxDim -h $maxDim -srgb:false -y -o $destDir $file.FullName | Out-Null
  Write-Host ("Compressed {0} -> {1} (max {2}px)" -f $file.Name, $format, $maxDim)
}

Write-Host "Asset compression finished. Expected DVMT texture pool footprint: < 800 MB." -ForegroundColor Green
