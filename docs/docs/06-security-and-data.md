# 6. Security and data

Three roles, a server-side check on every request, and nightly backups keep student data safe on the institute's own server.

## Roles and permissions

Yes = allowed; Own = only their own classes (teacher) or own data (student); No = refused by the server with 403.

| Action                                                     | Admin | Teacher                                 | Student       |
| ---------------------------------------------------------- | ----- | --------------------------------------- | ------------- |
| Create, edit, deactivate users; set first passwords        | Yes   | No                                      | No            |
| Reset a student's password                                 | Yes   | Own classes                             | No            |
| Import students                                            | Yes   | No                                      | No            |
| Manage courses, batches, classes, enrolments               | Yes   | No                                      | No            |
| Make groups                                                | Yes   | Own                                     | No            |
| Manage labs, seats, approve PCs                            | Yes   | No                                      | No            |
| Start and end a class; use lab controls                    | No    | Own                                     | No            |
| Create and edit lessons                                    | Yes   | Yes (own drafts; shared once published) | No            |
| Publish lessons; assign work                               | Yes   | Own classes                             | No            |
| See lessons                                                | Yes   | Yes                                     | Assigned only |
| Submit answers and recordings                              | No    | No                                      | Own           |
| Mark work, give feedback                                   | No    | Own classes                             | No            |
| See marks and progress                                     | All   | Own classes                             | Own           |
| Reports and exports                                        | All   | Own classes                             | No            |
| Settings (including branding), backups, restore, audit log | Yes   | No                                      | No            |

Each row is enforced by a NestJS guard and covered by an access test that tries the action as every role (test-driven: the refusal tests are written first).

## Authentication, sessions and device trust

**Passwords**

- Hashed with Argon2id; never stored or logged in plain text.
- The admin sets each new account's first-login password and prints a slip; the user must change it at first login (at least 8 characters). Teachers can reset passwords only for students in their own classes, and every reset goes in the audit log.
- Five wrong attempts lock the account for 10 minutes; the admin can unlock it. The count and the lock live on the account (`users.failed_login_attempts`, `users.locked_until`), so a restart does not clear them, and a good password clears them. Once the 10 minutes have passed the count starts again from zero, so an old lock cannot shut someone out on their first mistake.
- A wrong password and a username that does not exist give the same 401, so the login screen cannot be used to find out which student IDs are real. A locked account is told so, with the time it opens again.

**Tokens**

- Access token: JWT (HS256), 15 minutes, signed with `JWT_SECRET` — at least 32 characters, with no default: the server refuses to start without it.
- Refresh token: 32 random bytes, stored only as a SHA-256 hash in `refresh_tokens`, so a copied database row cannot be replayed as a login.
- Every refresh rotates. `POST /auth/refresh` revokes the token it was given and returns a new one, so a refresh token works once; a token taken off a lab PC is already dead by the time the app has used it.
- Staff refresh tokens last 7 days. Student refresh tokens last 30 minutes and are renewed on each use, so a student's login dies 30 minutes after the app goes quiet, and ends at logout or at End class.
- The access token is checked on every request and the account is read with it, so a deactivation or a forced password change takes effect at once instead of waiting for the token to run out.
- An account that must change its password may only see itself, change its password and log out. Every other endpoint answers 403 `PASSWORD_CHANGE_REQUIRED`: the apps hide the rest of the screen as well, but the server is what refuses.
- Changing a password ends every login of that account on every PC and hands the app that asked for it a fresh pair, so a password given away in the lab can be taken back from one screen.
- Logging out revokes that refresh token and frees the seat (`device_logins.logged_out_at`, reason `manual`). Logging out twice, or with a token the server never issued, answers the same 204; a refresh token belonging to someone else is refused with 403.
- Logging in elsewhere ends a student's older login, so one student cannot be logged in on two PCs (STU-01, with the student app).

**Device trust (lab PCs)**

1. On first start, the student app sends `POST /devices/register` with its hostname and MAC address.
2. The PC appears as "waiting" in Lab and seats; the admin approves it and binds it to a seat.
3. The server issues a device key; the app stores it in the Windows Credential Manager.
4. Student logins and lab events are accepted only with a valid device key, so an unknown laptop on the network cannot join the lab.

**Transport:** everything runs over HTTPS and WSS through Caddy with a local certificate authority. The installer adds the root certificate to each lab PC, which is also what lets the apps use the microphone and screen capture.

Lab PCs reach the server by its IP address, and TLS forbids an IP literal in the SNI field, so those connections arrive carrying no server name. Caddy therefore needs `default_sni` set to the server's address in `infra/Caddyfile`, or it has no certificate to offer and every handshake fails; plain HTTP on port 80 still answers with a redirect, which is what makes the fault easy to miss. Tested in `apps/server/test/nfr-12.infra-stack.spec.ts`.

**LiveKit signalling is part of that:** the apps reach it at `wss://<server>/livekit` on 443, inside the same TLS as the REST API and Socket.IO, so signalling is encrypted and LiveKit's own port 7880 is never opened to the lab. Caddy strips the prefix (`handle_path /livekit/*`) and forwards to `livekit:7880` on the Docker network. Only the media itself bypasses Caddy, as UDP on 50000–50200. Agreed now and built with LAB-04 in Phase 2; `infra/Caddyfile` still uses `handle`, which does not strip the prefix.

**Student app lock-down:** starts with Windows, runs in kiosk mode, blocks Alt+F4 and Task Manager while a teacher control is running, and needs the admin PIN to exit. Students use standard (non-admin) Windows accounts.

## Data protection, privacy and audit

- **All data stays in the institute.** Nothing is sent to the internet; there is no telemetry.
- **Least data:** LinguaLab stores name, student ID, phone, guardian contact, class records, answers, recordings and marks, and nothing more.
- **Students see only their own data.** Every student query is filtered by the logged-in student's ID on the server, and access tests prove another student's ID is refused.
- **Monitoring:** screen thumbnails are shown live and never saved. Students see no "monitored" icon; this is the institute's decision.
- **Lesson files:** videos and PDFs are shown inside the app only; the student app offers no download or print.
- **Leaving students** are deactivated, not deleted, so reports stay correct. Full deletion on request is an admin action that is logged.
- **Audit log** records logins (success and failure), password resets (by admin or teacher), grade changes, deletions, restores, settings changes and every lab command, with who, when and from which PC. The app has no way to edit or delete audit entries.
- **Error logs** on the server never include passwords, tokens or recordings, and are rotated after 30 days. Nothing from a request body or header is logged or returned: a whole round of logins, refreshes, logouts and password changes is run in `apps/server/test/auth/nfr-13.no-secrets-in-logs.spec.ts` with everything the server prints captured, and no password, token or hash may appear in it.

## Backup and restore policy

| What                                                                   | When                                          | Where                                     | Kept                           |
| ---------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------- | ------------------------------ |
| Automatic backup: database dump (`pg_dump`) + changed files in `/data` | Every night at 23:00 (changeable in Settings) | Second disk in the server                 | 14 days                        |
| Manual backup                                                          | Any time from the admin panel ("Back up now") | Second disk                               | Until deleted                  |
| USB copy of the latest backup                                          | Weekly, by the admin ("Copy latest to USB")   | External USB drive kept away from the lab | 8 weeks (admin rotates drives) |

- Each backup is checked after it is written (file size and a test read of the dump). A failed backup shows on the admin dashboard.
- **Restore** is done from the admin panel: choose a backup, type the admin password again, and the server restores the database and files, then restarts. It takes under 1 hour for a typical year of data.
- **Restore drill:** once per term, the admin restores the latest backup onto a spare PC and checks that the lab runs from it (this is also an acceptance criterion).
- A UPS keeps the server running through short power cuts, so the database is never cut off mid-write.
