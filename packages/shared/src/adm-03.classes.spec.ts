import { describe, it, expect } from 'vitest';
import {
  classCodeSchema,
  createBatchRequestSchema,
  createClassRequestSchema,
  createCourseRequestSchema,
  createGroupRequestSchema,
  scheduleSchema,
  setStudentsRequestSchema,
  updateBatchRequestSchema,
  updateClassRequestSchema,
  updateCourseRequestSchema,
} from './classes.js';

/**
 * ADM-03: the shapes the admin panel and the teacher console send when they
 * set up courses, batches, classes, enrolments and groups
 * (docs/docs/04-api-and-events.md, Classes and groups).
 */

const ID = '0190f5a0-0000-7000-8000-000000000001';
const OTHER_ID = '0190f5a0-0000-7000-8000-000000000002';

describe('ADM-03 courses and batches', () => {
  it('takes a course name, trimmed, and an optional description', () => {
    expect(createCourseRequestSchema.parse({ name: '  Spoken   English ' })).toEqual({
      name: 'Spoken English',
    });
    expect(createCourseRequestSchema.safeParse({ name: ' ' }).success).toBe(false);
  });

  it('changes a course only when something is given, and can clear the description', () => {
    expect(updateCourseRequestSchema.safeParse({}).success).toBe(false);
    expect(updateCourseRequestSchema.parse({ description: null })).toEqual({ description: null });
  });

  it('takes a batch with dates written as days', () => {
    expect(
      createBatchRequestSchema.parse({
        courseId: ID,
        name: 'Fall 2026',
        startsOn: '2026-09-01',
        endsOn: '2026-12-20',
      }),
    ).toEqual({ courseId: ID, name: 'Fall 2026', startsOn: '2026-09-01', endsOn: '2026-12-20' });
    expect(
      createBatchRequestSchema.safeParse({ courseId: ID, name: 'Fall', startsOn: '01/09/2026' })
        .success,
    ).toBe(false);
  });

  it('never moves a batch to another course', () => {
    expect(updateBatchRequestSchema.safeParse({ courseId: ID }).success).toBe(false);
    expect(updateBatchRequestSchema.parse({ endsOn: null })).toEqual({ endsOn: null });
  });
});

describe('ADM-03 classes', () => {
  it('writes class codes in capitals, as timetables do', () => {
    expect(classCodeSchema.parse(' b-12 ')).toBe('B-12');
    expect(classCodeSchema.safeParse('B 12').success).toBe(false);
  });

  it('takes a schedule of days, a start time and a length', () => {
    expect(scheduleSchema.parse({ days: ['mon', 'thu'], start: '10:00', minutes: 90 })).toEqual({
      days: ['mon', 'thu'],
      start: '10:00',
      minutes: 90,
    });
  });

  it('refuses a schedule with no days, a repeated day, a time that is not one, or no length', () => {
    for (const schedule of [
      { days: [], start: '10:00', minutes: 90 },
      { days: ['mon', 'mon'], start: '10:00', minutes: 90 },
      { days: ['mon'], start: '24:00', minutes: 90 },
      { days: ['mon'], start: '9:00', minutes: 90 },
      { days: ['mon'], start: '10:00', minutes: 0 },
    ]) {
      expect(scheduleSchema.safeParse(schedule).success, JSON.stringify(schedule)).toBe(false);
    }
  });

  it('takes a new class with an optional schedule and teachers', () => {
    expect(
      createClassRequestSchema.parse({
        code: 'b-12',
        name: 'Morning B',
        batchId: ID,
        labRoomId: OTHER_ID,
      }),
    ).toEqual({ code: 'B-12', name: 'Morning B', batchId: ID, labRoomId: OTHER_ID });
  });

  it('changes a class only when something is given, and can clear its schedule', () => {
    expect(updateClassRequestSchema.safeParse({}).success).toBe(false);
    expect(updateClassRequestSchema.parse({ schedule: null })).toEqual({ schedule: null });
  });

  it('refuses a student listed twice', () => {
    expect(setStudentsRequestSchema.safeParse({ studentIds: [ID, ID] }).success).toBe(false);
    expect(setStudentsRequestSchema.parse({ studentIds: [] })).toEqual({ studentIds: [] });
  });
});

describe('ADM-03 groups', () => {
  it('takes the three kinds', () => {
    expect(createGroupRequestSchema.parse({ kind: 'pair' })).toEqual({ kind: 'pair' });
    expect(createGroupRequestSchema.parse({ kind: 'random', size: 4 })).toEqual({
      kind: 'random',
      size: 4,
    });
    expect(
      createGroupRequestSchema.parse({ kind: 'manual', name: ' Team A ', studentIds: [ID] }),
    ).toEqual({ kind: 'manual', name: 'Team A', studentIds: [ID] });
  });

  it('refuses random groups of fewer than two, and a manual group with nobody in it', () => {
    expect(createGroupRequestSchema.safeParse({ kind: 'random', size: 1 }).success).toBe(false);
    expect(
      createGroupRequestSchema.safeParse({ kind: 'manual', name: 'Team A', studentIds: [] })
        .success,
    ).toBe(false);
  });
});
