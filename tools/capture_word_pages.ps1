param(
    [Parameter(Mandatory = $true)]
    [string]$DocPath,

    [Parameter(Mandatory = $true)]
    [string]$OutputDir
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class NativeWindowCapture
{
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll")]
    public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
}
"@

$resolvedDoc = (Resolve-Path $DocPath).Path
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$word = $null
$document = $null

try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $true
    $word.DisplayAlerts = 0
    $word.WindowState = 0
    $word.Left = 0
    $word.Top = 0
    $word.Width = 900
    $word.Height = 900

    $document = $word.Documents.Open($resolvedDoc, $false, $true, $false)
    $word.ActiveWindow.View.Type = 3
    $word.ActiveWindow.View.Zoom.PageFit = 1
    $pageCount = $document.ComputeStatistics(2)

    $word.Activate()
    $shell = New-Object -ComObject WScript.Shell
    $shell.SendKeys("{ESC}")
    Start-Sleep -Milliseconds 1200

    $hwnd = [IntPtr]$word.ActiveWindow.Hwnd
    $rect = New-Object NativeWindowCapture+RECT
    [NativeWindowCapture]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
    $captureWidth = [Math]::Max(100, $rect.Right - $rect.Left)
    $captureHeight = [Math]::Max(100, $rect.Bottom - $rect.Top)
    $paths = New-Object System.Collections.Generic.List[string]

    for ($page = 1; $page -le $pageCount; $page++) {
        $word.Selection.GoTo(1, 1, $page) | Out-Null
        $shell.SendKeys("{ESC}")
        Start-Sleep -Milliseconds 450

        $bitmap = New-Object System.Drawing.Bitmap($captureWidth, $captureHeight)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $hdc = $graphics.GetHdc()
        [NativeWindowCapture]::PrintWindow($hwnd, $hdc, 0) | Out-Null
        $graphics.ReleaseHdc($hdc)

        $pagePath = Join-Path $OutputDir ("page-{0:D2}.png" -f $page)
        $bitmap.Save($pagePath, [System.Drawing.Imaging.ImageFormat]::Png)
        $graphics.Dispose()
        $bitmap.Dispose()
        $paths.Add($pagePath) | Out-Null
    }

    $columns = 3
    $thumbWidth = 360
    $thumbHeight = 280
    $rows = [Math]::Ceiling($pageCount / $columns)
    $sheetWidth = $columns * $thumbWidth
    $sheetHeight = $rows * $thumbHeight
    $sheet = New-Object System.Drawing.Bitmap($sheetWidth, $sheetHeight)
    $sheetGraphics = [System.Drawing.Graphics]::FromImage($sheet)
    $sheetGraphics.Clear([System.Drawing.Color]::White)
    $font = New-Object System.Drawing.Font("Arial", 11, [System.Drawing.FontStyle]::Bold)
    $brush = [System.Drawing.Brushes]::Black

    for ($index = 0; $index -lt $paths.Count; $index++) {
        $img = [System.Drawing.Image]::FromFile($paths[$index])
        $col = $index % $columns
        $row = [Math]::Floor($index / $columns)
        $x = $col * $thumbWidth
        $y = $row * $thumbHeight
        $sheetGraphics.DrawString(("Page {0}" -f ($index + 1)), $font, $brush, $x + 10, $y + 8)

        $availableWidth = $thumbWidth - 20
        $availableHeight = $thumbHeight - 38
        $scale = [Math]::Min($availableWidth / $img.Width, $availableHeight / $img.Height)
        $drawWidth = [int]($img.Width * $scale)
        $drawHeight = [int]($img.Height * $scale)
        $drawX = $x + [int](($thumbWidth - $drawWidth) / 2)
        $drawY = $y + 30
        $sheetGraphics.DrawImage($img, $drawX, $drawY, $drawWidth, $drawHeight)
        $img.Dispose()
    }

    $contactSheet = Join-Path $OutputDir "contact-sheet.png"
    $sheet.Save($contactSheet, [System.Drawing.Imaging.ImageFormat]::Png)
    $sheetGraphics.Dispose()
    $sheet.Dispose()
    $font.Dispose()

    Write-Output ("pages=" + $pageCount)
    Write-Output $contactSheet
}
finally {
    if ($document) {
        $document.Close($false)
    }
    if ($word) {
        $word.Quit()
    }
}
