# Instala "Proyectar tablet" en la PC de EasyWorship (se ejecuta una sola vez).
# Instala OBS Studio si falta, deja su configuración lista y crea el acceso directo en el escritorio.
$ErrorActionPreference = "Stop"
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$obsExe = "C:\Program Files\obs-studio\bin\64bit\obs64.exe"

Write-Host "1/3 OBS Studio..."
if (-not (Test-Path $obsExe)) {
  winget install --id OBSProject.OBSStudio -e --silent --accept-package-agreements --accept-source-agreements
  if (-not (Test-Path $obsExe)) { throw "No se pudo instalar OBS Studio. Instálalo desde https://obsproject.com y vuelve a ejecutar este instalador." }
} else { Write-Host "   Ya estaba instalado." }
if (Get-Process obs64 -ErrorAction SilentlyContinue) { throw "Cierra OBS Studio y vuelve a ejecutar el instalador." }

Write-Host "2/3 Configuración de OBS..."
$cfg = Join-Path $env:APPDATA "obs-studio"
New-Item -ItemType Directory -Force (Join-Path $cfg "basic\profiles\Proyectar_tablet"), (Join-Path $cfg "basic\scenes") | Out-Null
Copy-Item (Join-Path $aqui "obs\basic\profiles\Proyectar_tablet\basic.ini") (Join-Path $cfg "basic\profiles\Proyectar_tablet\basic.ini") -Force
Copy-Item (Join-Path $aqui "obs\basic\scenes\Proyectar_tablet.json") (Join-Path $cfg "basic\scenes\Proyectar_tablet.json") -Force

# user.ini: sin asistente inicial, sin confirmación al cerrar, y el perfil y la colección "Proyectar tablet".
$ini = Join-Path $cfg "user.ini"
$valores = [ordered]@{
  "General" = [ordered]@{ "FirstRun" = "true"; "ConfirmOnExit" = "false" }
  "Basic"   = [ordered]@{ "Profile" = "Proyectar tablet"; "ProfileDir" = "Proyectar_tablet"; "SceneCollection" = "Proyectar tablet"; "SceneCollectionFile" = "Proyectar_tablet"; "ConfigOnNewProfile" = "false" }
}
$lineas = [System.Collections.Generic.List[string]]::new()
if (Test-Path $ini) { $lineas.AddRange([string[]](Get-Content $ini -Encoding UTF8)) }
foreach ($sec in $valores.Keys) {
  $ini_sec = $lineas.IndexOf("[$sec]")
  if ($ini_sec -lt 0) { $lineas.Add(""); $lineas.Add("[$sec]"); $ini_sec = $lineas.Count - 1 }
  foreach ($k in $valores[$sec].Keys) {
    $fin = $ini_sec + 1
    while ($fin -lt $lineas.Count -and -not $lineas[$fin].StartsWith("[")) { $fin++ }
    $hallada = $false
    for ($i = $ini_sec + 1; $i -lt $fin; $i++) { if ($lineas[$i] -match "^$k=") { $lineas[$i] = "$k=$($valores[$sec][$k])"; $hallada = $true } }
    if (-not $hallada) { $lineas.Insert($fin, "$k=$($valores[$sec][$k])") }
  }
}
[System.IO.File]::WriteAllLines($ini, $lineas, (New-Object System.Text.UTF8Encoding $true))

Write-Host "3/3 Acceso directo en el escritorio..."
$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Desktop")) "Proyectar tablet.lnk"))
$lnk.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$lnk.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $aqui 'proyectar.ps1')`""
$lnk.IconLocation = "$obsExe,0"
$lnk.Description = "Abre la pantalla de proyección de la tablet y la cámara de OBS para EasyWorship"
$lnk.Save()
Write-Host ""
Write-Host "Listo. Usa el acceso directo 'Proyectar tablet' del escritorio." -ForegroundColor Green
Write-Host "En EasyWorship: Live Video -> 'OBS Virtual Camera'."
