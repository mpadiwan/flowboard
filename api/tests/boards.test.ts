import type { Board, User } from '@prisma/client';
import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { bearer, createBoard, createUser, rejectedAuthHeaders } from './helpers/factories';

// FR-B1 to FR-B4, AC-2.6, AC-2.7, AC-3.2, AC-3.5. `api` sends the caller's Bearer token
// on every request; the 401 cases use a bare request(app).

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

interface ErrorResponse {
  success: false;
  message: string;
  code: string;
  details?: { path: string; message: string }[];
}

interface BoardResponse {
  success: true;
  data: Board;
}

interface BoardListResponse {
  success: true;
  data: Board[];
}

type Agent = ReturnType<typeof request.agent>;

let me: User;
let api: Agent;
let other: User;

beforeEach(async () => {
  me = await createUser();
  api = request.agent(app).set('Authorization', bearer(me.id));
  other = await createUser();
});
describe('authentication (AC-2.6)', () => {
  it.each([
    ['GET', '/boards'],
    ['POST', '/boards'],
    ['GET', `/boards/${MISSING_ID}`],
    ['DELETE', `/boards/${MISSING_ID}`],
  ])('%s %s returns 401 UNAUTHORIZED without a token', async (method, url) => {
    const res = await request(app)[method.toLowerCase() as 'get' | 'post' | 'delete'](url);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
  });

  it('returns 401 for every rejected Authorization header', async () => {
    for (const [label, header] of rejectedAuthHeaders(me.id)) {
      const res = await request(app).get('/boards').set('Authorization', header);

      expect({ label, status: res.status }).toEqual({ label, status: 401 });
      expect((res.body as ErrorResponse).code).toBe('UNAUTHORIZED');
    }
  });

  it('does not create a board without a token', async () => {
    await request(app).post('/boards').send({ name: 'Sneaky' });

    expect(await prisma.board.count()).toBe(0);
  });
});

describe('GET /boards', () => {
  it("lists only the caller's boards, newest first", async () => {
    const older = await prisma.board.create({
      data: { name: 'Older', ownerId: me.id, createdAt: new Date('2026-01-01') },
    });
    const newer = await prisma.board.create({
      data: { name: 'Newer', ownerId: me.id, createdAt: new Date('2026-02-01') },
    });
    await createBoard(other.id, 'Not mine');

    const res = await api.get('/boards');

    expect(res.status).toBe(200);
    const body = res.body as BoardListResponse;
    expect(body.success).toBe(true);
    expect(body.data.map((board) => board.id)).toEqual([newer.id, older.id]);
  });

  it('returns an empty list when the caller has no boards', async () => {
    const res = await api.get('/boards');

    expect(res.status).toBe(200);
    expect((res.body as BoardListResponse).data).toEqual([]);
  });
});

describe('POST /boards', () => {
  it('creates a board owned by the caller', async () => {
    const res = await api.post('/boards').send({ name: '  Sprint 1  ' });

    expect(res.status).toBe(201);
    const body = res.body as BoardResponse;
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ name: 'Sprint 1', ownerId: me.id });
    expect(body.data).not.toHaveProperty('owner');
  });

  it('ignores a sent ownerId and strips unknown fields (AC-3.5)', async () => {
    const res = await api.post('/boards').send({ name: 'Mine', ownerId: other.id, isAdmin: true });

    expect(res.status).toBe(201);
    const { data } = res.body as BoardResponse;
    expect(data.ownerId).toBe(me.id);
    expect(data).not.toHaveProperty('isAdmin');
    const stored = await prisma.board.findUniqueOrThrow({ where: { id: data.id } });
    expect(stored.ownerId).toBe(me.id);
  });

  it('returns 422 with a descriptive message when name is missing (AC-3.3)', async () => {
    const res = await api.post('/boards').send({});

    expect(res.status).toBe(422);
    const body = res.body as ErrorResponse;
    expect(body).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(body.details).toEqual([{ path: 'name', message: 'Required' }]);
  });

  it.each([
    ['an empty name', ''],
    ['a whitespace-only name', '   '],
    ['a name over 100 characters', 'a'.repeat(101)],
  ])('returns 422 for %s', async (_label, name) => {
    const res = await api.post('/boards').send({ name });

    expect(res.status).toBe(422);
    expect((res.body as ErrorResponse).details?.[0]?.path).toBe('name');
  });

  it('accepts a name of exactly 100 characters', async () => {
    const res = await api.post('/boards').send({ name: 'a'.repeat(100) });

    expect(res.status).toBe(201);
  });
});

describe('GET /boards/:id', () => {
  it('returns the board', async () => {
    const board = await createBoard(me.id);

    const res = await api.get(`/boards/${board.id}`);

    expect(res.status).toBe(200);
    expect((res.body as BoardResponse).data).toMatchObject({ id: board.id, name: board.name });
  });

  it("returns 403 FORBIDDEN for someone else's board (AC-2.7)", async () => {
    const board = await createBoard(other.id);

    const res = await api.get(`/boards/${board.id}`);

    expect(res.status).toBe(403);
    expect((res.body as ErrorResponse).code).toBe('FORBIDDEN');
  });

  it('returns 404 BOARD_NOT_FOUND for a missing board', async () => {
    const res = await api.get(`/boards/${MISSING_ID}`);

    expect(res.status).toBe(404);
    expect((res.body as ErrorResponse).code).toBe('BOARD_NOT_FOUND');
  });

  it('returns 422 for a non-UUID id (AC-3.2)', async () => {
    const res = await api.get('/boards/not-a-uuid');

    expect(res.status).toBe(422);
    expect((res.body as ErrorResponse).details?.[0]?.path).toBe('id');
  });
});

describe('DELETE /boards/:id', () => {
  it('returns 204 with no body and deletes the board and its tasks (ADR-003)', async () => {
    const board = await createBoard(me.id);
    await prisma.task.createMany({
      data: [
        { title: 'One', boardId: board.id },
        { title: 'Two', boardId: board.id },
      ],
    });

    const res = await api.delete(`/boards/${board.id}`);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(await prisma.board.findUnique({ where: { id: board.id } })).toBeNull();
    expect(await prisma.task.count({ where: { boardId: board.id } })).toBe(0);
  });

  it("returns 403 FORBIDDEN for someone else's board and keeps it", async () => {
    const board = await createBoard(other.id);

    const res = await api.delete(`/boards/${board.id}`);

    expect(res.status).toBe(403);
    expect((res.body as ErrorResponse).code).toBe('FORBIDDEN');
    expect(await prisma.board.findUnique({ where: { id: board.id } })).not.toBeNull();
  });

  it('returns 404 BOARD_NOT_FOUND for a missing board', async () => {
    const res = await api.delete(`/boards/${MISSING_ID}`);

    expect(res.status).toBe(404);
    expect((res.body as ErrorResponse).code).toBe('BOARD_NOT_FOUND');
  });

  it('returns 422 for a non-UUID id', async () => {
    const res = await api.delete('/boards/123');

    expect(res.status).toBe(422);
  });
});
