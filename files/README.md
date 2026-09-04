# Pipper Log — standalone (Supabase + Vercel)

This is Pipper Log pulled out of the Claude artifact sandbox and wired up to a
real Supabase database, so it works for anyone on any Claude plan (or no
Claude account at all).

## 1. Set up Supabase

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. Once it's ready, open **SQL Editor** and run the contents of
   `supabase-setup.sql` (in this folder) to create the table and permissions.
3. Go to **Project Settings > API** and copy:
   - the **Project URL**
   - the **anon public** key

## 2. Configure environment variables locally (optional, for testing)

Copy `.env.example` to `.env` and fill in the two values from step 1:

```
cp .env.example .env
```

Then run it locally to check it works before deploying:

```
npm install
npm run dev
```

## 3. Push to GitHub

```
git init
git add .
git commit -m "Pipper Log — Supabase backend"
```

Create a new repo on GitHub, then push:

```
git remote add origin https://github.com/<you>/pipper-log.git
git branch -M main
git push -u origin main
```

## 4. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com), sign in, and click **Add New > Project**.
2. Import your `pipper-log` GitHub repo. Vercel auto-detects Vite.
3. Before deploying, open **Environment Variables** and add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   (same values from step 1)
4. Click **Deploy**. You'll get a live URL like `pipper-log.vercel.app`.

## 5. Test it

Open the URL, add a booking, and refresh — it should still be there. Open it
on your phone too, and check a booking made on one device shows up on the
other after a refresh.

## Notes

- **No login system.** Anyone with the link can view and edit the calendar,
  same as the original Claude artifact. Fine for a trusted group of
  neighbours, but there's no per-person access control.
- **No real-time sync.** Like the original, changes only appear after a
  refresh — two people editing at the same moment could still overwrite each
  other, though the ownership-lock logic in the app still prevents stealing
  someone else's named booking.
- **Free tier limits.** Supabase's free tier is generous for a project this
  size (500MB database, plenty of API requests) — you're unlikely to hit any
  limits with a household calendar.
