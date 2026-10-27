$ErrorActionPreference = "Stop"

Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))

$envFile = Join-Path (Get-Location) ".env.local"
if (-not (Test-Path $envFile)) {
  throw "Missing .env.local. Configure the isolated Neon test branch first."
}

$entries = Get-Content $envFile
function Get-EnvValue([string]$name) {
  $entry = $entries | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
  if (-not $entry) { return $null }
  return $entry.Substring($name.Length + 1).Trim().Trim('"')
}

$branchName = Get-EnvValue "NEON_BRANCH"
if ($branchName -ne "testes-cats-20261026") {
  throw "Refusing to run destructive/load integration tests outside the dedicated test branch."
}

$databaseUrl = Get-EnvValue "DATABASE_URL"
$directDatabaseUrl = Get-EnvValue "DATABASE_URL_UNPOOLED"
if (-not $databaseUrl -or -not $directDatabaseUrl) {
  throw "The isolated test branch must have pooled and direct DATABASE_URL values."
}
if (([Uri]$directDatabaseUrl).Host -notlike "ep-little-shape-b6l07w5y*" -or ([Uri]$directDatabaseUrl).Host -like "*-pooler*") {
  throw "Refusing to run against an unexpected or pooled database endpoint."
}

$neon = Join-Path $env:APPDATA "npm\neon.cmd"
$branch = (& $neon branch get $branchName --project-id orange-paper-53554576 -o json | ConvertFrom-Json)
if ($branch.name -ne $branchName -or $branch.primary -or $branch.init_source -ne "parent-schema") {
  throw "Neon did not confirm the expected non-production schema-only branch."
}
$branchId = $branch.id
if ($branchId -ne "br-still-dust-b65r7aqc") {
  throw "Refusing to run load tests against an unexpected branch ID."
}

$env:DATABASE_URL = $databaseUrl
$env:DATABASE_URL_UNPOOLED = $directDatabaseUrl
$env:TEST_DATABASE_BRANCH_ID = $branchId
$env:RUN_DATABASE_INTEGRATION = "1"
$env:TEST_ADMIN_USERNAME = Get-EnvValue "TEST_ADMIN_USERNAME"
$env:TEST_ADMIN_PASSWORD = Get-EnvValue "TEST_ADMIN_PASSWORD"
$env:SESSION_SECRET = Get-EnvValue "SESSION_SECRET"
$env:ADMIN_USERNAME = "Administrador"
$env:ADMIN_SUPER_ADMIN = "true"
$env:APP_BASE_URL = "http://localhost:4173"
$env:NODE_ENV = "test"

if (-not $env:SESSION_SECRET -or $env:SESSION_SECRET.Length -lt 32) {
  throw "SESSION_SECRET in .env.local must contain at least 32 characters."
}
if (-not $env:TEST_ADMIN_USERNAME -or -not $env:TEST_ADMIN_PASSWORD) {
  throw "TEST_ADMIN_USERNAME and TEST_ADMIN_PASSWORD must be configured in .env.local."
}

$env:PORT = "4173"
$env:BASE_PATH = "/"

$commands = @(
  @{ Label = "Frontend tests"; Args = @("--filter", "@workspace/controle-carrinhos", "test") },
  @{ Label = "API unit tests"; Args = @("--filter", "@workspace/api-server", "exec", "vitest", "run", "src/lib/auth.test.ts", "src/routes/operational-state.test.ts") },
  @{ Label = "1,000 reservation lifecycle tests (4,000 API requests)"; Integration = $true },
  @{ Label = "Workspace typecheck"; Args = @("run", "typecheck") },
  @{ Label = "Production builds"; Args = @("run", "build") }
)

foreach ($command in $commands) {
  Write-Host "`n=== $($command.Label) ==="
  if ($command.Integration) {
    Push-Location (Join-Path (Get-Location) "artifacts\api-server")
    & .\node_modules\.bin\vitest.cmd run src/routes/reservations-load.integration.test.ts
    Pop-Location
  } else {
    $pnpmArgs = @($command.Args)
    & corepack.cmd pnpm@10.28.0 @pnpmArgs
  }
  if ($LASTEXITCODE -ne 0) {
    throw "$($command.Label) failed with exit code $LASTEXITCODE."
  }
}
