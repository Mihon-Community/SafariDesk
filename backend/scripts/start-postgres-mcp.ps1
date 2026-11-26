$ErrorActionPreference = "Stop"
$backendDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envFile = Join-Path $backendDir ".env"
if (-not (Test-Path -LiteralPath $envFile)) { throw "backend/.env is missing." }
$mcpLine = [IO.File]::ReadAllLines($envFile) | Where-Object { $_ -match '^MCP_DATABASE_URL=' } | Select-Object -First 1
if (-not $mcpLine) { throw "MCP_DATABASE_URL is missing. Run scripts/prepare-postgres.ps1 first." }
$env:POSTGRES_MCP_CONNECTION_STRING = $mcpLine.Substring('MCP_DATABASE_URL='.Length).Trim().Trim('"').Trim("'")
$env:POSTGRES_MCP_PROFILE_NAME = "safaridesk_local"
$env:POSTGRES_MCP_DISABLE_KEYRING = "1"
$env:POSTGRES_MCP_DISABLE_CWD_ACCESS = "1"
Set-Location $backendDir
$mcpCommand = Join-Path $backendDir "mcp\node_modules\.bin\postgres-mcp.cmd"
if (-not (Test-Path -LiteralPath $mcpCommand)) {
  throw "Postgres MCP is not installed. Run npm.cmd install --prefix mcp from backend/."
}
& $mcpCommand run --no-telemetry
exit $LASTEXITCODE
