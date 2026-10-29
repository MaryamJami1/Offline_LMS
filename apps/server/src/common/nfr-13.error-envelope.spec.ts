/**
 * The error envelope every endpoint shares, and the clock the auth code reads.
 * Covers NFR-13 (nothing from the request comes back in an error) and the
 * conventions in docs/docs/04-api-and-events.md.
 */
import { describe, it, expect, vi } from 'vitest';
import { HttpException, Logger, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { AppError } from './app-error.js';
import { Clock } from './clock.js';
import { ErrorFilter } from './error.filter.js';

interface Caught {
  status: number;
  body: unknown;
}

/** Runs the filter over one error and reports what the caller would receive. */
function answerFor(exception: unknown): Caught {
  const caught: Caught = { status: 0, body: undefined };
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({
        status: (code: number) => {
          caught.status = code;
          return {
            json: (body: unknown) => {
              caught.body = body;
              return undefined;
            },
          };
        },
      }),
      getRequest: () => ({ path: '/api/anything', headers: {} }),
    }),
  } as unknown as ArgumentsHost;

  new ErrorFilter().catch(exception, host);
  return caught;
}

describe('NFR-13 the error envelope', () => {
  it('sends an application error with its own code and details', () => {
    const answer = answerFor(
      new AppError(403, 'ACCOUNT_LOCKED', 'Too many wrong passwords', { unlocksAt: 'soon' }),
    );

    expect(answer.status).toBe(403);
    expect(answer.body).toEqual({
      error: {
        code: 'ACCOUNT_LOCKED',
        message: 'Too many wrong passwords',
        details: { unlocksAt: 'soon' },
      },
    });
  });

  it('gives a framework error a code of its own, so no answer is shapeless', () => {
    const answer = answerFor(new NotFoundException('No such thing'));

    expect(answer.status).toBe(404);
    expect(answer.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'No such thing', details: {} },
    });
  });

  it('falls back to a plain code for a status it has no name for', () => {
    const answer = answerFor(new HttpException('Slow down', 429));

    expect(answer.status).toBe(429);
    expect(answer.body).toEqual({ error: { code: 'ERROR', message: 'Slow down', details: {} } });
  });

  it('tells the caller nothing about an unexpected failure', () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const answer = answerFor(new Error('relation "users" does not exist'));

    expect(answer.status).toBe(500);
    expect(answer.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', details: {} },
    });
    expect(JSON.stringify(answer.body)).not.toContain('users');
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });

  it('survives something thrown that is not an error at all', () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const answer = answerFor('a string, thrown');

    expect(answer.status).toBe(500);
    expect(JSON.stringify(logged.mock.calls)).toContain('unknown');
    logged.mockRestore();
  });
});

describe('NFR-13 the clock', () => {
  it('reads the system time, which the tests replace with a fake one', () => {
    const before = Date.now();

    const read = new Clock().now();

    expect(read.getTime()).toBeGreaterThanOrEqual(before);
    expect(read.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
