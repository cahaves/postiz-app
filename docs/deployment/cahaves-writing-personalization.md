# Cahaves writing personalization rollout

This update adds an organization-scoped writing profile and merges the previously deployed native composer into the fork's main branch. Main also contains upstream changes since the deployed October 11 image, including nullable `Integration.customName` and `Post.batchId`, a batch index, and versioned Temporal workflows. Treat the rollout as an application upgrade as well as a new profile table.

`.github/workflows/cahaves-main-container-v2.yml` builds only `cahaves/postiz-app` main on a native AMD64 Ubuntu runner. It uses the existing Dockerfile and schema-safe startup, and exports `cahaves-main-<full-SHA>` with the image archive, archive checksum, image config ID and labels. The workflow has contents-read permission and no production credentials, registry login or deployment step. The old feature-branch build workflow remains available. The new job also builds pinned baseline `16c0cfc22f8079c63f6e4b8590b3d87f8f1bba78` as a companion rollback artifact. It has the same upgraded workflow sources without writing personalization, so image rollback can retain one container and compatible workflow registrations. Keep both verified artifacts before rollout.

Before deployment, verify the exact-SHA build, downloaded artifact checksum, architecture, image config/manifest relationship and revision label. Keep all credentials in the existing private runtime configuration. Do not put environment files, workflow histories, keys or database exports in the image or repository.

Prepare a fresh private backup of configuration, PostgreSQL/Temporal databases and media. Record current images, connected-channel fingerprints and unrelated container state. Inspect the live-to-final Prisma schema diff. The reviewed change is additive: two nullable columns, their batch index, the new profile table and its organization foreign key. Stop if the current diff requires destructive operations.

Run the installed Prisma CLI in a one-off final-image utility container with the existing private environment/network and no service dependencies:

```sh
pnpm exec prisma db push --schema ./libraries/nestjs-libraries/src/database/prisma/schema.prisma --skip-generate
```

Do not pass `--accept-data-loss` or `--force-reset`. Do not invoke root pm2-run. The Cahaves startup does not apply schemas, so this explicit step must finish before switching the application image. Verify the resulting schema before continuing.

Replay current Temporal histories against the final workflow bundle without running activities. The upstream upgrade introduces new workflow types, so retain a compatible worker strategy for rollback; the October 11 image alone may not process newly created histories. Use the companion baseline image for an application rollback, retaining the schema-safe Cahaves startup and existing private configuration. An application rollback should retain additive columns and writing profiles, not restore an older database or delete the new table.

Recreate only Postiz with the verified local image and `--no-deps`, retaining its existing volumes, networks, port mappings, credentials and access gate. Verify the three app processes, all four services, HTTPS, channel metadata, profile save/read/stale-revision behavior and memory use. Compare unrelated containers with the immediate pre-rollout snapshot. Browser verification must use a fresh headless session. Never publish a test social post as a side effect of deployment verification.

Record the deployed revision and evidence after actual rollout. A successful push or build alone does not establish deployment.
