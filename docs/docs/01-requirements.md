# 1. Requirements (SRS)

LinguaLab version 1 must let one teacher run a lab of 30 to 60 PCs and teach the four English skills with no internet. This document lists what the software must do and how well it must do it.

## Users and roles

| Role    | Where they work                                                        | What they need from LinguaLab                                                                                                                           |
| ------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin   | Any browser on the lab network                                         | Set up and maintain people, classes, the lab and its PCs, lessons, reports, settings and backups                                                        |
| Teacher | Teacher console on the teacher PC; admin panel for lessons and marking | Run a class: see every seat, show their screen, talk to students, run quizzes, watch screens, write lessons, mark work, reset their students' passwords |
| Student | Student app on any free lab PC                                         | Log in, follow what the teacher shows, do assigned lessons in four modules, record their voice, take quizzes, see their own marks and feedback          |

A person has exactly one role. Teachers see only their own classes unless the admin shares a class with them. Students see only their own data.

## Functional requirements

Priority: **Must** = needed for version 1, **Should** = version 1 if time allows, **Could** = later. Because the project follows test-driven development, every ID below has its own tests, named after it (LAB-04 becomes `lab-04.broadcast.spec.ts`), written before the feature code.

### Admin panel (ADM)

| ID     | Requirement                                                                                                                                          | Priority |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| ADM-01 | Create, edit and deactivate teacher and student accounts; set each new account's first-login password; reset passwords                               | Must     |
| ADM-02 | Import students from an Excel or CSV file (name, class, phone) with an error report for bad rows                                                     | Must     |
| ADM-03 | Create courses, batches, classes and groups; assign teachers and students to classes                                                                 | Must     |
| ADM-04 | Create one or more labs and their seat maps (rows, seats per row, pairs); register each lab PC and bind it to a seat; see each PC's status           | Must     |
| ADM-05 | Manage the four modules, units and lessons; publish and unpublish; import and export lesson packs (.zip)                                             | Must     |
| ADM-06 | View attendance, marks and progress by student, class and module; export to PDF and Excel                                                            | Must     |
| ADM-07 | Settings: software name, institute name, logo and main colour (rebranding needs no code change), grading scale, quiz pass mark, nightly backup time  | Must     |
| ADM-08 | Back up now, automatic nightly backup, copy to USB, restore from a backup                                                                            | Must     |
| ADM-09 | Audit log of logins, grade changes, password resets, deletions and lab commands                                                                      | Should   |
| ADM-10 | Push new student-app versions to lab PCs from the server                                                                                             | Should   |
| ADM-11 | Teachers can reset the password of students in their own classes (from the class student list); they cannot reset other students' or staff passwords | Must     |

### Teacher console (LAB)

| ID     | Requirement                                                                                                                                             | Priority |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| LAB-01 | Seat grid in room layout; each seat shows offline, empty (PC on, no login) or the logged-in student's name and ID, plus hand-raised and activity badges | Must     |
| LAB-02 | Select one seat, several seats, a group, or everyone; with nothing selected, controls go to every logged-in student                                     | Must     |
| LAB-03 | Start class (opens a session and records attendance from logins) and End class (saves everything, logs students off)                                    | Must     |
| LAB-04 | Broadcast PC: teacher screen full-screen on targets, keyboard and mouse locked                                                                          | Must     |
| LAB-05 | Screen Demo: teacher screen in a window; students keep control                                                                                          | Must     |
| LAB-06 | White Board: live drawing on student screens; clear; save the board to a lesson                                                                         | Must     |
| LAB-07 | Demo, both modes: play a lesson's audio or video in sync on targets; and show one student's screen and voice to the class                               | Must     |
| LAB-08 | Quiz: launch from the quiz bank with a timer; answers arrive live; auto-marking; results per question; share results with students                      | Must     |
| LAB-09 | Whole Talk (teacher to all), Intercom (private two-way call), Group Talk (voice per group); mute                                                        | Must     |
| LAB-10 | Hand raise from students, shown on the seat and in a list, with one-click Talk                                                                          | Must     |
| LAB-11 | Monitor: thumbnails of every logged-in screen refreshed every 3 s; click for a live full-size view; students see no monitoring icon                     | Must     |
| LAB-12 | Take control of a student PC from the live view                                                                                                         | Should   |
| LAB-13 | Lock and unlock selected or all screens; send a text message; launch an activity on targets                                                             | Must     |
| LAB-14 | Collect files from students' Documents folders into the session                                                                                         | Should   |
| LAB-15 | Groups: pair by seat, random groups of N, or manual groups                                                                                              | Must     |
| LAB-16 | A status bar always shows what is running, for whom and for how long, with one Stop button                                                              | Must     |
| LAB-17 | Record the class audio for the session                                                                                                                  | Could    |

### Student app (STU)

| ID     | Requirement                                                                                             | Priority |
| ------ | ------------------------------------------------------------------------------------------------------- | -------- |
| STU-01 | Log in at any registered lab PC with student ID and password; the seat used is recorded for the session | Must     |
| STU-02 | Dashboard: today's assigned work, the four modules with progress, latest marks and feedback             | Must     |
| STU-03 | Teacher actions take over the screen (broadcast, lock, quiz, activity) until the teacher stops them     | Must     |
| STU-04 | Raise and lower hand; hear the teacher; talk during Intercom and Group Talk                             | Must     |
| STU-05 | See only their own profile, work, recordings and marks                                                  | Must     |
| STU-06 | App starts with Windows, runs in kiosk mode and cannot be closed without the admin PIN                  | Must     |
| STU-07 | Log out by hand, at End class, and after 30 minutes idle                                                | Must     |

### English modules and lessons (MOD)

| ID     | Requirement                                                                                                                                                                                                                              | Priority |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| MOD-01 | Speaking: model audio, record an answer (up to 60 s), play back, record again, send; teacher marks with a rubric (pronunciation, fluency, accuracy) and text or voice feedback                                                           | Must     |
| MOD-02 | Reading: passage with glossary; multiple choice, true/false, fill in the blank, matching; automatic marking                                                                                                                              | Must     |
| MOD-03 | Writing: sentence, paragraph and essay tasks with a word counter; grammar exercises; teacher comments, rubric and mark                                                                                                                   | Must     |
| MOD-04 | Listening: audio with a play-count limit; transcript shown after submitting; multiple choice, fill in the blank, dictation; automatic marking                                                                                            | Must     |
| MOD-05 | Lesson editor: module, title, class, instructions, text, MP3 audio, MP4 video and PDF files, five question types (multiple choice, true/false, fill in the blank, recording, free writing), live student preview, save as draft, publish | Must     |
| MOD-06 | Assign lessons to a class, group or student with an optional due date                                                                                                                                                                    | Must     |
| MOD-07 | Grading inbox for speaking and writing answers                                                                                                                                                                                           | Must     |
| MOD-08 | Progress per student and module: average score and completion percentage                                                                                                                                                                 | Must     |
| MOD-09 | Automatic pronunciation score from a local speech model                                                                                                                                                                                  | Could    |
| MOD-10 | Students watch lesson videos (MP4) and read PDFs inside the student app, offline, with no download or print option                                                                                                                       | Must     |

## Non-functional requirements

Each target below is checked by an automated test or by the 60-seat load test in the Testing document.

| ID     | Area          | Requirement                                                                                     | Target                                                                                                     |
| ------ | ------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| NFR-01 | Offline       | Every feature works with the internet cable unplugged                                           | 100% of features                                                                                           |
| NFR-02 | Capacity      | One lab runs a full class; the server is sized for a second lab later (120 seats in total)      | 60 seats at once                                                                                           |
| NFR-03 | Broadcast     | Teacher screen readable on every seat                                                           | 1080p, 15 fps, under 500 ms delay                                                                          |
| NFR-04 | Voice         | Teacher and student voice in headsets                                                           | Under 200 ms delay, echo cancelled                                                                         |
| NFR-05 | Commands      | Lock, unlock, launch and stop reach every target seat                                           | Under 1 s                                                                                                  |
| NFR-06 | Monitor       | Thumbnails of all screens                                                                       | Refresh every 3 s, under 5 Mbps for 60 seats                                                               |
| NFR-07 | Start-up      | Student app ready after Windows login; console ready after opening                              | Under 15 s; under 10 s                                                                                     |
| NFR-08 | Reliability   | A lab PC reconnects by itself after a network drop; a console restart keeps the running session | Reconnect under 10 s; no session lost                                                                      |
| NFR-09 | Data safety   | Nightly backups kept for 14 days                                                                | At most 1 day of data lost; restore in under 1 hour                                                        |
| NFR-10 | Usability     | A teacher can run a class after a short training; common actions are one or two clicks          | Training under 1 hour                                                                                      |
| NFR-11 | Accessibility | Readable text and keyboard use                                                                  | Contrast at least 4.5:1; text at least 13 px; every control reachable by keyboard                          |
| NFR-12 | Platforms     | Lab and teacher PCs; server                                                                     | Windows 10 and 11 (64-bit); server on Windows 10/11 or Ubuntu 22.04+ with Docker                           |
| NFR-13 | Security      | Passwords and access                                                                            | Passwords hashed (Argon2); every request checked by role on the server; HTTPS on the lab network           |
| NFR-14 | Quality       | Test-driven development                                                                         | Tests written first; at least 80% line coverage on the server and shared code; all tests pass before merge |

## Constraints, assumptions and out of scope

**Constraints**

- No internet in daily use. Software updates and fonts are installed from the server, never downloaded during class.
- Lab PCs run Windows 10 or 11, and both must be supported.
- One gigabit switch connects the server, the teacher PC and all lab PCs.
- Students have no fixed seats, so nothing about a student may depend on a particular PC.

**Assumptions**

- Every lab PC has a USB headset with a microphone.
- The server PC has a fixed IP address on the lab network and runs whenever the lab is in use.
- Teachers write all lesson content themselves; two sample lessons per module ship with the software as examples.
- The interface is in English. Roman Urdu or Urdu help text can be added later.

**Out of scope for version 1**

- Access from home or over the internet; mobile apps.
- Fees, payments, admissions and timetabling beyond the class schedule.
- Video calls outside the lab network.
- Automatic AI pronunciation scoring (MOD-09 is a later option).

## Acceptance criteria for version 1

The institute signs off version 1 when all of these pass in Lab 1 with a real class:

- [ ] Every Must requirement above has passing automated tests, and the full test suite is green.
- [ ] 30 students log in at seats of their own choice; the console shows each name at the right seat within 2 seconds, and attendance matches the class register.
- [ ] Broadcast PC to all seats: text in a Word document is readable on every screen, with no seat dropping out for 20 minutes.
- [ ] Whole Talk, Intercom and Group Talk are clear in every headset, with no echo.
- [ ] A 10-question quiz runs to the whole class; all answers arrive, and the results match a hand count.
- [ ] Lock all, then unlock all, reaches every seat in under 1 second.
- [ ] A teacher who has not used LinguaLab before writes and publishes a Listening lesson with audio and three questions in under 10 minutes, using only the Teacher guide.
- [ ] A student completes one lesson in each of the four modules; marks and feedback show on their dashboard and in the admin reports.
- [ ] The internet cable is unplugged for a full day of classes with no problems.
- [ ] A backup is restored onto a spare PC and the lab runs from it.
