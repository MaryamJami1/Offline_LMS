# 7. Installation and operations

One server PC, one gigabit switch and an installer on each lab PC. No internet is needed after setup.

## Hardware and network requirements

| Item        | Minimum                                                              | Recommended                                                       |
| ----------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Server PC   | 4-core CPU, 16 GB RAM, 512 GB SSD, gigabit network card              | 8-core CPU, 16–32 GB RAM, 1 TB SSD + 1 TB second disk for backups |
| Server OS   | Windows 10/11 Pro with Docker Desktop, or Ubuntu 22.04+ with Docker  | Ubuntu 24.04 LTS (lighter, more stable for a 24/7 server)         |
| Teacher PC  | Windows 10/11 64-bit, 8 GB RAM, 1920 x 1080 screen, headset with mic | Two screens: one for the console, one to broadcast                |
| Student PCs | Windows 10/11 64-bit, 4 GB RAM, USB headset with mic                 | 8 GB RAM                                                          |
| Network     | One gigabit switch for all PCs and the server; Cat 6 cables          | Server on its own switch port; no Wi-Fi for lab PCs               |
| Power       | UPS for the server and switch                                        | UPS rated for at least 15 minutes                                 |
| Backup      | One external USB drive                                               | Two drives, rotated weekly                                        |

The server needs a fixed IP address (for example `192.168.10.2`). Internet is needed only once, at installation, if the installer files are not on a USB drive.

**Storage for video lessons:** 720p video takes about 300 MB per hour, and the original upload is deleted after conversion. A 1 TB disk holds well over 1,000 hours of video plus a year of recordings.

**Second lab later:** the recommended server handles two labs (120 seats). Add a second gigabit switch linked to the first, and add the new lab and its PCs in the admin panel; no reinstall is needed.

## Server installation

The release comes as an offline bundle (`lingualab-server-<version>.zip`) with the Docker images saved inside, so no internet is needed at the institute.

1. Install Ubuntu 24.04 LTS (or Windows with Docker Desktop) and give the server a fixed IP, for example `192.168.10.2`.
2. Copy the bundle to the server and unzip it to `/opt/lingualab`.
3. Load the Docker images: `docker load -i images.tar`
4. Copy `.env.example` to `.env` and set the institute name, the server IP, strong passwords for the database and LiveKit keys, and `JWT_SECRET` (at least 32 random characters — the server signs its access tokens with it and refuses to start without it; changing it later logs everybody out). Every variable in it is required: compose refuses to start if one is missing, rather than bringing up a database with a blank password. `LAN_IP` must be the server's real address on the lab network — LiveKit advertises it to the lab PCs as its media address, and Caddy issues its certificate for it.
5. Start everything: `docker compose up -d` (services: `caddy`, `server`, `postgres`, `livekit`, `backup`).
6. **Open the firewall to the lab**, or no lab PC can reach the server. On Ubuntu:

   ```sh
   sudo ufw allow 443/tcp && sudo ufw allow 7881/tcp && sudo ufw allow 50000:50200/udp
   ```

   On Windows, in an Administrator PowerShell:

   ```powershell
   New-NetFirewallRule -DisplayName "Lab HTTPS" -Direction Inbound -Action Allow `
     -Protocol TCP -LocalPort 443 -Profile Any -RemoteAddress LocalSubnet
   New-NetFirewallRule -DisplayName "Lab LiveKit TCP" -Direction Inbound -Action Allow `
     -Protocol TCP -LocalPort 7880,7881 -Profile Any -RemoteAddress LocalSubnet
   New-NetFirewallRule -DisplayName "Lab LiveKit UDP" -Direction Inbound -Action Allow `
     -Protocol UDP -LocalPort 50000-50200 -Profile Any -RemoteAddress LocalSubnet
   ```

   Windows needs this spelled out because running the server in Docker hides the problem: Docker's own process holds the ports, so a firewall rule that allowed `livekit-server.exe` as a program does not cover it, and a network Windows has classified as **Public** denies inbound by default. The server answers perfectly on its own `localhost` throughout, so nothing looks wrong until a lab PC tries to connect and simply hangs. Checked on the dev laptop on 2026-10-28, where exactly this stopped the second PC; written up in `spike-results.md`.

7. Create the database and seed data: `docker compose exec server pnpm db:migrate && docker compose exec server pnpm db:seed`
8. Open `https://192.168.10.2` in a browser, log in as `admin` with the printed first password, and change it. Then change the exit PIN of the student app: the dashboard lists it under **Needs attention** until you do. Set `SEED_EXIT_PIN` (six digits) before seeding to choose the first PIN; otherwise it is `135790`.
9. In Settings, set the branding (software name, logo, main colour), institute name and backup time. Plug in the second disk and check that the first backup runs.
10. Download the local root certificate from Settings › Security; the lab PC installer includes it.
11. Check `https://192.168.10.2/api/health`: server, database, LiveKit and disk should all show OK. From a **lab PC**, not only from the server itself — that is what proves step 6.

**Upgrades:** copy the new bundle, `docker load`, then `docker compose up -d`. Database migrations run automatically, and a backup is taken first.

**Running the server and the admin panel on a developer laptop.** With the stack up (`docker compose -f infra/docker-compose.yml up -d`):

```sh
pnpm build                                   # compiles shared and the server, builds the admin panel
pnpm --filter @lingualab/server db:migrate   # applies the migrations to the development database
pnpm --filter @lingualab/server db:seed      # 1 admin, 2 teachers, 30 students, Lab 1; first password Lab-2026, exit PIN 135790
JWT_SECRET=<at least 32 characters> pnpm --filter @lingualab/server start   # http://localhost:3000
pnpm --filter @lingualab/admin preview       # the built panel at http://localhost:4173, under the lab's CSP
```

**The student app on a developer laptop.** `pnpm --filter @lingualab/student dev` opens it in an ordinary window you can close, with the screens on Vite's dev server; the server address comes from `apps/student/lingualab.config.dev.json` (`http://localhost:3000`) unless `LINGUALAB_CONFIG` names another file, and `LINGUALAB_KIOSK=1` tries kiosk mode, which then closes only with the exit PIN (Ctrl+Alt+Shift+Q). `pnpm --filter @lingualab/student build` writes the screens, the main process and the preload script to `apps/student/dist`. Both variables are ignored by an installed app.

The server reads `DATABASE_URL` (default: the compose database), `JWT_SECRET` (required) and `PORT` (default 3000). `pnpm --filter @lingualab/admin dev` serves the panel at `http://localhost:5173` with hot reload instead; it sends no Content-Security-Policy, because hot reload needs inline scripts. Both send `/api` to `LINGUALAB_SERVER`, by default `http://localhost:3000`. Until the server joins docker-compose (Phase 2), Caddy has nothing behind it, so the panel is reached on these ports rather than at `https://<LAN_IP>`.

## Installing the teacher and student apps

**Student app (each lab PC)**

1. Log in to Windows as an administrator and run `LinguaLab-Student-Setup-<version>.exe` from a USB drive or from `https://192.168.10.2/downloads`.
2. Enter the server address when asked. The installer writes it to `lingualab.config.json` next to the app, as `{ "serverUrl": "https://192.168.10.2" }`, and adds the root certificate, the firewall rules and auto-start. A student cannot change the file; to move the lab to another server, edit it as an administrator.
3. Create a standard (non-admin) Windows account for students that logs in automatically; the app starts with it.
4. On first start the PC shows "Waiting for approval". In the admin panel, open Lab and seats, approve the PC and bind it to its seat (for example A1).
5. The login screen now shows "This PC: LAB1-A1 · Seat A1". Test with a headset: the setup check plays a sound and records 3 seconds.

To set up 30 PCs quickly, install on one PC, check it, then clone the disk image; each clone still registers itself and needs approval. Each PC keeps its device key with its network card's MAC address, so a clone, whose card is different, throws the copied key away and registers as itself. Taking the image before the app's first start avoids carrying a key at all.

**Teacher console (teacher PC)**

1. Run `LinguaLab-Teacher-Setup-<version>.exe` and enter the server address.
2. Log in with a teacher account. Windows asks once for screen-recording permission; allow it.
3. Choose the lab (Lab 1). The seat grid should show every approved PC as online.

**Updates:** when a new version is uploaded to the server, apps update themselves at the next start, never during a class.

## Daily operations and troubleshooting

**Every day:** switch on the server and switch first, then the teacher PC, then the lab PCs. The admin dashboard should show all PCs online and last night's backup as done.

**Every week:** copy the latest backup to the USB drive; glance at disk space on the dashboard (warning below 20% free).

**Every term:** run the restore drill on a spare PC; update the software if a new version is available.

| Problem                               | Check                                                      | Fix                                                                                            |
| ------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| A seat shows offline                  | Is the PC on and logged in to Windows? Is its cable in?    | Restart the PC; check the switch port light; in Lab and seats, check its IP and last-seen time |
| A new PC shows "Waiting for approval" | Lab and seats                                              | Approve it and bind it to its seat                                                             |
| Student cannot log in                 | Wrong password? Account inactive? Logged in on another PC? | The teacher or admin resets the password; logging in here ends the other login                 |
| Broadcast is blank on some seats      | Is UDP blocked by the Windows firewall on those PCs?       | Re-run the installer's firewall repair; LiveKit falls back to TCP 7881 meanwhile               |
| Voice echoes                          | Is a student using speakers instead of a headset?          | Headsets only; check the mic is not set to "listen to this device" in Windows                  |
| A lesson video does not play          | Is it still converting? (Content shows "processing")       | Wait a minute or two; if it failed, re-upload an MP4 or MOV file                               |
| Everything is slow                    | Dashboard shows server CPU, memory and disk                | Check nobody is copying large files on the network; restart the server outside class time      |
| Backup failed                         | Dashboard warning with the reason                          | Usually the second disk is full or unplugged; free space and press Back up now                 |
| Server PC died                        | —                                                          | Install LinguaLab on a spare PC with the same IP, restore the latest backup (under 1 hour)     |

Server logs: `docker compose logs -f server` (and `livekit`, `caddy`). Logs are rotated after 30 days.
