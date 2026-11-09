import type { Board, Task } from '@prisma/client';
import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { createBoard } from './helpers/factories';

// FR-T2 to FR-T5 and AC-3.1 to AC-3.5. Auth (401) and ownership (403) cases join with week-01.

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

async function createTask(boardId: string, title = 'Write tests'): Promise<Task> {
  return prisma.task.create({ data: { title, boardId } });
}

let board: Board;

beforeEach(async () => {
  board = await createBoard();
});

describe('POST /tasks', () => {
  it('creates a task with default priority and status', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: '  Ship day-02  ', boardId: board.id });

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
  });

  it('accepts optional description, priority and status', async () => {
    const res = await request(app).post('/tasks').send({
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
    const res = await request(app)
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
    const res = await request(app).post('/tasks').send({ boardId: board.id });

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
    const res = await request(app)
      .post('/tasks')
      .send({ ...fields, boardId: board.id });

    expect(res.status).toBe(422);
    expect((res.body as ErrorResponse).code).toBe('VALIDATION_ERROR');
  });

  it('returns 422 when boardId is not a UUID', async () => {
    const res = await request(app).post('/tasks').send({ title: 'ok', boardId: 'some-uuid' });

    expect(res.status).toBe(422);
    expect((res.body as ErrorResponse).details?.[0]?.path).toBe('boardId');
  });

  it('returns 404 BOARD_NOT_FOUND when the board does not exist', async () => {
    const res = await request(app).post('/tasks').send({ title: 'ok', boardId: MISSING_ID });

    expect(res.status).toBe(404);
    expect((res.body as ErrorResponse).code).toBe('BOARD_NOT_FOUND');
  });

  it('returns 400 INVALID_JSON for a malformed body', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Content-Type', 'application/json')
      .send('{"title": ');

    expect(res.status).toBe(400);
    expect((res.body as ErrorResponse).code).toBe('INVALID_JSON');
  });
});

describe('GET /tasks/:id', () => {
  it('returns the task', async () => {
    const task = await createTask(board.id);

    const res = await request(app).get(`/tasks/${task.id}`);

    expect(res.status).toBe(200);
    expect((res.body as TaskResponse).data).toMatchObject({ id: task.id, title: task.title });
  });

  it('returns 404 TASK_NOT_FOUND for a missing task', async () => {
    const res = await request(app).get(`/tasks/${MISSING_ID}`);

    expect(res.status).toBe(404);
    expect((res.body as ErrorResponse).code).toBe('TASK_NOT_FOUND');
  });

  it('returns 422 for a non-UUID id (AC-3.2)', async () => {
    const res = await request(app).get('/tasks/not-a-uuid');

    expect(res.status).toBe(422);
    expect((res.body as ErrorResponse).details?.[0]?.path).toBe('id');
  });
});

describe('PATCH /tasks/:id', () => {
  it('updates title and status (OQ-1)', async () => {
    const task = await createTask(board.id);

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .send({ title: 'Renamed', status: 'DONE' });

    expect(res.status).toBe(200);
    expect((res.body as TaskResponse).data).toMatchObject({
      title: 'Renamed',
      status: 'DONE',
      priority: 'MEDIUM',
    });
  });

  it('clears the description when it is null', async () => {
    const task = await prisma.task.create({
      data: { title: 'Has notes', description: 'old', boardId: board.id },
    });

    const res = await request(app).patch(`/tasks/${task.id}`).send({ description: null });

    expect(res.status).toBe(200);
    expect((res.body as TaskResponse).data.description).toBeNull();
  });

  it('ignores boardId: a task cannot move boards', async () => {
    const task = await createTask(board.id);
    const other = await createBoard('Other');

    const res = await request(app)
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

    const res = await request(app).patch(`/tasks/${task.id}`).send(body);

    expect(res.status).toBe(422);
    expect((res.body as ErrorResponse).message).toContain('At least one field must be provided');
  });

  it('returns 404 TASK_NOT_FOUND for a missing task', async () => {
    const res = await request(app).patch(`/tasks/${MISSING_ID}`).send({ title: 'x' });

    expect(res.status).toBe(404);
    expect((res.body as ErrorResponse).code).toBe('TASK_NOT_FOUND');
  });

  it('returns 422 for a non-UUID id', async () => {
    const res = await request(app).patch('/tasks/123').send({ title: 'x' });

    expect(res.status).toBe(422);
  });
});

describe('DELETE /tasks/:id', () => {
  it('returns 204 with no body and removes the task', async () => {
    const task = await createTask(board.id);

    const res = await request(app).delete(`/tasks/${task.id}`);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    const after = await request(app).get(`/tasks/${task.id}`);
    expect(after.status).toBe(404);
  });

  it('returns 404 TASK_NOT_FOUND for a missing task', async () => {
    const res = await request(app).delete(`/tasks/${MISSING_ID}`);

    expect(res.status).toBe(404);
    expect((res.body as ErrorResponse).code).toBe('TASK_NOT_FOUND');
  });

  it('returns 422 for a non-UUID id', async () => {
    const res = await request(app).delete('/tasks/not-a-uuid');

    expect(res.status).toBe(422);
  });
});

describe('unknown routes', () => {
  it('returns 404 ROUTE_NOT_FOUND', async () => {
    const res = await request(app).get('/nope');

    expect(res.status).toBe(404);
    expect((res.body as ErrorResponse).code).toBe('ROUTE_NOT_FOUND');
  });
});
