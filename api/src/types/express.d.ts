// req.user augmentation (ARCH §3, C4.2). Set by authenticate. Optional on purpose:
// handlers read it through requireUserId(), so a router mounted without its guard fails
// with 401 instead of reading undefined.

export interface AuthUser {
  id: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
