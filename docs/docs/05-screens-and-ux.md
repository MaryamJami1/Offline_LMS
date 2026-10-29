# 5. Screens and UX

Every screen follows the approved clickable prototype (screenshots in `../prototype/screenshots/`). This document is the reference for colours, type, screens and behaviour.

## Design system

The tokens live in `packages/ui/tokens.ts` and the Tailwind config, so all three apps look the same.

**Colours**

| Token                          | Hex                              | Used for                                  |
| ------------------------------ | -------------------------------- | ----------------------------------------- |
| `bg`                           | #F4F6F9                          | Page background                           |
| `surface`                      | #FFFFFF                          | Cards, panels, seat tiles                 |
| `border` / `border-strong`     | #DDE3EA / #CBD3DD                | Card borders / buttons and inputs         |
| `ink`                          | #0E1726                          | Main text; dark bars                      |
| `ink-muted`                    | #4A5565                          | Secondary text (passes 4.5:1 on white)    |
| `primary` / `primary-tint`     | #1D4ED8 / #E8EEFC                | Main buttons, selection, links, Speaking  |
| `live` / `live-tint`           | #B42318 / #FDECEA                | Live controls, End class, on-call, errors |
| `success` / `success-tint`     | #157F3D / #E7F5EC                | Online dot, correct answers, Reading      |
| `warning` / `warning-tint`     | #B45309 (text #9A4508) / #FDF1E3 | Hand raised, drafts, Writing              |
| `listening` / `listening-tint` | #6D28D9 / #F1EAFD                | Listening module                          |
| `offline`                      | #A7B1BE                          | Offline and empty seats                   |

**Branding can change:** the software name, logo and `primary` colour are loaded from Settings when each app starts, so the institute can rebrand without a new build. Every other colour stays fixed so contrast always passes.

**Type:** IBM Plex Sans for the interface (400, 500, 600, 700); IBM Plex Mono for seat codes, IDs and timers; IBM Plex Serif for reading passages and essays. Sizes: 12 labels, 13–14 body, 15–17 card titles, 20–28 page titles. Fonts are bundled with @fontsource.

**Spacing and shape:** 4 px grid; buttons 40 px tall (44 px for primary controls), radius 8 px; cards radius 12–14 px, 16–20 px padding; pills fully rounded.

**Components (shadcn/ui based):** Button (default, primary, danger, small), Seat tile, Control button, Tab rail, Card, Badge (live, info, ok, warn, muted), Progress bar, Level meter, Toast, Modal, Table, Option button (A/B/C), Audio player, Video player, PDF viewer, Recorder, Form fields.

## Screen inventory

"In prototype" means the screen is in the clickable prototype and the build should match it. "To design" screens follow the same design system.

### Teacher console

| ID   | Screen                                    | Main contents                                                                                                                                                             | Requirements             | Status       | Screenshot |
| ---- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------ | ---------- |
| T-01 | Teacher login                             | Username, password                                                                                                                                                        | STU-01 (staff)           | To design    |            |
| T-02 | Console: seat grid                        | Top bar (class, timer, Select all, Lock all, Start/End class), tab rail, 8 controls, seat grid in room order (empty seats until students log in), right panel, status bar | LAB-01 to LAB-03, LAB-16 | In prototype | 02, 03     |
| T-03 | Live control panels                       | Quiz progress and results, intercom call, talk level meter, demo player                                                                                                   | LAB-07 to LAB-10         | In prototype | 04, 05, 06 |
| T-04 | White board                               | Drawing area, pen, clear, save to lesson                                                                                                                                  | LAB-06                   | In prototype | 07         |
| T-05 | Monitor live view                         | Enlarged student screen, Take control, Send message, Show to class                                                                                                        | LAB-11, LAB-12           | In prototype | 08, 09     |
| T-06 | Groups, Quiz bank, Practice, Reports tabs | Group makers, quiz list, activity launcher, today's numbers                                                                                                               | LAB-08, LAB-13, LAB-15   | In prototype | 10         |
| T-07 | End-class summary                         | Present, duration, quizzes, average                                                                                                                                       | LAB-03                   | In prototype | 11         |
| T-08 | Grading inbox                             | List of recordings and essays; rubric, score, comment, voice note                                                                                                         | MOD-07                   | To design    |            |
| T-09 | My class students                         | Student list for the teacher's own classes with Reset password                                                                                                            | ADM-11                   | To design    |            |

### Student app

| ID   | Screen               | Main contents                                                                               | Requirements   | Status       | Screenshot |
| ---- | -------------------- | ------------------------------------------------------------------------------------------- | -------------- | ------------ | ---------- |
| S-01 | Login                | This PC and seat, student ID, password                                                      | STU-01         | In prototype | 12         |
| S-02 | Dashboard            | Today's work, four module tiles with progress, feedback, coming up                          | STU-02         | In prototype | 13         |
| S-03 | Listening exercise   | Audio player with play limit, questions, marking                                            | MOD-04         | In prototype | 14         |
| S-04 | Reading exercise     | Passage, glossary, questions                                                                | MOD-02         | In prototype | 15         |
| S-05 | Speaking task        | Prompt, model answer, recorder, send                                                        | MOD-01         | In prototype | 16         |
| S-06 | Writing task         | Prompt, counters, editor, submit                                                            | MOD-03         | In prototype | 17         |
| S-07 | My results           | Module scores, recent marks and feedback                                                    | STU-02, MOD-08 | In prototype | 18         |
| S-08 | Teacher takeovers    | Broadcast view, lock screen, quiz, message                                                  | STU-03         | In prototype | 19, 20, 21 |
| S-09 | Module page          | Units and lessons of one module, done and to do                                             | MOD-06, MOD-08 | To design    |            |
| S-10 | Video and PDF viewer | Video player (play, pause, seek, full screen) and PDF pages with zoom; no download or print | MOD-10         | To design    |            |

### Admin panel

| ID   | Screen        | Main contents                                                                                                     | Requirements   | Status                                           | Screenshot |
| ---- | ------------- | ----------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------ | ---------- |
| A-01 | Dashboard     | Totals, lab now, needs attention                                                                                  | ADM-06         | In prototype                                     | 22         |
| A-02 | Students      | Search, table with today's seat, add, import, reset password                                                      | ADM-01, ADM-02 | In prototype                                     | 23         |
| A-03 | Teachers      | Table, add                                                                                                        | ADM-01         | In prototype                                     |            |
| A-04 | Classes       | Cards, students, teachers, schedule                                                                               | ADM-03         | In prototype                                     |            |
| A-05 | Content list  | Module tabs, lessons table, new, import                                                                           | ADM-05         | In prototype                                     | 24         |
| A-06 | Lesson editor | Module, title, class, instructions, text, MP3, MP4 video and PDF uploads, questions, live preview, draft, publish | MOD-05         | In prototype (video/PDF upload to add)           | 25         |
| A-07 | Lab and seats | Lab picker, seat map, PC details, who is logged in, approve new PCs                                               | ADM-04         | In prototype (approval and lab picker to design) | 26         |
| A-08 | Reports       | Attendance and results charts and tables, PDF and Excel export                                                    | ADM-06         | In prototype                                     | 27         |
| A-09 | Backups       | List, back up now, copy to USB, restore                                                                           | ADM-08         | In prototype                                     | 28         |
| A-10 | Settings      | Branding (software name, logo, main colour), institute, grading, backup time                                      | ADM-07         | In prototype                                     | 29         |
| A-11 | Audit log     | Searchable list                                                                                                   | ADM-09         | To design                                        |            |

## Interaction rules and accessibility

**Rules every screen follows**

- With no seat selected, a control goes to every logged-in student; the selection line always says which.
- Pressing a running control again stops it; starting another control replaces it. The status bar always shows what is live, for whom and for how long, with one Stop button.
- Controls that need a class show "Press Start class first" instead of failing silently.
- Clicking an offline or empty seat explains why nothing happens.
- Every action that would take effect on the server shows a short toast (bottom centre, 3 seconds) confirming what happened.
- Teacher takeovers on the student app cannot be dismissed by the student; only the teacher's Stop ends them.
- While Monitor runs, the student app shows nothing.
- Forms keep what was typed after an error, and show the error next to the field.
- The teacher console fits a 1440 x 900 screen without scrolling, even with a control running. It must also work on 1366 x 768 with the right panel scrolling.

**Accessibility**

- Text contrast at least 4.5:1 (3:1 for 24 px and larger); status is never shown by colour alone (dots always have a label or badge).
- Every control is a real button, link or input, reachable with Tab, with a visible focus ring.
- Icon-only buttons have labels for screen readers; seat tiles announce the student, seat and state.
- Minimum touch target 40 px; minimum text 12 px (13 px for body).
- Audio exercises show the transcript after submitting, for students who cannot hear well.
