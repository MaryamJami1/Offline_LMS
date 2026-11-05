import type { z } from 'zod';
import { ApiError } from '../api/client.js';
import { problemOf } from './format.js';

/** Field name to message, plus anything that belongs to the form as a whole. */
export type FormProblems = Record<string, string | undefined> & { form?: string };

/**
 * Checks a request against its contract in packages/shared before it is sent,
 * so the form shows the same messages the server would.
 */
export function check<T>(
  schema: z.ZodType<T>,
  request: unknown,
): { ok: true; value: T } | { ok: false; problems: FormProblems } {
  const parsed = schema.safeParse(request);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }
  const problems: FormProblems = {};
  for (const issue of parsed.error.issues) {
    // A nested field is filed under its whole path (schedule.start) and under
    // its top field (schedule), so a form can show it either way.
    const path = issue.path.map(String);
    problems[path.join('.') || 'form'] ??= issue.message;
    problems[path[0] ?? 'form'] ??= issue.message;
  }
  return { ok: false, problems };
}

/** What a refused request means for the form: field messages where the server gave them. */
export function problemsOfError(
  error: unknown,
  fieldOfCode: Record<string, string> = {},
): FormProblems {
  if (error instanceof ApiError) {
    if (Object.keys(error.fields).length > 0) {
      return { ...error.fields };
    }
    const field = fieldOfCode[error.code];
    if (field !== undefined) {
      return { [field]: error.message };
    }
  }
  return { form: problemOf(error) };
}
