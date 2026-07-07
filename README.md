# Skate Spots

An iOS app for sharing skate spots with your crew. Drop pins on a map, attach
photos and videos, and share spots privately within groups ("crews").

## How it works

- **Map** — every spot in your crews shows up as a pin. Tap a pin's callout to
  see photos, videos, the address, and details. Long-press anywhere on the map
  (or hit the + button) to add a new spot.
- **Spots** — each spot has a name, details (ground quality, security, best
  time to skate...), an address (auto-filled from the pin location), and any
  number of photos/videos from your library or camera.
- **Crews** — spots belong to a crew. Create a crew and share its invite code
  with friends; anyone with the code can join and see that crew's spots.

## Stack

| Piece | Tech |
| --- | --- |
| `mobile/` | React Native (Expo SDK 57, TypeScript), React Navigation, Apple Maps via `react-native-maps` |
| `server/` | Node.js + Express 5 (TypeScript), validates every request against group membership |
| `supabase/` | Postgres schema + RLS policies, Supabase Auth, private Storage bucket for media |

Media uploads go straight from the phone to Supabase Storage using signed
upload URLs issued by the API, so video files never pass through the Express
server. Playback uses short-lived signed download URLs.

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run `supabase/migrations/0001_init.sql`. This
   creates the tables, row-level security policies, the `spot-media` storage
   bucket, and a trigger that creates a profile for each new user.
3. (Recommended for testing) Turn off email confirmation under
   Authentication → Sign In / Up → Email, so you can sign in right after
   signing up.

### 2. API server

```bash
cd server
cp .env.example .env   # fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev            # http://localhost:4000
```

### 3. iOS app

```bash
cd mobile
cp .env.example .env   # fill in Supabase URL, anon key, and the API URL
npm install
npm run ios            # or: npx expo start, then scan the QR with your iPhone
```

Testing on a real iPhone: set `EXPO_PUBLIC_API_URL` to your Mac's LAN IP
(e.g. `http://192.168.1.23:4000`), not `localhost` — the phone can't reach
your Mac's localhost. Phone and Mac must be on the same Wi-Fi.

## Repo layout

```
mobile/    Expo app (screens, navigation, Supabase auth, uploads)
server/    Express API (groups, spots, media signing)
supabase/  SQL migration (schema, RLS, storage bucket)
```

## API overview

All routes (except `/health`) require `Authorization: Bearer <supabase access token>`.

| Method | Route | What it does |
| --- | --- | --- |
| GET | `/me` | Current user's profile |
| GET | `/groups` | My crews with member counts |
| POST | `/groups` | Create a crew (returns invite code) |
| POST | `/groups/join` | Join a crew by invite code |
| GET | `/groups/:id/members` | Crew member list |
| DELETE | `/groups/:id/membership` | Leave a crew |
| GET | `/spots` | Map pins for all my crews (`?groupId=` to filter) |
| POST | `/spots` | Create a spot |
| GET | `/spots/:id` | Full detail + signed media URLs |
| POST | `/spots/:id/media` | Register media, get a signed upload URL |
| DELETE | `/spots/:id` | Delete my spot (and its media) |
