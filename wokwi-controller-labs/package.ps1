$ErrorActionPreference = 'Stop'
foreach ($role in @('flow', 'bay')) {
    $assetFolder = Join-Path $PSScriptRoot "../parking-prototype/public/controller-labs/$role"
    $sourceFiles = Get-ChildItem -LiteralPath $assetFolder -File | Where-Object { $_.Extension -in '.ino', '.json', '.c' } | Select-Object -ExpandProperty FullName
    Compress-Archive -LiteralPath $sourceFiles -DestinationPath (Join-Path $assetFolder 'source.zip') -Force
}
