# Second-PC check of the student installer: findings (STU-06)

The installer check (`notes/stu-06-installer-check.md`) was run on the second
PC on 2026-11-19, as the last part of Phase 1 task 11. It found three problems
that keep the installer from going to the institute as it is. Each one has an
issue in the Phase 1 milestone, and task 11 stays open until they are settled.

- Installer: `LinguaLab-Student-Setup-0.1.0.exe`, built on the laptop from main `f83b8b5` because the CI artifact had expired. SHA-256 `148B59E0B18485FCB73EA19678137009159C1928CC913A3D19A7D2D569ACE418`.
- Server: answering on its own port, `http://192.168.10.48:3000`, not through Caddy.
- Second PC: a single Windows account. The check asks for two, an administrator and a standard one.

The three findings lead into each other. With the wrong address (F1) the
server is never reached, so the exit PIN can never be checked (F2), and there
is no other way past the kiosk (F3). The second PC ended up unusable, and the
app could not be closed.

Points marked _from the code_ come from reading `main` at `f83b8b5` and were
not tried on the PC.

## F1. Server address handling (#88)

Requirements: STU-06, ADM-04.

**What happened.** The app showed "The server cannot be reached. Looking for
https://192.168.10.48:3000" while the server answers on
`http://192.168.10.48:3000`. An admin who types the address in the wrong form
gets no useful guidance, and the address cannot be changed without
reinstalling.

_From the code:_

- The installer's address page starts filled with `https://`, and its example
  is `https://192.168.10.2` (`apps/student/build/installer.nsh`,
  `ServerPageShow`). Typing `192.168.10.48:3000` after it gives exactly the
  address above. The installer (`CheckServerUrl`) and the app
  (`src/main/config.ts`) check only that it starts with `https://` or
  `http://`; neither of them tries it.
- The screen names the address but not what went wrong. No answer, a refused
  connection and HTTPS against a plain-HTTP port all become the same
  `ServerUnreachable` (`src/main/server-api.ts`), which looks just like a
  pulled cable.
- Running the installer again does not change the address. As an update it
  skips the address page and keeps the old file, unless `/SERVER=` is given.
  The documented way is to edit `lingualab.config.json` as an administrator
  (07, Installing the teacher and student apps), and that needs a way past the
  kiosk (F3).

**Why it matters at the institute.** The address is typed by hand on each of
30–60 PCs, by an admin or technician working from written notes. One wrong
character leaves a PC that says "cannot be reached" for ever, with nothing on
the screen pointing at the address. Because of F2 and F3, the app cannot be
closed to fix it. A new server address would mean the same on every PC.

**Fix direction.**

- Validate and normalise the address in the installer and in the app.
- Name the exact address tried in the error, and say what failed (no answer,
  refused, certificate, HTTPS against HTTP).
- Let an admin change the address without reinstalling.
- Decide between http on 3000 and https through Caddy for production. NFR-13's
  target is already HTTPS on the lab network, and 07 installs Caddy at
  `https://192.168.10.2`. The open question is whether an installed app should
  still accept `http://` at all.

## F2. Exit PIN needs the server (#89)

Requirements: STU-06, ADM-04, NFR-13.

**What happened.** With the server unreachable, Ctrl+Alt+Shift+Q opens the PIN
box but the PIN cannot be checked, so the app cannot be closed. This fails
closed, which is safe against students, but it leaves the admin locked out when
the server or the network is down.

_From the code:_ the dialog then says "Use Ctrl+Alt+Del to switch to the admin
Windows account" (`src/main/student-shell.ts`), and F3 shows that this is no
way out. A PC that is not approved, or was retired or reset in the admin panel,
cannot have its PIN checked either.

**Why it matters at the institute.** The admin most needs to close the app at
exactly the times the PIN cannot be checked: the server is down, the network is
being wired or repaired, the PC points at the wrong server (F1), or the PC was
retired or reset. Those will be common while the lab is installed.

**Fix direction.** Keep the server check as the normal path, and keep failing
closed for students. Design an admin path that works offline, together with F3.
Whatever the PC keeps for an offline check can be read by the student's
Windows account, since the app runs as that account. So it cannot be the
six-digit PIN's hash, because all million PINs can be tried offline. An offline
code has to be long and random, and changed from the admin panel like the PIN.

## F3. No admin way in (#90)

Requirements: STU-06, ADM-04, NFR-13.

**What happened.** The kiosk window stays above Task Manager, and after
Sign out / Sign in on a PC with a single account the app starts again. The only
recoveries were Win+R then `appwiz.cpl` right after login, or Safe Mode.

_From the code:_

- The installer starts the app for every Windows account
  (`HKLM\Software\Microsoft\Windows\CurrentVersion\Run`), and the app does not
  tell an administrator's account from a student's. A separate administrator
  account would therefore meet the kiosk at its own login too. The advice in
  the app ("switch to the admin Windows account") and in 10 (Closing the
  student app on a lab PC) does not work as written.
- 06 (Student app lock-down) says the app blocks Task Manager "while a teacher
  control is running"; the window is above Task Manager all the time (the
  `'screen-saver'` level in `src/main/main.ts`). Which one is meant belongs to
  this design: a student who
  can reach Task Manager can end the app, because it runs under their own
  account.

**Why it matters at the institute.** The lab technician needs a dependable way
to close the app on any PC, for app and Windows updates, a moved server (F1), a
network outage (F2) or a faulty PC, without Safe Mode on 30–60 machines.

**Fix direction.** Together with F2, design an admin recovery path, for
example:

- a hashed offline emergency code (see F2 for why it cannot be the PIN);
- a documented Windows-admin-only stop and uninstall procedure in
  `docs/docs/07-installation.md`;
- a maintenance mode set from the admin panel, which needs the server, so it
  covers planned work but not F2's outage.

Also require a separate Windows administrator account on every lab PC in the
installation steps. That account only helps if the app leaves it alone (see
above). Docs to correct with the fix: 06, 07 and 10.

## Still open

- The installer is unsigned. Windows SmartScreen and Smart App Control block
  it, so a code-signing certificate is needed before the institute rollout.
- The `student-installer` artifact of CI's Windows job is kept for 7 days
  (`retention-days: 7` in `.github/workflows/ci.yml`) and had expired, so the
  installer for this check was rebuilt on the laptop. Installers that go to lab
  PCs should be kept as a release asset.
