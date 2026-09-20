import cors from 'cors';
import express from 'express';
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
