# Cahaves Native AI image and rollout

This packaging builds the reviewed `codex/native-ai-composer` commit on the Cahaves Postiz v2.25.0 baseline. It does not upgrade Postiz or change the database schema.

## Build and delivery

`.github/workflows/cahaves-container.yml` runs only in `cahaves/postiz-app`, on pushes to `codex/native-ai-composer` or a manual run of that branch. It uses a GitHub-hosted native AMD64 Ubuntu runner and `Dockerfile.cahaves`. Do not build on Primary.

The job has only `contents: read`. It receives no production credentials and does not log in to a registry. The existing upstream container workflow remains unchanged and must not be dispatched for this rollout.

The image tag is `cahaves/postiz-app:native-ai-<full-commit-sha>`. OCI labels record the full source revision and `https://github.com/cahaves/postiz-app`. The job exports the image, archive SHA256, image ID and labels as `cahaves-native-ai-<full-commit-sha>`, retained for one day. Download and privately retain the verified archive before it expires. The commit tag identifies the build; pin its recorded image ID during rollout.

The archive avoids requiring private GHCR package access on Primary. The build workflow performs no deployment. [GitHub artifact retention and upload documentation](https://github.com/actions/upload-artifact#retention-period) describes the artifact lifecycle.

Node 22.20, pnpm 10.6.1 and PM2 6.0.14 match the existing runtime/tool composition with explicit versions. Application dependencies use the existing frozen lock. Installation skips lifecycle scripts, then rebuilds the declared bcrypt dependency and generates the client with the installed Prisma 6.5.0. Client generation does not push the schema. The build runs the existing frontend/backend/orchestrator build script.

Runtime configuration comes from the server's existing environment and mounts. No real `.env`, private credentials or local test outputs belong in the build context. `.dockerignore` excludes those files. Never supply provider keys, database credentials or the JWT secret as build arguments.

## Startup

`var/docker/cahaves-start.sh` validates and starts the existing Nginx configuration, starts the existing frontend/backend/orchestrator PM2 scripts, then follows their logs. Shutdown asks PM2 and Nginx to stop.

Nginx listens on 5000 and proxies frontend 4200 and backend 3000. Orchestrator retains its default 3002 port. Preserve the current server port mappings and overrides. The Cahaves startup bypasses the root `pm2-run` script because that script invokes `prisma-db-push --accept-data-loss` on every launch. No schema push, reset or migration occurs in this startup.

## Primary rollout

1. Record the reviewed full source commit, successful workflow run and downloaded artifact. Verify `image.tar.gz.sha256` before transfer and again on Primary. Load the archive with `docker load`, then compare architecture, OCI revision and image ID with the artifact metadata. Loading the image does not start services.
2. Privately back up the existing Compose/environment/access configuration, application and Temporal databases, and media. Verify the backups. Record the current Postiz image ID and sanitized container state for rollback and comparison.
3. Preserve the exact JWT secret, database/Redis/Meta credentials, connected-channel rows, provider scope, domain, access gate, networks and persistent volumes. Add only the new Postiz image identity and runtime `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` mappings. The default model is `openai/gpt-4.1-mini`. An absent key leaves the writing feature unavailable; do not replace existing provider credentials.
4. Validate Compose without printing expanded secrets. Recreate only the Postiz service with `--no-deps`; avoid restarting the database, Redis, Temporal or other services. Keep the previous image and private configuration for rollback. Use the loaded image ID or the verified commit tag with local pull disabled.
5. Verify frontend/backend/orchestrator health, trusted HTTPS, preserved credentials through private equality checks, connected-channel metadata, and unrelated container IDs/start times/restarts/OOM/health. Use a fresh isolated headless browser for signed-in assistant checks where authentication is available. Do not publish or schedule a real post, call a paid AI provider, or change channel credentials during verification.
6. Record the deployed source commit, image ID/tag, archive checksum, health results, OpenRouter configuration status, private backup/rollback locations and any verification limits. For rollback, restore only the previous Postiz image/configuration and recreate that service with `--no-deps`.

## Verification limits

Shell syntax, workflow structure and command composition can be checked without a Docker daemon. A successful GitHub Linux image build and inspection are required before rollout; local static checks do not prove the image builds or runs. The workflow uses [Docker's documented build context exclusions](https://docs.docker.com/build/concepts/context/#dockerignore-files) and [GitHub-hosted runner labels](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
