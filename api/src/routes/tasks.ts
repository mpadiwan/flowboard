import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma';
import { getOwnedBoard, getOwnedTask } from '../lib/ownership';
import { requireUserId } from '../lib/requestUser';
import { actingUser } from '../middleware/actingUser';
import { IdParamSchema } from '../schemas/common';
import { CreateTaskSchema, ListTasksQuerySchema, UpdateTaskSchema } from '../schemas/task';

// FR-T1 to FR-T5. Every route is scoped to the caller through the task's board (ADR-003);
// until week-01 the caller is the acting-user stub. Task events are published from
// day-08 (ADR-006).

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
    // day-08: publishTaskEvent('CREATED', task)
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
    // day-08: publishTaskEvent('UPDATED', task)
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
    await getOwnedTask(id, userId);
    await prisma.task.delete({ where: { id } });
    // day-08: publishTaskEvent('DELETED', task snapshot from before the delete)
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

const router: Router = Router();

// week-01: replace with authenticate.
router.use(actingUser);

router.get('/', listTasks);
router.get('/:id', getTask);
router.post('/', createTask);
router.patch('/:id', updateTask);
router.delete('/:id', deleteTask);

export default router;
