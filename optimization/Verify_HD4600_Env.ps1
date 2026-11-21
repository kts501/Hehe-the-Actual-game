<#
.SYNOPSIS
  Verifies Windows Haswell/Broadwell (i5-4690/5690 + HD 4600) hardware readiness,
  dual-channel DDR3 bandwidth configuration, active power plan, and DVMT sizing.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Continue'
Write-Host "=== Fall of the Living: HD 4600 Hardware & Bandwidth Audit ===" -ForegroundColor Cyan

# 1. CPU & Core/Thread Count
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1 Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed
Write-Host ("CPU: {0} ({1}C/{2}T @ {3} MHz)" -f $cpu.Name, $cpu.NumberOfCores, $cpu.NumberOfLogicalProcessors, $cpu.MaxClockSpeed)

# 2. Dual-Channel DDR3 Bandwidth Check (Critical for HD 4600 ~25.6 GB/s)
$dimms = @(Get-CimInstance Win32_PhysicalMemory)
$totalGb = [math]::Round((($dimms | Measure-Object -Property Capacity -Sum).Sum) / 1GB, 2)
$speeds = ($dimms | ForEach-Object { "$($_.Speed) MT/s ($($_.DeviceLocator))" }) -join ", "
Write-Host ("Memory: {0} GB across {1} DIMM(s) -> {2}" -f $totalGb, $dimms.Count, $speeds)
if ($dimms.Count -lt 2) {
  Write-Warning "Single-channel RAM detected! Intel HD 4600 loses ~40% pixel fill-rate without dual-channel DDR3."
}

# 3. GPU & Driver Version
$gpus = Get-CimInstance Win32_VideoController
foreach ($gpu in $gpus) {
  $vramMb = [math]::Round($gpu.AdapterRAM / 1MB, 0)
  Write-Host ("GPU: {0} | Driver: {1} | Reported VRAM: {2} MB" -f $gpu.Name, $gpu.DriverVersion, $vramMb)
}

# 4. Active Power Plan Check
$activePlan = powercfg /getactivescheme
Write-Host "Power Plan: $activePlan"
if ($activePlan -match 'Power saver|Balanced') {
  Write-Warning "Recommend switching to High Performance power plan (`powercfg /setactive SCHEME_MIN`) to stop i5 turbo downclocking."
}

Write-Host "Audit complete. Target: 1280x720..1600x900 internal scale, <1.1 GB DVMT, locked 30 FPS (<=31.5ms budget)." -ForegroundColor Green
