import { Router, type NextFunction, type Request, type Response } from 'express';
import { publishTaskEvent } from '../lib/events';
import { prisma } from '../lib/prisma';
import { getOwnedBoard, getOwnedTask } from '../lib/ownership';
import { requireUserId } from '../lib/requestUser';
import { authenticate } from '../middleware/authenticate';
import { IdParamSchema } from '../schemas/common';
import { CreateTaskSchema, ListTasksQuerySchema, UpdateTaskSchema } from '../schemas/task';

// FR-T1 to FR-T5. Every route needs a Bearer token and is scoped to the caller through
// the task's board (ADR-003). Each mutation publishes a task event after the write;
// the worker writes the AuditLog row from it (ADR-006).

export const listTasks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = requireUserId(req);
    const { boardId } = ListTasksQuerySchema.parse(req.query);

    // A boardId filter must name one of the caller's boards: 404 if missing, 403 if not theirs.
    if (boardId) {
      await getOwnedBoard(boardId, userId);
    }
    const tasks = await prisma.task.findMany({
      where: boardId ? { boardId } : { board: { ownerId: userId } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: tasks });
  } catch (err) {
    next(err);
  }
};

export const getTask = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = requireUserId(req);
    const { id } = IdParamSchema.parse(req.params);
    const task = await getOwnedTask(id, userId);
    res.json({ success: true, data: task });
  } catch (err) {
    next(err);
  }
};

export const createTask = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUserId(req);
    const input = CreateTaskSchema.parse(req.body);
    await getOwnedBoard(input.boardId, userId);

    // Named fields only: req.body is never spread into Prisma (ADR-007, AC-3.4).
    const task = await prisma.task.create({
      data: {
        title: input.title,
        description: input.description,
        priority: input.priority,
        status: input.status,
        boardId: input.boardId,
      },
    });
    await publishTaskEvent({ action: 'CREATED', taskId: task.id, userId, payload: task });
    res.status(201).json({ success: true, data: task });
  } catch (err) {
    next(err);
  }
};

export const updateTask = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUserId(req);
    const { id } = IdParamSchema.parse(req.params);
    const input = UpdateTaskSchema.parse(req.body);
    await getOwnedTask(id, userId);

    // Prisma skips undefined fields; a null description clears it.
    const task = await prisma.task.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        priority: input.priority,
        status: input.status,
      },
    });
    await publishTaskEvent({ action: 'UPDATED', taskId: task.id, userId, payload: task });
    res.json({ success: true, data: task });
  } catch (err) {
    next(err);
  }
};

export const deleteTask = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUserId(req);
    const { id } = IdParamSchema.parse(req.params);
    // The ownership check's result doubles as the snapshot the DELETED event carries.
    const task = await getOwnedTask(id, userId);
    await prisma.task.delete({ where: { id } });
    await publishTaskEvent({ action: 'DELETED', taskId: id, userId, payload: task });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

const router: Router = Router();

router.use(authenticate);

router.get('/', listTasks);
router.get('/:id', getTask);
router.post('/', createTask);
router.patch('/:id', updateTask);
router.delete('/:id', deleteTask);

export default router;
