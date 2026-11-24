# Ghost Desk

A Windows edge dock for local Codex, Claude Code in Claude Desktop, and Google Antigravity conversations. Each ghost represents a chat. Its movement shows activity, and its background color identifies the provider. The portable Windows x64 package includes the Node.js runtime.

## Open the panel

1. On 64-bit Windows 10 or 11 with .NET Framework 4.8, extract **Ghost-Desk-Windows-x64.zip**. Open **Ghost Desk.exe** inside the extracted folder. A narrow ghost tab appears at the center of the right screen edge on first launch. The app starts its local bridge in the background.
2. Drag the ghost strip to any monitor and release near its **top, bottom, left, or right** edge. The strip snaps to the nearest edge at the position where you drop it. Top and bottom use a horizontal strip. The dock stays inside the monitor's work area, clear of the taskbar, and remembers its monitor, edge, and position.
3. Click the strip to expand it inward. Drag the **Ghost Desk** heading to move the expanded panel. Click a chat to open it. Choose **Hide** or press **Esc** to collapse it. The strip shows up to nine ghosts. Pinned chats keep their slots, followed by chats waiting for you, working chats and newly completed turns. Click **+N other chats** in the expanded dock to see the rest.
4. Open **···** or right-click the strip to choose an edge or display from a menu. **Hide to tray** hides the entire dock. Double-click the ghost in the Windows notification area to bring it back. **Quit Ghost Desk** closes the app and its bridge together.

You can also open the running panel at **http://127.0.0.1:43821**. Choose **Float ↗** for the browser floating panel or **Preview** for sample chats. The Windows app runs in your signed-in desktop session and listens only on the loopback address. It starts when you launch it.

## Review and navigation

On the Windows strip, expanded sidebar and physical ESP32, a chat ready for review briefly shows a pair of floating eyes on an inverted background. It flashes every five seconds for the first 30 seconds, then every two seconds until reviewed or active again. **Mute alerts** silences the flash for that chat. The Windows animation preference also controls flashing on the sidebar.

Ghost Desk filters Codex's internal Guardian Review sessions before it counts chats, sends notifications or populates the board. It identifies these sessions by their Codex metadata, so a regular conversation can still be named Guardian Review.

A newly observed completion gets **Ready to review**, open eyes and a white corner dot. Open the chat through Ghost Desk or right-click its row and choose **Mark reviewed**. If Antigravity opens its picker for manual selection, the dot stays until you mark that chat reviewed. Chats already idle on first observation start quietly. Each row shows the provider and project below its title. When the client supplies no project, a short chat ID helps distinguish duplicate names.

Right-click a row to **Pin chat** or **Mute alerts**. Pinned ghosts keep their strip positions across restarts. The list holds its order while the pointer is over it. Hover over a ghost to see a preview that opens inward from the edge with its title, project, status and elapsed time.

**Ctrl + Alt + G** opens the oldest chat waiting for input. With no waiting chat it opens the panel. Under **··· → Jump to oldest wait**, choose another shortcut or turn it off. Under **··· → Notify after 30s waiting**, enable Windows notification-area alerts. Alerts start off, respect per-chat mute, and fire once per observed wait. Click a live alert to go to its chat. Windows notification settings govern delivery.

**··· → ESP32 display preview** opens a pixel-resolution simulator in the browser. Pick 240 × 240, 320 × 240 or 480 × 320. Try 5 or 15 sample chats or your live list. Tap a ghost for detail and page through crowded screens. The simulator and Windows dock draw from the same 16 × 16 sprite artwork. Samples stay separate from live chat actions.

![Ghost Desk with sample chats](<Ghost Desk preview.png>)

## Build from source

Use 64-bit Windows with .NET Framework 4.8 and PowerShell. To run from a checkout with Node.js 22.13 or later on PATH, build the executable and launch it from the repository root.

```powershell
.\dock\build.ps1
& '.\Ghost Desk.exe'
```

Run the adapter and activity tests with `node tests/desktop.mjs` and `node tests/activity.mjs`. To produce a self-contained distribution, run `.\package.ps1`. It verifies a pinned official Node.js Windows archive, includes its license, and writes **dist/Ghost-Desk-Windows-x64.zip**. For an offline build, pass the matching archive with `-RuntimeZip`. The Windows GitHub Actions workflow performs the test and build and uploads the ZIP as a workflow artifact.

## Desktop apps

The small tile behind each ghost and the lighter tint across its expanded row identify the provider. Claude and Claude Code use muted clay, Gemini and Antigravity use slate blue, and ChatGPT and Codex use sage green. Hover over a collapsed ghost to see its provider, title, and state.

Start the panel and select **Live**. The bridge reads the apps' existing session metadata on each refresh. Your current Windows account supplies access. No API keys, hooks, or changes to project settings are required.

- **Claude Code** reads the local Windows **Code** tab's conversation titles and matches each desktop chat to its live Claude worker. A busy worker shows **Working**, a waiting worker shows **Needs you**, and idle shows **Available** or **Turn ended**. A click opens the native link for the desktop conversation ID. The CLI worker ID can differ. The list includes open workers and chats active in the past 24 hours. An offline chat with incomplete evidence shows **Status unknown**.
- **Antigravity** reads the local Antigravity App's conversation index in read-only mode. It shows up to 64 top-level conversations updated in the past 24 hours. The app's run state and background-work flag determine **Working** or **Turn ended**. An explicit user-input or approval wait can show **Needs you**. Some approvals only surface inside the app. A click opens the app's **Search Conversations** picker, searches a unique title, and selects its matching result. If titles are ambiguous or Windows cannot expose the result, the panel tells you how to finish the selection. The picker integration uses the English Windows UI. [Antigravity conversation search](https://antigravity.google/docs/search/)
- **Codex** uses the local session reader described below.

The native readers reflect the formats in the installed apps. An app update can change those formats or the accessible controls used to open a conversation. The panel reports source availability in its footer. Each source is independent.

## Optional browser chats

Open **chrome://extensions** or **edge://extensions** in the profile that contains your chats. Turn on **Developer mode**, choose **Load unpacked**, then choose the **browser** folder next to this file. Refresh already-open Claude, Gemini, and ChatGPT tabs once so the observer can read their controls. Repeat for another browser profile as needed. Keep the extension folder in its current location while it is loaded.

The connector reports titles, provider, state, and a hashed route ID to the local bridge. A click activates the matching existing tab and brings its window forward. A provider's new-chat screen can appear as Available. Closed tabs drop out after the next successful snapshot. A sleeping or disconnected browser profile drops out after one minute. The connector uses your existing signed-in browser session. Titles and workspace labels stay in memory. Ghost Desk saves per-chat identity, colors, pins, mute settings and state markers locally under %LOCALAPPDATA%\\Ghost Desk. It uses no account tokens.

## What the states mean

| State | Ghost | Evidence |
| --- | --- | --- |
| Available | Steady, small open eyes | A visible chat composer, with no turn observed yet |
| Working | Bobs, three dots | A local Codex turn started, or a browser generation control is visible |
| Needs you | Shifts sideways, raised exclamation mark | Claude Desktop reports waiting, an explicit Antigravity input wait, or a supported web approval dialog |
| Ready to review | Open eyes, white corner dot | The bridge observed a working or waiting chat finish and the completion is unacknowledged |
| Turn ended | Rests with closed eyes | A Codex completion event, or a previously observed web generation control disappeared and the composer returned |
| Stopped | Dim face, square mouth | A local Codex abort event |
| Status unknown | Gray, question mark | Evidence is missing, outdated, or unrecognized |

An approval or question gets a specific label when the client provides evidence. A generic user wait is labeled Needs you. Elapsed time uses the reported state change or the time Ghost Desk first observed it. Color follows the session ID. Movement, text, and symbols identify the state. Reduced-motion preferences disable animation. A web turn ending can include a user stopping generation. Web observers inspect visible controls and can miss short turns, localized controls, in-chat questions, custom widgets, background work, and changes to provider interfaces. A chat that was already finished when observation began may appear Available.

## Coverage

**Codex desktop** reads recent local rollout logs and the title index under CODEX_HOME or the user's .codex directory. It considers the 48 most recently updated logs from the last 24 hours. It reads the last 1 MiB of each log and can look back another 16 MiB for a missing turn boundary after a restart. A missing boundary can yield Status unknown. Fifteen minutes without a fresh event changes Working to Status unknown. A click opens the documented codex://threads/<id> link. The reader matches explicit approval requests and blocking question calls to their responses when recorded in the local log. Some desktop prompts are visible only inside their client. Remote-host sessions and cloud tasks are outside the local readers’ coverage.

**Claude, Gemini, and ChatGPT web** use open conversation tabs in connected Chrome or Edge profiles. The Windows desktop readers work independently of these tabs. Cloud sessions, SSH or WSL workers, the regular Claude Chat tab, Gemini CLI, and Antigravity IDE are outside the native readers' coverage.

## ESP32 handoff

The PC owns provider integration, chat lookup, and window activation. Both desktop and future device clients can use the same versioned contract.

- GET /v1/sessions returns version, source health, and compact session records containing id, provider, title, state, updatedAt (Unix milliseconds), and hue (0–359). Additional fields include project, reason, stateSince, review, pin and muted. Base state stays finished while review is pending.
- POST /v1/focus accepts JSON with a single id. The PC resolves it against the current session list and activates the matching target. Browser requests wait for acknowledgment. A Codex or Claude Desktop protocol launch confirms that Windows accepted the link. Antigravity returns a target of session, picker, or application. The latter two include a message for the display when manual selection is needed.

- POST /v1/chat accepts id, op and value for pin or mute. A review acknowledgment includes the stateSince of the observed completion. The bridge checks the local origin and the current chat before applying changes.

The physical ESP32-2432S028R display pairs over USB and uses a dedicated TLS 1.2 PSK connection over Wi-Fi. The PC initiates the connection to port 43822 on the board. Each poll carries up to four chat rows and a tap opens a current chat through the desktop focus handler. The PC's HTTP API stays on loopback. The kit includes a complete flash image and a Windows setup utility. [Board setup guide](<hardware/START HERE.md>) · [Firmware build instructions](hardware/BUILD.md)

Use **… → Update display…** or the Ghost Desk tray menu to install a new **.ota.bin** on the paired display over Wi-Fi. The updater shows progress and confirms the firmware after the display reconnects. For a board running the original dual-USB Ghost Desk release, run option 4 in the Windows board kit once over USB.

## References


[Codex chat deep links](https://learn.chatgpt.com/docs/reference/commands) · [Chrome document picture-in-picture](https://developer.chrome.com/docs/web-platform/document-picture-in-picture) · [Chrome tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs) · [Claude Code lifecycle hooks](https://code.claude.com/docs/en/hooks) · [Gemini CLI lifecycle hooks](https://geminicli.com/docs/hooks/reference/)
