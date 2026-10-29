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
| Colours, fonts, screens (IDs T-xx, S-xx, A-xx) | `docs/docs/05-screens-and-ux.md` + `prototype/screenshots/` |
| Permissions, auth, device trust, backups | `docs/docs/06-security-and-data.md` |
| Server and app installation | `docs/docs/07-installation.md` |
| TDD method, test IDs, load test | `docs/docs/08-testing.md` |
| Phases, tasks, exit criteria | `docs/docs/09-project-plan.md` |
| How users use it | `docs/docs/10-user-guides.md` |

The prototype's `.dc.html` files in `prototype/source/` hold the exact styles, sample data and screen behaviour. They are a design reference, not code to ship; rebuild the screens in React with the shared UI kit.

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
- [ ] Login, refresh, logout, change password, account lockout (T-SEC-01)
- [ ] Role guards and the full permissions test (T-ACL-01)
- [ ] Users: create, edit, deactivate, first passwords, Excel import (ADM-01, ADM-02); teachers reset passwords for their own students (ADM-11)
- [ ] Courses, batches, classes, enrolments and groups (ADM-03)
- [ ] Labs (one or more), seat maps, PC registration and approval, device keys (ADM-04)
- [ ] Student login at any PC with device_logins; one login per student (STU-01)
- [ ] Admin panel screens A-01 to A-04 and A-07, matching the prototype
- [ ] Student app shell: auto-start, kiosk mode, login screen, idle logout (STU-06, STU-07)

**Deliverables:** admin panel for setup; student app that logs in.

**Exit criteria:** all Phase 1 tests green; server coverage at least 80%; 30 test accounts log in at random seats on 2 PCs.

### Phase 0 closed on 2026-10-28

Both exit criteria met. Broadcast and voice passed on 2 PCs (NFR-03 at 204 ms of 500, NFR-04 at 126 ms of 200) — written up in `docs/docs/spike-results.md`. "CI blocks a pull request with a failing test" was proved by opening one: `main` is now protected, requiring the `check` status with `enforce_admins` on, and a pull request carrying a deliberately failing test was refused with `mergeStateStatus: BLOCKED`, then closed unmerged.

### Still open, carried into Phase 1

- [ ] When the server gets its real build and Docker image: `packages/shared` needs a proper `tsc` build, and `pnpm db:seed` must run from the compiled output inside the container, without `tsx`
- [ ] Confirm the hardware list with the institute — Maryam's, outside the code
- [ ] Short video of the 2-PC spike — a Phase 0 deliverable, never recorded
- [ ] GitHub milestones per phase and one issue per requirement ID — `gh` is authenticated now, so this is unblocked
- [x] **Server branch coverage** was 66.66% against the 70% target; the database and seed tests of Phase 1 task 1 lifted it to 83.33%, with lines at 94.79% against 80%. `pnpm test:coverage` runs in CI and fails the build when a threshold is missed. What remains uncovered is structural: `platform() === 'win32' ? …` in `src/health/disk.ts` can only ever cover one side per operating system
- [ ] Testing Library and Playwright are installed but never exercised — no component test and no end-to-end test exists yet. `pnpm test:e2e` passes only because of `--pass-with-no-tests`
- [ ] Gate 1 (end of week 9) still owes the wired lab network, real headsets, and an echo check, which the one-way spike could not do

## Working method

- One GitHub issue per requirement ID; branch `feat/<ID>-short-name`; Conventional Commits (`feat(LAB-04): …`, `test(LAB-04): …`).
- Small pull requests; `main` always releasable; merge only with green CI.
- Before starting a task, restate which requirement IDs and test IDs it covers.
- Ask before adding a dependency that is not in `docs/docs/02-architecture.md`.
