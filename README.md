# Ghost Desk

A Windows edge dock for local Codex, Claude Code in Claude Desktop, and Google Antigravity conversations. Each ghost represents a chat. Its movement shows activity, and its background color identifies the provider. The portable Windows x64 package includes the Node.js runtime.

## Open the panel

1. On 64-bit Windows 10 or 11 with .NET Framework 4.8, extract **Ghost-Desk-Windows-x64.zip**. Open **Ghost Desk.exe** inside the extracted folder. A narrow ghost tab appears at the center of the right screen edge on first launch. The app starts its local bridge in the background.
2. Click the tab to expand it. Click a chat to open it. Select **Hide** or press **Esc** to collapse it. Working ghosts bob, attention ghosts shift sideways, and finished ghosts rest with closed eyes. The strip shows up to nine ghosts, with attention and working sessions first. A **+N** count covers additional chats.
3. Open **···** or right-click the strip to choose an edge or display. **Hide to tray** hides the entire dock. Double-click the ghost in the Windows notification area to bring it back. **Quit Ghost Desk** closes the app and its bridge together.

You can also open the running panel at **http://127.0.0.1:43821**. Choose **Float ↗** for the browser floating panel or **Preview** for sample chats. The Windows app runs in your signed-in desktop session and listens only on the loopback address. It starts when you launch it.

![Ghost Desk with sample chats](<Ghost Desk preview.png>)

## Build from source

Use 64-bit Windows with .NET Framework 4.8 and PowerShell. To run from a checkout with Node.js 22.13 or later on PATH, build the executable and launch it from the repository root.

```powershell
.\dock\build.ps1
& '.\Ghost Desk.exe'
```

Run the adapter tests with `node tests/desktop.mjs`. To produce a self-contained distribution, run `.\package.ps1`. It verifies a pinned official Node.js Windows archive, includes its license, and writes **dist/Ghost-Desk-Windows-x64.zip**. For an offline build, pass the matching archive with `-RuntimeZip`. The Windows GitHub Actions workflow performs the test and build and uploads the ZIP as a workflow artifact.

## Desktop apps

The small tile behind each ghost and the lighter tint across its expanded row identify the provider. Claude and Claude Code use muted clay, Gemini and Antigravity use slate blue, and ChatGPT and Codex use sage green. Hover over a collapsed ghost to see its provider, title, and state.

Start the panel and select **Live**. The bridge reads the apps' existing session metadata on each refresh. Your current Windows account supplies access. No API keys, hooks, or changes to project settings are required.

- **Claude Code** reads the local Windows **Code** tab's conversation titles and matches each desktop chat to its live Claude worker. A busy worker shows **Working**, a waiting worker shows **Needs you**, and idle shows **Available** or **Turn ended**. A click opens the native link for the desktop conversation ID. The CLI worker ID can differ. The list includes open workers and chats active in the past 24 hours. An offline chat with incomplete evidence shows **Status unknown**.
- **Antigravity** reads the local Antigravity App's conversation index in read-only mode. It shows up to 64 top-level conversations updated in the past 24 hours. The app's run state and background-work flag determine **Working** or **Turn ended**. An explicit user-input or approval wait can show **Needs you**. Some approvals only surface inside the app. A click opens the app's **Search Conversations** picker, searches a unique title, and selects its matching result. If titles are ambiguous or Windows cannot expose the result, the panel tells you how to finish the selection. The picker integration uses the English Windows UI. [Antigravity conversation search](https://antigravity.google/docs/search/)
- **Codex** uses the local session reader described below.

The native readers reflect the formats in the installed apps. An app update can change those formats or the accessible controls used to open a conversation. The panel reports source availability in its footer. Each source is independent.

## Optional browser chats

Open **chrome://extensions** or **edge://extensions** in the profile that contains your chats. Turn on **Developer mode**, choose **Load unpacked**, then choose the **browser** folder next to this file. Refresh already-open Claude, Gemini, and ChatGPT tabs once so the observer can read their controls. Repeat for another browser profile as needed. Keep the extension folder in its current location while it is loaded.

The connector reports titles, provider, state, and a hashed route ID to the local bridge. A click activates the matching existing tab and brings its window forward. A provider's new-chat screen can appear as Available. Closed tabs drop out after the next successful snapshot. A sleeping or disconnected browser profile drops out after one minute. The connector uses your existing signed-in browser session. Ghost Desk stores its list in memory and never asks for account tokens.

## What the states mean

| State | Ghost | Evidence |
| --- | --- | --- |
| Available | Steady, open circle | A visible chat composer, with no turn observed yet |
| Working | Bobs, three dots | A local Codex turn started, or a browser generation control is visible |
| Needs you | Tilts, exclamation mark | Claude Desktop reports waiting, an explicit Antigravity input wait, or a supported web approval dialog |
| Turn ended | Rests, check mark | A Codex completion event, or a previously observed web generation control disappeared and the composer returned |
| Stopped | Dim, square | A local Codex abort event |
| Status unknown | Gray, question mark | Evidence is missing, outdated, or unrecognized |

Color follows the session ID. Movement, text, and symbols identify the state. Reduced-motion preferences disable animation. A web turn ending can include a user stopping generation. Web observers inspect visible controls and can miss short turns, localized controls, in-chat questions, custom widgets, background work, and changes to provider interfaces. A chat that was already finished when observation began may appear Available.

## Coverage

**Codex desktop** reads recent local rollout logs and the title index under CODEX_HOME or the user's .codex directory. It considers the 48 most recently updated logs from the last 24 hours. It reads the last 1 MiB of each log and can look back another 16 MiB for a missing turn boundary after a restart. A missing boundary can yield Status unknown. Fifteen minutes without a fresh event changes Working to Status unknown. A click opens the documented codex://threads/<id> link. Approval tracking for native Codex, remote-host sessions, and cloud tasks is outside this starter's coverage.

**Claude, Gemini, and ChatGPT web** use open conversation tabs in connected Chrome or Edge profiles. The Windows desktop readers work independently of these tabs. Cloud sessions, SSH or WSL workers, the regular Claude Chat tab, Gemini CLI, and Antigravity IDE are outside the native readers' coverage.

## ESP32 handoff

The PC owns provider integration, chat lookup, and window activation. Both desktop and future device clients can use the same versioned contract.

- GET /v1/sessions returns version, source health, and compact session records containing id, provider, title, state, updatedAt (Unix milliseconds), and hue (0–359).
- POST /v1/focus accepts JSON with a single id. The PC resolves it against the current session list and activates the matching target. Browser requests wait for acknowledgment. A Codex or Claude Desktop protocol launch confirms that Windows accepted the link. Antigravity returns a target of session, picker, or application. The latter two include a message for the display when manual selection is needed.

For the first hardware version, add a USB serial transport to the bridge. Send a compact, paged snapshot on connect or reconnect, then changes keyed by id. The board can render a small ghost sprite, use the same state labels, and send a focus request with the touched ID. A Wi-Fi version can use an authenticated device endpoint. The starter exposes only loopback HTTP and checks origins on writes. Device transport, pairing, board-specific graphics, and firmware are future work.

## References

[Codex chat deep links](https://learn.chatgpt.com/docs/reference/commands) · [Chrome document picture-in-picture](https://developer.chrome.com/docs/web-platform/document-picture-in-picture) · [Chrome tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs) · [Claude Code lifecycle hooks](https://code.claude.com/docs/en/hooks) · [Gemini CLI lifecycle hooks](https://geminicli.com/docs/hooks/reference/)
