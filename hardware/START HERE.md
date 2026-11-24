# Ghost Desk on the 2.8-inch yellow display

Use this kit with the DIYmalls **ESP32-2432S028R**, classic ESP32, 4 MB flash, **single micro-USB** connector, ILI9341 LCD and XPT2046 resistive touch. Check your board before flashing. Dual-USB boards, ESP32-S3 models, capacitive-touch models and ST7789 displays can look similar and need their own firmware. [DIYmalls board listing](https://www.diymalls.com/item/FZ5815) · [CYD pin reference](https://github.com/witnessmenow/ESP32-Cheap-Yellow-Display/blob/main/PINS.md)

## First setup on Windows

1. Extract the **whole kit** to a permanent folder. It contains the firmware, Windows setup utility and a board-compatible copy of the Ghost Desk desktop app. The first flash downloads a checksum-verified Espressif flasher. You can do this without installing Python or Arduino IDE.
2. Open **Device Manager → Ports (COM & LPT)**. Connect the board using a **USB data cable**. Note the COM port that appears. Close any serial monitor using that port. For a board identified as CH340 with a missing driver, use the manufacturer's Windows driver. [WCH CH340/CH341 driver](https://www.wch-ic.com/downloads/CH341SER_EXE.html)
3. Double-click **Set up board.cmd**. Choose **1** and enter that COM port. Setup checks for a classic ESP32 with 4 MB flash, backs up all 4 MB to **%LOCALAPPDATA%\Ghost Desk\board-backups**, and shows the backup path. Type the requested confirmation to replace the firmware. Leave the data cable connected through pairing.
4. Confirm or enter your **2.4 GHz Wi-Fi network name** and enter the password at the hidden prompt. A shared 2.4/5 GHz SSID works when the router offers a compatible 2.4 GHz personal network. The PC may use Ethernet or 5 GHz on the same LAN. The utility sends these settings and a random pairing key over USB. The board remembers them after it loses power. [ESP32 wireless specifications](https://documentation.espressif.com/esp32_datasheet_en.html)
5. On the screen, tap the **three outer crosshairs and then the center crosshair** with the stylus. Calibration and USB setup can happen in either order. A missed center tap restarts calibration. To recalibrate later, hold the board's **BOOT** button for two seconds while the firmware is running.
6. Keep Ghost Desk open on your PC. Setup reuses the board-compatible app or launches **Ghost Desk\Ghost Desk.exe** from the kit. If it finds an older instance, choose **Quit Ghost Desk** from its tray menu, then launch the included executable. Once the display shows your chats, USB is needed only for power or reconfiguration. A USB wall supply works.

## Using the display

The board refreshes about every two seconds while connected. **Current** uses the dock's priorities, including pins, waits, work in progress and turns ready to review. Each page holds four chats. Use **All chats** to include quiet conversations, and **Prev / Next** to change pages. The view and page selection are independent on the board and PC.

Tap a chat row to open it on your computer. For an ambiguous Antigravity title, the display tells you to finish selection in the desktop picker. Provider tints and ghost faces follow the desktop artwork. The small LCD font abbreviates long text and substitutes unsupported characters. The full chat ID travels with the tap.

## If the board does not connect

| What you see | What to do |
| --- | --- |
| No new COM port | Try another known data cable and USB port. Check Device Manager with the board unplugged and plugged in. |
| Flasher stays at Connecting | Hold BOOT, tap and release RESET (EN), then release BOOT once the flasher connects. Tap RESET with BOOT released to return to normal operation. [Espressif boot-mode guide](https://docs.espressif.com/projects/esptool/en/latest/esp32/advanced-topics/boot-mode-selection.html) |
| Joining Wi-Fi | Check the SSID, password and 2.4 GHz personal-network setting. Run **Set up board.cmd → 2. Pair only** to change credentials without reflashing. Enterprise logins and captive portals require a different setup. |
| Waiting for PC | Open the updated desktop app and keep the PC awake. The board shows its IP here. Put both devices on the same LAN and check guest/client isolation or a VPN that blocks local access. |
| Worked before a router change | Ghost Desk tries the saved address and the board's local hostname. If local name resolution is unavailable and DHCP changed the address, run **Pair only** again. A DHCP reservation for the board also works. |
| White, inverted or offset LCD | Check the printed board revision and connector layout. This image targets the single-micro-USB ILI9341 variant. |
| No current work | Tap **All chats**. If that list is empty too, check the desktop panel's live list. |

For connection diagnostics on the PC, open [Ghost Desk board status](http://127.0.0.1:43821/v1/board). A connected board reports `"connected":true`. The PC initiates an encrypted TLS 1.2 connection to TCP 43822 on the board. This design works with the desktop bridge bound to loopback. Keep router port forwarding disabled for this local service.

## Re-pairing, sharing and recovery

Choose **Pair only** when changing Wi-Fi or pairing to another Windows PC. Pairing replaces the board's saved key. The Wi-Fi password resides in board flash. Windows saves its per-user pairing file at **%LOCALAPPDATA%\Ghost Desk\board-v1.json**. Share the original kit ZIP. Keep personal pairing files and flash backups private.

To restore the original firmware to the **same board**, close the setup utility and serial monitors. Open PowerShell, substitute your COM number and the exact backup path printed during setup, and run these lines. The last command replaces the board's entire flash with that backup.

```powershell
$tool = (Get-ChildItem "$env:LOCALAPPDATA\Ghost Desk\tools\esptool-4.5.1" -Recurse -Filter esptool.exe | Select-Object -First 1).FullName
$port = 'COM5'
$backup = 'C:\path\to\before-GhostDesk-your-backup.bin'
& $tool --chip esp32 --port $port --baud 460800 write_flash 0x0 $backup
```

For manual flashing, **GhostDesk-CYD-ILI9341.bin** is a merged image with base address **0x0**. SHA-256 is in **firmware.sha256**. After manual flashing, run **Pair only**. The full source archive includes the sketch, PC transport, tests and rebuild instructions.
