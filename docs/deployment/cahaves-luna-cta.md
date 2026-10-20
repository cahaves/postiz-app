# Cahaves Luna Max and CTA rollout

Deployed on 20 October 2026 from source `e563f9312c754a1e5380944516fb77b541895362`. Cahaves' native composer now uses OpenRouter `openai/gpt-6-luna` with `reasoning.effort=max`. Both settings are explicitly mapped through Compose. The provider key is retained in private server configuration.

The service accepts an optional validated `OPENROUTER_REASONING_EFFORT`. Blank settings preserve the previous request shape. The strict response schema, required-parameter routing, one-request/no-retry behavior, 4,000-token completion budget, 30-second server deadline and existing publication safeguards remain in place. Max is a reasoning setting, not a separate model name.

The previous profile treated CTAs as optional and had no brand facts. The new guidance makes introductions, launches and promotional posts end with one relevant CTA, placing it in the final part of a thread. Explicit no-CTA requests still take priority. Educational posts and replies do not require a sales pitch. Destinations and offers must come from supplied facts; the assistant must not assume a link is in the account bio.

## Build and deployment

Four new reasoning-configuration cases failed before implementation. All 123 backend tests subsequently passed, along with clean backend and orchestrator production builds. Independent review found no actionable issues. No dependency, frontend, Prisma schema or Temporal workflow source changed.

The deployed image is `sha256:b401d5cc70de7137dd5d62f5b980a694ef5056c699fd5ef732621c448c20a0ce`, tagged `cahaves/postiz-app:luna-cta-e563f931`. It is a compiled JavaScript overlay on the verified Linux AMD64 image `sha256:b334d12cf421942fb013d4f6a19da2809fe61d8c3511b9f0a1a6f352781cb26d`, source `a720d4c143a8c45d5324d8263e9957c8fc77e4a6`. This was not a full frontend/native-dependency rebuild.

All 619 compiled JavaScript files were compared against the running base. Only the backend and orchestrator copies of `AiTextService` differed; no JavaScript files were added or removed. Workflow JavaScript was identical. The derived image preserves the base's 15 layers, runtime configuration and native dependencies, adding three layers. Its 1,868 payload files passed per-file SHA256 checks. The 2,692,876-byte build archive hash is `1f79671bc2b179fa1b286b682ea7d0b09a3d217016e994e6fa533ae1c330e86e`.

The image revision label records `e563f931`; `dev.cahaves.frontend.revision` and the baked frontend version remain `a720d4c1`. The release directory `/srv/cahaves/postiz/releases/luna-cta-e563f931` retains the copy-only Dockerfile, source/build payload, manifest, build log and image verification. No installation or compilation ran on Primary.

A fresh configuration, container and channel baseline was captured at 08:05:49 UTC in `/srv/cahaves/postiz/config-backups/luna-cta-e563f931`. Expanded configuration comparison allowed only the app image, model and reasoning effort to change. The Postiz-only `up --no-deps --pull never --wait` completed healthy at 08:08:09 UTC. No schema operation ran.

Preservation verification passed at 08:10:03 UTC: all 29 other containers matched the immediate baseline; the provider key and all other runtime environment values, limits, mounts, networks and startup settings matched; both connected-channel fingerprints matched. The initial checker reported a difference because Docker reordered two identical bind entries. Sorting only that order-insensitive array resolved the check; an independent comparison confirmed no actual mount change.

Independent live checks confirmed all three PM2 processes online, all four Postiz services healthy, zero restarts or OOM kills, four internal readiness responses of 200, and trusted HTTPS responses of 401 without the access gate credentials and 200 with them. The observed cgroup memory was about 1,263 MiB of 1,536 MiB with no limit-pressure or OOM events. This was a short verification window, not a load test.

## Writing checks

Revision 3 was read before updating the profile. The authenticated revision guard saved revision 4, preserving language, tone, brand name, audience and approved examples. The saved profile exactly matches [the committed default](../research/2026-10-20-social-writing/cahaves-default-profile.json). It retains distinct Indonesian and English styles and adds basic company facts and URLs verified on the [Cahaves](https://cahaves.com) and [Cloud](https://cloud.cahaves.com) websites on 20 October 2026.

Two isolated service probes verified real Luna Max requests and valid strict-schema completion under the existing limits: a short introduction in 6.4 seconds and a three-part thread in 8.7 seconds. These probes did not modify application data.

Five private generation requests then passed against the deployed app:

- Indonesian Threads introduction: a website CTA appeared without asking for one explicitly.
- English Instagram introduction: a website CTA appeared.
- Three-part Indonesian Cloud thread: the website CTA appeared only in the final part.
- English introduction explicitly requesting no CTA: no CTA or link appeared.
- Actual headless Threads composer: generation succeeded and the introduction, including its CTA, applied to the native editor.

The four API checks took 5.8 to 13.1 seconds. Saved preferences were read back through both the API and the form. There were no unhandled browser errors, and the workspace post count stayed at zero. The browser used a fresh isolated headless session. Real social publication was not tested. These samples verify the exercised behavior, not consistent quality or latency for every future brief.

Private local evidence is under `/tmp/cahaves-luna-cta-evidence` and `/tmp/cahaves-luna-deploy`. It is excluded from Git.

## Recovery

The immediate rollback image is the retained `b334d12c` base. Restore the private `before-compose.yml` and `before-.env` from this rollout's recovery directory together, then recreate only Postiz using the recorded `switch-command.json` arguments. The previous image and model must be restored as a pair. Keep the current database and profile; this update has no schema migration. The earlier compatible `16c0cfc2` fallback and database/configuration/media backup remain available as described in [the personalization rollout](cahaves-writing-personalization.md).
