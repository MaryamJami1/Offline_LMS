# 4. API and real-time events

The apps use a REST API for data, Socket.IO for live lab commands, and LiveKit (WebRTC) for screen and voice.

## Conventions

- **Base URL:** `https://lingualab.local/api` (or the server's fixed IP). JSON in and out, UTF-8.
- **Authentication:** `POST /api/auth/login` returns a short-lived access token (15 minutes, JWT) and a refresh token (7 days for staff; 30 minutes, renewed on each use, for students, and ending at logout or End class). Send `Authorization: Bearer <token>` on every call. Lab PCs also send `X-Device-Key`. Every refresh rotates: the token sent in is revoked and a new one comes back, so each refresh token works once, and using one twice ends every login of that account.
- **Roles:** every endpoint below lists who may call it. The server checks the role and ownership on each request; the apps hiding a button is never the only check.
- **Validation:** request bodies are checked against Zod schemas from `packages/shared`; a failed check returns 400 with the field errors.
- **Errors:** `{ "error": { "code": "SEAT_EMPTY", "message": "No student is logged in at B4", "details": {} } }`. Statuses: 400 bad input, 401 not logged in, 403 not allowed, 404 not found, 409 conflict, 422 rule broken. `details` never carries a value from the request, so a mistyped password cannot come back in an error; a failed Zod check reports `{ issues: [{ field, message }] }`.
- **Lists:** `?page=1&pageSize=50&sort=name&q=search`; responses include `{ items, total, page, pageSize }`.
- **Dates:** ISO 8601 with time zone; the server stores UTC and the apps show Asia/Karachi time.
- **Contract tests:** each endpoint has a Supertest test written before the controller (test-driven), and the shared Zod schema is the single source for both sides.

## REST endpoints

Who: A = admin, T = teacher (own classes only), S = student (own data only), D = approved lab PC. Paths are relative to `/api`.

### Auth and users

| Method     | Path                        | Who                                 | Purpose                                                               |
| ---------- | --------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| POST       | `/auth/login`               | Anyone (+ D for students)           | Log in; returns tokens; records the seat for students                 |
| POST       | `/auth/refresh`             | Logged in                           | New access token; rotates the refresh token                           |
| POST       | `/auth/logout`              | Logged in                           | Ends the login; frees the seat                                        |
| POST       | `/auth/change-password`     | Logged in                           | Change own password                                                   |
| GET        | `/me`                       | Logged in                           | Own profile, role and current seat                                    |
| GET, POST  | `/users`                    | A                                   | List and create teachers and students (admin sets the first password) |
| GET, PATCH | `/users/:id`                | A                                   | View, edit, deactivate                                                |
| POST       | `/users/:id/reset-password` | A, T (students in own classes only) | New first-login password; logged in the audit log                     |
| POST       | `/users/import`             | A                                   | Upload Excel or CSV; returns created rows and errors                  |

**Auth in detail.** Request and response bodies are the schemas in `packages/shared/src/auth.ts`.

| Call                         | Body in                            | Answer                                                                                                                          |
| ---------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/login`           | `{ username, password }`           | 200 `{ accessToken, refreshToken, user }`                                                                                       |
| `POST /auth/refresh`         | `{ refreshToken }`                 | 200 `{ accessToken, refreshToken }` — the old refresh token is revoked, and offering one twice ends every login of that account |
| `POST /auth/logout`          | `{ refreshToken }`                 | 204, and the seat is freed                                                                                                      |
| `POST /auth/change-password` | `{ currentPassword, newPassword }` | 200 `{ accessToken, refreshToken, user }`, every other login ended                                                              |
| `GET /me`                    | —                                  | 200 `{ user, seat }`, `seat` null when they are not at a lab PC                                                                 |

Error codes these calls return:

| Code                       | Status | When                                                                                                                                                                                  |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VALIDATION_FAILED`        | 400    | The body does not match the schema                                                                                                                                                    |
| `INVALID_CREDENTIALS`      | 401    | Wrong password, or no such username — the same answer for both                                                                                                                        |
| `UNAUTHENTICATED`          | 401    | No bearer token on a call that needs one                                                                                                                                              |
| `INVALID_TOKEN`            | 401    | An access or refresh token that is expired, revoked or not ours. A refresh token used a second time answers with this and nothing more, after that account's other logins are revoked |
| `ACCOUNT_LOCKED`           | 403    | Five wrong passwords; `details.unlocksAt` says when it opens again                                                                                                                    |
| `ACCOUNT_INACTIVE`         | 403    | The account has been deactivated, even if its token is still in date                                                                                                                  |
| `PASSWORD_CHANGE_REQUIRED` | 403    | A first-login account asking for anything but `/me`, change-password or logout                                                                                                        |
| `FORBIDDEN`                | 403    | The refresh token sent to `/auth/logout` belongs to another account                                                                                                                   |
| `INTERNAL_ERROR`           | 500    | Something unexpected; the message is logged, never the request                                                                                                                        |

### Classes and groups

| Method     | Path                    | Who             | Purpose                                       |
| ---------- | ----------------------- | --------------- | --------------------------------------------- |
| GET, POST  | `/courses`, `/batches`  | A               | Manage courses and batches                    |
| GET, POST  | `/classes`              | A (T: list own) | Manage classes                                |
| GET, PATCH | `/classes/:id`          | A, T            | Class details, schedule                       |
| GET        | `/classes/:id/students` | A, T            | Students of a class (teacher screen T-09)     |
| PUT        | `/classes/:id/teachers` | A               | Set teachers                                  |
| PUT        | `/classes/:id/students` | A               | Set enrolled students                         |
| GET, POST  | `/classes/:id/groups`   | A, T            | List and create groups (pair, random, manual) |

### Lab, devices and sessions

| Method    | Path                        | Who               | Purpose                                        |
| --------- | --------------------------- | ----------------- | ---------------------------------------------- |
| GET, POST | `/labs`                     | A                 | Manage labs (one or more) and seat layouts     |
| GET       | `/labs/:id/seats`           | A, T              | Seats with PC status and who is logged in now  |
| POST      | `/devices/register`         | Unapproved lab PC | PC asks to join; waits for admin approval      |
| GET       | `/devices`                  | A                 | All PCs, status, versions                      |
| PATCH     | `/devices/:id`              | A                 | Approve, bind to a seat, rename, retire        |
| POST      | `/sessions`                 | T                 | Start class: opens a session, takes attendance |
| POST      | `/sessions/:id/end`         | T                 | End class: saves, logs students off            |
| GET       | `/sessions/:id`             | T                 | Session details, attendance, events            |
| POST      | `/sessions/:id/media-token` | T, S              | LiveKit token for this session's rooms         |
| POST      | `/sessions/:id/collect`     | T                 | Ask target PCs to upload files                 |

### Lessons and quizzes

| Method             | Path                                             | Who                     | Purpose                                                                               |
| ------------------ | ------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------- |
| GET                | `/modules`                                       | All                     | The four modules                                                                      |
| GET, POST          | `/lessons`                                       | A, T (S: assigned only) | List with filters (module, status, kind); create                                      |
| GET, PATCH, DELETE | `/lessons/:id`                                   | A, T (author)           | Read, edit, delete a draft                                                            |
| POST               | `/lessons/:id/publish`, `/lessons/:id/unpublish` | A, T                    | Change status                                                                         |
| POST               | `/lessons/:id/media`                             | A, T                    | Upload MP3, MP4 video, image or PDF; video is converted to 720p in the background     |
| GET                | `/media/:id`                                     | Logged in               | Stream a file (range requests for audio and video; PDFs sent for in-app viewing only) |
| POST, GET          | `/lessons/import`, `/lessons/:id/export`         | A, T                    | Lesson packs (.zip)                                                                   |
| POST               | `/sessions/:id/quizzes`                          | T                       | Launch a quiz in class                                                                |
| POST               | `/quiz-runs/:id/responses`                       | S                       | Send an answer                                                                        |
| POST               | `/quiz-runs/:id/close`, `/quiz-runs/:id/share`   | T                       | Close and share results                                                               |

### Assignments, work and marking

| Method    | Path                           | Who            | Purpose                                          |
| --------- | ------------------------------ | -------------- | ------------------------------------------------ |
| GET, POST | `/assignments`                 | T (S: own)     | Assign a lesson to a class, group or student     |
| POST      | `/assignments/:id/submissions` | S              | Start an attempt                                 |
| PATCH     | `/submissions/:id`             | S              | Save answers (auto-saves every 10 s)             |
| POST      | `/submissions/:id/submit`      | S              | Submit; auto-marked questions are scored at once |
| POST      | `/answers/:id/recording`       | S              | Upload a speaking recording                      |
| GET       | `/grading-inbox`               | T              | Speaking and writing answers to mark             |
| POST      | `/submissions/:id/grade`       | T              | Rubric, score, comment, optional voice feedback  |
| GET       | `/students/:id/progress`       | A, T, S (self) | Scores and completion per module                 |

### Reports and system

| Method     | Path                                            | Who                   | Purpose                                                             |
| ---------- | ----------------------------------------------- | --------------------- | ------------------------------------------------------------------- |
| GET        | `/reports/attendance`, `/reports/results`       | A, T                  | Filters: class, student, module, date range; `format=json/pdf/xlsx` |
| GET, PATCH | `/settings`                                     | A (GET branding: all) | Institute settings, including branding (name, logo, main colour)    |
| GET, POST  | `/backups`                                      | A                     | List backups; back up now                                           |
| POST       | `/backups/:id/restore`, `/backups/:id/copy-usb` | A                     | Restore (needs admin password again); copy to USB                   |
| GET        | `/audit-logs`                                   | A                     | Search the audit log                                                |
| GET        | `/releases/latest?app=student`                  | D                     | Check for an app update                                             |
| GET        | `/health`                                       | Anyone on the LAN     | Server, database, LiveKit and disk status                           |

## Real-time lab events (Socket.IO)

Apps connect to `wss://lingualab.local/lab` with their access token. The server puts each connection in rooms: `lab:<labId>` (everyone in the lab), `session:<sessionId>`, `seat:<seatCode>` and `console:<labId>` (the teacher). Event names are constants in `packages/shared/events.ts`; payloads are Zod schemas there too.

**From the teacher console**

| Event         | Payload                                           | What the server does                                                                             |
| ------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `lab:command` | `{ type, targets: seatCode[] \| 'all', options }` | Checks role and session, logs it in session_events, sends the matching event to each target seat |
| `lab:stop`    | `{ type }`                                        | Stops a running control on all its targets                                                       |

Command types: `broadcast.start` (fullscreen, locked), `screendemo.start` (window), `whiteboard.start`, `demo.lesson.start` (mediaId), `demo.student.start` (seat), `quiz.start` (quizRunId), `intercom.start` (seat), `wholetalk.start`, `grouptalk.start` (groups), `monitor.start`, `lock`, `unlock`, `message` (text), `activity.launch` (lessonId), `collect.files`, `logout`.

**Server to student app (room `seat:<code>`)**

| Event                                    | Payload                                          | What the app does                                                                     |
| ---------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `lab:broadcast.start` / `.stop`          | `{ mode: 'fullscreen' \| 'window', mediaToken }` | Joins the LiveKit room and shows the teacher's screen; locks input in fullscreen mode |
| `lab:whiteboard.stroke`                  | `{ points, color, width }`                       | Draws the stroke on the board view                                                    |
| `lab:demo.sync`                          | `{ mediaId, position, playing }`                 | Plays the lesson audio or video in step with the teacher                              |
| `lab:quiz.start` / `.close` / `.results` | `{ quizRunId, questions, endsAt }`               | Shows the quiz; shows own results when shared                                         |
| `lab:voice.join` / `.leave`              | `{ room, mediaToken, canSpeak }`                 | Joins Whole Talk, Intercom or a Group Talk room                                       |
| `lab:monitor.start` / `.stop`            | `{ intervalMs: 3000 }`                           | Starts or stops sending thumbnails (shows nothing on screen)                          |
| `lab:lock` / `lab:unlock`                | `{ message? }`                                   | Shows or removes the lock screen                                                      |
| `lab:message`                            | `{ text }`                                       | Shows a message                                                                       |
| `lab:activity.launch`                    | `{ lessonId, assignmentId }`                     | Opens the lesson                                                                      |
| `lab:logout`                             | `{ reason }`                                     | Logs the student out                                                                  |

**From the student app**

| Event            | Payload                                              | What the server does                       |
| ---------------- | ---------------------------------------------------- | ------------------------------------------ |
| `seat:status`    | `{ activity, online, appVersion }`                   | Updates the seat and tells the console     |
| `seat:hand`      | `{ raised: boolean }`                                | Shows or clears the hand on the console    |
| `seat:thumbnail` | `{ jpegBase64 }` (320 px, every 3 s while monitored) | Forwards to the console only               |
| `quiz:answer`    | `{ quizRunId, questionId, response }`                | Saves it, marks it, updates the live count |

**Server to teacher console (room `console:<labId>`)**

| Event                | Payload                                                                           |
| -------------------- | --------------------------------------------------------------------------------- |
| `seat:update`        | `{ seatCode, online, student?: { id, name, studentId }, activity, hand, locked }` |
| `seat:thumbnail`     | `{ seatCode, jpegBase64 }`                                                        |
| `quiz:progress`      | `{ quizRunId, answered, total, perQuestion }`                                     |
| `session:attendance` | `{ present, absent: [...] }`                                                      |

**Reliability:** a student app that loses the connection retries with back-off (1, 2, 4, 8 s) and, on reconnecting, the server re-sends whatever is running for that seat (for example, an active broadcast or lock).

## Media rooms (LiveKit)

The server creates rooms per session and hands out short-lived tokens (`POST /sessions/:id/media-token`) whose permissions match the role. A student's token never allows publishing video unless the teacher has started a student demo for that seat.

| Room name                   | Used for                       | Publishes                                                                     | Subscribes                       |
| --------------------------- | ------------------------------ | ----------------------------------------------------------------------------- | -------------------------------- |
| `s-<sessionId>-screen`      | Broadcast PC, Screen Demo      | Teacher: screen (1080p, 15 fps, simulcast 1080/720/360) and optional PC audio | Target seats                     |
| `s-<sessionId>-demo`        | Student demo                   | The presenting student: screen + mic                                          | Teacher and other seats          |
| `s-<sessionId>-talk`        | Whole Talk                     | Teacher: mic                                                                  | Target seats                     |
| `s-<sessionId>-ic-<seat>`   | Intercom                       | Teacher and one student: mic                                                  | Each other                       |
| `s-<sessionId>-g<n>`        | Group Talk, one room per group | Group members: mic                                                            | Group members (teacher may join) |
| `s-<sessionId>-view-<seat>` | Monitor live view of one seat  | That student: screen, only while the teacher watches                          | Teacher                          |

**Media settings:** Opus voice at 32–64 kbps with echo cancellation and noise suppression; screen as VP8 or H.264 tuned for text (content hint "text"); UDP ports 50000–50200 on the server; TURN not needed on a single LAN. Lesson videos in Demo are served as files from `/media/:id` and kept in sync with `lab:demo.sync`, not sent through LiveKit.

**Signalling address:** the apps connect to `wss://<server>/livekit`, on 443 through Caddy, never to LiveKit's own port 7880. Caddy strips the prefix with `handle_path /livekit/*` before passing the request to `livekit:7880`, so LiveKit sees the `/rtc` path it expects. Media itself does not go through Caddy: it is UDP straight to ports 50000–50200 on the server (see the port table in 02-architecture.md).

This is a decision, not yet built: `infra/Caddyfile` still uses `handle`, which does not strip the prefix, so `/livekit/*` currently returns LiveKit's own 404. It is implemented with LAB-04 in Phase 2 — see 09-project-plan.md.
