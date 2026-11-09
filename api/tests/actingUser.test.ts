import request from 'supertest';
import app from '../src/app';
import { env } from '../src/config/env';

// The day-04 acting-user stub's failure modes. Deleted with the stub in week-01.

interface ErrorResponse {
  success: false;
  message: string;
  code: string;
}

describe('actingUser stub', () => {
  it('returns 500 ACTING_USER_MISSING when the seed user does not exist', async () => {
    const res = await request(app).get('/boards');

    expect(res.status).toBe(500);
    expect((res.body as ErrorResponse).code).toBe('ACTING_USER_MISSING');
  });

  it('returns 500 ACTING_USER_DISABLED in production', async () => {
    const replaced = jest.replaceProperty(env, 'NODE_ENV', 'production');
    try {
      const res = await request(app).get('/tasks');

      expect(res.status).toBe(500);
      expect((res.body as ErrorResponse).code).toBe('ACTING_USER_DISABLED');
    } finally {
      replaced.restore();
    }
  });
});
