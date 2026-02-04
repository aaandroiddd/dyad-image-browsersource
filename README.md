# Welcome to your Dyad app

## Environment setup

The app expects Supabase credentials to be available at runtime. Copy
`.env.example` to `.env` and provide your values:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

If these variables are missing, the UI will display a configuration error
instead of the main interface. The URL must point to a valid Supabase project
domain (for example, `https://your-project-ref.supabase.co`). Using an
incorrect domain will prevent the app from connecting to Supabase.

## Deployment notes

### Serverless (recommended)

This repo ships with Vercel configuration that exposes the API routes at
`/api/elestrals/search`, `/api/elestrals/cards`, and `/api/elestrals/cron` by
running the handlers in `api/elestrals/*.ts` as serverless functions.
Deploying to Vercel (or any platform that supports Node.js serverless functions
from `api`) will make the routes available without extra setup. See
`vercel.json` for the SPA rewrite.

### Static hosting (SPA-only)

If you deploy the front-end as a static SPA, you must provide a backend (or
reverse proxy) for `/api/elestrals/*`. One common approach is to deploy the
serverless function separately and proxy requests back to it. For example:

- **Netlify**: add a `_redirects` rule like `/api/*  https://your-backend.example.com/api/:splat  200`.
- **Cloudflare Pages**: add a `_routes.json` rule that forwards `/api/*` to a
  Worker or other backend.

Without a proxy/backend, the client will receive HTML instead of JSON and show
an "API route not configured" error.

If your backend is hosted on a different base path, set
`VITE_ELESTRALS_API_BASE` to point at it (for example,
`https://your-backend.example.com/api`). The UI will use this value when
calling `/elestrals/search`.

### Building the Elestrals search index

The search API reads from a local snapshot stored in
`server/data/elestrals-cards-snapshot.json`. Run the ingest script after
deploying (or during CI) to populate it:

```
npm run ingest:elestrals
```

In production, remote fetching for refreshes is disabled by default. If you
want `/api/elestrals/search?refresh=1` (or the cron route) to fetch directly
from `collect.elestrals.com`, set:

```
ELESTRALS_REMOTE_FETCH=true
```

If you use the Vercel cron, you can optionally set
`ELESTRALS_CRON_SECRET` and include `?secret=...` when triggering the cron route.
