import { Router, type NextFunction, type Request, type Response } from 'express';
import { recordTaskAudit } from '../lib/audit';
import { prisma } from '../lib/prisma';
import { getOwnedBoard, getOwnedTask } from '../lib/ownership';
import { requireUserId } from '../lib/requestUser';
import { authenticate } from '../middleware/authenticate';
import { IdParamSchema } from '../schemas/common';
import { CreateTaskSchema, ListTasksQuerySchema, UpdateTaskSchema } from '../schemas/task';

// FR-T1 to FR-T5. Every route needs a Bearer token and is scoped to the caller through
// the task's board (ADR-003). Each mutation writes its AuditLog row in the same
// transaction; day-08 swaps that for a task event (ADR-006).

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
    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          title: input.title,
          description: input.description,
          priority: input.priority,
          status: input.status,
          boardId: input.boardId,
        },
      });
      // day-08: replaced by publishTaskEvent('CREATED', task) after the write.
      await recordTaskAudit(tx, 'CREATED', created.id, userId);
      return created;
    });
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
    const task = await prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description,
          priority: input.priority,
          status: input.status,
        },
      });
      // day-08: replaced by publishTaskEvent('UPDATED', task) after the write.
      await recordTaskAudit(tx, 'UPDATED', updated.id, userId);
      return updated;
    });
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
    await prisma.$transaction(async (tx) => {
      await tx.task.delete({ where: { id } });
      // day-08: replaced by publishTaskEvent('DELETED', task snapshot from before the delete).
      await recordTaskAudit(tx, 'DELETED', id, userId);
    });
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
