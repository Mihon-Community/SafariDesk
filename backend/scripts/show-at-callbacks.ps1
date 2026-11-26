$ErrorActionPreference = "Stop"
$backendDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envPath = Join-Path $backendDir ".env"
if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) { throw "backend/.env is missing." }

$values = @{}
foreach ($line in [IO.File]::ReadAllLines($envPath)) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
    $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
  }
}

$token = $values['WEBHOOK_TOKEN']
$baseUrl = $values['PUBLIC_BASE_URL'].TrimEnd('/')
if ($token.Length -lt 32) { throw "WEBHOOK_TOKEN must contain at least 32 characters." }
if (-not $baseUrl.StartsWith('https://')) { throw "PUBLIC_BASE_URL must be an HTTPS URL." }

Write-Host "These URLs contain WEBHOOK_TOKEN. Copy them into the Africa's Talking Sandbox callback settings; do not share screenshots or logs containing them."
Write-Output "USSD: $baseUrl/api/webhooks/africastalking/ussd?token=$token"
Write-Output "Incoming SMS: $baseUrl/webhook/incoming?token=$token"
Write-Output "SMS delivery reports: $baseUrl/api/webhooks/africastalking/sms-status?token=$token"
