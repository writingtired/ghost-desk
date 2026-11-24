# Ghost Desk v0.1.0 public beta

Ghost Desk shows local Codex, Claude Code and Antigravity activity in a Windows edge dock. The dock runs on its own. A paired ESP32 provides a second touch interface.

| Download | Use |
| --- | --- |
| Ghost-Desk-Windows-x64.zip | Extract the entire ZIP and open Ghost Desk.exe. |
| Ghost-Desk-Wireless-Update-Kit.zip | First installation on a supported dual-USB 2.8-inch ESP32-2432S028R. Extract everything and open START HERE.md. |
| GhostDesk-CYD-2USB.ota.bin | Existing paired board with wireless updates enabled. Choose Update display in Ghost Desk. |
| SHA256SUMS.txt | SHA-256 checksums of the release downloads. |

**Windows** requires Windows 10 or 11 x64 and .NET Framework 4.8. Node is bundled. Use the tray icon for provider and board diagnostics, display preferences and optional sign-in startup.

**Display** firmware v0.1.0 adds persistent orientation, brightness and review flash intensity. A settings change takes effect over the paired local connection. The board confirms the change back to the app.

**Compatibility** depends on the local session formats provided by each desktop client. Antigravity conversation selection uses its English Windows UI. The hardware kit targets the dual-USB board with ST7789 or ILI9341 and resistive touch.