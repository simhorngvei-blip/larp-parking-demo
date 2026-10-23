$ErrorActionPreference='Stop'
$assetFolder=Join-Path $PSScriptRoot '../parking-prototype/public/controller-labs/bollard'
$sourceFiles=@('sketch.ino','control.h','diagram.json','bollard.chip.c','bollard.chip.json','README.md') | ForEach-Object {Join-Path $assetFolder $_}
Compress-Archive -LiteralPath $sourceFiles -DestinationPath (Join-Path $assetFolder 'source.zip') -Force
