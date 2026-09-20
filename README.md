# Simple Skate Map

iOS app for documenting street architecture and clips with your group. Pin
places you admire, attach photos and videos, share privately with invite
codes. For looking — not a guidebook.

## Run it (Mac + Simulator)

Xcode must be installed and opened once.

```bash
git clone https://github.com/lyuhiroyama/simple-skate-map.git
cd simple-skate-map/mobile
cp .env.example .env
npm install
npx expo start --ios
```

No Supabase keys yet is fine. The app starts in **demo mode** (sample places in
downtown LA, Apple/Google buttons skip a live account). You still get a real
Apple Map in the Simulator.

When you are ready for real accounts, fill in `mobile/.env` and
`server/.env` from a Supabase project, run `supabase/migrations/0001_init.sql`,
enable Apple + Google under Authentication → Providers, then restart Expo.

## Layout

```
mobile/     Expo app
server/     Express API
supabase/   Postgres + RLS + storage bucket
```

## Auth

No email/password. **Sign in with Apple** (native) and **Continue with Google**.
Session stays on the device until you tap Sign out.
