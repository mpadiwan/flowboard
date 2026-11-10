import { Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';
import { consumeRefresh, invalidRefreshToken, issueTokenPair, verifyRefresh } from '../lib/tokens';
import { rateLimiter } from '../middleware/rateLimiter';
import { LoginSchema, RefreshTokenSchema, RegisterSchema } from '../schemas/auth';

// FR-A1 to FR-A4. Public routes. Register and login are rate limited per IP (NFR-5);
// the login lockout (day-12) attaches here later. The limiter runs before validation,
// so malformed attempts count too. Refresh and logout are not rate limited (ARCH §5)
// and fail closed with 503 when Redis is down (ADR-005).

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

    const tokens = await issueTokenPair(user.id);
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

    res.json({ success: true, data: await issueTokenPair(user.id) });
  } catch (err) {
    next(err);
  }
};

// ADR-004 §3: the old key is deleted before the new pair is stored. If DEL removed
// nothing, the token was already rotated or logged out, so this is a replay.
export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken } = RefreshTokenSchema.parse(req.body);
    const claims = verifyRefresh(refreshToken);
    if (!(await consumeRefresh(claims))) {
      throw invalidRefreshToken();
    }

    res.json({ success: true, data: await issueTokenPair(claims.sub) });
  } catch (err) {
    next(err);
  }
};

// ADR-004 §4: 204 even when the key is already gone, so logging out twice is safe.
export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken } = RefreshTokenSchema.parse(req.body);
    await consumeRefresh(verifyRefresh(refreshToken));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

const router: Router = Router();

router.post('/register', rateLimiter, register);
router.post('/login', rateLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', logout);

export default router;
