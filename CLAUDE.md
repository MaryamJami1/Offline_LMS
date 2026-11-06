# CLAUDE.md — LinguaLab

Offline Digital Language Lab for an English language institute: a teacher console that controls 30–60 lab PCs (broadcast, white board, demo, quiz, intercom, monitor) plus an English LMS (Speaking, Reading, Writing, Listening). Everything runs on the institute's own server and LAN, with no internet in daily use.

Owner: Maryam Jamil. She often writes in Roman Urdu; reply in the language she writes in. Code, comments, commit messages and docs stay in English.

## Source of truth

Read the relevant document before working on a feature. If code and docs disagree, ask; do not guess.

| Need | File |
| --- | --- |
| Scope, decisions, glossary | `docs/docs/00-overview.md` |
| What to build (requirement IDs ADM, LAB, STU, MOD, NFR) | `docs/docs/01-requirements.md` |
| Stack, repo layout, flows, ports | `docs/docs/02-architecture.md` |
| Tables and columns | `docs/docs/03-database.md` |
| REST endpoints, Socket.IO events, LiveKit rooms | `docs/docs/04-api-and-events.md` |
| Colours, fonts, screens (IDs T-xx, S-xx, A-xx) | `docs/docs/05-screens-and-ux.md` + `docs/prototype/screenshots/` |
| Permissions, auth, device trust, backups | `docs/docs/06-security-and-data.md` |
| Server and app installation | `docs/docs/07-installation.md` |
| TDD method, test IDs, load test | `docs/docs/08-testing.md` |
| Phases, tasks, exit criteria | `docs/docs/09-project-plan.md` |
| How users use it | `docs/docs/10-user-guides.md` |

The prototype's `.dc.html` files in `docs/prototype/source/` hold the exact styles, sample data and screen behaviour. They are a design reference, not code to ship; rebuild the screens in React with the shared UI kit.

## Non-negotiable rules

1. **Test-driven development, always.**
   - Red: write a failing test for the requirement first and run it to see it fail.
   - Green: write the simplest code that passes.
   - Refactor: clean up with all tests green.
   - Never write feature code without a failing test that needs it. Never delete or weaken a test to make it pass.
   - Only exception: throwaway proof-of-concept code in `spikes/` (Phase 0). It is never imported by `apps/` or `packages/` and never shipped; when the feature is built for real, it is rebuilt test-first.
2. **Name tests after requirement IDs:** `lab-04.broadcast.spec.ts`, `adm-11.reset-password.spec.ts`. Start from the test cases listed in `docs/docs/08-testing.md`. A test that covers several requirements at once, like the seed, may use a descriptive name and list the IDs at the top of the file.
3. **Run the tests** that cover your change before saying a task is done, and the full suite before a commit. Report real results; never claim tests pass without running them.
4. **Offline only:** no CDNs, no external fonts, no calls to the internet at runtime. Fonts come from @fontsource; every dependency is installed locally.
5. **Security on the server:** every endpoint and socket event checks role and ownership on the server (see the permissions table in `docs/docs/06-security-and-data.md`). Students only ever see their own data. Teachers only act on their own classes.
6. **Shared contracts:** request and event payloads are Zod schemas in `packages/shared`; Socket.IO event names are constants in `packages/shared/events.ts`.
7. **Strict TypeScript,** no `any`, ESLint + Prettier clean.
8. **Branding is data:** never hard-code the product name, logo or primary colour in UI code; read them from settings (default "Lab").
9. **No fixed seats:** nothing about a student may depend on a particular PC; the link is `device_logins`.
10. **Docs stay true:** if a change alters behaviour, update the matching file in `docs/` in the same commit.

## Target repository layout

```
apps/server     NestJS + Prisma + Socket.IO gateway (+ test/)
apps/teacher    Electron + React teacher console
apps/student    Electron + React student app (kiosk)
apps/admin      React + Vite admin panel
packages/shared Zod schemas, types, event names
packages/ui     design tokens + shared components
packages/test-utils  fake lab (60 seats), seeded DB, socket/LiveKit helpers
e2e/            Playwright (browser + Electron)
infra/          docker-compose.yml, Caddyfile, livekit.yaml, backup scripts
spikes/         Phase 0 throwaway experiments (not shipped, not test-first)
notes/          demo notes, gate checklists and reports
docs/           this documentation
```

## Commands (create these in Phase 0)

```
pnpm install
pnpm test            # all unit, component, API and real-time tests
pnpm test:watch      # TDD loop for the package you are in
pnpm test:e2e        # Playwright
pnpm lint && pnpm typecheck
docker compose -f infra/docker-compose.yml up -d   # PostgreSQL, LiveKit, Caddy
pnpm dev             # server + admin + apps in dev mode
```

## Current phase: Phase 1 — Foundation (weeks 2–4)

**Goal:** the admin can set up people, classes and the lab, and students can log in at any PC.

- [x] Prisma schema and migrations for People, Organisation and Lab tables; seed data — People, Organisation, Lab and sessions plus `settings`; seed gives 1 admin, 2 teachers, 2 classes, 30 students, Lab 1 with 30 seats and the software name "Lab"
- [x] Login, refresh, logout, change password, account lockout (T-SEC-01) — rotating refresh tokens, a guard that reads the account on every request, and a first-login account held to `/me`, change-password and logout. Device keys and the seat recorded at login come with STU-01; the admin's unlock button with ADM-01
- [x] Role guards and the full permissions test (T-ACL-01) — the authentication and role guards are registered for the whole application, so an endpoint is protected unless it is deliberately public; ownership lives in `AccessService`; the table is tried as four accounts, with the rows whose endpoints are not built yet expecting 404 so they cannot be forgotten
- [x] Users: create, edit, deactivate, unlock, first passwords, Excel import (ADM-01, ADM-02; T-ADM-01, T-ADM-02) — `/users` endpoints, generated first passwords shown once, the student import from .xlsx or CSV with numbered errors and no duplicates, and the `audit_logs` table with entries for accounts created, deactivated, reactivated and unlocked
- [x] Teachers reset passwords for their own students (ADM-11, T-ADM-11) — `POST /users/:id/reset-password` for the admin on any account and a teacher on the students enrolled in their own classes, decided by `AccessService.assertMayResetPassword`; a server-made password shown once, the lockout cleared, every login ended, and `user.password_reset` in the audit log in the same transaction
- [x] Courses, batches, classes, enrolments and groups (ADM-03) — `/courses`, `/batches` and `/classes` with T-ADM-03; a student taken out of a class is marked as having left, never deleted; pairs follow roll numbers until LAB-15 pairs by seat, random groups never leave anyone alone, and making either again replaces the earlier ones; a teacher lists, reads and groups only their own classes
- [x] Labs (one or more), seat maps, PC registration and approval, device keys (ADM-04) — `/labs` and `/devices` with T-ADM-04; a PC gets its key when it registers and the key works only once the admin approves it; an approved PC without its key is refused, and the admin resets a reinstalled one; `devices.retired_at` keeps a retired PC's history; a teacher sees on the seat map only their own students' names, and LAB-01 adds the running session's class
- [x] Student login at any PC with device_logins; one login per student (STU-01) — students log in only at an approved, seated PC (`X-Device-Key`); a login ends the student's older login and whoever was at that PC (reason `replaced`), and the replaced PC's leftover token is refused without ending anything; reuse detection now frees the seat (reason `revoked`); the student's refresh token carries the PC, which turns on the NFR-13 retry window; a password change at the student's own PC keeps the seat; `GET /devices/me` tells the login screen where it is. Linking the login to the class session's attendance comes with LAB-03
- [x] UI kit in `packages/ui` (NFR-11; T-NFR-11a, T-NFR-11b) — design tokens and the Tailwind 4 theme, IBM Plex from @fontsource, Button, Seat tile, Control button, Tab rail, Card, Badge, Progress bar, Level meter, Toast, Modal, Table, Option buttons and form fields on Radix, and `BrandingProvider`, which reads the public `GET /settings/branding` and keeps "Lab" in the default blue until it answers or when the main colour would fail contrast. The media components come with MOD-01, MOD-04 and MOD-10
- [ ] Admin panel screens A-01 to A-04 and A-07, matching the prototype — move the permissions table out of the T-ACL-01 test into `packages/shared` as part of this, so the panel hides buttons from the same source the server refuses by. Three pull requests:
  - [x] (a) `PERMISSIONS` and `may()` in `packages/shared`, checked by T-ACL-01 against 06 and against every endpoint; `seatToday` on `GET /users`; Select field, Checkbox group, Side navigation and the "no PC" seat tile
  - [x] (b) `apps/admin`: login and the five screens, test-first against a fake `AdminApi`; an API client that keeps the access token in memory and the refresh token in sessionStorage and sends requests refused at once to one refresh; columns and cards with no data yet stay hidden (05); a mandatory password change before anything else
  - [x] (c) real builds for `packages/shared` and the server (`pnpm build`; the server's `start` and `PORT`; the seed compiled, `tsx` gone), with `@lingualab/source` keeping tests and Vite on the source; the Playwright journey T-E2E-01 on a database made for each run and dropped after it; and the Content-Security-Policy in the Caddyfile (T-SEC-05), which `vite preview` also sends, allowing nothing inline but Radix's `<style>` elements. The parent box is ticked once Maryam has checked every screen against the prototype
- [ ] Student app shell: auto-start, kiosk mode, login screen, idle logout (STU-06, STU-07)
  - [x] (a) the server's side: the exit PIN as the `lab.exit_pin` setting (argon2 hash, `SEED_EXIT_PIN` in the seed, `GET`/`PUT /settings/exit-pin` for the admin with the password typed again), `POST /devices/exit` by the device key with five tries and a fifteen-minute lockout per PC, every try in the audit log; `reason: 'idle'` on `POST /auth/logout`; "Needs attention" on A-01 with the change-PIN modal until A-10
  - [ ] (b) `apps/student`: config file next to the app, device key in safeStorage (DPAPI), register and check in, S-01 with this PC and seat, change password at first login, kiosk window that closes only through `POST /devices/exit` (Ctrl+Alt+Shift+Q), idle logout at 30 minutes (T-STU-07) with `logout(reason)` as the hook for LAB-03
  - [ ] (c) T-STU-06 in Playwright's Electron mode, electron-builder NSIS installer writing the config file and auto-start for all users

**Deliverables:** admin panel for setup; student app that logs in.

**Exit criteria:** all Phase 1 tests green; server coverage at least 80%; 30 test accounts log in at random seats on 2 PCs.

### Phase 0 closed on 2026-10-28

Both exit criteria met. Broadcast and voice passed on 2 PCs (NFR-03 at 204 ms of 500, NFR-04 at 126 ms of 200) — written up in `docs/docs/spike-results.md`. "CI blocks a pull request with a failing test" was proved by opening one: `main` is now protected, requiring the `check` status with `enforce_admins` on, and a pull request carrying a deliberately failing test was refused with `mergeStateStatus: BLOCKED`, then closed unmerged.

### Still open, carried into Phase 1

- [ ] When the server gets its Docker image: `pnpm db:seed` must run from the compiled output inside the container. The `tsc` builds and the compiled seed came with task 10c
- [ ] Confirm the hardware list with the institute — Maryam's, outside the code
- [ ] Short video of the 2-PC spike — a Phase 0 deliverable, never recorded
- [ ] GitHub milestones per phase and one issue per requirement ID — `gh` is authenticated now, so this is unblocked
- [x] **Server branch coverage** was 66.66% against the 70% target; the database and seed tests of Phase 1 task 1 lifted it to 83.33%, with lines at 94.79% against 80%. `pnpm test:coverage` runs in CI and fails the build when a threshold is missed. What remains uncovered is structural: `platform() === 'win32' ? …` in `src/health/disk.ts` can only ever cover one side per operating system
- [x] Testing Library and Playwright are exercised: the admin panel's component tests (task 10b) and the end-to-end journey T-E2E-01 (task 10c); `--pass-with-no-tests` is gone from `pnpm test:e2e`
- [ ] Gate 1 (end of week 9) still owes the wired lab network, real headsets, and an echo check, which the one-way spike could not do

## Working method

- One GitHub issue per requirement ID; branch `feat/<ID>-short-name`; Conventional Commits (`feat(LAB-04): …`, `test(LAB-04): …`).
- Small pull requests; `main` always releasable; merge only with green CI.
- Before starting a task, restate which requirement IDs and test IDs it covers.
- Ask before adding a dependency that is not in `docs/docs/02-architecture.md`.
- On Maryam's laptop (8 GB RAM), run the tests one package at a time (`pnpm --filter <package> test`, then `pnpm test:e2e` on its own) and leave the full suite to CI; running everything at once runs out of memory. Rule 3 is met by those per-package runs plus green CI.
