import { describe, it, expect } from 'vitest';
import { PERMISSIONS, accessOf, may, type Action } from './permissions.js';

/**
 * T-ACL-01, the shared half: the permissions table of
 * docs/docs/06-security-and-data.md as data, so the apps hide what the server
 * refuses from the same source. The server's T-ACL-01 spec checks this table
 * against the document cell by cell and every endpoint against this table.
 */

describe('T-ACL-01 the shared permissions table', () => {
  it('holds every row of the document, by its own key', () => {
    expect(Object.keys(PERMISSIONS)).toEqual([
      'manageUsers',
      'resetStudentPassword',
      'importStudents',
      'manageOrganisation',
      'makeGroups',
      'manageLabs',
      'runClass',
      'editLessons',
      'publishLessons',
      'seeLessons',
      'submitWork',
      'markWork',
      'seeProgress',
      'reports',
      'manageSettings',
      'seeBranding',
    ]);
  });

  it('keeps each cell as the document writes it', () => {
    expect(PERMISSIONS.resetStudentPassword).toEqual({
      row: "Reset a student's password",
      admin: 'Yes',
      teacher: 'Own classes',
      student: 'No',
    });
    expect(PERMISSIONS.editLessons.teacher).toBe('Yes (own drafts; shared once published)');
    expect(PERMISSIONS.seeLessons.student).toBe('Assigned only');
  });

  it('reads Yes and All as everything, the Own and Assigned cells as own only, and No as nothing', () => {
    expect(accessOf('Yes')).toBe('all');
    expect(accessOf('All')).toBe('all');
    expect(accessOf('Yes (own drafts; shared once published)')).toBe('all');
    expect(accessOf('Own')).toBe('own');
    expect(accessOf('Own classes')).toBe('own');
    expect(accessOf('Assigned only')).toBe('own');
    expect(accessOf('No')).toBe('none');
  });

  it('lets the admin manage users, import students and manage labs, and nobody else', () => {
    const adminOnly: Action[] = ['manageUsers', 'importStudents', 'manageLabs', 'manageSettings'];

    for (const action of adminOnly) {
      expect(may('admin', action), action).toBe(true);
      expect(may('teacher', action), action).toBe(false);
      expect(may('student', action), action).toBe(false);
    }
  });

  it("lets a teacher reset a student's password for their own classes only", () => {
    expect(may('teacher', 'resetStudentPassword')).toBe(true);
    expect(may('teacher', 'resetStudentPassword', { ownClass: false })).toBe(false);
    expect(may('teacher', 'resetStudentPassword', { ownClass: true })).toBe(true);
    expect(may('admin', 'resetStudentPassword', { ownClass: false })).toBe(true);
  });

  it('keeps the admin out of running a class and marking work', () => {
    expect(may('admin', 'runClass')).toBe(false);
    expect(may('admin', 'markWork')).toBe(false);
    expect(may('teacher', 'runClass')).toBe(true);
  });

  it('lets everyone see the branding', () => {
    expect(may('admin', 'seeBranding')).toBe(true);
    expect(may('teacher', 'seeBranding')).toBe(true);
    expect(may('student', 'seeBranding')).toBe(true);
  });
});
