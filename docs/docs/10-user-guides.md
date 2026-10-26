# 10. User guides

Short step-by-step guides for teachers, students and the admin. They will become the printed manuals and the in-app help.

## Teacher guide: running a class

**Before class**

1. Open LinguaLab Teacher on the teacher PC and log in.
2. Choose your class (for example B-12) and check the seat grid: green dots mean the PCs are on.
3. Put on your headset and check the mic volume slider.

**Start the class**

4. Students sit at any free PC and log in. Their names appear on the seats as they do.
5. Press **Start class**. Attendance is taken from the logins; late students are marked late when they log in.

**Teach**

6. To choose who a control goes to, click seats (or **Select all**). With nothing selected, a control goes to everyone logged in.
7. Press a control:
    - **Broadcast PC:** students see your screen full-screen and cannot use their PC.
    - **Screen Demo:** students see your screen in a window and keep working.
    - **White Board:** write or draw; press **Save to lesson** to keep it.
    - **Demo:** with no seat or many seats selected it plays the lesson audio or video; with one student selected, that student's screen and voice go to the class.
    - **Quiz:** choose a quiz in the Quiz tab and press Launch; watch answers arrive; press **Show results to students** at the end.
    - **Whole Talk:** speak to everyone in their headsets.
    - **Intercom:** select one student, then press Intercom for a private call. When a hand is raised, press **Talk** next to the name.
    - **Monitor:** see every screen; click one to see it full size. Students are not shown any sign that you are watching.
8. The dark bar at the bottom always shows what is running. Press **Stop** to end it, or press the same control again.
9. **Lock all** shows "Eyes on your teacher" on every screen. Press **Unlock all** to give control back.
10. For pair or group speaking practice: Groups tab › **Pair by seat** or **Random groups of 4** › **Start Group Talk**.

**End the class**

11. Press **End class** and check the summary. Everything is saved and students are logged off.

**Writing a lesson** (admin panel › Content › New lesson)

1. Choose the module, type a title, choose the class and write short instructions.
2. Add the reading text, and upload an MP3, a video (MP4) or a PDF if the lesson needs them. Videos take a minute or two to be ready.
3. Add questions: choose the type, type the question, fill the answers and tick the correct one.
4. Check the student preview on the right, then press **Publish** (or **Save as draft** to finish later).

**Marking:** open the grading inbox, listen to each recording or read each essay, set the rubric marks, add a comment or a voice note, and press Save.

**Resetting a student's password:** open your class's student list, find the student and press **Reset password**. Give them the printed slip; they choose a new password when they log in. You can do this only for students in your own classes.

## Student guide: logging in and doing lessons

1. Sit at any free PC and put on the headset.
2. Type your student ID (for example S-1001) and your password, then press **Log in**. The first time, you choose a new password.
3. Your dashboard shows **Today from your teacher**, your four modules and your latest marks.
4. Press **Start** on a task:
    - **Listening:** press play (you can play it twice), then answer the questions and press **Submit answers**.
    - **Reading:** read the passage, answer the questions, press **Submit answers**.
    - **Speaking:** listen to the model answer if you like, press the round button to record, press the square to stop, listen back, then **Send to teacher**.
    - **Writing:** write your answer in the box; the counters show your words. Press **Submit to teacher**.
5. Need help? Press **Raise hand**. Your teacher sees it and can talk to you in your headset.
6. When your teacher shares their screen, locks screens or starts a quiz, your screen changes by itself. Wait for your teacher to stop it.
7. See your marks and your teacher's comments in **My results**.
8. Press **Log out** when you leave. If you forget, you are logged out at the end of class.

Your work is saved to your account, not the computer, so you can sit at a different PC next time.

Some lessons include a video or a PDF. They open inside the app; listen to videos through your headset. Forgot your password? Ask your teacher to reset it.

## Admin guide: classes, lessons, seats and backups

Open `https://192.168.10.2` (or `https://lingualab.local`) in any browser on the lab network and log in as admin.

**Setting up a new batch**

1. **Classes:** create the course and batch if new, then **New class** (code, name, lab, days and time).
2. **Teachers:** add each teacher and assign them to their classes.
3. **Students:** **Import from Excel** with columns Name, Class, Phone (or **Add student** one by one). Print the first-login password slips.

**Adding a new lab PC**

1. Install the student app on the PC (see 07-installation.md).
2. In **Lab and seats**, the PC shows as waiting. Approve it and choose its seat.

**Lessons:** teachers write lessons themselves under **Content**. The admin can edit, publish, unpublish, import and export lesson packs.

**Reports:** choose a class, student or module and a date range; press **Export PDF** or **Export Excel**.

**Backups**

- Backups run every night by themselves. Check the dashboard each morning: "Last backup: last night" should be green.
- Every week, plug in the USB drive and press **Copy latest to USB**.
- To restore: **Backups** › choose a backup › **Restore** › type the admin password. The lab is unavailable for a few minutes.

**Passwords:** **Students** or **Teachers** › find the person › **Reset password** gives a new first-login password. Teachers can also reset passwords for students in their own classes. Locked accounts unlock after 10 minutes, or straight away from the same page.

**Branding:** Settings › Branding changes the software name, logo and main colour. All apps pick up the change the next time they start.

**A second lab:** Lab and seats › **New lab**, draw its seat map, then install and approve its PCs. Classes can then be set to the new lab.
