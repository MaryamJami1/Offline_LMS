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
2. **Name tests after requirement IDs:** `lab-04.broadcast.spec.ts`, `adm-11.reset-password.spec.ts`. Start from the test cases listed in `docs/docs/08-testing.md`.
3. **Run the tests** that cover your change before saying a task is done, and the full suite before a commit. Report real results; never claim tests pass without running them.
4. **Offline only:** no CDNs, no external fonts, no calls to the internet at runtime. Fonts come from @fontsource; every dependency is installed locally.
5. **Security on the server:** every endpoint and socket event checks role and ownership on the server (see the permissions table in `docs/docs/06-security-and-data.md`). Students only ever see their own data. Teachers only act on their own classes.
6. **Shared contracts:** request and event payloads are Zod schemas in `packages/shared`; Socket.IO event names are constants in `packages/shared/events.ts`.
7. **Strict TypeScript,** no `any`, ESLint + Prettier clean.
8. **Branding is data:** never hard-code the product name, logo or primary colour in UI code; read them from settings (default "LinguaLab").
9. **No fixed seats:** nothing about a student may depend on a particular PC; the link is `device_logins`.
10. **Docs stay true:** if a change alters behaviour, update the matching file in `docs/docs/` in the same commit.

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
docs/docs/          this documentation
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

## Current phase: Phase 0 — Setup and risk check (week 1)

- [ ] Monorepo: pnpm workspaces, Turborepo, strict TypeScript, ESLint, Prettier
- [ ] Test tools: Vitest, Testing Library, Supertest, Playwright, Husky + lint-staged; GitHub Actions running every test on each pull request
- [ ] `infra/docker-compose.yml` with PostgreSQL 16, LiveKit, Caddy; `/api/health` endpoint, test first
- [ ] Spike: teacher Electron app captures the screen (desktopCapturer) and publishes to LiveKit; student Electron app shows it full-screen on 2 PCs
- [ ] Spike: teacher microphone heard clearly in a student headset

Exit criteria: broadcast text readable and voice clear on 2 PCs; CI blocks a pull request with a failing test. Then move to Phase 1 in `docs/docs/09-project-plan.md`.

## Working method

- One GitHub issue per requirement ID; branch `feat/<ID>-short-name`; Conventional Commits (`feat(LAB-04): …`, `test(LAB-04): …`).
- Small pull requests; `main` always releasable; merge only with green CI.
- Before starting a task, restate which requirement IDs and test IDs it covers.
- Ask before adding a dependency that is not in `docs/docs/02-architecture.md`.
