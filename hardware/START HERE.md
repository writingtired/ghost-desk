# Ghost Desk on the 2.8-inch yellow display

This kit targets a **2.8-inch ESP32-2432S028 / 2432S028R** with the classic ESP32, 4 MB flash and XPT2046 resistive touch. For a former **NMMiner board with USB-C and micro-USB**, start with the preselected **ST7789** profile. NMMiner also supports ILI9341 versions of this board. If the old firmware name or panel label identifies ILI9341, select that profile during setup. Both drivers are in the same binary. The setup utility checks the ESP32 chip and flash size. You confirm the LCD visually. [NMMiner board support](https://github.com/NMminer1024/NMMiner) · [CYD2USB reference configuration](https://github.com/witnessmenow/ESP32-Cheap-Yellow-Display/blob/main/DisplayConfig/CYD2USB/User_Setup.h)

## Update a working Ghost Desk display

1. Extract the whole kit. Start the updated Windows app. If a previous version is running, quit it from its tray menu first.
2. For a display running the original dual-USB Ghost Desk release, connect its USB data cable. Open **Set up board.cmd**, choose **4**, enter its COM port and confirm the upgrade. The utility identifies your paired board, backs up and verifies its old application, and writes only the application. Your Wi-Fi, pairing, display profile and touch calibration stay in place. A new board installed with option 1 from this kit already supports wireless updates.
3. For subsequent releases, power the display and open **Ghost Desk → … → Update display…** or right-click the Ghost Desk tray icon and choose **Update display…**. Click **Choose firmware…**, select the new **GhostDesk-CYD-2USB.ota.bin**, then click **Update display**. Keep the desktop app running and the board powered until Ghost Desk confirms the new firmware after reboot. The same build reports that it is already installed.

The paired PC sends the application over the existing encrypted local Wi-Fi connection. The board writes to its spare firmware slot and checks the image before switching slots. If the transfer stops early, reopen the updater and retry once the display reconnects. The merged **GhostDesk-CYD-2USB.bin** is for first-time USB setup.

## First setup on Windows

1. Extract the **whole kit** to a permanent folder. It contains the firmware, Windows setup utility and a board-compatible copy of the Ghost Desk desktop app. The first flash downloads a checksum-verified Espressif flasher. You can do this without installing Python or Arduino IDE.
2. Open **Device Manager → Ports (COM & LPT)**. Connect **one USB data cable** to the board. Use the connector that makes a new COM port appear. If needed, unplug it and try the other connector. Close any serial monitor using that port. For a board identified as CH340 with a missing driver, use the manufacturer's Windows driver. [WCH CH340/CH341 driver](https://www.wch-ic.com/downloads/CH341SER_EXE.html)
3. Double-click **Set up board.cmd**, choose **1** and enter that COM port. Setup saves all 4 MB of the current miner firmware to **%LOCALAPPDATA%\Ghost Desk\board-backups**, verifies the backup against the board and prints the path. Keep that file for restoring this unit. Type the requested confirmation to flash Ghost Desk. At the display prompt, press **Enter** if the text is readable on a dark background. For a blank or scrambled panel, try **2. ILI9341**. For a readable screen with negative colors, choose the inverted version of the working driver. You can try the profiles over USB before continuing.
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
| White, inverted or offset LCD | Run **3. Adjust display only** over USB. Try the other driver for a blank or garbled screen, or the matching inverted profile for negative colors. The selection persists after power loss. A driver change can prompt fresh touch calibration. If neither driver renders correctly, check the PCB model and panel markings before proceeding. |
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

For manual flashing, **GhostDesk-CYD-2USB.bin** is a merged image with base address **0x0**. SHA-256 is in **firmware.sha256**. After manual flashing, use **3. Adjust display only** if needed, then **2. Pair only**. The full source archive includes the sketch, PC transport, tests and rebuild instructions.
