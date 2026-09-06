# Libreta — Production Deployment Guide

## Status

The **Supabase backend is already live** (database + RLS + Auth + edge function + all migrations applied). This guide covers taking the **frontend to production** and the remaining config knobs.

**Complexity:** Low–Moderate (~1–3 hrs, no code changes required).

---

## 1. Current state

| Layer | Status | Location |
|---|---|---|
| Postgres schema + RLS | ✅ Live | `supabase/migrations` (0001–0006) |
| Supabase Auth | ✅ Live | email/password + magic link |
| Atomic RPCs | ✅ Live | `post_sale`, `void_sale`, `receive_goods`, `post_journal_entry`, `create_business`, `join_business`, `delete_all_sales` |
| Edge function | ✅ Live | `supabase/functions/invite-user` |
| Frontend build | ✅ Works | `npm run build` → `dist/` (~32 lazy chunks) |

---

## 2. What production deployment requires

### 2.1 Host the static `dist/` (pick a host)

Because Libreta is a client-side SPA, the host **must fall back to `index.html`** for any path.

| Option | Notes |
|---|---|
| Vercel (recommended) | Zero-config Vite, auto SPA fallback, env vars, preview deploys |
| Netlify | Same, simple |
| Cloudflare Pages | Free, fast CDN |
| Custom server (nginx) | Only if self-hosting (needs `try_files … /index.html`) |

### 2.2 Update remote Supabase Auth redirect URLs

Currently `http://localhost:5173`. Must become the production domain, or **magic-link/OTP login and invite links break**.

- Update `site_url` and `additional_redirect_urls` (PATCH the project's `config/auth`).

### 2.3 Update the edge-function `SITE_URL` secret

Still localhost. Invite emails would link to the wrong origin otherwise.

- Update the `SITE_URL` secret used by `supabase/functions/invite-user`.

### 2.4 Set build-time env vars on the host

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

- The **anon key is safe in the client**.
- The **`service_role` key must NEVER be exposed** — it only lives server-side (edge function auto-injection) and in the gitignored `.env.deploy`.

### 2.5 (Recommended) Custom SMTP

Supabase's built-in sender often lands in spam. Configure **Auth → SMTP** for reliable invite / magic-link delivery.

### 2.6 Optional custom domain

---

## 3. Hosting config snippets

### Vercel (`vercel.json`)

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

### Netlify (`netlify.toml`)

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Cloudflare Pages

- Build command `npm run build`, output `dist`.
- Add a `_redirects` file: `/* /index.html 200`

---

## 4. Known tidy-ups before go-live (non-blocking)

- ESLint is now configured (`eslint.config.js` + `npm run lint`, eslint v9 flat config). It reports **0 errors**; the ~650 warnings are unused imports in some ported components — cosmetic, safe to leave or clean up later.
- Confirm `.env` / `.env.deploy` are **never committed** (they are gitignored).

---

## 5. Production hardening (optional)

- Supabase backups / point-in-time recovery
- Auth rate limits
- RLS policy review
- Keep `verify_jwt = true` on the edge function (already set)

---

## 6. Open decisions needed

1. **Frontend host?** (Vercel / Netlify / Cloudflare Pages / own server)
2. **Custom domain?** (e.g. `app.yourdomain.com`) or a host-provided URL for now?
