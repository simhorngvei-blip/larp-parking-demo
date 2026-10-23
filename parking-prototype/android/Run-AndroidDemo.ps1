param(
    [ValidateSet('user','guard')][string]$Role = 'user',
    [string]$SdkPath = "$env:LOCALAPPDATA\Android\Sdk",
    [string]$JdkPath = $env:JAVA_HOME,
    [ValidatePattern('^[A-Za-z0-9_.-]+$')][string]$AvdName = 'Pixel_8',
    [ValidateRange(1024,65535)][int]$AdbPort = 5038,
    [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$androidRoot = $PSScriptRoot
$productRoot = Split-Path (Split-Path $androidRoot -Parent) -Parent
$evidence = Join-Path $productRoot 'parking-prototype\artifacts\android'
New-Item -ItemType Directory -Force $evidence | Out-Null
$adb = Join-Path $SdkPath 'platform-tools\adb.exe'
$emulator = Join-Path $SdkPath 'emulator\emulator.exe'
if (!(Test-Path -LiteralPath $adb)) { throw "Android SDK not found at $SdkPath. Pass -SdkPath from Android Studio SDK Manager." }
if (!$JdkPath) {
    $installed = Get-ChildItem (Join-Path $productRoot 'tools\android-jdk') -Directory -ErrorAction SilentlyContinue | Where-Object {Test-Path (Join-Path $_.FullName 'bin\jlink.exe')} | Select-Object -First 1
    if ($installed) { $JdkPath = $installed.FullName }
}
if (!$SkipBuild -and (!$JdkPath -or !(Test-Path -LiteralPath (Join-Path $JdkPath 'bin\jlink.exe')))) {
    throw 'A complete JDK 17+ with jlink is required. Set JAVA_HOME or pass -JdkPath. A stripped IDE runtime is insufficient.'
}
try { $response = Invoke-WebRequest 'http://127.0.0.1:8080/api/public/demo-profiles' -UseBasicParsing -TimeoutSec 10; if ($response.StatusCode -ne 200) {throw 'API unavailable'} }
catch { throw 'Start the LARP Docker demo on localhost:8080 first. See the product BEGINNER_START_HERE.md.' }
$saved = @{}
foreach ($name in @('JAVA_HOME','ANDROID_HOME','ADB_SERVER_SOCKET','ANDROID_ADB_SERVER_PORT','ADB_VENDOR_KEYS')) { $saved[$name] = [Environment]::GetEnvironmentVariable($name,'Process') }
try {
    if ($JdkPath) { $env:JAVA_HOME = $JdkPath }
    $env:ANDROID_HOME = $SdkPath
    $env:ADB_SERVER_SOCKET = "tcp:localhost:$AdbPort"
    $env:ANDROID_ADB_SERVER_PORT = "$AdbPort"
    $key = Join-Path $env:USERPROFILE '.android\adbkey'
    if (Test-Path -LiteralPath $key) { $env:ADB_VENDOR_KEYS = $key }
    if (!$SkipBuild) {
        Push-Location $androidRoot
        try { & '.\gradlew.bat' --no-daemon --console plain ("assemble" + (Get-Culture).TextInfo.ToTitleCase($Role) + "Debug"); if ($LASTEXITCODE) {throw 'Android debug build failed'} }
        finally { Pop-Location }
    }
    $apk = Join-Path $androidRoot "app\build\outputs\apk\$Role\debug\app-$Role-debug.apk"
    if (!(Test-Path -LiteralPath $apk)) {throw 'Debug APK missing. Run without -SkipBuild first.'}
    & $adb -P $AdbPort start-server
    $deviceLine = (& $adb -P $AdbPort devices) | Where-Object {$_ -match '^emulator-\d+\s+device$'} | Select-Object -First 1
    if (!$deviceLine) {
        $booting = (& $adb -P $AdbPort devices) | Where-Object {$_ -match '^emulator-\d+\s+'}
        if (!$booting) {
            Start-Process -FilePath $emulator -ArgumentList "@$AvdName",'-no-snapshot-load','-no-snapshot-save','-no-boot-anim','-memory','2048','-cores','2','-gpu','swiftshader' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $evidence 'launcher-emulator.log') -RedirectStandardError (Join-Path $evidence 'launcher-emulator-errors.log') | Out-Null
        }
        $deadline = (Get-Date).AddSeconds(240)
        do {
            Start-Sleep -Seconds 2
            $deviceLine = (& $adb -P $AdbPort devices) | Where-Object {$_ -match '^emulator-\d+\s+device$'} | Select-Object -First 1
        } until ($deviceLine -or (Get-Date) -gt $deadline)
    }
    if (!$deviceLine) {throw 'Emulator not authorized/ready. See Android README; do not wipe your AVD or kill another application''s ADB server.'}
    $serial = ($deviceLine -split '\s+')[0]
    $deadline = (Get-Date).AddSeconds(180)
    do { $boot = (& $adb -P $AdbPort -s $serial shell getprop sys.boot_completed 2>$null); if ($boot -eq '1') {break}; Start-Sleep -Seconds 2 } until ((Get-Date) -gt $deadline)
    if ($boot -ne '1') {throw 'Emulator did not finish booting within the timeout'}
    & $adb -P $AdbPort -s $serial reverse tcp:8080 tcp:8080
    if ($LASTEXITCODE) {throw 'ADB reverse failed'}
    & $adb -P $AdbPort -s $serial install -r $apk
    if ($LASTEXITCODE) {throw 'APK install failed'}
    $component = if ($Role -eq 'guard') {'com.larp.guard/com.larp.parking.MainActivity'} else {'com.larp.parking/.MainActivity'}
    & $adb -P $AdbPort -s $serial shell am start -n $component
    if ($LASTEXITCODE) {throw 'App launch failed'}
    Write-Host "LARP user demo launched on $serial. Private ADB port: $AdbPort. Host server: localhost:8080."
} finally {
    foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name,$saved[$name],'Process') }
}
