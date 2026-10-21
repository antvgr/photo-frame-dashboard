$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here
$ErrorActionPreference = 'Continue'
$root = $repo
$kiosk = "$root\dashboard\kiosk"
$sdk = "$root\android-build\sdk"
$bt = "$sdk\build-tools\34.0.0"
$jar = "$sdk\platforms\android-34\android.jar"
$env:JAVA_HOME = (Get-ChildItem "$root\android-build\jdk" -Directory | Select-Object -First 1).FullName
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$out = "$root\android-build\kiosk-build"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force "$out\gen", "$out\classes" | Out-Null
Set-Location $kiosk

& "$bt\aapt2.exe" compile --dir res -o "$out\res.zip"
& "$bt\aapt2.exe" link -o "$out\base.apk" -I $jar --manifest AndroidManifest.xml "$out\res.zip" --java "$out\gen" --min-sdk-version 23 --target-sdk-version 23 --version-code 1 --version-name 1.0
$src = @(Get-ChildItem src -Recurse -Filter *.java | ForEach-Object FullName) + (Get-ChildItem "$out\gen" -Recurse -Filter R.java | ForEach-Object FullName)
& javac -nowarn -source 8 -target 8 -classpath $jar -d "$out/classes" $src 2>&1 | Out-Null; if (-not (Test-Path "$out/classes/com/wesbos/homehq/MainActivity.class")) { throw "javac failed" }
$classes = Get-ChildItem "$out\classes" -Recurse -Filter *.class | ForEach-Object FullName
& "$bt\d8.bat" --min-api 23 --lib $jar --output $out @classes

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open("$out\base.apk", 'Update')
[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, "$out\classes.dex", 'classes.dex') | Out-Null
$zip.Dispose()

& "$bt\zipalign.exe" -f 4 "$out\base.apk" "$out\aligned.apk"
$ks = "$root\android-build\debug.keystore"
if (-not (Test-Path $ks)) {
  & keytool -genkeypair -keystore $ks -storepass android -keypass android -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US" | Out-Null
}
& "$bt\apksigner.bat" sign --ks $ks --ks-pass pass:android --key-pass pass:android --out "$out\homehq.apk" "$out\aligned.apk"
Get-Item "$out\homehq.apk" | Select-Object FullName, Length
