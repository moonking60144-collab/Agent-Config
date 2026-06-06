# 環境 Profile（範本）

> 機器特定設定。這份是 **MSI Katana（原始開發機）** 的實際內容，當範例參考。
> 換新機器時，`deploy.ps1` 會探測該機硬體，自動生成 `~/.claude/profile.md` 取代本內容。
> 也可直接手動編輯 `~/.claude/profile.md`。本檔（`profile.example.md`）只是範本，不會被 Claude Code 載入。

## Hardware
- **型號**：MSI Katana 17 HX B14WFK（筆電）
- **CPU**：Intel Core i7-14650HX（16 核 / 24 執行緒）
- **RAM**：24 GB
- **GPU**：NVIDIA GeForce RTX 5060 Laptop GPU（8 GB VRAM）+ Intel UHD Graphics
- **螢幕**：17 吋（CSO1702 面板）
- **硬碟**：C: 總容量 925 GB（可用空間隨用量變動，需要時用 System Info 的指令即時探測，勿引用快照值）
- **Wi-Fi**：Intel Wi-Fi 6E AX211

## OS & Shell
- **OS**：Windows 11 Home（10.0.26200）64-bit
- **Claude Code 預設 Shell**：PowerShell（使用 PowerShell 語法）
- **PowerShell**：5.1（內建）／ 7.6.0（獨立安裝）
- **WSL**：Ubuntu 24.04（WSL2）

## Dev Tools & Versions
| Tool    | Version        | Path                                      |
|---------|----------------|-------------------------------------------|
| Git     | 2.53.0         | C:\Program Files\Git\                     |
| Node.js | v24.14.1       | C:\Program Files\nodejs\                  |
| Python  | 3.13.12        | WindowsApps (Store)                       |
| .NET    | —              | C:\Program Files\dotnet\                  |
| VS Code | —              | AppData\Local\Programs\Microsoft VS Code\ |

## Package Managers
- `winget` — Windows 套件管理（推薦用於安裝/移除軟體）
- `npm` — Node.js 套件
- `pip` — Python 套件

## NVIDIA
- **驅動版本**：596.21
- **VRAM**：8 GB
- 查詢 GPU 狀態：`nvidia-smi`
- NVIDIA Control Panel 是 UWP 應用（PackageFamily: `NVIDIACorp.NVIDIAControlPanel_56jybvy8sckqj`）

---

## Commonly Used Commands

### UWP App Shortcut Repair
UWP 捷徑圖示消失時，重建捷徑的 PowerShell 模板：
```powershell
# 1. 找到 app 資訊
Get-AppxPackage -Name '*關鍵字*' | Select-Object Name, InstallLocation, PackageFamilyName

# 2. 取得 AppId
Get-AppxPackage -Name '套件名' | ForEach-Object { [xml]$m = Get-AppxPackageManifest $_; $m.Package.Applications.Application } | Select-Object Id, Executable

# 3. 建立捷徑
$WshShell = New-Object -comObject WScript.Shell
$sc = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\名稱.lnk")
$sc.TargetPath = 'explorer.exe'
$sc.Arguments = 'shell:AppsFolder\PackageFamilyName!AppId'
$sc.IconLocation = '安裝路徑\app.exe,0'
$sc.Save()

# 4. 刷新圖示快取
ie4uinit.exe -show
```

### System Info
```powershell
# GPU 狀態
nvidia-smi

# 磁碟空間
Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object DeviceID, @{N='SizeGB';E={[math]::Round($_.Size/1GB)}}, @{N='FreeGB';E={[math]::Round($_.FreeSpace/1GB)}}

# 已安裝的 UWP 應用
Get-AppxPackage | Select-Object Name, Version | Sort-Object Name

# WSL
wsl -l -v
```

### Software Management
```powershell
# 安裝軟體
winget install <package>

# 移除軟體
winget uninstall <package>

# 搜尋軟體
winget search <keyword>
```
