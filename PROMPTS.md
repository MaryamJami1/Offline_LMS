# LinguaLab: Claude Code prompt playbook

Every prompt you need to build LinguaLab with Claude Code, from Phase 0 to version 1.0. Every prompt matches a task in `docs/09-project-plan.md`, and the requirement and test IDs come from `docs/01-requirements.md` and `docs/08-testing.md`.

## How to use this file

1. **One prompt, one task.** Copy the prompt, fill in anything in `<angle brackets>`, and paste it into Claude Code.
2. **Start a fresh session for each new task.** Exit Claude Code and run `claude` again. That way Claude starts clean and reads `CLAUDE.md` again.
3. **Read the plan before saying yes.** Every prompt asks Claude for a plan first. Reply "go", or correct the plan.
4. **Don't accept "done" without real test output.** If you are not sure, paste **U4**.
5. **After every task**, paste **U3** (commit and pull request). **After every phase**, paste **U5** (phase check).
6. Follow-up messages can be in Roman Urdu; Claude will reply in the same language. Code and docs stay in English.
7. A screenshot number in a prompt, such as `prototype/screenshots/14`, means the file that starts with that number (`14-student-listening-marked.png`); `prototype/README.md` lists them all.

**Before you start:** have Claude Code, Node.js 22 LTS, pnpm (`corepack enable`), Git, Docker Desktop and the GitHub CLI installed, and run `gh auth login` once. Have a second Windows PC ready by Phase 0 task 7.

**Contents**

- [Everyday prompts (U1–U12)](#everyday-prompts)
- [Phase 0: Setup and risk check (week 1)](#phase-0-setup-and-risk-check-week-1)
- [Phase 1: Foundation (weeks 2–4)](#phase-1-foundation-weeks-24)
- [Phase 2: Lab core and lesson editor (weeks 5–9)](#phase-2-lab-core-and-lesson-editor-weeks-59)
- [Phase 3: Lab advanced (weeks 10–12)](#phase-3-lab-advanced-weeks-1012)
- [Phase 4: English modules (weeks 13–15)](#phase-4-english-modules-weeks-1315)
- [Phase 5: Reports, hardening and launch (weeks 16–17)](#phase-5-reports-hardening-and-launch-weeks-1617)
- [Optional: only if the institute agrees](#optional-only-if-the-institute-agrees)

---

## Everyday prompts

### U1. Start of a session, or coming back after a break

```text
Read CLAUDE.md. Then run `git status`, `git log --oneline -10` and `pnpm test`, and tell me:
which phase we are in, which checklist tasks are done, the next unchecked task, and whether
all tests pass. Don't change any files yet.
```

Until Phase 0 task 2 is done, `pnpm test` does not exist yet; Claude will say so.

### U2. Any task that is not in this file

```text
Next task: <what to build>. It covers <requirement IDs> and tests <test IDs from docs/08-testing.md>.
1. Read the docs that matter for it (the "Source of truth" table in CLAUDE.md) and tell me the plan:
   files to create or change, the tests you will write first, and anything unclear. Wait for my OK.
2. Then follow the TDD loop in CLAUDE.md: write the failing tests, run them and show me they fail,
   write the code, run them again and show me they pass.
3. Run pnpm lint, pnpm typecheck and the full pnpm test, and show me the real results.
```

### U3. Finish a task: commit and pull request

```text
This task is done. First check: its tests are named after the requirement ID; the full pnpm test,
pnpm lint and pnpm typecheck pass (run them and show the results); any doc this change affects is
updated. Then tick the task in CLAUDE.md, commit on a branch feat/<ID>-<short-name> with a
Conventional Commit message (feat(<ID>): ...), push it, and open a pull request with gh that lists
the requirement IDs and test IDs. Tell me when CI is green.
```

### U4. Prove it

```text
Before we go on, prove it: run the exact tests for this task and then the full suite, and paste the
real summary lines (passed and failed counts, coverage). List every requirement ID and test ID you
covered. If anything was skipped, mocked, or left as a TODO, say so plainly.
```

### U5. End of a phase

```text
I think Phase <N> is finished. Check it against docs/09-project-plan.md:
- every task in the Phase <N> checklist, one by one, with the test files that prove it;
- the exit criteria: run everything that can run here (full suite, coverage, e2e) and show real results;
- for anything that needs real PCs, give me a step-by-step manual checklist.
List what is missing. If nothing is missing, replace the "Current phase" section of CLAUDE.md with
Phase <N+1>, copying its tasks and exit criteria from docs/09-project-plan.md, and commit.
```

### U6. Fix a bug

```text
Bug: <what happens, the steps to make it happen, what should happen, any error text>.
First write a test that reproduces it and show me that it fails. Then fix the cause, not the symptom,
show me the test passing, and run the full suite. Name the test after the requirement the bug breaks.
```

### U7. Make a screen match the prototype

```text
Compare screen <ID, e.g. A-02> with prototype/screenshots/<file>.png and
prototype/source/<file>.dc.html. Run the app, take a 1440x900 screenshot with Playwright, and list
every difference in layout, colours, fonts, spacing and text. Fix them with packages/ui tokens and
components (no hard-coded colours, branding from settings). Show me the before and after screenshots.
```

### U8. The institute asks for a change

```text
The institute asked for a change: <describe it>.
Don't write code yet. Tell me which requirement IDs, screens, tables, endpoints and tests it touches,
whether it is Must, Should or Could, and how it changes the timeline. When I agree, update
docs/01-requirements.md and the other docs first and commit that; then build it test-first like any
other task.
```

### U9. Claude is stuck or going in circles

```text
Stop changing code. You have tried several times and it still fails. Explain simply: what you
expected, what actually happens (the exact error), what you have tried, and your two or three best
guesses for the cause. Suggest the smallest experiment that shows which guess is right.
Don't weaken or delete any test.
```

### U10. Review before merging

```text
Review this branch against main like a strict senior reviewer. Check: tests written first, named by
requirement ID, and failing without the change; role and ownership checks on the server; no `any`;
no hard-coded branding; offline only (no CDN or internet calls); Zod contracts in packages/shared;
docs updated; screens match the prototype. List the problems by severity with file and line.
Don't fix anything until I say.
```

### U11. Friday demo notes

```text
Prepare my Friday demo for the institute. From the git log since last Friday, list what was finished
in plain English (no technical words), write a 15-minute demo script for the test bench, and say what
comes next week. Save it as notes/demo-<yyyy-mm-dd>.md.
```

### U12. Teach me what you built

```text
Explain what you built in this task in Roman Urdu, simply: which files, how a request flows through
them, and why the tests are written the way they are. Use one small example.
```

---

## Phase 0: Setup and risk check (week 1)

### P0-1. Monorepo

```text
Phase 0, task 1: monorepo.
Read CLAUDE.md and docs/02-architecture.md (stack, repository layout, coding standards).
Create the pnpm workspace with Turborepo, strict TypeScript (one shared base tsconfig), ESLint and
Prettier, and an empty package for every folder in the "Target repository layout" in CLAUDE.md.
Add root scripts for the commands listed in CLAUDE.md (any that cannot work yet print "not yet").
Add .gitignore, .editorconfig, .nvmrc (Node 22) and a short root README.
Tell me the plan before writing files.
```

### P0-2. Test tools and CI

```text
Phase 0, task 2: test tools and CI.
Read docs/08-testing.md (test levels, coverage targets, continuous integration).
Set up Vitest in every package, with coverage thresholds of 80% lines and 70% branches for
apps/server and packages/shared; Testing Library for the React packages; Supertest for the server;
Playwright in e2e/. Add Husky and lint-staged to run lint and related tests before each commit.
Add a GitHub Actions workflow that runs lint, typecheck and all tests on every pull request, with a
PostgreSQL 16 service ready for later API tests.
Prove the setup works with one tiny real test in packages/shared, written test-first (for example a
function that turns a seat code like " b4 " into "B4"): show me the failing run, then the passing run.
Tell me the plan before writing files.
```

### P0-3. GitHub repository, milestones and issues

```text
Phase 0, task 3: GitHub project.
I created an empty private repository: <https://github.com/maryamjami1/lingualab>. Connect this
folder to it and push main.
Then, with the gh CLI: create one milestone per phase (Phase 0 to Phase 5, from
docs/09-project-plan.md); one issue per requirement ID in docs/01-requirements.md (title like
"LAB-04 Broadcast PC"), labelled must, should or could, in the milestone of the phase that builds it,
with its test IDs from docs/08-testing.md in the description. Add a pull request template with the
questions from "Working method" in docs/09-project-plan.md.
Show me the list of issues before creating them.
```

### P0-4. Docker and the first endpoint

```text
Phase 0, task 4: infrastructure and the first real endpoint.
Read docs/02-architecture.md (ports) and docs/07-installation.md.
Create infra/docker-compose.yml with PostgreSQL 16, LiveKit and Caddy, plus infra/livekit.yaml and
infra/Caddyfile. LiveKit must advertise my laptop's LAN IP, not the container's IP, so that other PCs
can connect; keep that IP and all secrets in a .env file (add .env.example, never commit .env).
Then, test-first, create the NestJS app in apps/server with GET /api/health reporting server,
database, LiveKit and disk status (docs/04-api-and-events.md). Write the Supertest test first and
show me it failing.
Tell me the plan before writing files.
```

### P0-5. Spike: screen broadcast

```text
Phase 0, task 5: broadcast spike. This is throwaway proof-of-concept code in spikes/broadcast/; it is
not test-first and is never shipped (see the spikes rule in CLAUDE.md).
Goal: prove that screen sharing works over our LAN before we build anything on top of it.
Build the smallest possible pair of Electron apps:
- teacher: captures the whole screen with desktopCapturer and publishes it to a LiveKit room
  (content hint "text", 1080p, 15 fps; see NFR-03 and "Media settings" in docs/04-api-and-events.md);
- student: joins the room and shows the screen full-screen.
A tiny script can create LiveKit tokens with the LiveKit server SDK. The LiveKit address comes from a
config file, so the student app can run on another PC. If screen capture needs HTTPS, use Caddy's
local certificate authority as described under "Transport" in docs/06-security-and-data.md.
Tell me the plan, including how I will run the student side on my second PC.
```

### P0-6. Spike: voice

```text
Phase 0, task 6: voice spike (same spikes/ folder, same throwaway rules).
Add a "Talk" button to the spike teacher app that publishes the microphone (Opus, with echo
cancellation, noise suppression and auto gain on), and make the student app play it. If LiveKit
stats allow it, show the measured delay on screen. Keep it minimal.
```

### P0-7. Run the spike on two PCs

```text
Phase 0, task 7: run the spike on two PCs.
My laptop runs Docker and the teacher spike; its LAN IP is <laptop IP>. My second Windows PC is on the
same switch with IP <second PC IP>.
Give me exact steps: build or copy the student spike to the second PC, set the server address, open
the Windows firewall ports from the ports table in docs/02-architecture.md, and what to check.
Then help me read the results: text readability, frame rate, delay, voice clarity, echo.
Write the results, what we learned and any settings to change into docs/spike-results.md.
```

Record a short video of the two PCs working (a Phase 0 deliverable), then paste **U5** with N = 0.

---

## Phase 1: Foundation (weeks 2–4)

### P1-1. Database foundation

```text
Phase 1, task 1: database foundation.
Read docs/03-database.md (People, Organisation, and Lab and sessions) and the glossary in
docs/00-overview.md.
Create the Prisma schema and migrations for those tables, and a seed script with 1 admin, 2 teachers,
2 classes, 30 students, Lab 1 with a 30-seat map like the prototype, and default settings (software
name "LinguaLab"). Write tests first for every rule (unique student IDs, seat codes unique per lab,
at most one active login per student).
Tell me the plan before writing files.
```

### P1-2. Login and tokens

```text
Phase 1, task 2: authentication. Covers NFR-13; test T-SEC-01.
Read "Auth and users" in docs/04-api-and-events.md and "Authentication, sessions and device trust"
in docs/06-security-and-data.md.
Test-first: POST /auth/login, /auth/refresh, /auth/logout, /auth/change-password and GET /me;
Argon2id hashing; access JWT of 15 minutes; refresh tokens stored hashed; staff refresh tokens last
7 days; five wrong passwords lock the account for 10 minutes (T-SEC-01). Passwords and tokens must
never appear in logs.
Tell me the plan before writing files.
```

### P1-3. Roles and permissions

```text
Phase 1, task 3: role guards and the permissions test. Test T-ACL-01.
Read "Roles and permissions" in docs/06-security-and-data.md.
Build the role guard and the ownership checks (teachers only act on their own classes; students only
see their own data). Write a data-driven test that tries every row of the permissions table as admin,
teacher (own class), teacher (other class) and student, expecting 200 or 403. Rows for endpoints that
do not exist yet are marked todo and switched on as each endpoint is built.
Tell me the plan before writing files.
```

### P1-4. Users and Excel import

```text
Phase 1, task 4: users. Covers ADM-01 and ADM-02; test T-ADM-02.
Read "Auth and users" in docs/04-api-and-events.md.
Test-first: create, edit and deactivate teachers and students; the admin sets each new account's
first-login password, and the user must change it at first login. POST /users/import accepts Excel
or CSV (name, class, phone), creates valid rows, reports bad rows with line numbers, and never creates
duplicates (T-ADM-02). Ask me before adding the Excel library.
Tell me the plan before writing files.
```

### P1-5. Teachers reset their students' passwords

```text
Phase 1, task 5: password reset. Covers ADM-11; test T-ADM-11.
Test-first: POST /users/:id/reset-password works for an admin on anyone, and for a teacher only on
students in that teacher's own classes; a teacher resetting a student of another class, or any staff
account, gets 403. Every reset writes an audit log entry (create the audit_logs table from the System
section of docs/03-database.md if it is not there yet). Add the matching rows to the T-ACL-01 test.
Tell me the plan before writing files.
```

### P1-6. Courses, classes and groups

```text
Phase 1, task 6: organisation. Covers ADM-03.
Read "Organisation" in docs/03-database.md and "Classes and groups" in
docs/04-api-and-events.md.
Test-first: courses, batches, classes, assigning teachers and students to classes, GET
/classes/:id/students, and groups (pair, random, manual). Teachers can list only their own classes.
Tell me the plan before writing files.
```

### P1-7. Labs, seat maps and PC approval

```text
Phase 1, task 7: labs and devices. Covers ADM-04.
Read "Lab and sessions" in docs/03-database.md and "Device trust (lab PCs)" in
docs/06-security-and-data.md.
Test-first: create one or more labs with seat maps (rows, seats per row, pairs); POST
/devices/register from an unknown PC creates a pending device; the admin approves it and binds it to
a seat (PATCH /devices/:id); the server issues a device key; GET /devices shows status and app version.
Student logins and lab events will later require a valid device key.
Tell me the plan before writing files.
```

### P1-8. Student login at any PC

```text
Phase 1, task 8: student login at any free PC. Covers STU-01; tests T-STU-01a and T-STU-01b.
Test-first: a student login from an approved PC records the seat in device_logins; a login from an
unknown PC gets 403 (T-STU-01a); logging in on a second PC ends the first login and frees that seat
(T-STU-01b). Nothing about a student may depend on a particular PC (rule 9 in CLAUDE.md).
Tell me the plan before writing files.
```

### P1-9. Shared UI kit and branding

```text
Phase 1, task 9: packages/ui.
Read docs/05-screens-and-ux.md (colour tokens, type, components) and look at the styles in
prototype/source/*.dc.html.
Build the design tokens and the shared components listed in docs/05-screens-and-ux.md
(Button, Seat tile, Control button, Tab rail, Card, Badge, Progress bar, Level meter, Toast, Modal,
Table, Option button, Form fields) on shadcn/ui with Tailwind, with IBM Plex from @fontsource
(no internet fonts). Add a BrandingProvider that reads the software name, logo and main colour from
GET /settings and falls back to "LinguaLab" defaults (rule 8 in CLAUDE.md). Component tests first,
including keyboard use and 4.5:1 contrast (NFR-11).
Tell me the plan before writing files.
```

### P1-10. Admin panel screens

```text
Phase 1, task 10: admin panel. Screens A-01, A-02, A-03, A-04 and A-07.
Read the admin screens in docs/05-screens-and-ux.md and compare with prototype/screenshots/22, 23
and 26 (A-03 and A-04 have no screenshot; follow prototype/source/Admin.dc.html).
Build apps/admin (React + Vite) with login, the dashboard, students (with today's seat, add, import,
reset password), teachers, classes, and lab and seats (lab picker, seat map, PC details, approve new
PCs). Use only packages/ui components. Test-first: component tests for each screen, and one Playwright
journey: admin logs in, imports students, approves a PC and binds it to a seat.
Tell me the plan before writing files.
```

Then paste **U7** for each screen.

### P1-11. Student app shell (kiosk)

```text
Phase 1, task 11: student app shell. Covers STU-06 and STU-07; tests T-STU-06 and T-STU-07; screen S-01.
Read "Student app lock-down" and "Device trust (lab PCs)" in docs/06-security-and-data.md.
Build apps/student in Electron + React: starts with Windows, runs in kiosk mode, and cannot be closed
without the admin PIN (T-STU-06, Electron e2e); first start registers the PC and waits for approval,
then stores the device key in the Windows Credential Manager; the S-01 login screen shows this PC and
its seat; the student is logged out by hand, at End class, and after 30 idle minutes (T-STU-07 with
fake timers). The server address comes from a config file.
Tell me the plan, and how I can test kiosk mode on my second PC without locking my laptop.
```

Phase 1 exit check: paste **U5** with N = 1. It includes 30 test accounts logging in at random seats on 2 PCs.

---

## Phase 2: Lab core and lesson editor (weeks 5–9)

### P2-1. Real-time gateway and fake lab

```text
Phase 2, task 1: Socket.IO gateway. Covers LAB-01 and NFR-08; test T-LAB-01.
Read "Real-time lab events (Socket.IO)" in docs/04-api-and-events.md.
First build the fake lab in packages/test-utils: N simulated seats with socket.io-client that log in,
join and react to events, because every real-time test will use it.
Then, test-first: the gateway authenticates with the access token (plus the device key for seats);
puts connections in the rooms lab:<labId>, session:<sessionId>, seat:<seatCode> and console:<labId>;
sends seat:update to the console within 2 s of a login (T-LAB-01); and re-sends the full seat state
after a reconnect (reconnect under 10 s, NFR-08). Event names go in packages/shared/events.ts and every
payload is a Zod schema in packages/shared.
Tell me the plan before writing files.
```

### P2-2. Teacher console: seat grid, selection and status bar

```text
Phase 2, task 2: teacher console. Covers LAB-01, LAB-02 and LAB-16; tests T-LAB-02 and T-LAB-16;
screens T-01 and T-02.
Read the teacher screens in docs/05-screens-and-ux.md and compare with prototype/screenshots/02 and 03.
Build apps/teacher in Electron + React: teacher login (T-01); the seat grid in room order with each
seat's state (offline, free, logged-in student, hand raised, activity); selecting one seat, several,
a group or all, where nothing selected means every logged-in student (T-LAB-02, unit); the eight
control buttons; and the status bar showing what is running, for whom and for how long, with one Stop
that ends it on every target (T-LAB-16, real-time). Component tests first for the seat tile states.
Tell me the plan before writing files.
```

### P2-3. Start and End class

```text
Phase 2, task 3: sessions. Covers LAB-03; test T-LAB-03; screen T-07.
Test-first: POST /sessions starts a class and marks logged-in students present and the rest absent;
a later login marks the student late; session:attendance updates the console; POST /sessions/:id/end
saves everything and logs every student out; the end-class summary (T-07) shows present, duration,
quizzes and average.
Tell me the plan before writing files.
```

### P2-4. Broadcast PC and Screen Demo

```text
Phase 2, task 4: broadcast. Covers LAB-04, LAB-05 and STU-03; tests T-LAB-04 and T-STU-03; screen S-08.
Read docs/spike-results.md first and reuse what the spike proved, rebuilt properly with tests in apps/.
Test-first: lab:command broadcast.start is checked on the server (role, own class, running session)
and logged in session_events; it reaches only the target seats; a teacher of another class is refused;
a seat that reconnects receives the broadcast again (T-LAB-04). POST /sessions/:id/media-token gives
students subscribe-only tokens. On the student side, fullscreen mode locks keyboard and mouse,
window mode (Screen Demo) does not, and the takeover cannot be closed from the student app; only the
teacher's Stop removes it (T-STU-03, Electron e2e).
Tell me the plan before writing files.
```

### P2-5. Whole Talk

```text
Phase 2, task 5: Whole Talk (part of LAB-09).
Read "Media rooms (LiveKit)" in docs/04-api-and-events.md.
Test-first: wholetalk.start sends lab:voice.join to the target seats only, for the room
s-<sessionId>-talk; the teacher's token can publish the microphone and the students' tokens can only
subscribe (canSpeak false); Stop sends lab:voice.leave. Show a talk level meter on the console (T-03).
Voice settings: Opus 32–64 kbps, echo cancellation and noise suppression on (NFR-04).
Tell me the plan before writing files.
```

### P2-6. Lock, unlock, message, launch activity

```text
Phase 2, task 6: lab commands. Covers LAB-13; test T-LAB-13.
Test-first: lock, unlock, message and activity.launch reach the target seats; "Lock all" reaches 60
fake seats in under 1 s (T-LAB-13, performance test with the fake lab). On the student app, the lock
screen shows the optional message and blocks Alt+F4 while a control is running (see "Student app
lock-down" in docs/06-security-and-data.md); activity.launch opens the given lesson.
Tell me the plan before writing files.
```

### P2-7. White Board

```text
Phase 2, task 7: White Board. Covers LAB-06; screen T-04.
Compare with prototype/screenshots/07.
Test-first: whiteboard.start opens the board on the targets; strokes from the teacher
(lab:whiteboard.stroke) are drawn live on the student screens; Clear clears every board; "Save to
lesson" stores the board as an image on a lesson. Use Excalidraw on the teacher side as in
docs/02-architecture.md.
Tell me the plan before writing files.
```

### P2-8. My class students (teacher password reset screen)

```text
Phase 2, task 8: teacher screen T-09. Covers ADM-11 (screen).
Build the "My class students" screen in the teacher console: the student list of the teacher's own
classes from GET /classes/:id/students, with a Reset password button that calls the endpoint from
Phase 1 and shows the new first-login password once. Component test first, then a Playwright journey.
Tell me the plan before writing files.
```

### P2-9. Content and lesson editor

```text
Phase 2, task 9: lesson editor. Covers MOD-05 and ADM-05 (lessons); test T-MOD-05; screens A-05 and A-06.
Read "Content" in docs/03-database.md and "Lessons and quizzes" in docs/04-api-and-events.md;
compare with prototype/screenshots/24 and 25.
Test-first: the content list with module tabs; the editor with module, title, class, instructions,
text, five question types (multiple choice, true/false, fill in the blank, recording, free writing),
live student preview, save as draft and publish. Publishing is refused without a title, with no
questions, with a multiple-choice question that has fewer than two answers or no correct answer, or
with a gap question that has no answer (T-MOD-05, component and API). Teachers and admins both use it.
Tell me the plan before writing files.
```

### P2-10. Media upload: MP3, video and PDF

```text
Phase 2, task 10: lesson files. Covers MOD-05 and MOD-10 (server side); test T-MOD-10a.
Read "File storage, indexes and retention" in docs/03-database.md.
Test-first: POST /lessons/:id/media accepts MP3, MP4 and PDF up to 1 GB and refuses anything else; a
video is converted in the background with ffmpeg to 720p H.264, the original is removed, and the
editor shows "processing" until it is ready; GET /media/:id streams with range requests (T-MOD-10a,
integration test). Add the upload buttons to the lesson editor (A-06).
Tell me the plan before writing files.
```

### P2-11. Lesson packs

```text
Phase 2, task 11: lesson packs. Covers ADM-05 (import and export).
Test-first: GET /lessons/:id/export downloads a .zip with the lesson and its files; POST
/lessons/import brings it back as a draft, on the same or another server, with no duplicate files.
Tell me the plan before writing files.
```

### P2-12. Sample lessons

```text
Phase 2, task 12: sample content.
Write two short sample lessons per module (Speaking, Reading, Writing, Listening) at beginner level,
with questions of every type the editor supports, and a seed script that creates them through the
API (not straight into the database), so the editor's validation rules are used. Put small,
royalty-free placeholder audio and PDF files in the seed folder, generated locally (no downloads).
Tell me the plan before writing files.
```

### P2-13. Gate 1 preparation (10-PC test)

```text
Phase 2, task 13: prepare Gate 1.
Read "Load test for a full class" in docs/08-testing.md.
Make unsigned Windows test builds of the teacher and student apps that read the server address from
a config file, and a script that records server CPU, memory, network and LiveKit statistics during
the test. Write notes/gate-1-checklist.md: the setup steps for 10 PCs, the parts of the 20-minute
script that apply to Phase 2 features, and the pass criteria (smooth broadcast, clear voice, lock in
under 1 s) with space to write the results.
Tell me the plan before writing files.
```

Run the test in the lab, then paste **U5** with N = 2. That is Gate 1.

---

## Phase 3: Lab advanced (weeks 10–12)

### P3-1. Monitor

```text
Phase 3, task 1: Monitor. Covers LAB-11 and NFR-06; tests T-LAB-11 and T-LAB-11b; screen T-05.
Compare with prototype/screenshots/08 and 09.
Test-first: while Monitor is on, each student app sends a 320 px JPEG thumbnail every 3 s; thumbnails
go only to the console and are never written to disk; they stop when Monitor stops (T-LAB-11). The
student app shows no icon or message while Monitor runs (T-LAB-11b, Electron e2e). Clicking a
thumbnail opens a live full-size view: only that seat gets permission to publish its screen, and only
while the view is open. Keep 60 thumbnails under 5 Mbps.
Tell me the plan before writing files.
```

### P3-2. Take control (Should, only if time allows)

```text
Phase 3, task 2: take control from the live view. Covers LAB-12 (Should).
Don't write code yet. Propose how the teacher's mouse and keyboard can control a student PC from the
live view, which security checks it needs (only the teacher of the running session, only while the
live view is open, logged in the audit log), and how long it would take. Wait for my decision.
```

### P3-3. Intercom and mute

```text
Phase 3, task 3: Intercom and mute. Covers LAB-09; test T-LAB-09.
Test-first: intercom.start needs exactly one seat; the teacher and that student both get tokens for
the room s-<sessionId>-ic-<seat> and no other room (T-LAB-09, unit); nobody else hears them. The
teacher can mute any speaker from the server, and the student cannot unmute themselves. Show the
intercom call panel (T-03, prototype/screenshots/06).
Tell me the plan before writing files.
```

### P3-4. Hand raise

```text
Phase 3, task 4: hand raise. Covers LAB-10 and STU-04; test T-LAB-10.
Test-first: the student raises and lowers a hand (seat:hand); the hand shows on the seat and in a list
on the console; one-click Talk starts an intercom with that student and lowers the hand (T-LAB-10).
Tell me the plan before writing files.
```

### P3-5. Groups and Group Talk

```text
Phase 3, task 5: groups. Covers LAB-15 and LAB-09 (Group Talk); screen T-06.
Compare with prototype/screenshots/10.
Test-first: make groups by pairing seats, random groups of N, or by hand; grouptalk.start creates one
room per group (s-<sessionId>-g<n>) where only its members speak and listen; the teacher can join any
group to listen or speak; Stop ends every group room.
Tell me the plan before writing files.
```

### P3-6. Demo: lesson playback and student demo

```text
Phase 3, task 6: Demo, both modes. Covers LAB-07.
Lesson mode, test-first: demo.lesson.start(mediaId) makes every target stream the file from
/media/:id (not through LiveKit); play, pause and seek on the console send lab:demo.sync, and every
seat stays within 1 s of the teacher's position, for audio and video.
Student mode, test-first: demo.student.start(seat) gives only that seat temporary permission to
publish its screen and microphone, the class subscribes, and Stop takes the permission away.
Tell me the plan before writing files.
```

### P3-7. Quiz

```text
Phase 3, task 7: live quiz. Covers LAB-08; tests T-LAB-08a and T-LAB-08b; screens T-03 and T-06.
Compare with prototype/screenshots/05 and 21.
Test-first: a quiz bank; POST /sessions/:id/quizzes launches a quiz with a timer as a takeover on the
targets; answers arrive with quiz:answer and are auto-marked (multiple choice, true/false, gap), and
the live count on the console matches the answers received (T-LAB-08a); answers after the quiz closes
are refused, and shared results show each student only their own (T-LAB-08b).
Tell me the plan before writing files.
```

### P3-8. Collect files (Should, only if time allows)

```text
Phase 3, task 8: collect files. Covers LAB-14 (Should).
Test-first: POST /sessions/:id/collect asks the target PCs to upload the files from the student's
Documents folder into the session, with a size limit, and the teacher sees who has sent what.
Tell me the plan before writing files.
```

### P3-9. Console polish

```text
Phase 3, task 9: compare every console panel and tab (T-03 to T-07) with prototype/screenshots/03 to 11,
as in prompt U7, and fix the differences. Then check that every control is reachable by keyboard and
that common actions take one or two clicks (NFR-10, NFR-11).
```

Then paste **U5** with N = 3. The exit criteria need all eight controls tested on 10 PCs.

---

## Phase 4: English modules (weeks 13–15)

### P4-1. Assignments

```text
Phase 4, task 1: assignments. Covers MOD-06.
Test-first: a teacher assigns a published lesson to a class, a group or one student, with an optional
due date; students see only their own assignments (add the rows to T-ACL-01).
Tell me the plan before writing files.
```

### P4-2. Marking engine

```text
Phase 4, task 2: automatic marking. Covers MOD-02 and MOD-04; test T-MOD-02.
Build it as pure functions in packages/shared, test-first: multiple choice, true/false, matching, fill
in the blank (ignores case and extra spaces), and dictation scored by words correct (T-MOD-02).
Include edge cases: empty answers, punctuation, apostrophes such as "it's".
Tell me the plan before writing files.
```

### P4-3. Submissions

```text
Phase 4, task 3: attempts and submissions.
Read "Work and results" in docs/03-database.md and "Assignments, work and marking" in
docs/04-api-and-events.md.
Test-first: POST /assignments/:id/submissions starts an attempt; PATCH /submissions/:id auto-saves
answers every 10 s; POST /submissions/:id/submit scores the auto-marked questions at once with the
marking engine and sends recordings and essays to the grading inbox.
Tell me the plan before writing files.
```

### P4-4. Student dashboard, module page, results

```text
Phase 4, task 4: student home. Covers STU-02, STU-05 and MOD-08 (display); screens S-02, S-07 and S-09.
Compare with prototype/screenshots/13 and 18 (S-09 is not in the prototype; design it from the same
components).
Test-first: the dashboard with today's work, the four module tiles with progress, latest marks and
feedback; the module page with units and lessons, done and to do; My results. A student never sees
another student's data.
Tell me the plan before writing files.
```

### P4-5. Listening exercise

```text
Phase 4, task 5: Listening. Covers MOD-04; screen S-03.
Compare with prototype/screenshots/14.
Test-first: the audio player with the play-count limit set by the teacher (the count is saved with
the submission); multiple choice, fill in the blank and dictation; the transcript appears only after
submitting; marks show at once.
Tell me the plan before writing files.
```

### P4-6. Reading exercise

```text
Phase 4, task 6: Reading. Covers MOD-02; screen S-04.
Compare with prototype/screenshots/15.
Test-first: the passage with its glossary; multiple choice, true/false, fill in the blank and matching;
automatic marking.
Tell me the plan before writing files.
```

### P4-7. Recorder and Speaking task

```text
Phase 4, task 7: Speaking. Covers MOD-01; test T-MOD-01; screen S-05.
Compare with prototype/screenshots/16.
Test-first: a Recorder component (MediaRecorder, WebM/Opus, up to 60 s, level meter, play back,
record again); the speaking task with prompt and model audio; POST /answers/:id/recording saves the
file under /data/recordings/ and refuses recordings over 60 s or 5 MB (T-MOD-01). The recording must
play back from the server.
Tell me the plan before writing files.
```

### P4-8. Writing task

```text
Phase 4, task 8: Writing. Covers MOD-03; screen S-06.
Compare with prototype/screenshots/17.
Test-first: sentence, paragraph and essay tasks with a live word counter and minimum and maximum word
limits; grammar exercises that use the auto-marked question types; the essay goes to the grading
inbox on submit.
Tell me the plan before writing files.
```

### P4-9. Video and PDF viewer

```text
Phase 4, task 9: video and PDF viewer. Covers MOD-10; test T-MOD-10b; screen S-10.
S-10 is not in the prototype; design it from packages/ui components.
Test-first: the student app plays lesson videos (play, pause, seek, full screen) and shows PDFs with
pdf.js (pages, zoom), with no download, save or print option anywhere, including right-click and
keyboard shortcuts. The Electron e2e test runs with the internet route blocked (T-MOD-10b).
Tell me the plan before writing files.
```

### P4-10. Grading inbox

```text
Phase 4, task 10: grading inbox. Covers MOD-07; test T-MOD-07; screen T-08.
T-08 is not in the prototype; design it from packages/ui components.
Test-first: GET /grading-inbox lists speaking and writing answers from the teacher's own classes;
POST /submissions/:id/grade saves the rubric (pronunciation, fluency, accuracy for speaking), the score,
a comment and an optional voice note (saved under /data/feedback/), updates the final score and the
student's progress (T-MOD-07). Every grade change goes in the audit log.
Tell me the plan before writing files.
```

### P4-11. Progress

```text
Phase 4, task 11: progress. Covers MOD-08; test T-MOD-08.
Test-first: progress = the average of marked submissions, and completion = finished / assigned, per
student and module (T-MOD-08, unit); GET /students/:id/progress returns it for admins, the student's
own teachers, and the student only for themselves.
Tell me the plan before writing files.
```

### P4-12. Phase 4 end-to-end journey

```text
Phase 4, task 12: write the Playwright end-to-end journey that proves the exit criteria: one student
logs in at any seat, does one assigned lesson in each module (Listening, Reading, Speaking with a
recording, Writing), watches a lesson video and opens a PDF; the teacher marks the speaking and writing
answers in the grading inbox; the student sees the marks and feedback. Show me it passing.
```

Then paste **U5** with N = 4.

---

## Phase 5: Reports, hardening and launch (weeks 16–17)

### P5-1. Reports

```text
Phase 5, task 1: reports. Covers ADM-06; screen A-08.
Compare with prototype/screenshots/27.
Test-first: GET /reports/attendance and /reports/results with filters (class, student, module, date
range) and format=json, pdf or xlsx; charts and tables in the admin panel; teachers only see their own
classes. Suggest the PDF and Excel libraries and ask me before adding them.
Tell me the plan before writing files.
```

### P5-2. Backups and restore

```text
Phase 5, task 2: backups. Covers ADM-08 and NFR-09; test T-ADM-08; screen A-09.
Read "Backup and restore policy" in docs/06-security-and-data.md.
Test-first: "Back up now" and the automatic nightly backup (database and files) at the time set in
Settings, keeping 14 days; copy to USB; restore needs the admin password again; a backup restores into
an empty database and the data matches the original (T-ADM-08, integration). Write
notes/restore-drill.md with the steps for the first restore drill on the spare PC.
Tell me the plan before writing files.
```

### P5-3. Settings and branding

```text
Phase 5, task 3: Settings. Covers ADM-07; test T-ADM-07; screen A-10.
Compare with prototype/screenshots/29.
Test-first: the admin changes the software name, logo, main colour, institute name, grading scale,
quiz pass mark and backup time; after changing the name, logo and colour, all three apps show them at
their next start (T-ADM-07, end-to-end). Search the code for any hard-coded product name or main
colour and remove it.
Tell me the plan before writing files.
```

### P5-4. Audit log

```text
Phase 5, task 4: audit log. Covers ADM-09; screen A-11.
Test-first: logins (success and failure), grade changes, password resets (by admin or teacher),
deletions and lab commands are all written to the audit log; GET /audit-logs searches by person,
action and date; A-11 shows a searchable list (not in the prototype; build it from packages/ui).
Tell me the plan before writing files.
```

### P5-5. App updates from the server

```text
Phase 5, task 5: app updates. Covers ADM-10 (Should).
Test-first: GET /releases/latest?app=student tells a lab PC whether a newer version is on the server;
the student app downloads it from the server (never the internet) and installs it at the next restart,
never during a class. Propose the approach and ask me before adding an update library.
```

### P5-6. Offline check

```text
Phase 5, task 6: offline proof. Covers NFR-01; test T-NFR-01.
Run the full end-to-end suite with every route to the internet blocked (T-NFR-01). Also search the
whole repository for CDN links, external fonts and any http(s) URL that is not the local server, and
remove them. Show me the search results and the test run.
```

### P5-7. Installers and the offline server bundle

```text
Phase 5, task 7: installers. Read docs/07-installation.md.
Build Windows installers with electron-builder (NSIS) for the teacher and student apps: they ask for
the server address, add the local root certificate, add the firewall rules and set up auto-start.
Build the offline server bundle lingualab-server-<version>.zip with the Docker images saved inside
(images.tar), so no internet is needed at the institute. Then give me a dry-run checklist of the
installation guide on a spare PC, and update docs/07-installation.md wherever reality differs.
Tell me the plan before writing files.
```

### P5-8. 60-seat load test (Gate 2)

```text
Phase 5, task 8: load test. Read "Load test for a full class" in docs/08-testing.md.
Build e2e/load/fake-lab.ts: simulated seats that log in, join Socket.IO and LiveKit with headless
Chromium, subscribe to the broadcast and send thumbnails, running on two spare laptops until there are
60 seats with the real PCs. Add the server statistics recorder, and write notes/gate-2-report.md with
the 20-minute script and the pass-criteria table, ready to fill in during the test.
Tell me the plan before writing files.
```

### P5-9. Fix everything from the acceptance test

```text
Here are the results of the user acceptance test with the institute:
<paste the checklist with failed items and notes>
Create one GitHub issue for each failed item, with steps and the requirement ID, in a "UAT" milestone.
Then fix them one at a time, each test-first as in prompt U6, starting with the most serious.
```

### P5-10. Training material

```text
Phase 5, task 10: training. Turn docs/10-user-guides.md into print-ready PDFs (teacher guide and admin
guide) with screenshots taken from the real apps (not the prototype), plus a one-page teacher cheat
sheet of the eight controls. Save them in docs/print/.
```

### P5-11. Release 1.0

```text
Phase 5, task 11: release. Check that every Must requirement has a passing test named after it (list
any that do not), that docs/ matches the app, and that the acceptance checklist is signed. Then write
the release notes from the issues and commits, set version 1.0.0 in every package, tag v1.0.0 and
create the GitHub release with the installers and the server bundle attached.
```

---

## Optional: only if the institute agrees

These two came up after the documentation was finished. Add them with **U8** first, so the docs are updated, then build them.

### OD-1. Teacher PC sound during Broadcast

```text
Add to Broadcast PC (LAB-04): the teacher can choose to send the teacher PC's system sound with the
screen (for example a video playing on the teacher PC), using Electron's Windows loopback audio
capture. Off by default, with a toggle on the console. Test-first: the toggle adds or removes the audio
track, and students hear it only while the broadcast runs.
Tell me the plan before writing files.
```

### OD-2. Headset check after login

```text
Add a headset check to the student app after login: a microphone level meter and a "Play test sound"
button, with "My headset works" and "Problem" answers; "Problem" puts a warning badge on that seat on
the teacher console. Component test and real-time test first.
Tell me the plan before writing files.
```
