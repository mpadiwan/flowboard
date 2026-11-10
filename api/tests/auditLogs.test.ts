import type { AuditLog, User } from '@prisma/client';
import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { bearer, createUser, rejectedAuthHeaders } from './helpers/factories';

// FR-L1, OQ-4. The worker writes these rows in the dev stack; the test stack has no
// worker (ADR-008), so they are inserted directly.

const TASK_ID = '00000000-0000-4000-8000-000000000001';

interface ErrorResponse {
  success: false;
  message: string;
  code: string;
  details?: { path: string; message: string }[];
}

interface AuditLogListResponse {
  success: true;
  data: AuditLog[];
}

type Agent = ReturnType<typeof request.agent>;

let me: User;
let api: Agent;

beforeEach(async () => {
  me = await createUser();
  api = request.agent(app).set('Authorization', bearer(me.id));
});

async function createAuditLog(
  userId: string,
  createdAt: Date,
  action = 'UPDATED',
): Promise<AuditLog> {
  return prisma.auditLog.create({
    data: { userId, action, entity: 'Task', entityId: TASK_ID, createdAt },
  });
}

// `count` rows for the user, one minute apart, oldest first.
async function createAuditLogs(userId: string, count: number): Promise<AuditLog[]> {
  const rows: AuditLog[] = [];
  for (let i = 0; i < count; i += 1) {
    rows.push(await createAuditLog(userId, new Date(Date.UTC(2026, 0, 1, 0, i))));
  }
  return rows;
}

describe('GET /audit-logs', () => {
  it('returns 401 UNAUTHORIZED without a token', async () => {
    const res = await request(app).get('/audit-logs');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
  });

  it('returns 401 for every rejected Authorization header', async () => {
    for (const [label, header] of rejectedAuthHeaders(me.id)) {
      const res = await request(app).get('/audit-logs').set('Authorization', header);

      expect({ label, status: res.status }).toEqual({ label, status: 401 });
    }
  });

  it("returns only the caller's rows, newest first", async () => {
    const older = await createAuditLog(me.id, new Date('2026-01-01'), 'CREATED');
    const newer = await createAuditLog(me.id, new Date('2026-02-01'), 'DELETED');
    await createAuditLog((await createUser()).id, new Date('2026-03-01'));

    const res = await api.get('/audit-logs');

    expect(res.status).toBe(200);
    const body = res.body as AuditLogListResponse;
    expect(body.success).toBe(true);
    expect(body.data.map((row) => row.id)).toEqual([newer.id, older.id]);
    expect(body.data[0]).toMatchObject({
      userId: me.id,
      action: 'DELETED',
      entity: 'Task',
      entityId: TASK_ID,
    });
  });

  it('returns an empty list when the caller has no rows', async () => {
    const res = await api.get('/audit-logs');

    expect(res.status).toBe(200);
    expect((res.body as AuditLogListResponse).data).toEqual([]);
  });

  it('returns at most 50 rows by default', async () => {
    const rows = await createAuditLogs(me.id, 51);

    const res = await api.get('/audit-logs');

    expect(res.status).toBe(200);
    const { data } = res.body as AuditLogListResponse;
    expect(data).toHaveLength(50);
    // The oldest row is the one left out.
    expect(data.map((row) => row.id)).not.toContain(rows[0]?.id);
  });

  it('honours ?limit', async () => {
    const rows = await createAuditLogs(me.id, 3);

    const res = await api.get('/audit-logs').query({ limit: '2' });

    expect(res.status).toBe(200);
    expect((res.body as AuditLogListResponse).data.map((row) => row.id)).toEqual([
      rows[2]?.id,
      rows[1]?.id,
    ]);
  });

  it.each([['0'], ['101'], ['abc'], ['1.5']])('returns 422 for limit=%s', async (limit) => {
    const res = await api.get('/audit-logs').query({ limit });

    expect(res.status).toBe(422);
    const body = res.body as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details?.[0]?.path).toBe('limit');
  });
});
