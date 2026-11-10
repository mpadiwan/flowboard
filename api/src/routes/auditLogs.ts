import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireUserId } from '../lib/requestUser';
import { authenticate } from '../middleware/authenticate';
import { AuditLogQuerySchema } from '../schemas/auditLog';

// FR-L1, OQ-4: "owner only" means the caller's own rows (userId = the actor). The rows
// are written by the worker from tasks:events (ADR-006), so a change shows up here shortly
// after its response, not in the same request.

export const listAuditLogs = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUserId(req);
    const { limit } = AuditLogQuerySchema.parse(req.query);
    const rows = await prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

const router: Router = Router();

router.use(authenticate);

router.get('/', listAuditLogs);

export default router;
