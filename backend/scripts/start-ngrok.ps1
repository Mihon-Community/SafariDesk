$ErrorActionPreference = "Stop"

$backendDir = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $backendDir ".env"
if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
  throw "Create backend/.env from backend/.env.example, then set PUBLIC_BASE_URL."
}

$publicBaseUrl = ""
foreach ($line in Get-Content -LiteralPath $envFile) {
  if ($line -match '^\s*PUBLIC_BASE_URL\s*=(.*)$') {
    $publicBaseUrl = $Matches[1].Trim().Trim('"').Trim("'")
    break
  }
}
if (-not $publicBaseUrl) { throw "Set PUBLIC_BASE_URL in backend/.env to your ngrok HTTPS origin." }

try { $publicUri = [Uri]$publicBaseUrl } catch { throw "PUBLIC_BASE_URL must be a valid HTTPS origin." }
if ($publicUri.Scheme -ne "https" -or $publicUri.AbsolutePath -ne "/" -or $publicUri.Query -or $publicUri.Fragment -or $publicUri.UserInfo) {
  throw "PUBLIC_BASE_URL must be an HTTPS origin with no path, query, fragment, or credentials."
}

$ngrok = Get-Command ngrok -CommandType Application -ErrorAction SilentlyContinue
if (-not $ngrok) {
  throw "ngrok CLI is unavailable. Install it from https://download.ngrok.com/windows and authenticate it, then rerun this script."
}

# Forward the website through Next.js. Next serves invitation links and rewrites
# API/callback requests to FastAPI on port 3001. Callback authentication uses
# the explicit query token from the configured Africa's Talking callback URL.
$endpointUrl = $publicUri.GetLeftPart([System.UriPartial]::Authority)
Write-Host "Starting ngrok for localhost:3002 (Next.js; API rewrites to 3001). Press Ctrl+C to stop."
& $ngrok.Source http 3002 --url $endpointUrl
if ($LASTEXITCODE -ne 0) { throw "ngrok exited with code $LASTEXITCODE. Confirm the CLI is installed and authenticated." }
