# Wealthline

A full-stack budgeting app with per-user accounts: income/expense tracking, monthly budgets by category, a 1-month / 1-year / retirement-goals view, and recurring bills.

- **Backend:** Node.js + Express, Postgres (via [Neon](https://neon.tech)'s serverless driver), cookie-based session auth (bcrypt + JWT)
- **Frontend:** React + Vite, charts via Recharts

Each person who signs up gets their own private set of categories, transactions, budgets, bills, and goals — nothing is shared between accounts.

## Local development

You need a Postgres database to run this even locally — the app has no other storage backend.

A Neon project already exists for this app (project **wealthline**, id `long-pond-82796326`, `production` branch), and `server/.env` is already populated with its connection string plus a generated `JWT_SECRET` — both gitignored, never committed. If you're setting this up somewhere new:

1. Grab the connection string from the [Neon console](https://console.neon.tech) for that project (or create a new one), and put it in `server/.env` as `DATABASE_URL` (see `server/.env.example` for the full list of variables).
2. Install Node.js 18+, then:
   ```bash
   npm run install:all
   npm run dev
   ```

This starts the API on http://localhost:4000 and the web app on http://localhost:5173 (open that one). The Vite dev server proxies `/api` requests to the backend. `server/index.js` loads `server/.env` automatically via `dotenv`.

If the Neon CLI is installed (`npm i -g neon`), you can also regenerate the connection string with:
```bash
neon-env export --project-id long-pond-82796326 --branch production
```
(or set `NEON_PROJECT_ID=long-pond-82796326` and `NEON_BRANCH=production` as env vars first, then just `neon-env export`).

## Deploying to Vercel (recommended)

This is the cheapest good option: **Vercel's free Hobby tier + Neon's free Postgres tier = $0/month** for personal or small-group use, and Vercel auto-deploys every time you push to GitHub.

1. **Push this project to a GitHub repo** (create one at github.com if you don't have one, then `git init`, `git add`, `git commit`, and push — ask if you'd like help with this).
2. **Import the repo into Vercel**: https://vercel.com/new → select your GitHub repo. Vercel will read `vercel.json` and configure the build automatically — no manual settings needed.
3. **Set environment variables** in Vercel's Project Settings → Environment Variables — copy the values straight out of your local `server/.env`:
   - `DATABASE_URL` — the Neon connection string (already set up for the `wealthline` project, `production` branch)
   - `JWT_SECRET` — the random string already generated in `server/.env`, or generate a fresh one for production with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
4. **Deploy.** Vercel gives you a `https://<project>.vercel.app` URL — anyone can sign up from there. Every future `git push` redeploys automatically.

You don't need to set `CORS_ORIGIN` or `PORT` — the frontend and API share the same Vercel domain.

### Why not GitHub or Vercel alone?

- **GitHub** hosts your code and (via GitHub Pages) only static sites — it can't run the Express backend or store data, so it's your source repo, not your app host.
- **Vercel** runs the backend as stateless serverless functions with no persistent disk, so this app can't use a local SQLite/file database there — that's exactly why the data layer here is Postgres (Neon) instead. With that in place, Vercel works well.

## Alternative: self-host with Docker

If you'd rather run this on your own server or a host like Fly.io/Railway/Render instead of Vercel, a `Dockerfile` is included. It still needs the same `DATABASE_URL` (Neon or any Postgres) and `JWT_SECRET` environment variables — no persistent volume is required since all data lives in Postgres, not on local disk.

```bash
docker build -t wealthline .
docker run -p 4000:4000 -e DATABASE_URL=... -e JWT_SECRET=... -e NODE_ENV=production wealthline
```

## Project structure

```
server/     Express API + Postgres (Neon) storage + auth — the app logic
api/        Single Vercel serverless function that re-exports server/app.js
client/     React app (Vite)
vercel.json Tells Vercel how to build the client and route /api/* to the function
Dockerfile  Alternative: builds both into one self-hostable image
```
