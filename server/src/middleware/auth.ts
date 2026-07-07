import type { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../supabase.js';

declare module 'express-serve-static-core' {
  interface Request {
    userId: string;
  }
}

/**
 * Verifies the Supabase access token sent as `Authorization: Bearer <jwt>`
 * and attaches the user id to the request.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  const token = header.slice('Bearer '.length);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.userId = data.user.id;
  next();
}
