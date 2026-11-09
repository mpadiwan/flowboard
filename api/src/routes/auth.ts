import { Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';
import { issueTokenPair } from '../lib/tokens';
import { LoginSchema, RegisterSchema } from '../schemas/auth';

// FR-A1 and FR-A2. Public routes; the rate limiter (day-06) and the login lockout
// (day-12) attach to this router later.

// Compared against when the email is unknown, so login takes the same bcrypt time
// whether or not the account exists (ARCH §8). Hashed once at startup, not on first use,
// so even the first unknown-email login isn't slower than a real one.
const dummyHash: Promise<string> = bcrypt.hash('flowboard-timing-equaliser', env.BCRYPT_COST);

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const input = RegisterSchema.parse(req.body);
    const hash = await bcrypt.hash(input.password, env.BCRYPT_COST);

    // A unique-email violation is caught here rather than pre-checked, so two concurrent
    // registrations can't both pass a lookup. The hash never leaves the database layer.
    const user = await prisma.user
      .create({
        data: { email: input.email, password: hash },
        select: { id: true, email: true, createdAt: true },
      })
      .catch((err: unknown) => {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new AppError('Email is already registered', 409, 'EMAIL_TAKEN');
        }
        throw err;
      });

    const tokens = issueTokenPair(user.id);
    res.status(201).json({ success: true, data: { user, ...tokens } });
  } catch (err) {
    next(err);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const input = LoginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, password: true },
    });

    // Unknown email and wrong password take the same path and get the same 401.
    const matches = await bcrypt.compare(input.password, user?.password ?? (await dummyHash));
    if (!user || !matches) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    res.json({ success: true, data: issueTokenPair(user.id) });
  } catch (err) {
    next(err);
  }
};

const router: Router = Router();

router.post('/register', register);
router.post('/login', login);

export default router;
