import type { Task } from '@prisma/client';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';
import { CreateTaskSchema, IdParamSchema, UpdateTaskSchema } from '../schemas/task';

// FR-T2 to FR-T5. Until week-01 these routes have no `authenticate` middleware and no
// ownership check (ADR-003); task events are published from day-08 (ADR-006).

// Becomes getOwnedTask (404 if missing, 403 if not the caller's) once auth lands.
async function findTaskOrThrow(id: string): Promise<Task> {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) {
    throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
  }
  return task;
}

export const getTask = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const task = await findTaskOrThrow(id);
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
    const input = CreateTaskSchema.parse(req.body);

    const board = await prisma.board.findUnique({ where: { id: input.boardId } });
    if (!board) {
      throw new AppError('Board not found', 404, 'BOARD_NOT_FOUND');
    }

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
    const { id } = IdParamSchema.parse(req.params);
    const input = UpdateTaskSchema.parse(req.body);
    await findTaskOrThrow(id);

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
    const { id } = IdParamSchema.parse(req.params);
    await findTaskOrThrow(id);
    await prisma.task.delete({ where: { id } });
    // day-08: publishTaskEvent('DELETED', task snapshot from before the delete)
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

const router: Router = Router();

router.get('/:id', getTask);
router.post('/', createTask);
router.patch('/:id', updateTask);
router.delete('/:id', deleteTask);

export default router;
