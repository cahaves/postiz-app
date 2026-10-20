# Writing Personalization Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task, with independent research and a final pattern review.

**Goal:** Add persistent, research-informed Indonesian and English writing preferences to the native Postiz composer.

**Architecture:** A private organization-scoped Prisma model stores validated preferences. The native AI service uses those preferences and provider-owned guidance. The composer loads and saves preferences through authenticated routes using SWR and native controls.

**Tech Stack:** pnpm, Node 22, NestJS, Prisma 6.5, Next.js/React, SWR, existing OpenRouter client, Jest, headless Playwright.

**Spec:** `docs/superpowers/specs/2026-10-20-writing-personalization.md`

## Global Constraints

- Main worktree only; no PR; direct task commits to origin/main.
- No new UI dependency, raw SQL, public API/MCP exposure, Temporal signature change, credential migration or model switch is needed for personalization.
- Input limits, profile fields and default values are exactly those in the spec.
- Research metrics are observed snapshots; recommendations are provisional and editable.

## Review Focus

- A stale administrator form must not overwrite another administrator's changes.
- Failed profile loading or unsaved edits must not silently generate with the wrong voice.
- Profile or organization changes must not leave an old suggestion ready to publish.
- Examples and selected integrations must not leak credentials or inject actions into the model.
- A publication failure after one channel saves must not invite duplicate publication.

## Tasks

### 1. Reconcile the native assistant with fork main

- [x] Resolve editor/modal conflicts while retaining main's channel dates and native AI snapshot safeguards.
- [x] Update affected provider fixtures and direction-aware editor assertions; run the existing AI suite.
- [x] Commit the verified merge without resetting or rewriting either history.

### 2. Persist preferences and supply generation context

Files: new `dtos/posts/ai.writing.profile.dto.ts`, `database/prisma/ai-writing-profile/ai.writing.profile.{repository,service}.ts`, `api/routes/ai.writing.profile.controller.ts`; existing schema, database/API modules, PostsService, AiTextService and social-provider implementations. Tests: `tests/ai-text/backend.profile.spec.ts` and affected existing backend fixtures.

Interface: `AiWritingProfile` with the spec fields; `AiWritingProfileResponse = { profile: AiWritingProfile; revision: number }`; `AiWritingProfileSaveDto` has profile and revision. GET/POST `/posts/ai-text/profile`. Service methods `get(orgId)` and `save(orgId, dto)` return the response. The AI service reads the profile through its service dependency and includes only selected fields and provider guidance in its bounded request.

- [x] Write failing tests for invalid fields, tenant scoping, first-save/update races and sanitized prompt context.
- [x] Implement the additive Prisma model, repository, validation service, authenticated route and admin policy.
- [x] Add provider-owned guidance and bounded profile context to generation.
- [x] Generate Prisma client; verify schema and backend tests/types/build.

### 3. Add native writing-preferences controls

Files: new `apps/frontend/src/components/new-launch/ai.writing.preferences.tsx`; assistant integration; profile tests and existing frontend/browser fixtures.

- [x] Test loading failure, successful persistence, unsaved edits, conflict, readonly members and stale-candidate invalidation.
- [x] Implement an organization-keyed SWR hook and native controlled fields with explicit save/discard.
- [x] Gate generation on loaded/saved preferences; clear conversation and suggestions when revision changes.
- [x] Verify frontend tests/types and real headless composer rendering at desktop/mobile sizes.

### 4. Evidence, review and publication

Files: `docs/research/2026-10-20-social-writing/` for paraphrased observations, sources, limitations and descriptive charts; update native AI/deployment docs.

- [x] Assemble primary-page observations and same-account contrasts; preserve missing counts as null.
- [x] Explain the chosen defaults and contradictory examples without causal claims.
- [x] Run a separate agent review against repository patterns, security and publication behavior; fix findings.
- [x] Review staged diff for credentials and unrelated changes. Commit and push to Cahaves origin/main.
- [x] Extend the study to sumopodcloud, monveo.app and shobrunjb; review the 22-post chart and product-scoped editable defaults.
- [x] Install and verify the initial profile on the live workspace without overwriting existing user preferences or publishing test posts.
- [x] Report verified source and deployment status separately, with remaining evidence limits.
