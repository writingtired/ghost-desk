# Firmware dependencies

The build uses these upstream versions. The kit's **notices** directory includes notices from the installed display and JSON libraries. The Windows runtime includes its license under **Ghost Desk/runtime**.

| Component | Version and upstream source |
| --- | --- |
| Espressif Arduino core and bundled ESP-IDF SDK | [arduino-esp32 2.0.17](https://github.com/espressif/arduino-esp32/tree/2.0.17) |
| Adafruit ILI9341 driver | [1.6.2](https://github.com/adafruit/Adafruit_ILI9341/tree/1.6.2) |
| Adafruit GFX | [1.11.11](https://github.com/adafruit/Adafruit-GFX-Library/tree/1.11.11) |
| Adafruit BusIO | [1.17.0](https://github.com/adafruit/Adafruit_BusIO/tree/1.17.0) |
| ArduinoJson | [6.21.5](https://github.com/bblanchon/ArduinoJson/tree/v6.21.5) |
| Espressif USB flasher, fetched by Windows setup | [esptool 4.5.1](https://github.com/espressif/esptool/tree/v4.5.1) |

The board firmware source and the host-side board transport are in the accompanying source archive.
