# Spike results (Phase 0)

What the week-1 risk spikes proved, and the settings Phase 1 and Phase 2 should carry forward. The
spike code itself lives in `spikes/` and is throwaway: it is not test-first, it is never imported by
`apps/` or `packages/`, and the features are rebuilt properly, test-first, when their phase arrives.

| Spike            | Requirement | Status                 |
| ---------------- | ----------- | ---------------------- |
| Screen broadcast | NFR-03      | Passed on 2 PCs (WiFi) |
| Teacher voice    | NFR-04      | Not run yet            |

## Screen broadcast — NFR-03

**Target:** teacher screen readable on every seat, 1080p, 15 fps, under 500 ms delay.
**Result: passed**, with the delay at about 40% of the budget. Measured over WiFi, which reads
pessimistically; re-check on the wired lab switch at Gate 1.

### How it was run (2026-10-27)

| Piece            | Setup                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Teacher PC       | Laptop on WiFi, `192.168.10.101`. Runs LiveKit 1.13.11 and the teacher app from source                                         |
| Student PC       | Second PC on the same WiFi. Runs `student-spike.exe` from a USB drive — no Node, no pnpm, no server                            |
| Network          | Shared WiFi, one `/24` subnet, no wired switch involved                                                                        |
| Publish settings | Whole screen via `desktopCapturer`, VP8, 1920x1080 @ 15 fps, `maxBitrate` 3 Mbit/s, `simulcast: false`, `contentHint = "text"` |

### What was measured

| Check          | Target            | Measured                     |
| -------------- | ----------------- | ---------------------------- |
| Delay, run 1   | under 500 ms      | 179 ms                       |
| Delay, run 2   | under 500 ms      | 229 ms                       |
| Delay, average | under 500 ms      | about 204 ms                 |
| Resolution     | 1920x1080         | 1920x1080                    |
| Frame rate     | about 15 fps      | 15 fps                       |
| Text readable  | 11px line legible | 14px readable, 11px readable |

The 9px line was not recorded; it is below anything the real UI will use. The delay is the gap
between the teacher's millisecond clock as it appears inside the broadcast and the student PC's own
clock in the corner of the same screen, read off one phone photo of both monitors.

### Caveat: this was WiFi

NFR-03's 500 ms assumes the gigabit switch in the lab. WiFi adds jitter and retransmits, so 204 ms
is the pessimistic figure, not the optimistic one — the wired number should be the same or better.
It still has to be confirmed: **re-measure on the wired lab network at Gate 1**, on 10 PCs, together
with the lab test in `docs/docs/08-testing.md`.

Two readings is also a small sample. It is enough to retire the risk ("broadcast might be too slow
to read"), not enough to characterise the network.

### Settings to carry into Phase 1

Keep these; they are what the measured result was produced with.

- **VP8, not VP9 or H.264.** VP8 is what every lab PC decodes without hardware help.
- **`contentHint = "text"`** on the video track. This is what keeps small text sharp instead of
  smearing it when the encoder is under pressure — it is the single setting NFR-03 depends on.
- **`simulcast: false`.** One layer. Every seat gets the same 1080p stream; there is no mobile
  client to downgrade for, and simulcast would spend bitrate on layers nobody subscribes to.
- **15 fps, 3 Mbit/s.** A screen of text is mostly static; the bitrate goes to sharpness.
- **Pinned versions** — see the pinned-versions table in `docs/docs/02-architecture.md`. The spike
  and `infra/docker-compose.yml` must not drift apart.

### Finding: joining a room costs about 2 seconds

Connect setup (signalling, ICE over the 50000-50200 range, DTLS) took 1984 / 2140 / 2761 ms across
three runs. This is one-time cost when an app joins the room, not frame latency, so it does not
count against NFR-03 or NFR-05 — but it would be visible if an app joined on demand.

**Phase 2 (LAB-04) therefore has the student apps join the session's LiveKit room at Start class and
stay connected for the whole session.** Broadcast then only subscribes to the teacher's track on an
open connection, so the screen appears in under 1 s instead of paying ICE setup in front of the
class. This is recorded under the Broadcast task in `docs/docs/09-project-plan.md`.

### Two Electron API notes

Found moving the spike from Electron 33 to 44:

- `webContents.on('console-message')` now takes a single details object, not
  `(event, level, message)`. The old signature silently logs `undefined`.
- The legacy `getUserMedia` constraints (`chromeMediaSource: 'desktop'` with a source id from
  `desktopCapturer`) still work in 44, so the apps do not need `session.setDisplayMediaRequestHandler`
  yet.

`desktopCapturer` is a privileged Electron API, not the browser's `getDisplayMedia`, so it needs no
secure context — Caddy's local certificate authority is not involved in broadcast at all.

## Teacher voice — NFR-04

**Target:** teacher and student voice in headsets, under 200 ms delay, echo cancelled.

Not run yet. It is the second Phase 0 spike; Phase 0 does not exit until teacher voice is clear in a
student headset on 2 PCs.
