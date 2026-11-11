# Checking a student app installer on a spare PC (STU-06)

What T-STU-06 and the Windows CI job cannot do: run the real installer as an
administrator and log in to Windows afterwards. Do this for every new
installer before it goes to the lab, on a spare PC, never on the laptop you
develop on.

## Before

- The server and admin panel are running; from the spare PC, the admin panel opens at the server's address.
- On the USB drive: `LinguaLab-Student-Setup-<version>.exe` (from `pnpm --filter @lingualab/student installer`, or the `student-installer` artifact of the pull request's Windows CI job) and, for `https://`, `lab-root.crt` beside it (07, step 2).
- The spare PC has two Windows accounts: yours, an administrator, and a standard one such as `student-test`.
- Write down the current exit PIN. Your ways out if anything goes wrong: Ctrl+Alt+Shift+Q and the PIN; Ctrl+Alt+Del, then Sign out or Switch user; Safe Mode as a last resort.

## Steps

| #   | Do                                                                                                 | Expect                                                                                                               | OK  |
| --- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --- |
| 1   | As the administrator, run the installer                                                            | Windows asks for administrator rights; the installer asks for the server address, filled with `https://`             |     |
| 2   | Type an address without `https://`, press Next                                                     | "The address must start with https:// or http://"; the page stays                                                    |     |
| 3   | Type the server's address, finish                                                                  | The app does **not** start; `C:\Program Files\LinguaLab Student\lingualab.config.json` holds `{ "serverUrl": "…" }`  |     |
| 4   | `reg query HKLM\Software\Microsoft\Windows\CurrentVersion\Run /v "LinguaLab Student"`              | The quoted path of `LinguaLab Student.exe`                                                                           |     |
| 5   | With `lab-root.crt` beside the installer: `certutil -store Root` and look for the Caddy local root | Listed                                                                                                               |     |
| 6   | As `student-test`, try to save a change to the config file                                         | Access denied                                                                                                        |     |
| 7   | Sign out, sign in as `student-test`                                                                | The app starts by itself, full screen, on top: "Waiting for approval" with the PC's name                             |     |
| 8   | In the admin panel, Lab and seats: approve the PC on a seat                                        | Within 30 s: "Log in to Lab", "This PC: … · Seat …"                                                                  |     |
| 9   | Try Alt+F4, Alt+Tab, Ctrl+W, F5, F11, Ctrl+Shift+I and the Windows key                             | The app stays in front and open (the Windows key may open Start, but the app stays full screen behind it and on top) |     |
| 10  | Log in as a test student, change the first password, log out                                       | As on the laptop                                                                                                     |     |
| 11  | Ctrl+Alt+Shift+Q, a wrong PIN                                                                      | "Wrong PIN. 4 tries left."; the app stays                                                                            |     |
| 12  | Ctrl+Alt+Shift+Q, the right PIN                                                                    | The app closes; the dashboard's audit log shows `device.exit`                                                        |     |
| 13  | Sign out and in again as `student-test`                                                            | The app starts again                                                                                                 |     |
| 14  | As the administrator, run the same installer again (an update)                                     | It does not ask for the address; the config file is unchanged; the app still starts at the next login                |     |
| 15  | Silent: `LinguaLab-Student-Setup-<version>.exe /S /SERVER=ftp://x`, then `echo %ERRORLEVEL%`       | 2, nothing changed                                                                                                   |     |
| 16  | Uninstall from Settings › Apps                                                                     | The Run value and the firewall rule are gone; the root certificate stays                                             |     |

Write the date, the installer version and any step that failed below, and
report a failure as an issue against STU-06.

## Results

| Date | Version | PC  | Failed steps |
| ---- | ------- | --- | ------------ |
|      |         |     |              |
