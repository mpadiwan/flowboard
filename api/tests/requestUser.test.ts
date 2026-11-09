import type { Request } from 'express';
import { AppError } from '../src/errors/AppError';
import { requireUserId } from '../src/lib/requestUser';

// Called directly: every router mounts a guard, so the 401 branch can't be reached over HTTP.

describe('requireUserId', () => {
  it("returns the caller's id", () => {
    const req = { user: { id: 'user-1' } } as Request;

    expect(requireUserId(req)).toBe('user-1');
  });

  it('throws 401 UNAUTHORIZED when no guard set req.user', () => {
    let thrown: unknown;
    try {
      requireUserId({} as Request);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect(thrown).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
  });
});
