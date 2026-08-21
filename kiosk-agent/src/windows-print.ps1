param(
  [ValidateSet('list', 'status', 'print')]
  [string]$Action,
  [string]$PrinterName,
  [string]$FilePath,
  [ValidateRange(1, 10)]
  [string]$Copies = '1',
  [string]$PaperSize = 'Instax Mini (54 × 86 mm)',
  [ValidateSet('portrait', 'landscape')]
  [string]$Orientation = 'portrait'
)

$ErrorActionPreference = 'Stop'

function Get-PrinterReport($Printer) {
  $state = "$($Printer.PrinterStatus) $($Printer.PrinterState) $($Printer.QueueStatus)"
  $offline = [bool]$Printer.WorkOffline -or $state -match 'Offline|Error|Paused|NotAvailable|PaperOut|DoorOpen|Unknown'
  [PSCustomObject]@{
    name = $Printer.Name
    status = if ($offline) { 'OFFLINE' } else { 'READY' }
    driver_name = $Printer.DriverName
    port_name = $Printer.PortName
  }
}

try {
  if ($Action -eq 'list') {
    $reports = @(Get-Printer | ForEach-Object { Get-PrinterReport $_ })
    if ($reports.Count -eq 0) { Write-Output '[]' }
    else { $reports | ConvertTo-Json -Compress }
    exit 0
  }

  if ([string]::IsNullOrWhiteSpace($PrinterName)) { throw 'PRINTER_NOT_CONFIGURED' }
  $printer = Get-Printer -Name $PrinterName -ErrorAction Stop
  $report = Get-PrinterReport $printer

  if ($Action -eq 'status') {
    $report | ConvertTo-Json -Compress
    exit 0
  }

  if ($Action -eq 'print') {
    if ($report.status -ne 'READY') { Write-Error 'PRINTER_OFFLINE'; exit 3 }
    if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) { throw 'IMAGE_FILE_NOT_FOUND' }

    Add-Type -AssemblyName System.Drawing
    $document = New-Object System.Drawing.Printing.PrintDocument
    $document.PrinterSettings.PrinterName = $PrinterName
    if (-not $document.PrinterSettings.IsValid) { Write-Error 'PRINTER_NOT_FOUND'; exit 2 }
    $document.PrinterSettings.Copies = [int16]$Copies
    $document.DefaultPageSettings.Landscape = ($Orientation -eq 'landscape')

    $paperAliases = @{
      'Instax Mini (54 × 86 mm)' = '2R|4x6|4 x 6|4R|10x15|10 x 15|A4'
      'Polaroid 6 × 9 cm (2R)' = '2R|4x6|4 x 6|4R|10x15|10 x 15|A4'
      '2 Strip 5 × 15 cm' = 'Strip|5x15|2x6|4x6|4 x 6|4R|10x15|10 x 15|A4'
      '3 Strip 5 × 15 cm' = 'Strip|5x15|2x6|4x6|4 x 6|4R|10x15|10 x 15|A4'
      '4 Strip 5 × 15 cm' = 'Strip|5x15|2x6|4x6|4 x 6|4R|10x15|10 x 15|A4'
      '2×2 Grid 10 × 10 cm' = '4x6|4 x 6|4R|10x15|10 x 15|A4'
      '2×3 Grid 10 × 15 cm' = '4x6|4 x 6|4R|10x15|10 x 15|A4'
    }
    $paper = $document.PrinterSettings.PaperSizes | Where-Object { $_.PaperName -match $paperAliases[$PaperSize] } | Select-Object -First 1
    if ($null -eq $paper) {
      $paper = $document.PrinterSettings.PaperSizes | Where-Object { $_.PaperName -match $paperAliases['4R'] } | Select-Object -First 1
    }
    if ($null -ne $paper) { $document.DefaultPageSettings.PaperSize = $paper }

    $image = [System.Drawing.Image]::FromFile($FilePath)
    try {
      $document.PrintController = New-Object System.Drawing.Printing.StandardPrintController
      $document.add_PrintPage({
        param($sender, $eventArgs)
        $bounds = $eventArgs.PageBounds
        $eventArgs.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $explicitW = $null
        $explicitH = $null
        switch -Regex ($PaperSize) {
            'Instax Mini \(54 × 86 mm\)' { $explicitW = 236; $explicitH = 354 }
            'Polaroid 6 × 9 cm \(2R\)' { $explicitW = 236; $explicitH = 354 }
            '2 Strip 5 × 15 cm' { $explicitW = 197; $explicitH = 591 }
            '3 Strip 5 × 15 cm' { $explicitW = 197; $explicitH = 591 }
            '4 Strip 5 × 15 cm' { $explicitW = 197; $explicitH = 591 }
            '2×2 Grid 10 × 10 cm' { $explicitW = 394; $explicitH = 394 }
            '2×3 Grid 10 × 15 cm' { $explicitW = 394; $explicitH = 591 }
        }

        if ($null -ne $explicitW -and $null -ne $explicitH) {
            if ($image.Width -gt $image.Height) {
                $targetWidth = [Math]::Max($explicitW, $explicitH)
                $targetHeight = [Math]::Min($explicitW, $explicitH)
            } else {
                $targetWidth = [Math]::Min($explicitW, $explicitH)
                $targetHeight = [Math]::Max($explicitW, $explicitH)
            }
        } else {
            $targetDpi = 300.0
            $targetWidth = [int](($image.Width / $targetDpi) * 100)
            $targetHeight = [int](($image.Height / $targetDpi) * 100)
        }

        # Only scale down if the physical size is larger than the paper bounds
        if ($targetWidth -gt $bounds.Width -or $targetHeight -gt $bounds.Height) {
            $scale = [Math]::Min($bounds.Width / $targetWidth, $bounds.Height / $targetHeight)
            $targetWidth = [int]($targetWidth * $scale)
            $targetHeight = [int]($targetHeight * $scale)
        }

        $x = $bounds.X + [int](($bounds.Width - $targetWidth) / 2)
        if (($bounds.Height - $targetHeight) -gt 200) {
            $y = $bounds.Y + 50 # 0.5 inch from top if printed on A4/large paper
        } else {
            $y = $bounds.Y + [int](($bounds.Height - $targetHeight) / 2)
        }
        
        $eventArgs.Graphics.DrawImage($image, $x, $y, $targetWidth, $targetHeight)
      })
      $document.Print()
    } finally {
      $image.Dispose()
      $document.Dispose()
    }

    [PSCustomObject]@{
      accepted = $true
      requestId = $null
      printerName = $PrinterName
      copies = $Copies
    } | ConvertTo-Json -Compress
    exit 0
  }

  throw 'INVALID_ACTION'
} catch {
  $message = $_.Exception.Message
  if ($message -match 'Cannot find|not found|does not exist|PRINTER_NOT_FOUND') {
    Write-Error 'PRINTER_NOT_FOUND'
    exit 2
  }
  Write-Error $message
  exit 1
}
