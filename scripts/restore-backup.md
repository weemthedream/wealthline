# Restoring from a backup

Backups run nightly via GitHub Actions and are kept for 90 days.

## Get a backup file

1. Go to the repo → **Actions** → **Database backup**
2. Click the run you want (they're dated)
3. Download the artifact under **Artifacts** — a `.zip` containing `wealthline-YYYY-MM-DD.sql.gz`
4. Unzip it

## Before restoring — read this

Restoring **overwrites live data**. If the database is still reachable, take a
fresh dump first so you can undo a bad restore:

```bash
pg_dump "$DATABASE_URL_UNPOOLED" --no-owner --no-privileges | gzip > before-restore.sql.gz
```

Safer still: restore into a **Neon branch** rather than production, confirm the
data looks right, then promote it.

```bash
neon branches create --name restore-test --project-id long-pond-82796326
```

## Restore

Use the **unpooled** connection string (the pooler doesn't handle restores well).
You need `psql` at version 18 or newer.

```bash
gunzip -c wealthline-2026-10-29.sql.gz | psql "<unpooled-connection-string>"
```

The dump uses `CREATE TABLE` without `DROP`, so restoring over an existing
database will error on tables that already exist. To replace everything:

```bash
psql "<unpooled-connection-string>" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
gunzip -c wealthline-2026-10-29.sql.gz | psql "<unpooled-connection-string>"
```

## After restoring

- The app recreates any missing schema on its next request, so a partial
  restore self-heals on the structural side.
- Everyone stays logged in, because sessions are signed tokens rather than
  database rows. If the restore was prompted by a breach, force everyone out:

```sql
UPDATE users SET token_version = token_version + 1;
```

## Running a backup on demand

Actions → **Database backup** → **Run workflow**.
