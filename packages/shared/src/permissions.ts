import type { Role } from './auth.js';

/**
 * The permissions table of docs/docs/06-security-and-data.md, cell for cell.
 * The server's T-ACL-01 spec checks it against the document and checks every
 * endpoint against it; the apps decide which buttons to show from it. Hiding a
 * button is never the check: the server refuses on its own.
 */
export interface PermissionRow {
  /** The Action column, word for word. */
  row: string;
  admin: string;
  teacher: string;
  student: string;
}

export const PERMISSIONS = {
  manageUsers: {
    row: 'Create, edit, deactivate users; set first passwords',
    admin: 'Yes',
    teacher: 'No',
    student: 'No',
  },
  resetStudentPassword: {
    row: "Reset a student's password",
    admin: 'Yes',
    teacher: 'Own classes',
    student: 'No',
  },
  importStudents: { row: 'Import students', admin: 'Yes', teacher: 'No', student: 'No' },
  manageOrganisation: {
    row: 'Manage courses, batches, classes, enrolments',
    admin: 'Yes',
    teacher: 'No',
    student: 'No',
  },
  makeGroups: { row: 'Make groups', admin: 'Yes', teacher: 'Own', student: 'No' },
  manageLabs: {
    row: 'Manage labs, seats, approve PCs',
    admin: 'Yes',
    teacher: 'No',
    student: 'No',
  },
  runClass: {
    row: 'Start and end a class; use lab controls',
    admin: 'No',
    teacher: 'Own',
    student: 'No',
  },
  editLessons: {
    row: 'Create and edit lessons',
    admin: 'Yes',
    teacher: 'Yes (own drafts; shared once published)',
    student: 'No',
  },
  publishLessons: {
    row: 'Publish lessons; assign work',
    admin: 'Yes',
    teacher: 'Own classes',
    student: 'No',
  },
  seeLessons: { row: 'See lessons', admin: 'Yes', teacher: 'Yes', student: 'Assigned only' },
  submitWork: { row: 'Submit answers and recordings', admin: 'No', teacher: 'No', student: 'Own' },
  markWork: { row: 'Mark work, give feedback', admin: 'No', teacher: 'Own classes', student: 'No' },
  seeProgress: {
    row: 'See marks and progress',
    admin: 'All',
    teacher: 'Own classes',
    student: 'Own',
  },
  reports: { row: 'Reports and exports', admin: 'All', teacher: 'Own classes', student: 'No' },
  manageSettings: {
    row: 'Settings (including branding), backups, restore, audit log',
    admin: 'Yes',
    teacher: 'No',
    student: 'No',
  },
  seeBranding: {
    row: 'See the branding (software name, logo, main colour)',
    admin: 'Yes',
    teacher: 'Yes',
    student: 'Yes',
  },
} as const satisfies Record<string, PermissionRow>;

export type Action = keyof typeof PERMISSIONS;

/** all: everything the action covers; own: only their own classes or data; none: refused. */
export type Access = 'all' | 'own' | 'none';

/** How a cell of the table reads. "Yes (own drafts; …)" still lets every teacher create. */
export function accessOf(cell: string): Access {
  if (cell.startsWith('Yes') || cell === 'All') {
    return 'all';
  }
  if (cell.startsWith('Own') || cell.startsWith('Assigned')) {
    return 'own';
  }
  return 'none';
}

/**
 * Whether a role may do something. For a cell that allows only the role's own
 * classes, pass `ownClass` when the screen knows it; without it the answer is
 * whether the role may do it for some class at all.
 */
export function may(role: Role, action: Action, scope?: { ownClass: boolean }): boolean {
  const access = accessOf(PERMISSIONS[action][role]);
  if (access === 'own' && scope !== undefined) {
    return scope.ownClass;
  }
  return access !== 'none';
}
