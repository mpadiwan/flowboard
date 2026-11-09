import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma';
import { getOwnedBoard } from '../lib/ownership';
import { requireUserId } from '../lib/requestUser';
import { authenticate } from '../middleware/authenticate';
import { CreateBoardSchema } from '../schemas/board';
import { IdParamSchema } from '../schemas/common';

// FR-B1 to FR-B4. Every route needs a Bearer token and is scoped to the caller (ADR-003).

export const listBoards = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const ownerId = requireUserId(req);
    const boards = await prisma.board.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: boards });
  } catch (err) {
    next(err);
  }
};

export const createBoard = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const ownerId = requireUserId(req);
    const input = CreateBoardSchema.parse(req.body);

    // Named fields only: req.body is never spread into Prisma (ADR-007, AC-3.4).
    const board = await prisma.board.create({
      data: { name: input.name, ownerId },
    });
    res.status(201).json({ success: true, data: board });
  } catch (err) {
    next(err);
  }
};

export const getBoard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = requireUserId(req);
    const { id } = IdParamSchema.parse(req.params);
    const board = await getOwnedBoard(id, userId);
    res.json({ success: true, data: board });
  } catch (err) {
    next(err);
  }
};

export const deleteBoard = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUserId(req);
    const { id } = IdParamSchema.parse(req.params);
    await getOwnedBoard(id, userId);
    // The board's tasks go with it (onDelete: Cascade). Not audited per task (OQ-7).
    await prisma.board.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

const router: Router = Router();

router.use(authenticate);

router.get('/', listBoards);
router.post('/', createBoard);
router.get('/:id', getBoard);
router.delete('/:id', deleteBoard);

export default router;
