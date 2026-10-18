# Abre la pantalla de proyección (Chrome en modo app) y OBS con la cámara virtual encendida.
# Mide dónde queda el contenido de la página (sin la barra de título de Chrome), deja ese contenido en 16:9
# y le indica a OBS el recorte exacto, sea cual sea la escala de pantalla de esta PC.
param([string]$url = "https://aixproj3ct-oss.github.io/United-Church-Biblia/proyeccion.html")
$titulo = "Proyección United Church"
$obsDir = "C:\Program Files\obs-studio\bin\64bit"
$escena = Join-Path $env:APPDATA "obs-studio\basic\scenes\Proyectar_tablet.json"
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, PresentationFramework
Add-Type @"
using System; using System.Runtime.InteropServices;
public class Ventana {
  public struct R { public int L, T, Rt, B; }
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out R r, int s);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr z, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr c);
}
"@
# Medir en píxeles reales en cualquier monitor (si no, Windows escala las coordenadas y el recorte sale mal).
[Ventana]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null
function Aviso($t) { [System.Windows.MessageBox]::Show($t, "Proyectar tablet") | Out-Null }
# Chrome propio para la proyección: así sigue dibujando aunque EasyWorship tape la ventana
# (el Chrome normal deja de pintar las ventanas tapadas y OBS recibe una imagen congelada).
$perfil = Join-Path $env:LOCALAPPDATA "ProyectarTablet\Chrome"
$opciones = @("--user-data-dir=`"$perfil`"", "--no-first-run", "--no-default-browser-check",
  "--disable-features=CalculateNativeWinOcclusion", "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding", "--disable-background-timer-throttling")
function EsNuestro($p) { (Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)" -ErrorAction SilentlyContinue).CommandLine -like "*ProyectarTablet*" }
function Buscar { Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq $titulo -and (EsNuestro $_) } | Select-Object -First 1 }
function Marco($h) { $r = New-Object Ventana+R; [Ventana]::DwmGetWindowAttribute($h, 9, [ref]$r, 16) | Out-Null; $r }
function Contenido($h) {
  $raiz = [System.Windows.Automation.AutomationElement]::FromHandle($h)
  $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Document)
  $doc = $raiz.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
  if ($doc) { $doc.Current.BoundingRectangle } else { $null }
}

$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { Aviso "No encontré Google Chrome. Instálalo y vuelve a intentar."; exit 1 }

# Cierra una ventana de proyección abierta con el Chrome normal (versión anterior de este acceso directo).
Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq $titulo -and -not (EsNuestro $_) } | ForEach-Object { $_.CloseMainWindow() | Out-Null }
$p = Buscar
if (-not $p) {
  Start-Process $chrome -ArgumentList ($opciones + @("--app=$url", "--window-size=1280,760", "--window-position=60,60"))
  for ($i = 0; $i -lt 40 -and -not ($p = Buscar); $i++) { Start-Sleep -Milliseconds 500 }
  if (-not $p) { Aviso "No se abrió la ventana de proyección."; exit 1 }
}
$h = $p.MainWindowHandle
# Restaurar si estaba minimizada (OBS no captura ventanas minimizadas) o maximizada (el contenido debe quedar en 16:9).
[Ventana]::ShowWindow($h, 9) | Out-Null
if ([Ventana]::IsZoomed($h)) { [Ventana]::ShowWindow($h, 9) | Out-Null }
Start-Sleep -Milliseconds 800

# Ajusta el alto para que el contenido quede en 16:9 y calcula el recorte.
$recorte = $null
for ($intento = 0; $intento -lt 3; $intento++) {
  $c = Contenido $h
  if (-not $c) { Start-Sleep -Milliseconds 700; continue }
  $alto16x9 = [int][Math]::Round($c.Width * 9 / 16)
  $dif = $alto16x9 - [int][Math]::Round($c.Height)
  if ([Math]::Abs($dif) -gt 1) {
    $w = New-Object Ventana+R; [Ventana]::GetWindowRect($h, [ref]$w) | Out-Null
    [Ventana]::SetWindowPos($h, [IntPtr]::Zero, $w.L, $w.T, $w.Rt - $w.L, $w.B - $w.T + $dif, 0x0014) | Out-Null
    Start-Sleep -Milliseconds 600; continue
  }
  $m = Marco $h
  $recorte = @{ top = [int]($c.Top - $m.T); left = [int]($c.Left - $m.L); right = [int]($m.Rt - $c.Right); bottom = [int]($m.B - $c.Bottom) }
  break
}

# Escribe el recorte en la escena de OBS (solo si cambió; OBS debe estar cerrado para releerla).
$obs = Get-Process obs64 -ErrorAction SilentlyContinue
if ($recorte -and (Test-Path $escena)) {
  $json = Get-Content $escena -Raw -Encoding UTF8 | ConvertFrom-Json
  $item = $json.sources | Where-Object { $_.id -eq "scene" } | ForEach-Object { $_.settings.items } | Select-Object -First 1
  if ($item.crop_top -ne $recorte.top -or $item.crop_left -ne $recorte.left -or $item.crop_right -ne $recorte.right -or $item.crop_bottom -ne $recorte.bottom) {
    if ($obs) {
      # Cierre ordenado (sin forzar): si se fuerza, OBS arranca después en modo seguro y sin cámara.
      taskkill /IM obs64.exe | Out-Null
      for ($i = 0; $i -lt 30 -and (Get-Process obs64 -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 500 }
      if (Get-Process obs64 -ErrorAction SilentlyContinue) { Aviso "Cierra OBS Studio y vuelve a abrir 'Proyectar tablet'."; exit 1 }
      $obs = $null
    }
    $item.crop_top = $recorte.top; $item.crop_left = $recorte.left; $item.crop_right = $recorte.right; $item.crop_bottom = $recorte.bottom
    # Solo ASCII: los acentos van como \uXXXX para que OBS lea bien el título de la ventana.
    $texto = [regex]::Replace(($json | ConvertTo-Json -Depth 20), '[^\x00-\x7F]', { param($c) '\u{0:x4}' -f [int][char]$c.Value })
    [System.IO.File]::WriteAllText($escena, $texto, (New-Object System.Text.UTF8Encoding $false))
  }
}
if (-not $obs) {
  Start-Process (Join-Path $obsDir "obs64.exe") -WorkingDirectory $obsDir -ArgumentList "--startvirtualcam", "--minimize-to-tray", "--disable-shutdown-check", "--collection", "`"Proyectar tablet`"", "--profile", "`"Proyectar tablet`"", "--scene", "Tablet"
}
