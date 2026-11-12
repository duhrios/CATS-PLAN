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

$linkedBranchId = Get-EnvValue "NEON_BRANCH"
$projectId = Get-EnvValue "TEST_NEON_PROJECT_ID"
$testBranchName = Get-EnvValue "TEST_NEON_BRANCH_NAME"
$expectedBranchId = Get-EnvValue "TEST_DATABASE_BRANCH_ID"
if (
  -not $projectId -or
  -not $testBranchName -or
  -not $expectedBranchId -or
  $linkedBranchId -notin @($expectedBranchId, $testBranchName)
) {
  throw "Configure TEST_NEON_PROJECT_ID and TEST_NEON_BRANCH_NAME for the selected test branch."
}

$databaseUrl = Get-EnvValue "DATABASE_URL"
$directDatabaseUrl = Get-EnvValue "DATABASE_URL_UNPOOLED"
if (-not $databaseUrl -or -not $directDatabaseUrl) {
  throw "The isolated test branch must have pooled and direct DATABASE_URL values."
}
if (([Uri]$directDatabaseUrl).Host -like "*-pooler*") {
  throw "Refusing to run against an unexpected or pooled database endpoint."
}

$neon = Join-Path $env:APPDATA "npm\neon.cmd"
$branch = (& $neon branch get $testBranchName --project-id $projectId -o json | ConvertFrom-Json)
if ($branch.name -ne $testBranchName -or $branch.primary -or $branch.init_source -ne "parent-schema" -or $branch.current_state -ne "ready") {
  throw "Neon did not confirm the expected non-production schema-only branch."
}
$branchId = $branch.id
if ($branchId -ne $expectedBranchId) {
  throw "The selected Neon branch ID does not match the test database configuration."
}
$expectedConnection = (& $neon connection-string $branchId --project-id $projectId).Trim()
if ($LASTEXITCODE -ne 0) { throw "Could not verify the branch connection with Neon CLI." }
if (([Uri]$expectedConnection).Host -ne ([Uri]$directDatabaseUrl).Host) {
  throw "DATABASE_URL_UNPOOLED does not match the verified test branch."
}

$env:DATABASE_URL = $databaseUrl
$env:DATABASE_URL_UNPOOLED = $directDatabaseUrl
$env:NEON_BRANCH = $branchId
$env:TEST_DATABASE_BRANCH_ID = $branchId
$env:TEST_DATABASE_HOST = ([Uri]$directDatabaseUrl).Host
$env:RUN_DATABASE_INTEGRATION = "1"
$env:TEST_ADMIN_USERNAME = Get-EnvValue "TEST_ADMIN_USERNAME"
$env:TEST_ADMIN_PASSWORD = Get-EnvValue "TEST_ADMIN_PASSWORD"
$env:SESSION_SECRET = Get-EnvValue "SESSION_SECRET"
$env:ADMIN_USERNAME = $env:TEST_ADMIN_USERNAME
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
