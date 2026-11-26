param(
  [int]$MaxWaitSeconds = 60
)

$ErrorActionPreference = "Stop"
$backendDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envPath = Join-Path $backendDir ".env"
if (-not (Test-Path -LiteralPath $envPath)) {
  throw "Copy .env.example to .env and configure the Africa's Talking values first."
}
Set-Location $backendDir

$envValues = @{}
foreach ($line in [IO.File]::ReadAllLines($envPath)) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
    $value = $Matches[2]
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $envValues[$Matches[1]] = $value
  }
}

function New-LocalPassword {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}

$keysToSet = [ordered]@{}
foreach ($key in @('POSTGRES_ADMIN_PASSWORD', 'SAFARIDESK_APP_DB_PASSWORD', 'SAFARIDESK_MCP_DB_PASSWORD')) {
  if (-not $envValues.ContainsKey($key) -or -not $envValues[$key]) {
    $envValues[$key] = New-LocalPassword
    $keysToSet[$key] = $envValues[$key]
  }
}
$envValues['DATABASE_URL'] = "postgresql://safaridesk_app:$($envValues['SAFARIDESK_APP_DB_PASSWORD'])@127.0.0.1:5432/safaridesk"
$envValues['MCP_DATABASE_URL'] = "postgresql://safaridesk_mcp:$($envValues['SAFARIDESK_MCP_DB_PASSWORD'])@127.0.0.1:5432/safaridesk"
$keysToSet['DATABASE_URL'] = $envValues['DATABASE_URL']
$keysToSet['MCP_DATABASE_URL'] = $envValues['MCP_DATABASE_URL']

$lines = [Collections.Generic.List[string]]::new()
foreach ($line in [IO.File]::ReadAllLines($envPath)) {
  $replaced = $false
  foreach ($key in $keysToSet.Keys) {
    if ($line -match "^\s*$([regex]::Escape($key))\s*=") {
      $lines.Add("$key=$($keysToSet[$key])")
      $replaced = $true
      break
    }
  }
  if (-not $replaced) { $lines.Add($line) }
}
foreach ($key in $keysToSet.Keys) {
  if (-not ($lines | Where-Object { $_ -match "^\s*$([regex]::Escape($key))\s*=" })) {
    $lines.Add("$key=$($keysToSet[$key])")
  }
}
[IO.File]::WriteAllLines($envPath, $lines, (New-Object System.Text.UTF8Encoding $false))

docker compose up -d db
if ($LASTEXITCODE -ne 0) { throw "Could not start the local PostgreSQL container." }

$deadline = (Get-Date).AddSeconds($MaxWaitSeconds)
do {
  $health = docker inspect --format '{{.State.Health.Status}}' safaridesk-postgres 2>$null
  if ($health -eq 'healthy') { break }
  if ((Get-Date) -gt $deadline) { throw "PostgreSQL did not become healthy within $MaxWaitSeconds seconds." }
  Start-Sleep -Seconds 2
} while ($true)

$env:PGPASSWORD = $envValues['POSTGRES_ADMIN_PASSWORD']
try {
  foreach ($role in @('safaridesk_app', 'safaridesk_mcp')) {
    $roleExists = docker exec safaridesk-postgres psql -U postgres -d safaridesk -tA -c "SELECT 1 FROM pg_roles WHERE rolname = '$role'"
    if ($LASTEXITCODE -ne 0) { throw "Could not inspect PostgreSQL roles." }
    if ([string]$roleExists -ne '1') {
      docker exec safaridesk-postgres psql -U postgres -d safaridesk -v ON_ERROR_STOP=1 -c "CREATE ROLE $role LOGIN"
      if ($LASTEXITCODE -ne 0) { throw "Could not create PostgreSQL role $role." }
    }
  }
  docker exec safaridesk-postgres psql -U postgres -d safaridesk -v ON_ERROR_STOP=1 -c "ALTER ROLE safaridesk_app WITH LOGIN PASSWORD '$($envValues['SAFARIDESK_APP_DB_PASSWORD'])' NOSUPERUSER NOCREATEDB NOCREATEROLE"
  if ($LASTEXITCODE -ne 0) { throw "Could not configure the app database role." }
  docker exec safaridesk-postgres psql -U postgres -d safaridesk -v ON_ERROR_STOP=1 -c "ALTER ROLE safaridesk_mcp WITH LOGIN PASSWORD '$($envValues['SAFARIDESK_MCP_DB_PASSWORD'])' NOSUPERUSER NOCREATEDB NOCREATEROLE"
  if ($LASTEXITCODE -ne 0) { throw "Could not configure the read-only MCP database role." }
  docker exec safaridesk-postgres psql -U postgres -d safaridesk -v ON_ERROR_STOP=1 -c "GRANT CONNECT ON DATABASE safaridesk TO safaridesk_app, safaridesk_mcp; REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE, CREATE ON SCHEMA public TO safaridesk_app; GRANT USAGE ON SCHEMA public TO safaridesk_mcp; ALTER DEFAULT PRIVILEGES FOR ROLE safaridesk_app IN SCHEMA public GRANT SELECT ON TABLES TO safaridesk_mcp;"
  if ($LASTEXITCODE -ne 0) { throw "Could not apply PostgreSQL grants." }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host "PostgreSQL is healthy on 127.0.0.1:5432. The application database role and read-only MCP role are configured."
Write-Host "Start the Python API once to create the schema and bootstrap the configured admin user."
