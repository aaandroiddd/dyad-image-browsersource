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
