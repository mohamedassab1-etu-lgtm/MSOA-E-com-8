@'
$ErrorActionPreference = "Stop"

# branch -> folder
$map = [ordered]@{
  "auth"      = "MSOA-E-com-auth-service"
  "catalog"   = "MSOA-E-com-catalog-service"
  "inventory" = "MSOA-E-com-inventory-service"
  "orders"    = "MSOA-E-com-orders-service"
  "payments"  = "MSOA-E-com-payments-service"
  "shipping"  = "MSOA-E-com-shipping-service"
}

function Run-Git {
  & git @args
  if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') failed" }
}

if (git status --porcelain) {
  Write-Host "Working tree not clean. Commit or stash first." -ForegroundColor Red
  exit 1
}

Run-Git fetch origin

foreach ($branch in $map.Keys) {
  $folder = $map[$branch]
  Write-Host "=== $branch ($folder) ===" -ForegroundColor Cyan

  Run-Git checkout $branch
  Run-Git pull origin $branch

  git rm -r -q --ignore-unmatch $folder
  Run-Git checkout origin/main -- $folder

  git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) {
    Run-Git commit -m "fix($branch): sync $folder from main"
    Run-Git push origin $branch
  } else {
    Write-Host "Nothing to sync for $branch" -ForegroundColor Yellow
  }
}

Run-Git checkout main
Write-Host "Done." -ForegroundColor Green
'@ | Set-Content -Encoding UTF8 .\sync.ps1