import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from './utils';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);
  const payload = verifyAccessToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = payload;
  next();
}

export function requireMarketplaceAuth(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'marketplace_player') {
    return res.status(403).json({ error: 'Marketplace account required' });
  }

  next();
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // DELIBERATELY excludes 'captain' — this is the default guard, so any
  // endpoint not explicitly re-tagged with requireCaptain stays closed to
  // captains (default-deny). Do not add 'captain' here.
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

// Gate C2 (2026-07-10): the session-running guard. Captains run live
// sessions — courts, queue, score entry, check-ins, session setup/edit —
// but get NOTHING else (no merge, refunds, referrals admin, marketplace
// admin, player delete, venue writes, imports). Apply this ONLY to
// endpoints a Court Captain needs on session night; everything else keeps
// requireAdmin and therefore rejects captains by default.
export function requireCaptain(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'captain' && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Captain access required' });
  }

  next();
}

export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  next();
}
