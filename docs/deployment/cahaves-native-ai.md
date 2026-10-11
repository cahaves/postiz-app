# Cahaves Native AI image and rollout

This packaging builds the reviewed `codex/native-ai-composer` commit on the Cahaves Postiz v2.25.0 baseline. It does not upgrade Postiz or change the database schema.

## Build and delivery

`.github/workflows/cahaves-container.yml` runs only in `cahaves/postiz-app`, on pushes to `codex/native-ai-composer` or a manual run of that branch. It uses a GitHub-hosted native AMD64 Ubuntu runner and `Dockerfile.cahaves`. Do not build on Primary.

The job has only `contents: read`. It receives no production credentials and does not log in to a registry. The existing upstream container workflow remains unchanged and must not be dispatched for this rollout.

The image tag is `cahaves/postiz-app:native-ai-<full-commit-sha>`. OCI labels record the full source revision and `https://github.com/cahaves/postiz-app`. The job exports the image, archive SHA256, image ID and labels as `cahaves-native-ai-<full-commit-sha>`, retained for one day. Download and privately retain the verified archive before it expires. The commit tag identifies the build; verify its recorded config ID and pin the verified runtime identifier during rollout.

The archive avoids requiring private GHCR package access on Primary. The build workflow performs no deployment. [GitHub artifact retention and upload documentation](https://github.com/actions/upload-artifact#retention-period) describes the artifact lifecycle.

Node 22.20, pnpm 10.6.1 and PM2 6.0.14 match the existing runtime/tool composition with explicit versions. Application dependencies use the existing frozen lock. The credential-free root `.npmrc` is included through a root-only `.dockerignore` exception: its `inject-workspace-packages=true` matches the lock settings, and `node-linker=hoisted` preserves the existing dependency layout. Other `.npmrc` files and private/global configuration remain excluded. Installation skips lifecycle scripts, then rebuilds the declared bcrypt dependency and generates the client with the installed Prisma 6.5.0. Client generation does not push the schema. The build runs the existing frontend/backend/orchestrator build script.

Runtime configuration comes from the server's existing environment and mounts. No real `.env`, private credentials or local test outputs belong in the build context. `.dockerignore` excludes those files. Never supply provider keys, database credentials or the JWT secret as build arguments.

## Startup

`var/docker/cahaves-start.sh` validates and starts the existing Nginx configuration, starts the existing frontend/backend/orchestrator PM2 scripts, then follows their logs. Shutdown asks PM2 and Nginx to stop.

Nginx listens on 5000 and proxies frontend 4200 and backend 3000. Orchestrator retains its default 3002 port. Preserve the current server port mappings and overrides. The Cahaves startup bypasses the root `pm2-run` script because that script invokes `prisma-db-push --accept-data-loss` on every launch. No schema push, reset or migration occurs in this startup.

## Primary rollout

1. Record the reviewed full source commit, successful workflow run and downloaded artifact. Verify `image.tar.gz.sha256` before transfer and again on Primary. Load the archive with `docker load`, then compare architecture and OCI revision with the artifact metadata. Compare the config digest with the recorded build image ID. If a containerd store reports a manifest ID, hash its manifest/config blobs and verify that the manifest references the exact recorded config and that RootFS diff IDs match; then pin that verified runtime manifest ID. Loading the image does not start services.
2. Privately back up the existing Compose/environment/access configuration, application and Temporal databases, and media. Verify the backups. Record the current Postiz image ID and sanitized container state for rollback and comparison. Inspect that image's entrypoint, CMD and app package scripts, and prepare the schema-safe rollback override below before replacing it.
3. Preserve the exact JWT secret, database/Redis/Meta credentials, connected-channel rows, provider scope, domain, access gate, networks and persistent volumes. Add only the new Postiz image identity and runtime `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` mappings. The default model is `openai/gpt-4.1-mini`. An absent key leaves the writing feature unavailable; do not replace existing provider credentials.
4. Validate Compose without printing expanded secrets. Recreate only the Postiz service with `--no-deps`; avoid restarting the database, Redis, Temporal or other services. Keep the previous image and private configuration for rollback. Use the loaded image ID or the verified commit tag with local pull disabled.
5. Verify frontend/backend/orchestrator health, trusted HTTPS, preserved credentials through private equality checks, connected-channel metadata, and unrelated container IDs/start times/restarts/OOM/health. Use a fresh isolated headless browser for signed-in assistant checks where authentication is available. Do not publish or schedule a real post, call a paid AI provider, or change channel credentials during verification.
6. Record the deployed source commit, image ID/tag, archive checksum, health results, OpenRouter configuration status, private backup/rollback locations and any verification limits. For rollback, follow the explicit startup override below.

## Schema-safe application rollback

The previous image's default CMD starts root `pm2`/`pm2-run`, which invokes Prisma schema push with `--accept-data-loss`. Do not launch the previous image with that default. Its new Cahaves startup script is also unavailable. Preserve this separate rollback override alongside the private configuration backup:

```yaml
services:
  postiz:
    image: "${POSTIZ_ROLLBACK_IMAGE:?Set the recorded previous Postiz image ID}"
    pull_policy: never
    entrypoint: []
    command:
      - /bin/sh
      - -ec
      - |
        cd /app
        stop_services() {
          trap - EXIT INT TERM
          pm2 kill || true
          nginx -s quit || true
        }
        trap stop_services EXIT
        trap 'exit 0' INT TERM
        nginx -t
        nginx
        pm2 delete all || true
        pnpm run --parallel \
          --filter ./apps/frontend \
          --filter ./apps/backend \
          --filter ./apps/orchestrator \
          pm2
        pm2 logs &
        wait "$!"
```

Set `POSTIZ_ROLLBACK_IMAGE` to the recorded previous local image ID. Restore the previous application configuration while retaining this override as the last Compose file. The empty entrypoint and explicit command replace the old default startup; only the existing Nginx and three app PM2 scripts run.

Before rollout, verify the old image contains these app scripts and Nginx, compare its schema with the reviewed unchanged schema, and validate the merged rollback Compose configuration privately without printing expanded secrets. For an application rollback, recreate only Postiz with the verified override, local pull disabled and `--no-deps`, then check all three apps and HTTPS again. Do not run schema push/reset/migrations or restore application/Temporal databases for this rollback. The database and media backups are retained for recovery, not restored when switching between these schema-identical application images.

## Verification limits

Shell syntax, workflow structure and command composition can be checked without a Docker daemon. A successful GitHub Linux image build and inspection are required before rollout; local static checks do not prove the image builds or runs. The workflow uses [Docker's documented build context exclusions](https://docs.docker.com/build/concepts/context/#dockerignore-files) and [GitHub-hosted runner labels](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

## Verified deployment record

Cahaves Primary runs source `d4c9406def9ef43f6d0dc1f8554354eefab38312` from [the successful image build](https://github.com/cahaves/postiz-app/actions/runs/38139955121). Primary manifest ID is `sha256:2764bcc6d0e8de58565214a69dcf7d09757d238566d002294450a4fd0982d984`; its config digest is the exact build ID `sha256:4e564e92121638e690e860ecdc34f5f0191e050fbf99d26ae081d4e257c15493`. Config hashing and RootFS comparison passed. The image archive checksum is `65e0284610e7a2cccfea9c81eafce1bd67d256410564fc55e4a27ba8489a206b`.

At 13:47:11 UTC on 11 October 2026, all four services and three app processes were healthy with zero restarts/OOM. Old credentials and both connected-channel fingerprints were preserved. Every other container matched its immediate pre-rollout state. Trusted HTTPS and isolated headless login checks passed. OpenRouter key is not installed, so actual generation and social delivery remain unverified. Source code tests total 140 passing cases.

Private recovery configuration and schema-safe rollback live under `/srv/cahaves/postiz/config-backups/native-ai-rollout-2026-10-11T12-37-38Z`; verified database/media backups are under `/srv/cahaves/postiz/backups/2026-10-11T12-39-31Z`. The metadata-only record commit does not change deployed application bytes.
