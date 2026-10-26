# LinguaLab — project starter folder

Everything needed to start building LinguaLab, the offline Digital Language Lab, with Claude Code.

```
lingualab/
├─ CLAUDE.md            Project rules Claude Code reads automatically (TDD, structure, current phase)
├─ README.md            This file
├─ docs/                Full documentation (version 1.1 draft, 26 Oct 2026)
│  ├─ 00-overview.md         scope, decisions, glossary
│  ├─ 01-requirements.md     requirement IDs, NFRs, acceptance criteria
│  ├─ 02-architecture.md     stack, flows, repo layout, ports
│  ├─ 03-database.md         tables and columns
│  ├─ 04-api-and-events.md   REST, Socket.IO, LiveKit
│  ├─ 05-screens-and-ux.md   design system and screen list
│  ├─ 06-security-and-data.md
│  ├─ 07-installation.md
│  ├─ 08-testing.md          test-driven development and test cases
│  ├─ 09-project-plan.md     phase-by-phase build plan
│  ├─ 10-user-guides.md
│  └─ diagrams/              architecture, flow, database and roadmap images
└─ prototype/
   ├─ README.md
   ├─ screenshots/           29 screens of the approved clickable prototype
   └─ source/                prototype source (.dc.html) as design reference
```

## Start with Claude Code

1. Unzip this folder where you keep your projects, then open a terminal in it:

   ```
   cd lingualab
   git init
   claude
   ```

2. First prompt to give Claude Code:

   > Read CLAUDE.md, docs/09-project-plan.md and docs/08-testing.md. Then start Phase 0, task 1, test-first. Tell me the plan before writing files.

3. Work through Phase 0 task by task. When its exit criteria pass, move to Phase 1.

Online versions: the documentation doc and the clickable prototype are in Claude (the prototype link is in `prototype/README.md`).
