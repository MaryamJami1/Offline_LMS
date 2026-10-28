# Spike results (Phase 0)

What the week-1 risk spikes proved, and the settings Phase 1 and Phase 2 should carry forward. The
spike code itself lives in `spikes/` and is throwaway: it is not test-first, it is never imported by
`apps/` or `packages/`, and the features are rebuilt properly, test-first, when their phase arrives.

| Spike            | Requirement    | Status                           |
| ---------------- | -------------- | -------------------------------- |
| Screen broadcast | NFR-03         | Passed on 2 PCs (WiFi)           |
| Teacher voice    | NFR-04         | Passed on 2 PCs (WiFi)           |
| Server stack     | NFR-12, NFR-13 | Passed in Docker, 4 faults fixed |

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
**Result: passed on 2 PCs**, at 126 ms against a 200 ms budget, with the screen broadcast running
at the same time. Measured over WiFi and on the laptop's built-in microphone rather than a headset,
so the headset-and-wired confirmation is still owed at Gate 1.

### The 2-PC run (2026-10-27)

Teacher app and LiveKit on the laptop, talking into its built-in microphone; `student-spike.exe` on
the second PC. The broadcast ran throughout, so this is voice and 1080p video sharing one WiFi
link, which is how a real class works.

| Check                   | Target           | Measured                                |
| ----------------------- | ---------------- | --------------------------------------- |
| Delay, student estimate | under 200 ms     | 126 ms — net 5 + buffer 80 + playout 42 |
| Packet loss             | none audible     | 0.0%                                    |
| Concealed samples       | none audible     | 0.0%                                    |
| Codec and bitrate       | Opus             | Opus, 48 kHz, about 48 kbit/s           |
| Voice quality           | every word clear | clear                                   |
| Echo                    | cancelled        | none heard — but nothing could echo     |
| Broadcast alongside it  | 1080p, 15 fps    | 1920x1080 at 14 fps                     |

126 ms is the receiver's estimate. Capture and Opus encode on the teacher PC appear in none of
those statistics, so true mouth-to-ear is roughly 20-40 ms higher — call it 150-170 ms. Still
inside the budget, but the real margin is about a quarter of it, not half, and that is the figure
to carry into Gate 1.

The broadcast read 14 fps instead of 15 with voice sharing the link. One frame is within the noise
of a single run, but it is worth watching when 10 PCs are subscribed.

### What is still owed

- **A real echo test. This run could not provide one.** The spike is one-way: the teacher app
  plays no audio at all, so the echo canceller had nothing to cancel, and the student app
  publishes no microphone. "No echo heard" was the only possible outcome and says nothing about
  whether echo cancellation works. Echo appears when audio goes both ways and a microphone hears
  its own loudspeaker — LAB-09 Intercom and Group Talk. That test cannot happen before Phase 2,
  and NFR-04's "echo cancelled" stays unproven until it does.
- **Headsets.** NFR-04 says "in headsets", and this ran on the laptop's own microphone. A headset
  microphone sits closer to the mouth and behaves differently — and headsets are also the main
  defence against echo, which is why the hardware list has one on every seat.
- **The wired lab network**, as with the broadcast half.
- **More than one listener.** One student is not 30 subscribers on one uplink.

### What one PC had shown first

Before the 2-PC run, with LiveKit, the teacher app and the student app all on the same laptop and
the microphone replaced by Chromium's synthetic one:

| Check                           | Measured                                                   |
| ------------------------------- | ---------------------------------------------------------- |
| Codec                           | `audio/opus`, 48 kHz clock, mono capture                   |
| Processing                      | AEC on, NS on, AGC on — read back, not merely requested    |
| Bitrate on the wire             | 37-41 kbit/s                                               |
| Uplink half-RTT (teacher)       | 1-9 ms                                                     |
| Packet loss / concealed samples | 0.0% / 0.0%                                                |
| Delay, student estimate         | 138 ms at best, settling at 250-310 ms                     |
| Mute and unmute                 | Talk toggles; the student reads "teacher microphone muted" |

Two PCs did better than one, which is the expected direction: the single machine was encoding
1080p, decoding it again, running the server and generating the audio all at once, and its jitter
buffer sat at 249 ms against the 80 ms measured across the real pair. The bitrate rose from 37-41
to about 48 kbit/s because real speech is harder to code than a 440 Hz tone.

### Settings to carry into Phase 2

- **Opus, mono, `echoCancellation`, `noiseSuppression` and `autoGainControl` all on**, and read
  back from `getSettings()` afterwards rather than assumed. Windows or a driver can refuse any of
  them, and NFR-04 fails quietly if it does.
- **`red: true`** (redundant audio) and **`dtx: true`** (silence costs no bitrate), both LiveKit
  defaults for a mono track. RED is most of the gap between the 24 kbit/s preset and the 48
  kbit/s measured on the wire, and it is worth it: one lost packet stops being a gap in a word.
- **Publish once, then mute and unmute.** Re-publishing renegotiates the connection every time the
  teacher stops talking.

### Finding: an occluded teacher window wrecks the voice delay

With Electron's default `backgroundThrottling`, the teacher window sat behind the student's
full-screen window and Chromium throttled it. Nothing failed: no packet loss, no concealed samples,
round trip still about 1 ms. But the publisher emitted audio in bursts, the receiver's jitter buffer
grew to absorb them, and the delay went to **0.5-1.4 s** — draining only slowly, because a
continuous tone gives the decoder no silence to shrink the buffer in.

`backgroundThrottling: false` on both windows, nothing else changed, brought the same machine back
to **138-357 ms**.

**Phase 2 (LAB-09) must set `backgroundThrottling: false` on the teacher console and the student
app.** This is not an edge case: during Whole Talk the teacher is demonstrating something in another
application, so the console window is behind it almost by definition.

One laptop and a small sample, so this is a direction, not a measurement — but it costs nothing to
act on, and the failure it prevents is silent.

### Finding: the delay lives in the jitter buffer

The student app splits its estimate into three parts, and they are nowhere near equal. On one
overloaded laptop:

```
voice 292 ms  (budget 200 ms)
net 1 + buffer 249 + playout 42 ms · loss 0.0% · gaps 0.0%
```

and across the real pair of PCs:

```
voice 126 ms  (budget 200 ms)
net 5 + buffer 80 + playout 42 ms · loss 0.0% · gaps 0.0%
```

The network part never exceeded 9 ms and playout is a steady ~42 ms in both. Everything that
changed — 249 ms down to 80 ms — is the jitter buffer. The lever for NFR-04 is therefore how
evenly packets arrive, not how fast the network is, and the way to make it worse is to let the
publishing window be throttled (above). Capture and Opus encode on the teacher PC appear in none
of these stats, so true mouth-to-ear is roughly 20-40 ms above the figure shown.

If the wired Gate 1 run ever comes in over 200 ms, the next thing to try is
`receiver.jitterBufferTarget`, which caps how far the buffer may grow, at the cost of dropouts when
the network is rough. The spike deliberately leaves it unset: its job is to measure the default.

## The server stack in Docker — NFR-12 (2026-10-28)

Phase 0 task 4 was ticked before Docker Desktop worked on the dev laptop, so `infra/docker-compose.yml`
had never actually been started. Re-checked here on Docker Desktop 29.9.2 (WSL 2 backend, 3.78 GB
of the laptop's 8 GB). All three services now start and answer:

| Service    | Image                             | Checked                                             |
| ---------- | --------------------------------- | --------------------------------------------------- |
| PostgreSQL | `postgres:16`                     | `SELECT` answered; reports PostgreSQL 16.15         |
| LiveKit    | `livekit/livekit-server:v1.13.11` | HTTP 200 on 7880; `nodeIP` is the LAN address       |
| Caddy      | `caddy:2`                         | 80 redirects to 443; TLS 1.3 from its own authority |

`docker compose up -d` takes about 19 s from cold and the three containers together sit at about
91 MB, so the 8 GB laptop is not the constraint.

### What the old `/api/health` test actually proved: nothing about the database

`apps/server/test/health.spec.ts` used no mocks — it booted the real `AppModule` with the real
Prisma client. But its assertion was `expect(['ok', 'error']).toContain(res.body.database)`, which
is true either way. With no database and no LiveKit running, all four tests passed while the
endpoint was reporting `database: "error"` and `livekit: "error"`. The test described the shape of
the response, not the health of anything.

It is kept as that shape test. Three new files hold the parts that can fail:

| File                                             | Proves                                                      |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `apps/server/test/nfr-12.compose-config.spec.ts` | The compose file and its two config files resolve correctly |
| `apps/server/test/nfr-12.infra-stack.spec.ts`    | The three services run, and `/api/health` reports `ok`      |
| `apps/server/src/health/health.service.spec.ts`  | `ok` and `error` are told apart, and neither throws         |

CI now brings the whole stack up with `docker compose up -d --wait` before `pnpm test`, so these
run against real services on every pull request instead of against nothing.

### Four faults the first real start found

1. **No `infra/.env`, and compose did not care.** `POSTGRES_USER`, `POSTGRES_PASSWORD` and
   `POSTGRES_DB` resolved to blank strings with only a warning. Every required variable is now
   written `${VAR:?set VAR in infra/.env}`, so compose refuses to start rather than bring up a
   database with no password.
2. **`infra/livekit.yaml` held `${LAN_IP}` and `${LIVEKIT_API_KEY}`.** `livekit-server` does not
   expand `${VAR}` inside its config file — the spike's own `run-livekit.ps1` had already worked
   around this, but `infra/` had not. The keys now arrive as the `LIVEKIT_KEYS` environment
   variable and the address as `--node-ip`, both filled in by compose.
3. **Caddy proxied to itself.** `reverse_proxy localhost:7880` and `localhost:3000` mean the Caddy
   container, not the LiveKit container or the API. They are now the compose service names
   `livekit:7880` and `server:3000` (the `server` service arrives in Phase 1; until then `/api/*`
   returns 502, which is correct).
4. **No certificate for a client arriving by IP — NFR-13.** This one would have broken the whole
   lab. TLS forbids an IP literal in the SNI field, so a lab PC opening `https://192.168.10.2`
   sends no server name at all, and Caddy had nothing to offer it: the handshake failed with
   `tlsv1 alert internal error`. Port 80 worked, which is what hides it. Fixed with a global
   `default_sni {$LAN_IP}` in the Caddyfile. The handshake now completes with

   ```
   protocol : TLSv1.3
   issuer   : Caddy Local Authority - ECC Intermediate
   SAN      : IP Address:192.168.10.101
   ```

   Three tests cover it, named after NFR-13 rather than NFR-12.

### The broadcast spike against the Docker LiveKit

The standalone `livekit-server.exe` was stopped and `spikes/broadcast` pointed at the container
instead — no spike code or config changed, because `infra/.env` deliberately carries the same key
and secret as `spikes/broadcast/config.json`. Both apps reported the container's own node ID
(`ND_kAfQX5BpDsGj`), so this was the Docker server and not the binary:

```
[teacher] connected to Livekit Server version: 1.13.11, protocol: 18, nodeId: ND_kAfQX5BpDsGj
[teacher] published screen: 1920x1080 @ 15 fps, contentHint="text"
[student] subscribed to video from "teacher" (TR_VSu7B8HgE3nvY4, video/VP8)
[student] receiving 1920x1080  15 fps
```

Media went over UDP through the published range, not the TCP fallback, which is the thing worth
knowing about running LiveKit in Docker:

```
connectionType: "udp"
teacher selected: udp4 host 192.168.10.101:50193
student selected: udp4 host 192.168.10.101:50069
```

Two observations for Gate 1, neither a blocker:

- **Docker rewrites the client's source address.** LiveKit saw the teacher's remote candidate as
  `udp prflx 172.18.0.1:43143` — the Docker bridge gateway, not the client's own IP. Media is
  unaffected, but anything that wants to identify a lab PC by its address will see one address for
  all 60 seats. Per-seat identity must come from the device key (STU-01, `device_logins`), never
  from the socket address.
- **The teacher's first connect took 7602 ms**, against 1984–2761 ms on the standalone binary; the
  student, connecting a minute later, took 2137 ms. One cold sample is not a measurement, so this
  is only a note: both numbers are one-time setup cost when joining a room, not frame latency, and
  Phase 2 already keeps the student apps joined for the whole session so the teacher never pays it
  (see the 2-second finding above). Worth timing properly on the wired network at Gate 1.

Both figures above were taken with both apps on the one laptop, so they say nothing new about
NFR-03 or NFR-04 — the 2-PC numbers earlier in this document still stand as the result. What this
run proves is narrower and was the question: the pipeline works unchanged when LiveKit is the
Docker container from `infra/`.
