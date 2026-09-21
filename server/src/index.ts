import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { env } from './env.js';
import { deleteUserAccount } from './lib/account.js';
import { HttpError } from './lib/httpError.js';
import { requireAuth } from './middleware/auth.js';
import { groupsRouter } from './routes/groups.js';
import { moderationRouter } from './routes/moderation.js';
import { spotsRouter } from './routes/spots.js';
import { supabaseAdmin } from './supabase.js';

function publicErrorMessage(err: unknown): string {
  let message = '';
  if (err instanceof Error && err.message) message = err.message;
  else if (err && typeof err === 'object' && 'message' in err) {
    const value = (err as { message?: unknown }).message;
    if (typeof value === 'string') message = value;
  }
  const trimmed = message.trim();
  if (!trimmed) return 'Internal server error';
  if (
    trimmed.length > 240 ||
    /<!DOCTYPE|<html|SSL handshake|cloudflare/i.test(trimmed)
  ) {
    return 'Could not reach the database. Try again in a moment.';
  }
  return trimmed;
}

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/groups', requireAuth, groupsRouter);
app.use('/spots', requireAuth, spotsRouter);

/** Current user's profile. */
app.get('/me', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, username, created_at')
    .eq('id', req.userId)
    .single();
  if (error) throw error;
  res.json({ profile: { id: data.id, username: data.username, createdAt: data.created_at } });
});

const usernameSchema = z
  .string()
  .trim()
  .min(2, 'Username must be 2–32 characters')
  .max(32, 'Username must be 2–32 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Use letters, numbers, and underscores only');

app.patch('/me', requireAuth, async (req, res) => {
  const parsed = usernameSchema.safeParse(req.body?.username);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid username' });
    return;
  }
  const username = parsed.data;

  const { data: current, error: currentError } = await supabaseAdmin
    .from('profiles')
    .select('id, username, created_at, username_changed_at')
    .eq('id', req.userId)
    .single();
  if (currentError) throw currentError;

  if (current.username === username) {
    res.json({
      profile: { id: current.id, username: current.username, createdAt: current.created_at },
    });
    return;
  }

  if (current.username_changed_at) {
    const elapsed = Date.now() - new Date(current.username_changed_at).getTime();
    if (elapsed < 24 * 60 * 60 * 1000) {
      res.status(429).json({ error: 'You can change your username once a day.' });
      return;
    }
  }

  const { data: taken, error: takenError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .neq('id', req.userId)
    .maybeSingle();
  if (takenError) throw takenError;
  if (taken) {
    res.status(409).json({ error: 'That username is taken' });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ username, username_changed_at: new Date().toISOString() })
    .eq('id', req.userId)
    .select('id, username, created_at')
    .single();
  if (error) throw error;
  res.json({ profile: { id: data.id, username: data.username, createdAt: data.created_at } });
});

app.delete('/me', requireAuth, async (req, res) => {
  await deleteUserAccount(req.userId);
  res.status(204).end();
});

app.use(requireAuth, moderationRouter);

// Central error handler: Express 5 forwards rejected async handlers here.
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    const status = err instanceof HttpError ? err.status : 500;
    const message = publicErrorMessage(err);
    res.status(status).json({ error: message });
  },
);

app.listen(env.port, () => {
  console.log(`Skate spots API listening on http://localhost:${env.port}`);
});
