# Mr. Clipped Up

iOS app for sharing skate spots with your crew. Drop pins on a map, attach
photos and videos, share privately with invite codes.

## Run it (Mac + Simulator)

Xcode must be installed and opened once.

```bash
git clone https://github.com/lyuhiroyama/mr-clipped-up.git
cd mr-clipped-up/mobile
cp .env.example .env
npm install
npx expo start --ios
```

No Supabase keys yet is fine. The app starts in **demo mode** (sample spots in
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
