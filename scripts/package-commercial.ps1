$ErrorActionPreference = "Stop"

$sourceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$parentRoot = Split-Path $sourceRoot -Parent
$packageName = "CATS-PLAN-COMERCIAL-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$packageRoot = Join-Path $parentRoot $packageName
$zipPath = Join-Path $parentRoot "$packageName.zip"
New-Item -ItemType Directory -Path $packageRoot | Out-Null

$excludedDirectories = @(
  ".git",
  ".agents",
  ".vercel",
  "node_modules",
  "dist",
  "coverage",
  ".next",
  ".turbo",
  ".replit-artifact",
  "screenshots"
)
$robocopyArgs = @(
  $sourceRoot,
  $packageRoot,
  "/E",
  "/COPY:DAT",
  "/R:1",
  "/W:1",
  "/XJ",
  "/XD"
) + $excludedDirectories + @(
  "/XF",
  ".env",
  ".env.*",
  "*.tsbuildinfo",
  "/NFL",
  "/NDL",
  "/NJH",
  "/NJS",
  "/NP"
)
robocopy @robocopyArgs | Out-Null
if ($LASTEXITCODE -ge 8) {
  throw "Source copy failed with robocopy exit code $LASTEXITCODE"
}
Copy-Item -LiteralPath (Join-Path $sourceRoot ".env.example") -Destination (Join-Path $packageRoot ".env.example")

$frontendVercel = Join-Path $packageRoot "artifacts\controle-carrinhos\vercel.json"
if (-not (Test-Path -LiteralPath $frontendVercel)) {
  throw "Frontend Vercel configuration not found in package: $frontendVercel"
}
$vercelConfig = Get-Content -LiteralPath $frontendVercel -Raw
$vercelConfig = $vercelConfig.Replace(
  "https://api-server-one-azure.vercel.app",
  "https://SEU-PROJETO-API.vercel.app"
)
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($frontendVercel, $vercelConfig, $utf8WithoutBom)

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory(
  $packageRoot,
  $zipPath,
  [System.IO.Compression.CompressionLevel]::Optimal,
  $false
)

Write-Output "Pacote criado: $zipPath"
