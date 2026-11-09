import type { Board, Task, User } from '@prisma/client';
import request from 'supertest';
import app from '../src/app';
import * as audit from '../src/lib/audit';
import { prisma } from '../src/lib/prisma';
import { bearer, createBoard, createUser, rejectedAuthHeaders } from './helpers/factories';

// FR-T1 to FR-T5, AC-2.6, AC-2.7, AC-3.1 to AC-3.5 and AC-6.3. `api` sends the caller's
// Bearer token on every request; the 401 cases use a bare request(app).

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

interface ErrorResponse {
  success: false;
  message: string;
  code: string;
  details?: { path: string; message: string }[];
}

interface TaskResponse {
  success: true;
  data: Task;
}

interface TaskListResponse {
  success: true;
  data: Task[];
}

async function createTask(boardId: string, title = 'Write tests'): Promise<Task> {
  return prisma.task.create({ data: { title, boardId } });
}

// AC-6.3: the AuditLog rows written so far, as the fields the brief specifies.
async function auditRows(): Promise<
  { userId: string; action: string; entity: string; entityId: string }[]
> {
  return prisma.auditLog.findMany({
    select: { userId: true, action: true, entity: true, entityId: true },
    orderBy: { createdAt: 'asc' },
  });
}

type Agent = ReturnType<typeof request.agent>;

let me: User;
let api: Agent;
let board: Board;
// A board and task owned by someone else, for the 403 cases (AC-2.7).
let otherBoard: Board;

beforeEach(async () => {
  me = await createUser();
  api = request.agent(app).set('Authorization', bearer(me.id));
  board = await createBoard(me.id);
  otherBoard = await createBoard((await createUser()).id, 'Not mine');
});
describe('authentication (AC-2.6)', () => {
  it.each([
    ['GET', '/tasks'],
    ['POST', '/tasks'],
    ['GET', `/tasks/${MISSING_ID}`],
    ['PATCH', `/tasks/${MISSING_ID}`],
    ['DELETE', `/tasks/${MISSING_ID}`],
  ])('%s %s returns 401 UNAUTHORIZED without a token', async (method, url) => {
    const res =
      await request(app)[method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete'](url);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
  });

  it('returns 401 for every rejected Authorization header', async () => {
    for (const [label, header] of rejectedAuthHeaders(me.id)) {
      const res = await request(app).get('/tasks').set('Authorization', header);

      expect({ label, status: res.status }).toEqual({ label, status: 401 });
      expect((res.body as ErrorResponse).code).toBe('UNAUTHORIZED');
    }
  });

  it('does not change a task or write an audit row without a token', async () => {
    const task = await createTask(board.id, 'Original');

    await request(app).patch(`/tasks/${task.id}`).send({ title: 'Hijacked' });

    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.title).toBe('Original');
    expect(await prisma.auditLog.count()).toBe(0);
  });
});

describe('GET /tasks', () => {
  it("lists tasks on all of the caller's boards, newest first", async () => {
    const second = await createBoard(me.id, 'Second');
    const older = await prisma.task.create({
      data: { title: 'Older', boardId: board.id, createdAt: new Date('2026-01-01') },
    });
    const newer = await prisma.task.create({
      data: { title: 'Newer', boardId: second.id, createdAt: new Date('2026-02-01') },
    });
    await createTask(otherBoard.id, 'Someone else');

    const res = await api.get('/tasks');

    expect(res.status).toBe(200);
    const body = res.body as TaskListResponse;
    expect(body.success).toBe(true);
    expect(body.data.map((task) => task.id)).toEqual([newer.id, older.id]);
  });

  it('filters by boardId', async () => {
    const second = await createBoard(me.id, 'Second');
    const onBoard = await createTask(board.id, 'On board');
    await createTask(second.id, 'Elsewhere');

    const res = await api.get('/tasks').query({ boardId: board.id });

    expect(res.status).toBe(200);
    expect((res.body as TaskListResponse).data.map((task) => task.id)).toEqual([onBoard.id]);
  });

  it('returns an empty list when the caller has no tasks', async () => {
    const res = await api.get('/tasks');

    expect(res.status).toBe(200);
    expect((res.body as TaskListResponse).data).toEqual([]);
  });

  it("returns 403 FORBIDDEN for someone else's boardId", async () => {
    const res = await api.get('/tasks').query({ boardId: otherBoard.id });

    expect(res.status).toBe(403);
    expect((res.body as ErrorResponse).code).toBe('FORBIDDEN');
  });

  it('returns 404 BOARD_NOT_FOUND for a missing boardId', async () => {
    const res = await api.get('/tasks').query({ boardId: MISSING_ID });

    expect(res.status).toBe(404);
    expect((res.body as ErrorResponse).code).toBe('BOARD_NOT_FOUND');
  });

  it('returns 422 when boardId is not a UUID', async () => {
    const res = await api.get('/tasks').query({ boardId: 'abc' });

    expect(res.status).toBe(422);
    expect((res.body as ErrorResponse).details?.[0]?.path).toBe('boardId');
  });
});

describe('POST /tasks', () => {
  it('creates a task with default priority and status', async () => {
    const res = await api.post('/tasks').send({ title: '  Ship day-02  ', boardId: board.id });

    expect(res.status).toBe(201);
    const body = res.body as TaskResponse;
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      title: 'Ship day-02',
      description: null,
      priority: 'MEDIUM',
      status: 'TODO',
      boardId: board.id,
    });
    expect(await auditRows()).toEqual([
      { userId: me.id, action: 'CREATED', entity: 'Task', entityId: body.data.id },
    ]);
  });

  it('rolls back the task when its audit row cannot be written', async () => {
    const spy = jest
      .spyOn(audit, 'recordTaskAudit')
      .mockRejectedValueOnce(new Error('audit insert failed'));
    try {
      const res = await api.post('/tasks').send({ title: 'Unaudited', boardId: board.id });

      expect(res.status).toBe(500);
      expect(await prisma.task.count()).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('accepts optional description, priority and status', async () => {
    const res = await api.post('/tasks').send({
      title: 'Review',
      description: 'Check the schema',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      boardId: board.id,
    });

    expect(res.status).toBe(201);
    expect((res.body as TaskResponse).data).toMatchObject({
      description: 'Check the schema',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
    });
  });

  it('strips unknown fields such as isAdmin and id (AC-3.5)', async () => {
    const res = await api
      .post('/tasks')
      .send({ title: 'Mass assignment', boardId: board.id, isAdmin: true, id: 'x' });

    expect(res.status).toBe(201);
    const { data } = res.body as TaskResponse;
    expect(data).not.toHaveProperty('isAdmin');
    expect(data.id).not.toBe('x');
    const stored = await prisma.task.findUniqueOrThrow({ where: { id: data.id } });
    expect(stored).not.toHaveProperty('isAdmin');
  });

  it('returns 422 with a descriptive message when title is missing (AC-3.3)', async () => {
    const res = await api.post('/tasks').send({ boardId: board.id });

    expect(res.status).toBe(422);
    const body = res.body as ErrorResponse;
    expect(body).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(body.message).toContain('title');
    expect(body.details).toEqual([{ path: 'title', message: 'Required' }]);
  });

  it.each([
    ['a whitespace-only title', { title: '   ' }],
    ['a title over 255 characters', { title: 'a'.repeat(256) }],
    ['a description over 5000 characters', { title: 'ok', description: 'a'.repeat(5001) }],
    ['an unknown priority', { title: 'ok', priority: 'URGENT' }],
    ['an unknown status', { title: 'ok', status: 'BLOCKED' }],
  ])('returns 422 for %s', async (_label, fields) => {
    const res = await api.post('/tasks').send({ ...fields, boardId: board.id });

    expect(res.status).toBe(422);
    expect((res.body as ErrorResponse).code).toBe('VALIDATION_ERROR');
  });

  it('returns 422 when boardId is not a UUID', async () => {
    const res = await api.post('/tasks').send({ title: 'ok', boardId: 'some-uuid' });

    expect(res.status).toBe(422);
    expect((res.body as ErrorResponse).details?.[0]?.path).toBe('boardId');
  });

  it('returns 404 BOARD_NOT_FOUND when the board does not exist', async () => {
    const res = await api.post('/tasks').send({ title: 'ok', boardId: MISSING_ID });

    expect(res.status).toBe(404);
    expect((res.body as ErrorResponse).code).toBe('BOARD_NOT_FOUND');
  });

  it("returns 403 FORBIDDEN on someone else's board and creates nothing", async () => {
    const res = await api.post('/tasks').send({ title: 'ok', boardId: otherBoard.id });

    expect(res.status).toBe(403);
    expect((res.body as ErrorResponse).code).toBe('FORBIDDEN');
    expect(await prisma.task.count({ where: { boardId: otherBoard.id } })).toBe(0);
    expect(await auditRows()).toEqual([]);
  });

  it('returns 400 INVALID_JSON for a malformed body', async () => {
    const res = await api.post('/tasks').set('Content-Type', 'application/json').send('{"title": ');

    expect(res.status).toBe(400);
    expect((res.body as ErrorResponse).code).toBe('INVALID_JSON');
  });
});

describe('GET /tasks/:id', () => {
  it('returns the task', async () => {
    const task = await createTask(board.id);

    const res = await api.get(`/tasks/${task.id}`);

    expect(res.status).toBe(200);
    expect((res.body as TaskResponse).data).toMatchObject({ id: task.id, title: task.title });
  });

  it('returns 404 TASK_NOT_FOUND for a missing task', async () => {
    const res = await api.get(`/tasks/${MISSING_ID}`);

    expect(res.status).toBe(404);
    expect((res.body as ErrorResponse).code).toBe('TASK_NOT_FOUND');
  });

  it("returns 403 FORBIDDEN for someone else's task (AC-2.7)", async () => {
    const task = await createTask(otherBoard.id);

    const res = await api.get(`/tasks/${task.id}`);

    expect(res.status).toBe(403);
    expect((res.body as ErrorResponse).code).toBe('FORBIDDEN');
  });

  it('returns 422 for a non-UUID id (AC-3.2)', async () => {
    const res = await api.get('/tasks/not-a-uuid');

    expect(res.status).toBe(422);
    expect((res.body as ErrorResponse).details?.[0]?.path).toBe('id');
  });
});

describe('PATCH /tasks/:id', () => {
  it('updates title and status (OQ-1)', async () => {
    const task = await createTask(board.id);

    const res = await api.patch(`/tasks/${task.id}`).send({ title: 'Renamed', status: 'DONE' });

    expect(res.status).toBe(200);
    expect((res.body as TaskResponse).data).toMatchObject({
      title: 'Renamed',
      status: 'DONE',
      priority: 'MEDIUM',
    });
    expect(await auditRows()).toEqual([
      { userId: me.id, action: 'UPDATED', entity: 'Task', entityId: task.id },
    ]);
  });

  it('clears the description when it is null', async () => {
    const task = await prisma.task.create({
      data: { title: 'Has notes', description: 'old', boardId: board.id },
    });

    const res = await api.patch(`/tasks/${task.id}`).send({ description: null });

    expect(res.status).toBe(200);
    expect((res.body as TaskResponse).data.description).toBeNull();
  });

  it('ignores boardId: a task cannot move boards', async () => {
    const task = await createTask(board.id);
    const other = await createBoard(me.id, 'Other');

    const res = await api
      .patch(`/tasks/${task.id}`)
      .send({ title: 'Still here', boardId: other.id });

    expect(res.status).toBe(200);
    expect((res.body as TaskResponse).data.boardId).toBe(board.id);
  });

  it.each([
    ['an empty body', {}],
    ['only unknown fields', { isAdmin: true }],
    ['only boardId', { boardId: MISSING_ID }],
  ])('returns 422 for %s', async (_label, body) => {
    const task = await createTask(board.id);

    const res = await api.patch(`/tasks/${task.id}`).send(body);

    expect(res.status).toBe(422);
    expect((res.body as ErrorResponse).message).toContain('At least one field must be provided');
    expect(await auditRows()).toEqual([]);
  });

  it('returns 404 TASK_NOT_FOUND for a missing task', async () => {
    const res = await api.patch(`/tasks/${MISSING_ID}`).send({ title: 'x' });

    expect(res.status).toBe(404);
    expect((res.body as ErrorResponse).code).toBe('TASK_NOT_FOUND');
  });

  it("returns 403 FORBIDDEN for someone else's task and leaves it unchanged", async () => {
    const task = await createTask(otherBoard.id, 'Original');

    const res = await api.patch(`/tasks/${task.id}`).send({ title: 'Hijacked' });

    expect(res.status).toBe(403);
    expect((res.body as ErrorResponse).code).toBe('FORBIDDEN');
    const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.title).toBe('Original');
    expect(await auditRows()).toEqual([]);
  });

  it('returns 422 for a non-UUID id', async () => {
    const res = await api.patch('/tasks/123').send({ title: 'x' });

    expect(res.status).toBe(422);
  });
});

describe('DELETE /tasks/:id', () => {
  it('returns 204 with no body and removes the task', async () => {
    const task = await createTask(board.id);

    const res = await api.delete(`/tasks/${task.id}`);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    const after = await api.get(`/tasks/${task.id}`);
    expect(after.status).toBe(404);
    // The row outlives the task: entityId has no foreign key (ARCH §4).
    expect(await auditRows()).toEqual([
      { userId: me.id, action: 'DELETED', entity: 'Task', entityId: task.id },
    ]);
  });

  it('returns 404 TASK_NOT_FOUND for a missing task', async () => {
    const res = await api.delete(`/tasks/${MISSING_ID}`);

    expect(res.status).toBe(404);
    expect((res.body as ErrorResponse).code).toBe('TASK_NOT_FOUND');
  });

  it("returns 403 FORBIDDEN for someone else's task and keeps it", async () => {
    const task = await createTask(otherBoard.id);

    const res = await api.delete(`/tasks/${task.id}`);

    expect(res.status).toBe(403);
    expect((res.body as ErrorResponse).code).toBe('FORBIDDEN');
    expect(await prisma.task.findUnique({ where: { id: task.id } })).not.toBeNull();
    expect(await auditRows()).toEqual([]);
  });

  it('returns 422 for a non-UUID id', async () => {
    const res = await api.delete('/tasks/not-a-uuid');

    expect(res.status).toBe(422);
  });
});

describe('unknown routes', () => {
  it('returns 404 ROUTE_NOT_FOUND', async () => {
    const res = await api.get('/nope');

    expect(res.status).toBe(404);
    expect((res.body as ErrorResponse).code).toBe('ROUTE_NOT_FOUND');
  });
});
