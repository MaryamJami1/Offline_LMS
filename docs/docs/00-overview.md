# LinguaLab Project Documentation

Version 1.1 (draft) · 26 Oct 2026 · Maryam Jamil

This is the full documentation set for LinguaLab, the offline Digital Language Lab for an English language institute. Each file in this folder is one document.

## Purpose and scope

LinguaLab replaces the institute's existing language-lab software with one offline system that does two jobs: it lets a teacher control every PC in the lab, and it teaches English through four modules (Speaking, Reading, Writing, Listening).

**Who uses it**

- **Admin:** sets up people, classes, the lab, lessons and backups.
- **Teachers:** run classes from the lab console, write lessons and mark work.
- **Students:** log in at any free lab PC, do assigned lessons and quizzes, and see their own marks.

**Size:** Lab 1 has 30 PCs today; the design target is 60 PCs per lab. The sample setup has 3 teachers, 3 classes and about 72 students.

**In scope for version 1**

- Admin panel: people, classes, groups, lab seats and PCs, lessons, reports, backups and settings.
- Teacher console: seat grid and eight controls (Broadcast PC, Screen Demo, White Board, Demo, Quiz, Intercom with Whole Talk and Group Talk, Monitor), plus lock, message, collect files and start/end class.
- Student app: login at any PC, dashboard, four modules, voice recording, quizzes, marks and feedback.
- Lesson editor for teachers, grading inbox, progress tracking.
- Installers for the server and the lab PCs; nightly backups.

**Out of scope for version 1:** internet or cloud access, mobile apps, fee or payment handling, and automatic AI pronunciation scoring (a later option). A second lab is planned for later; version 1 supports more than one lab but sets up Lab 1 only.

## Document map

| File                                               | What it covers                                                                              | Read it if you are                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------ |
| [01-requirements.md](01-requirements.md)           | Roles, numbered functional requirements, non-functional targets, scope, acceptance criteria | Everyone; the institute signs this one off |
| [02-architecture.md](02-architecture.md)           | Components, tech stack, message flows, repository layout, network ports                     | Developers                                 |
| [03-database.md](03-database.md)                   | Tables, columns, relationships, file storage                                                | Developers                                 |
| [04-api-and-events.md](04-api-and-events.md)       | REST endpoints, Socket.IO lab events, LiveKit media rooms                                   | Developers                                 |
| [05-screens-and-ux.md](05-screens-and-ux.md)       | Colours, type, every screen, interaction rules                                              | Developers, designers, the institute       |
| [06-security-and-data.md](06-security-and-data.md) | Permissions, login, privacy, audit, backups                                                 | Developers, admin                          |
| [07-installation.md](07-installation.md)           | Hardware, server setup, installing lab PCs, daily operations, troubleshooting               | Admin, IT person                           |
| [08-testing.md](08-testing.md)                     | Test-driven development, test cases, 60-seat load test, acceptance checklist                | Developers, the institute                  |
| [09-project-plan.md](09-project-plan.md)           | Phase-by-phase build plan with tasks, deliverables and exit criteria; risks                 | Everyone                                   |
| [10-user-guides.md](10-user-guides.md)             | Step-by-step guides for teachers, students and the admin                                    | Teachers, students, admin                  |

Related: the clickable prototype (screenshots and source in `../prototype/`), online at https://claude.ai/artifact/B5an47MxmpnvR1y2CoRwVk

## Decisions so far

The institute answered the key questions on 26 Oct 2026. These answers, and the technical choices that follow from them, hold for every document here.

| Topic                   | Decision                                                       | What it means for the build                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lab PCs                 | Windows 10 and Windows 11                                      | Both apps are built and tested on both versions (64-bit)                                                                                                               |
| Network                 | Gigabit switch                                                 | Teacher screen broadcast runs at 1080p, 15 fps to every seat                                                                                                           |
| Seating                 | No fixed seats                                                 | Students log in at any free PC each class; the console records who sat where; data follows the student account                                                         |
| Lesson content          | The institute's teachers write their own lessons               | The lesson editor is built early (Phase 2) and must be usable with no training                                                                                         |
| Student and teacher PCs | Small desktop app (Electron) on each PC                        | Needed for silent screen capture, screen lock, full-screen broadcast and auto-start                                                                                    |
| Admin panel             | Web app in any browser on the lab network                      | Nothing to install for the admin                                                                                                                                       |
| Server                  | One local PC running Docker Compose                            | Works with the internet unplugged                                                                                                                                      |
| Screen and voice        | LiveKit media server on the local network                      | No special lab hardware; any USB headset works                                                                                                                         |
| Data                    | PostgreSQL plus files on the server disk                       | Nightly automatic backups to a second disk                                                                                                                             |
| Language                | TypeScript end to end                                          | One language for server, apps and admin panel                                                                                                                          |
| Development method      | Test-driven development (TDD)                                  | Every feature starts with a failing test, then the code to pass it, then a clean-up. Each requirement has a matching test ID, and nothing merges without passing tests |
| Demo                    | Both: teacher plays a lesson, and a student shows their screen | Both modes are Must requirements (LAB-07)                                                                                                                              |
| Monitoring              | Students see no "monitored" icon                               | The student app shows nothing while Monitor runs; thumbnails are still never saved                                                                                     |
| Branding                | Name, logo and colours will change later                       | Software name, logo and main colour are admin settings, so rebranding needs no code change                                                                             |
| Passwords               | Admin sets first passwords; teachers reset them                | Teachers can reset passwords only for students in their own classes (ADM-11); every reset is logged                                                                    |
| Lesson media            | MP3, video (MP4) and PDF                                       | The lesson editor uploads all three; videos are converted to 720p on the server; the student app has a video player and PDF viewer (MOD-10)                            |
| Second lab              | Planned for the future                                         | Version 1 supports more than one lab in data and screens; the server is sized for 120 seats                                                                            |

## Glossary

| Term                    | Meaning in LinguaLab                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Lab                     | A room with student PCs and one teacher PC, for example Lab 1                                                     |
| Seat                    | A position in the lab layout, named by row and number (A1 to E6). Each seat has one lab PC                        |
| Lab PC / device         | A student computer running the student app, registered to one seat                                                |
| Session (class session) | One taught class, from Start class to End class                                                                   |
| Seat record             | Which student logged in at which seat during a session                                                            |
| Broadcast PC            | The teacher's screen shown full-screen on students' PCs, with their keyboard and mouse locked                     |
| Screen Demo             | The teacher's screen shown in a window; students can keep working                                                 |
| White Board             | A live drawing board the teacher writes on, shown on students' screens                                            |
| Demo                    | Either a lesson (audio or video) played to students in sync, or one student's screen and voice shown to the class |
| Whole Talk              | The teacher's microphone heard in every selected headset                                                          |
| Intercom                | A private two-way voice call between the teacher and one student                                                  |
| Group Talk              | Voice rooms where each pair or group talks only among themselves                                                  |
| Monitor                 | Small live pictures of every student screen, with a full-size live view on click                                  |
| Lock                    | Blanks a student screen with "Eyes on your teacher" and blocks input                                              |
| Module                  | One of the four skills: Speaking, Reading, Writing, Listening                                                     |
| Lesson                  | A unit of content in one module: text, audio, video, PDF and questions                                            |
| Assignment              | A lesson given to a class, group or student, with an optional due date                                            |
| Submission              | One student's attempt at an assignment, with answers, recordings and marks                                        |
| Grading inbox           | The teacher's list of speaking recordings and writing answers waiting for marks                                   |
| SFU (LiveKit)           | The media server that takes one stream from the teacher and forwards it to every seat                             |
| Socket.IO               | The live message channel used for lab commands and status                                                         |
| Kiosk mode              | The student app running full-screen and locked, so students cannot leave it                                       |
| Device key              | A secret given to each approved lab PC so only known PCs can join the lab                                         |

## Open questions and history

**Answered by the institute (26 Oct 2026)**

- [x] Demo: teacher playing a lesson, a student showing their work, or both? Answer: both.
- [x] Monitoring: should students see a "monitored" icon? Answer: no icon.
- [x] Branding: final software name, logo and colours. Answer: they will change later, so name, logo and colours are settings, not code. The default software name is "Lab"; "LinguaLab" stays the name of this project and its repository.
- [x] Passwords: who gives the first password, and who resets forgotten ones? Answer: the admin gives the first password; teachers reset passwords for students in their own classes.
- [x] Media: is MP3 enough, or do lessons need video or PDF? Answer: video and PDF are needed too.
- [x] Growth: is a second lab planned? Answer: yes, in future; no date yet.

**Still to confirm:** data retention periods (see 03-database.md, proposal).

**Document history**

| Version   | Date        | Change                                                                                                                         |
| --------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1.0 draft | 26 Oct 2026 | First full documentation set, written after the prototype and the institute's answers                                          |
| 1.1 draft | 26 Oct 2026 | Institute's answers on demo, monitoring, branding, passwords, video and PDF, and a second lab added to every affected document |
