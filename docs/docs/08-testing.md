# 8. Testing and QA

Every feature is tested on Windows 10 and 11, then in a full class on the real lab before the institute signs off.

## Test strategy: test-driven development

LinguaLab is built test-first. No feature code is written until a failing test describes what it must do.

**The cycle for every requirement**

1. **Red:** pick a requirement (for example LAB-04). Write the outermost test that proves it (usually an API or real-time test) and watch it fail.
2. **Red, smaller:** write unit tests for the pieces the feature needs (target selection, permission check, event payload) and watch them fail.
3. **Green:** write the simplest code that makes the tests pass.
4. **Refactor:** clean up names and duplication while every test stays green.
5. **Commit** with the requirement ID (`feat(LAB-04): broadcast to selected seats`). The pull request runs the full suite, and it cannot merge unless every test passes.

**Definition of done for a task:** tests written first and passing; requirement ID in the test file name; coverage not lowered; types and lint clean; reviewed; the matching screen checked against the prototype.

**Test levels**

| Level             | Tool                                                                                        | What it covers                                                                               | Where                        | Runs                            |
| ----------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------- |
| Unit              | Vitest                                                                                      | Services and pure logic: marking, target selection, permissions, seat logins, progress maths | `*.spec.ts` beside the code  | On save and before every commit |
| Component         | Vitest + Testing Library                                                                    | React parts: seat tile, controls, lesson editor, recorder, quiz                              | `apps/*/src/**/*.spec.tsx`   | Before every commit             |
| API / integration | Vitest + Supertest + the real PostgreSQL, LiveKit and Caddy from `infra/docker-compose.yml` | Every endpoint, guard and database rule                                                      | `apps/server/test/`          | Every push                      |
| Real-time         | Vitest + socket.io-client + a fake lab of up to 60 seats                                    | Lab commands, seat updates, reconnects, quiz flow                                            | `apps/server/test/realtime/` | Every push                      |
| End-to-end        | Playwright (browser for admin; Electron mode for the two apps)                              | Full user journeys across apps                                                               | `e2e/`                       | Every pull request              |
| Lab hardware      | Checklist + load script                                                                     | Real screen, voice and network on 2, 10, then 60 PCs                                         | Lab test bench               | At each phase gate              |

**Coverage targets:** server and shared packages at least 80% of lines and 70% of branches; app logic (hooks, stores) at least 70%; every Must requirement has at least one test named after it.

These are enforced, not aspirational: the thresholds live in each package's `vitest.config.ts`, `pnpm test:coverage` fails the build when they are missed, and CI runs it on every pull request. Raise coverage by testing behaviour that matters — the gap that first pushed the server under its branch target was the health check reporting an unreadable disk as `0 bytes free`, indistinguishable from a full one. Tests written only to colour in a line are worse than the missing coverage, because they freeze whatever the code happens to do today.

**Continuous integration (GitHub Actions)** on every pull request: lint, type check, unit and component tests, API and real-time tests against the real stack, Playwright end-to-end tests, and a Windows job that builds and smoke-tests both Electron apps. The stack comes up with `docker compose -f infra/docker-compose.yml up -d --wait` before the tests, so the same compose file the lab server runs is the one CI tests against. A pre-commit hook (Husky + lint-staged) runs the tests related to changed files.

**A test that cannot fail is not a test.** The first `/api/health` test asserted `expect(['ok', 'error']).toContain(res.body.database)` and so passed with no database running at all. Health checks and anything else with a pass and a fail state are asserted on the value that means working, and the failing branch gets its own test; `docs/docs/spike-results.md` has the worked example.

**Environments:** developer laptop (Docker Compose), CI, a lab test bench (2 PCs, later 10), the institute's lab after hours for gates, then production.

## Test cases per feature

These are the first tests to write for each requirement, before its code. More are added as the code grows.

| ID        | Requirement       | Test written first (expected result)                                                                                                                                       | Level                   |
| --------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| T-STU-01a | STU-01            | Login from an approved PC records the seat in device_logins; login from an unknown PC is refused (403)                                                                     | API                     |
| T-STU-01b | STU-01            | Logging in on a second PC ends the first login and frees that seat                                                                                                         | API + real-time         |
| T-SEC-01  | NFR-13            | Five wrong passwords lock the account for 10 minutes                                                                                                                       | API                     |
| T-ACL-01  | Permissions table | Every row of the permissions table, tried as admin, teacher (own / other class) and student, returns the expected 200 or 403                                               | API                     |
| T-LAB-01  | LAB-01            | When a student logs in, the console receives seat:update with the right seat and name within 2 s                                                                           | Real-time               |
| T-LAB-02  | LAB-02            | With nothing selected, targets are all logged-in seats and exclude empty and offline seats                                                                                 | Unit                    |
| T-LAB-03  | LAB-03            | Start class marks logged-in students present and the rest absent; a later login marks the student late; End class logs everyone out                                        | API                     |
| T-LAB-04  | LAB-04            | broadcast.start reaches only target seats; a teacher of another class is refused; a seat that reconnects receives the broadcast again                                      | Real-time               |
| T-LAB-08a | LAB-08            | Multiple-choice, true/false and gap answers are marked correctly; the live count matches answers received                                                                  | Unit + real-time        |
| T-LAB-08b | LAB-08            | Answers after the quiz closes are refused; shared results show each student only their own                                                                                 | Real-time               |
| T-LAB-09  | LAB-09            | Intercom needs exactly one seat; the media token allows only that intercom room                                                                                            | Unit                    |
| T-LAB-10  | LAB-10            | A raised hand shows on the console; Talk starts an intercom and lowers the hand                                                                                            | Real-time               |
| T-LAB-11  | LAB-11            | Thumbnails are sent only while Monitor is on, go only to the console, and are never written to disk                                                                        | Real-time               |
| T-LAB-11b | LAB-11            | While Monitor runs, the student app shows no icon or message                                                                                                               | End-to-end (Electron)   |
| T-LAB-13  | LAB-13            | Lock all reaches 60 fake seats in under 1 s                                                                                                                                | Real-time (performance) |
| T-LAB-16  | LAB-16            | Stop ends the running control on every target seat                                                                                                                         | Real-time               |
| T-STU-03  | STU-03            | A takeover cannot be closed from the student app; only the teacher's Stop removes it                                                                                       | End-to-end (Electron)   |
| T-STU-06  | STU-06            | The student app cannot be closed without the admin PIN                                                                                                                     | End-to-end (Electron)   |
| T-STU-07  | STU-07            | A student is logged out after 30 idle minutes (fake timers)                                                                                                                | Unit                    |
| T-MOD-02  | MOD-02, MOD-04    | Auto-marking: gap answers ignore case and extra spaces; dictation scored by words correct                                                                                  | Unit                    |
| T-MOD-01  | MOD-01            | A recording upload is saved, playable, and refused above 60 s or 5 MB                                                                                                      | API                     |
| T-MOD-05  | MOD-05            | Publishing is refused without a title, with no questions, with a multiple-choice question of fewer than two answers or no correct answer, or a gap question with no answer | Component + API         |
| T-MOD-07  | MOD-07            | Grading saves the rubric and comment, updates the final score and the student's progress                                                                                   | API                     |
| T-MOD-08  | MOD-08            | Progress = average of marked submissions; completion = finished / assigned                                                                                                 | Unit                    |
| T-MOD-10a | MOD-05, MOD-10    | An uploaded video is converted to 720p H.264, the original is removed, and the file streams with range requests; files that are not MP3, MP4 or PDF are refused            | Integration             |
| T-MOD-10b | MOD-10            | The student app plays the video and shows the PDF with no download or print option, with the network to the internet cut                                                   | End-to-end (Electron)   |
| T-ADM-02  | ADM-02            | Import creates valid rows, reports bad rows with line numbers, and never creates duplicates                                                                                | API                     |
| T-ADM-07  | ADM-07            | Changing the software name, logo and main colour in Settings changes all three apps at their next start                                                                    | End-to-end              |
| T-ADM-08  | ADM-08            | A backup restores into an empty database and the data matches the original                                                                                                 | Integration             |
| T-ADM-11  | ADM-11            | A teacher resets the password of a student in their own class; resetting a student of another class or a staff account is refused (403); every reset is in the audit log   | API                     |
| T-NFR-01  | NFR-01            | The end-to-end suite passes with no route to the internet                                                                                                                  | End-to-end              |

## Load test for a full class

Run at Gate 1 (10 real PCs) and Gate 2 (all PCs, plus simulated seats up to 60).

**Setup**

- The real lab PCs run the student app, logged in with test accounts.
- A load script (`e2e/load/fake-lab.ts`) on two spare laptops adds simulated seats: each one logs in, joins Socket.IO and LiveKit with headless Chromium, subscribes to the broadcast and sends thumbnails, until there are 60 seats in total.
- The server records CPU, memory, network and LiveKit statistics during the test.

**Script (20 minutes)**

1. 60 logins within 1 minute.
2. Broadcast PC for 10 minutes while the teacher scrolls a Word document and plays a short video.
3. Lock all, unlock all, five times.
4. Monitor on for 3 minutes.
5. Whole Talk for 2 minutes, then Group Talk with 15 pairs.
6. A 10-question quiz answered by all seats.
7. A 3-minute lesson video played to all seats with Demo.

**Pass criteria**

| Measure                         | Target                                                          |
| ------------------------------- | --------------------------------------------------------------- |
| Login to name on the console    | Under 2 s for each seat                                         |
| Lock and unlock reach all seats | Under 1 s at the 95th percentile                                |
| Broadcast                       | Readable text on every real PC; no seat drops for more than 5 s |
| Voice                           | No echo; delay under 200 ms on real PCs                         |
| Quiz                            | All 600 answers saved and counted                               |
| Lesson video in Demo            | Plays on every seat, within 1 s of the teacher's position       |
| Server                          | CPU under 70%, memory under 75%, network under 300 Mbps         |

## User acceptance checklist

Done with the institute in Phase 5, on the real lab, by their own admin, two teachers and a class of students. The full sign-off list is in 01-requirements.md under acceptance criteria; this is the order to run it in.

**Admin (about 1 hour)**

- [ ] Import a class of students from the institute's own Excel file
- [ ] Approve a new lab PC and bind it to a seat
- [ ] Create a class, assign a teacher and students
- [ ] Change the branding in Settings and check all apps
- [ ] Run Back up now, copy it to USB, and restore it on the spare PC
- [ ] Export the attendance and results reports as PDF and Excel

**Teacher (one real class)**

- [ ] Students log in at seats of their choice; names appear correctly
- [ ] Start class; attendance matches the register
- [ ] Broadcast PC, Screen Demo and White Board
- [ ] Lesson Demo (audio and video) and a Student Demo
- [ ] Whole Talk, Intercom with a raised hand, Group Talk in pairs
- [ ] A quiz to the whole class; share results
- [ ] Monitor, live view, lock and unlock
- [ ] End class; the summary is correct
- [ ] Write and publish a Listening lesson with the Teacher guide only (with an MP3, a video and a PDF)
- [ ] Reset a student's password
- [ ] Mark two speaking recordings and two essays in the grading inbox

**Student**

- [ ] Log in, finish one lesson per module, record a speaking answer, watch a lesson video and open a PDF
- [ ] See marks and feedback; cannot see any other student's data

Each item passes, or gets a numbered issue in GitHub that is fixed and re-tested before sign-off.
