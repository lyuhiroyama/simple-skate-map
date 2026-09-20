import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { env } from './env.js';
import { requireAuth } from './middleware/auth.js';
import { groupsRouter } from './routes/groups.js';
import { spotsRouter } from './routes/spots.js';
import { supabaseAdmin } from './supabase.js';

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
    .update({ username })
    .eq('id', req.userId)
    .select('id, username, created_at')
    .single();
  if (error) throw error;
  res.json({ profile: { id: data.id, username: data.username, createdAt: data.created_at } });
});

// Central error handler: Express 5 forwards rejected async handlers here.
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  },
);

app.listen(env.port, () => {
  console.log(`Skate spots API listening on http://localhost:${env.port}`);
});
