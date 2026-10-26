# Prototype reference

The approved clickable prototype (version of 26 Oct 2026). Online: https://claude.ai/artifact/B5an47MxmpnvR1y2CoRwVk

Build every screen to match these, using the design system in `../docs/05-screens-and-ux.md`. All names and numbers are sample data.

## Screenshots (1440 x 900)

| File | Screen ID | What it shows |
| --- | --- | --- |
| 01-role-picker.png | — | Prototype start page |
| 02-teacher-students-logging-in.png | T-02 | Seats empty, filling as students log in at any PC |
| 03-teacher-class-started.png | T-02 | Class started, 27 of 30 logged in, B4 empty |
| 04-teacher-broadcast.png | T-02, T-03 | Broadcast PC to the whole class, Live badges, status bar |
| 05-teacher-quiz-results-and-hand-raised.png | T-03 | Live quiz results; a raised hand |
| 06-teacher-intercom.png | T-03 | Intercom call with level meter |
| 07-teacher-white-board.png | T-04 | White board |
| 08-teacher-monitor.png | T-05 | Monitor thumbnails |
| 09-teacher-monitor-live-view.png | T-05 | Live view of one student screen |
| 10-teacher-group-talk.png | T-06 | Groups tab and Group Talk |
| 11-teacher-end-class-summary.png | T-07 | End-class summary |
| 12-student-login.png | S-01 | Login at any PC |
| 13-student-dashboard.png | S-02 | Dashboard |
| 14-student-listening-marked.png | S-03 | Listening exercise after marking |
| 15-student-reading.png | S-04 | Reading exercise |
| 16-student-speaking-recording.png | S-05 | Recording a speaking answer |
| 17-student-writing.png | S-06 | Writing task with counters |
| 18-student-results.png | S-07 | My results |
| 19-student-takeover-broadcast.png | S-08 | Teacher broadcast on the student screen |
| 20-student-takeover-lock.png | S-08 | Lock screen |
| 21-student-takeover-quiz.png | S-08 | Quiz from the teacher |
| 22-admin-dashboard.png | A-01 | Admin dashboard |
| 23-admin-students.png | A-02 | Students with today's seat |
| 24-admin-content.png | A-05 | Content list |
| 25-admin-lesson-editor.png | A-06 | Lesson editor with live student preview |
| 26-admin-lab-and-seats.png | A-07 | Lab seat map and PC details |
| 27-admin-reports.png | A-08 | Reports |
| 28-admin-backups.png | A-09 | Backups |
| 29-admin-settings.png | A-10 | Settings |

Not yet in the prototype (see the "To design" rows in the screens document): teacher login, grading inbox, teacher's class student list with password reset, module page, video and PDF viewer, video/PDF upload in the lesson editor, audit log.

## Source files

`source/*.dc.html` are the prototype's own files: the HTML holds the layout and exact inline styles; the `<script type="text/x-dc">` block at the bottom of each file holds the sample data and the screen logic (seat assignment, quiz simulation, lesson editor validation). They need the design tool's runtime to run, so treat them as a reference to read, not code to run or ship.
