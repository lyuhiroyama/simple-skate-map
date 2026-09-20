# AGENTS.md

Conventions for AI coding agents in this repo.

## Stack

- Expo (managed) + React Native + TypeScript in `mobile/`
- Express API in `server/`
- Supabase (Postgres + Auth + Storage) in `supabase/`
- Node 22 (`.nvmrc`), npm

## Conventions

- Path alias is not used in `mobile/` (relative imports)
- Never commit `.env`; only update `.env.example`
- `EXPO_PUBLIC_*` ships in the client bundle
- Prefer `expo install <pkg>` for native modules
- Auth is Sign in with Apple + Google only — do not add email/password

## Status

Working MVP: map, spots, crews, media, Apple/Google login UI.
Without Supabase env vars the app runs in demo mode with sample data.

## Cursor Cloud specific instructions

- No iOS Simulator here. Use Expo web: `cd mobile && npx expo start --web`
  (http://localhost:8081). `npm run ios` cannot be used in this VM.
- `react-dom` must match `react` (19.2.3) or the web page is blank.
- Demo mode (`isDemo` in `mobile/src/config.ts`) lets the app run without
  real Supabase. `getSupabase` is not used; the client is created in
  `mobile/src/lib/supabase.ts`.
