# Rebuild the CYD firmware on Windows

Install Arduino CLI and use a short Arduino data directory if working from a deep Windows path. The verified build used Arduino CLI 1.3.1, Espressif core 2.0.17, the ESP32 Dev Module, dual-I/O 40 MHz flash, the default partition table and 4 MB flash.

Run these commands from the repository root in PowerShell. They install the build dependencies into the Arduino CLI directories for the current user.

```powershell
$index='https://espressif.github.io/arduino-esp32/package_esp32_index.json'
arduino-cli core update-index --additional-urls $index
arduino-cli core install esp32:esp32@2.0.17 --additional-urls $index
arduino-cli lib install 'Adafruit ILI9341@1.6.2' 'Adafruit ST7735 and ST7789 Library@1.11.0' 'Adafruit GFX Library@1.11.11' 'Adafruit BusIO@1.17.0' 'ArduinoJson@6.21.5' --no-deps
.\hardware\build-board.ps1
```

The script writes two firmware images, their SHA-256 checksums, setup scripts and the guide into **dist/board**. Use **GhostDesk-CYD-2USB.ota.bin** in the desktop wireless updater. For first-time USB installation, use the merged image at **0x0**. It contains the bootloader at 0x1000, partition table at 0x8000, initial OTA data at 0xe000 and application at 0x10000. Keep the default dual-slot partition scheme, update target identifier and paired transport compatible for future wireless releases.

Build the portable desktop ZIP with **package.ps1** and extract its **Ghost Desk** folder into **dist/board** for a combined kit. Include the firmware's third-party notices from the kit or the pinned dependencies. The test **node tests/device-link.mjs** exercises a paired TLS peer, paging, reconnects and chat selection. Physical acceptance requires the matching board, a USB data cable and a 2.4 GHz Wi-Fi network.

LCD SPI uses GPIO 14/12/13 for clock/MISO/MOSI, CS 15, DC 2 and backlight 21. The resistive controller uses CLK 25, DIN 32, DOUT 39, CS 33 and IRQ 36. The firmware keeps networking in its own task so the display can accept touch while a desktop client is opening a chat.
