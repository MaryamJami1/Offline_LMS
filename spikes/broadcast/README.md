# Broadcast spike (Phase 0, task 5)

Throwaway proof of concept: a teacher Electron app captures the whole screen with
`desktopCapturer`, publishes it to LiveKit, and a student Electron app shows it full-screen on a
second PC. **This code is not test-first and is never shipped.** It exists only to prove NFR-03
(1080p, 15 fps, under 500 ms delay) before Phase 1 builds anything on top of LiveKit.

Deliberately outside the pnpm workspace, so `pnpm test`, `pnpm lint` and `pnpm typecheck` never
see it. It installs with plain `npm` so the student PC needs nothing but Node.js.

## Status: passed on two PCs

Run on 2026-10-27 with the teacher app and LiveKit 1.13.11 on the laptop and
`student-spike.exe` on a second PC from a USB drive, both on the same WiFi:

| Check          | Target            | Measured                     |
| -------------- | ----------------- | ---------------------------- |
| Delay, run 1   | under 500 ms      | 179 ms                       |
| Delay, run 2   | under 500 ms      | 229 ms                       |
| Delay, average | under 500 ms      | about 204 ms                 |
| Resolution     | 1920x1080         | 1920x1080                    |
| Frame rate     | about 15 fps      | 15 fps                       |
| Text readable  | 11px line legible | 14px readable, 11px readable |

**NFR-03 passes**, at about 40% of the 500 ms budget. This was over WiFi, which reads
pessimistically — the wired lab switch should be the same or better, but that still has to be
confirmed: re-measure at Gate 1. Full write-up in `docs/docs/spike-results.md`.

Earlier, on the dev machine alone (teacher and student side by side):

```
[teacher] published screen: 1920x1080 @ 15 fps, contentHint="text"
[student] subscribed to video from "teacher" (TR_VSzg67ZjkeLkBE, video/VP8)
[student] receiving 1920x1080  15 fps
```

LiveKit negotiated `connectionType: "udp"` on a port inside the 50000-50200 range.

The portable `student-spike.exe` was tested the same way, run from a folder holding only the .exe
and `config.json`: it read that config, joined the room (`connectTime 135 ms`, reported by the
server as Electron 44.9.3) and rendered the teacher's screen. So the bundled `livekit-client`
loads correctly from inside the asar archive too.

Two Electron API notes for Phase 1, found by moving the spike from Electron 33 to 44:

- `webContents.on('console-message')` takes a single details object now, not
  `(event, level, message)`. The old signature silently logs `undefined`.
- The legacy `getUserMedia` constraints (`chromeMediaSource: 'desktop'` with a source id from
  `desktopCapturer`) still work in 44, so the apps do not need
  `session.setDisplayMediaRequestHandler` yet.

### Pinned versions

| Piece                | Version |
| -------------------- | ------- |
| LiveKit server       | 1.13.11 |
| `livekit-client`     | 2.23.0  |
| `livekit-server-sdk` | 2.19.2  |
| `electron`           | 44.9.3  |

Exact versions, no `^` ranges, so the spike and `infra/docker-compose.yml` cannot drift apart. See
the pinned-versions table in `docs/docs/02-architecture.md`.

## Why there is no HTTPS here

`desktopCapturer` is a privileged Electron API, not the browser's `getDisplayMedia`, so it needs no
secure context. LiveKit is reached over plain `ws://` on the LAN. Caddy and its local certificate
authority (docs/docs/06-security-and-data.md, "Transport") are therefore not needed for this spike —
they come back in Phase 1 when the real apps talk to the NestJS server.

---

## On the server PC (also the teacher PC)

### 1. Get the LiveKit server

Version **1.13.11**, matching the `livekit/livekit-server:v1.13.11` image pinned in
`infra/docker-compose.yml`. Download the official Windows build and check it:

```sh
mkdir bin
cd bin
curl -LO https://github.com/livekit/livekit/releases/download/v1.13.11/livekit_1.13.11_windows_amd64.zip
curl -LO https://github.com/livekit/livekit/releases/download/v1.13.11/checksums.txt
```

Verify the hash before unzipping — it must be
`5d071ea43339f0140d24a66f0b2ff8a7bf6c4d0dceb19b30abca835670213667`:

```powershell
(Get-FileHash livekit_1.13.11_windows_amd64.zip -Algorithm SHA256).Hash
Expand-Archive livekit_1.13.11_windows_amd64.zip -DestinationPath . -Force
cd ..
```

`bin/` is git-ignored; the binary is never committed.

### 2. Start LiveKit

```sh
cp .env.example .env
```

Edit `.env` and set `LAN_IP` to that machine's real LAN address. Find it with `ipconfig` and use the
IPv4 address of the adapter on the lab network — **not** `127.0.0.1`, because LiveKit advertises
`LAN_IP` to the student PC as its WebRTC candidate. Then:

```powershell
.\run-livekit.ps1
```

The script reads `.env`, passes the key and secret as `LIVEKIT_KEYS` and the IP as `--node-ip`, and
applies `livekit.yaml` (same ports as `infra/livekit.yaml`). Leave it running; Ctrl+C stops it.

Windows will ask about the firewall the first time — **allow it on Private networks**. If PowerShell
refuses to run the script, unblock it once with `Unblock-File .\run-livekit.ps1`.

A healthy start ends with:

```
using explicit node IP for NAT1To1Ips  {"ip": {"V4":"192.168.10.101"}, "advertiseInternalIP": false}
starting LiveKit server  {"portHttp": 7880, "nodeIP": "192.168.10.101", "version": "1.13.11",
                          "rtc.portTCP": 7881, "rtc.portICERange": [50000, 50200]}
```

Check `nodeIP` is your LAN address. Then confirm it answers from the LAN:

```sh
curl http://192.168.10.101:7880
```

### 3. Configure and run the teacher app

```sh
cp config.example.json config.json
```

Edit `config.json`: set `livekitWsUrl` to `ws://<LAN_IP>:7880`. Keep `apiKey` and `apiSecret`
exactly equal to the values in `.env` — the apps mint their own LiveKit tokens from them, so there
is no token to copy anywhere.

```sh
npm install
npm run teacher
```

It starts publishing immediately. The window shows a millisecond clock and a readability ruler
(20px down to 9px text) — both are what you check on the student screen.

---

## On the student PC (your second PC)

The student PC runs no LiveKit and no server. Use the portable .exe so it needs no Node.js and no
pnpm either.

### Build the portable .exe (on this PC, once)

```sh
npm install
npm run build:student
```

The first build downloads NSIS, so give it a few minutes; later builds are quick. The result is a
single file:

```
dist/student-spike.exe
```

### Put two files on the USB drive

```
USB:\
├─ student-spike.exe
└─ config.json
```

`config.json` must sit **next to the .exe**, not inside it. Copy the one from this PC, or start
from `config.example.json`:

```json
{
  "livekitWsUrl": "ws://192.168.10.101:7880",
  "roomName": "spike-broadcast",
  "apiKey": "devkey",
  "apiSecret": "<same secret as the server PC>"
}
```

`livekitWsUrl` points at the **server PC's** LAN IP. `apiSecret` must match the server exactly, or
LiveKit rejects the token. Because the config is a plain file beside the .exe, you can change the
address on the student PC in Notepad without rebuilding anything.

The portable .exe unpacks itself into a temp folder before running, so its own `__dirname` is _not_
the USB drive. It finds the config through `PORTABLE_EXECUTABLE_DIR`, which electron-builder sets
to the folder the .exe was launched from — verified to work even when the working directory is
somewhere else entirely. If no config is found it writes `student-spike-error.log` beside the .exe
listing every path it tried, because a double-clicked app has no terminal to print to.

### Run it

Double-click `student-spike.exe`. It can run straight from the USB drive or from a folder copied
off it — either way it reads the `config.json` sitting beside it.

The .exe is unsigned, so Windows SmartScreen shows "Windows protected your PC" the first time:
choose **More info → Run anyway**. (Phase 5 builds signed installers; see
`docs/docs/07-installation.md`.)

The window goes full-screen black, then shows the teacher's screen. **Esc quits** (the real
student app is a locked kiosk; the spike stays escapable on purpose).

### Or run it from source instead

If the student PC already has Node.js, the .exe is optional — copy this folder over (without
`node_modules`, `bin` or `dist`), create `config.json` as above, then:

```sh
npm install
npm run student
```

Bottom-right shows the received resolution and fps; bottom-left shows this PC's own clock — read
the numbers off the screen, which is all you need for the checks below.

Started from a terminal instead, the same line is also printed once a second:

```
receiving 1920x1080  15 fps
```

The portable .exe prints nothing to a terminal, even when started from one: its launcher unpacks
the app and hands off, so redirecting its output captures an empty file. Read the HUD off the
screen. If it fails to start, it writes `student-spike-error.log` next to itself instead.

---

## What to check before calling the spike passed

| Check         | How                                                                                        | Target            |
| ------------- | ------------------------------------------------------------------------------------------ | ----------------- |
| Text readable | Read the readability ruler on the student screen                                           | 11px line legible |
| Resolution    | `receiving …` line, or bottom-right HUD                                                    | 1920x1080         |
| Frame rate    | `receiving …` line, or bottom-right HUD                                                    | ~15 fps           |
| Delay         | Photograph both screens at once; subtract the broadcast clock from the student's own clock | under 500 ms      |

The delay check works because the teacher broadcasts its whole screen, so the student sees the
teacher's clock inside the video while its own clock runs in the corner. One phone photo of the two
monitors gives both numbers.

**Measure on the wired network too.** The 204 ms above is a WiFi number: it proves the pipeline
and clears the budget, but NFR-03's 500 ms assumes the gigabit switch, so the lab figure is still
outstanding until Gate 1.

## Troubleshooting

| Symptom                                  | Cause                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `livekit-client not found`               | `npm install` was not run in `spikes/broadcast`                                     |
| App exits instantly, no window at all    | npm blocked Electron's postinstall, so there is no binary — see below               |
| .exe shows an error box and quits        | No `config.json` beside it. `student-spike-error.log` lists the paths it tried      |
| Student joins but the screen stays black | UDP 50000-50200 blocked, or `LAN_IP` in `.env` is `127.0.0.1`                       |
| `could not establish signal connection`  | Wrong `livekitWsUrl`, or TCP 7880 blocked by the firewall                           |
| `invalid token` / `permission denied`    | `apiSecret` differs between the two PCs                                             |
| Blurry text but smooth motion            | Encoder ignored the `text` content hint — the NFR-03 risk this spike exists to find |

### If Electron has no binary

Recent npm versions refuse to run a dependency's install scripts until they are approved, and
Electron downloads its binary in `postinstall`. `package.json` carries the approval:

```json
"allowScripts": { "electron@44.9.3": true }
```

The key includes the version, so it must be changed whenever Electron is bumped. If `npm install`
warns `1 package has install scripts not yet covered by allowScripts`, there is no
`node_modules/electron/dist/electron.exe` and both apps exit at once. Fix it with:

```sh
npm approve-scripts electron
npm install
```

Two messages are expected and harmless:

- `ERROR … CPU monitoring unsupported on current platform` at LiveKit startup, followed by
  `Windows detected, capacity management is unavailable`. Red, but only disables capacity metrics.
- `Electron Security Warning (Insecure Content-Security-Policy)` in the apps. Electron says itself
  that it does not appear in a packaged build.

A third message, `Initial connection failed: v1 RTC path not found. Consider upgrading your LiveKit
server version`, means the server is older than the client. It should not appear on 1.13.11.

## Finding: connect setup takes about 2 seconds

Upgrading the server from 1.7.2 to 1.13.11 removed the `/rtc/v1` fallback — the client now connects
on its first attempt and negotiates protocol 18 instead of 14. But connect setup did not get
faster. Three teacher-only runs on 1.13.11:

```
run 1 : 1984 ms   v1-fallback: none
run 2 : 2140 ms   v1-fallback: none
run 3 : 2761 ms   v1-fallback: none
```

The 1.7.2 figure of `1185 ms` was never a fair baseline: the client's timer started on the _second_
(successful) signal attempt, so it excluded the ~1 s wasted on the failed first one. Total time to
connect is roughly the same or slightly better now, with one attempt instead of two.

This is **one-time setup cost when a broadcast starts, not frame latency**, so it does not count
against NFR-03 (under 500 ms delay) or NFR-05 (commands under 1 s, which travel over Socket.IO).
The likely cause is ICE candidate gathering across the 200-port range on a single WiFi machine that
is also running the server, both apps and the encoder.

### What Phase 2 should do about it

The spike pays this cost because each app joins the room at launch. The real apps must not pay it
when the teacher presses Broadcast.

**In Phase 2 (LAB-04), the student apps join the session's LiveKit room at Start class and stay
connected for the whole session.** Broadcast then only has to subscribe to the teacher's track,
which is a fast operation on an open connection, so the screen appears in under 1 s. Joining a room
on demand would put the whole ~2 s of ICE and DTLS setup in front of the teacher every time.

This is recorded under the Broadcast task in Phase 2 of `docs/docs/09-project-plan.md`.

## Throwing it away

Stop the server with Ctrl+C, then delete `spikes/broadcast/`. Nothing else in the repo imports it.
