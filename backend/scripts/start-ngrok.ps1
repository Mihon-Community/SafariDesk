$ErrorActionPreference = "Stop"

$backendDir = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $backendDir ".env"
if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
  throw "Create backend/.env from backend/.env.example, then set PUBLIC_BASE_URL and WEBHOOK_TOKEN."
}

function Read-DotEnvValue([string]$Name) {
  foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match "^\s*$([regex]::Escape($Name))\s*=(.*)$") {
      $value = $Matches[1].Trim()
      if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      return $value
    }
  }
  return ""
}

$publicBaseUrl = Read-DotEnvValue "PUBLIC_BASE_URL"
$webhookToken = Read-DotEnvValue "WEBHOOK_TOKEN"
if (-not $publicBaseUrl) { throw "Set PUBLIC_BASE_URL in backend/.env to your reserved ngrok HTTPS origin." }
if ([System.Text.Encoding]::UTF8.GetByteCount($webhookToken) -lt 32) { throw "Set WEBHOOK_TOKEN in backend/.env to a locally generated value of at least 32 bytes." }

try { $publicUri = [Uri]$publicBaseUrl } catch { throw "PUBLIC_BASE_URL must be a valid HTTPS origin." }
if ($publicUri.Scheme -ne "https" -or $publicUri.AbsolutePath -ne "/" -or $publicUri.Query -or $publicUri.Fragment -or $publicUri.UserInfo) {
  throw "PUBLIC_BASE_URL must be an HTTPS origin with no path, query, fragment, or credentials."
}

$ngrok = Get-Command ngrok -CommandType Application -ErrorAction SilentlyContinue
if (-not $ngrok) {
  throw "ngrok CLI is unavailable. Install it from https://download.ngrok.com/windows and authenticate it, then rerun this script."
}

# The header is deliberately attached only to the DLR API route. AT's incoming
# SMS and USSD callbacks authenticate with their own query token.
$policy = @{
  on_http_request = @(
    @{
      expressions = @('req.url.path.startsWith("/api/webhooks/africastalking/")')
      actions = @(
        @{
          type = "add-headers"
          config = @{ headers = @{ "x-webhook-token" = $webhookToken } }
        }
      )
    }
  )
} | ConvertTo-Json -Depth 10

$policyFile = Join-Path ([System.IO.Path]::GetTempPath()) ("safaridesk-ngrok-policy-{0}.json" -f [Guid]::NewGuid().ToString("N"))
$endpointUrl = $publicUri.GetLeftPart([System.UriPartial]::Authority)
try {
  # Windows PowerShell's `-Encoding utf8` writes a BOM, which ngrok rejects
  # when parsing its traffic policy as JSON. Write UTF-8 without a BOM.
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($policyFile, $policy, $utf8NoBom)
  Write-Host "Starting ngrok for localhost:3001. Press Ctrl+C to stop; the temporary policy file will be removed."
  & $ngrok.Source http 3001 --url $endpointUrl --traffic-policy-file $policyFile
  if ($LASTEXITCODE -ne 0) { throw "ngrok exited with code $LASTEXITCODE. Confirm the CLI is installed and authenticated." }
} finally {
  if (Test-Path -LiteralPath $policyFile) { Remove-Item -LiteralPath $policyFile -Force }
}
