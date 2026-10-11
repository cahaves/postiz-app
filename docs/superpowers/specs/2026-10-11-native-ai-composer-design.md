# Native Postiz composer AI: implementation design

Drafted 2026-10-11 against installed v2.25.0, commit `8e42f09cb45c3b6be16656c2d23a372d5eb21053`, in `/Users/refifauzan/Projects/cahaves/postiz-app/.worktrees/native-ai-composer`.

## Decision

Build one inline, session-local chat assistant in the existing post form. It writes or refines the current draft scope, displays the proposed text, and supports a deliberately selected `Write`, `Write & post now`, or `Write & schedule` action. OpenRouter supplies text through its OpenAI-compatible endpoint. Existing Postiz validation and save logic alone performs publishing/scheduling. This is a complete one-off composer feature, not recurring generation, MCP, a new agent runtime, or a separate publishing implementation.

The user requested implementation, a proper plan, and sub-agents, then confirmed post-form chat with publishing and OpenRouter. AI credentials are not available for a live model check; the feature must expose its configuration state honestly and be verified with provider-mocked tests.

Read: root `CLAUDE.md`, frontend `AGENTS.md` and `CLAUDE.md`, all three discovery reports. Also inspected current `ManageModal.schedule`, existing server `validatePosts`, content normalization, and throttler behavior. Follow the native Postiz React/Tiptap/Tailwind controls and pnpm conventions. Do not import Cahaves/HeroUI dependencies into this separate fork. Read installed Next/Tiptap docs before implementation once dependencies exist.

## Product behavior and scope

1. Place `AiTextAssistant` inside `#social-content`, below `SelectCurrent` and above `EditorWrapper`. Use existing native Button/Textarea/form patterns, tokens, translated labels, accessible prompt label/status/error region, and visible keyboard focus.
2. Show the current scope and channels affected by a final save. The smallest version changes all existing blocks in the current scope, preserving their number/order. Global scope updates global text only; existing channel overrides remain intact. A channel scope updates its override. If it inherits global content, the UI explicitly states that applying creates a channel-specific version; the atomic action creates that override once. Do not use the existing toggle to create it.
3. Keep conversation history for this modal session and target only. An instruction plus current candidate/source is enough for refinement: “write a caption”, then “make it shorter” operates on the latest candidate. Current candidate is supplied separately from bounded conversational messages. Reset or visibly invalidate the session when source scope/selection/content structure changes. No DB chat persistence is needed.
4. Action defaults to `Write`. Select `Write & post now` or `Write & schedule` BEFORE submitting; show that exact action in the submit button and a summary of all selected publishing channels. Schedule uses the native date/time field, visibly including timezone. It never interprets model-generated dates. A typed “publish” in ordinary Write mode does not silently publish; explain that publishing requires selecting the corresponding action. This deterministic mode selection is the trusted user instruction. The model never returns an action enum.
5. Write returns a plain-text candidate with `Apply to draft` and `Discard`. Subsequent chat prompts refine that candidate without mutating the form. Apply changes text only. Publish modes generate, validate, atomically apply, and call the existing save path once, without adding an AI approval dialog. Existing republish and shortlink choices remain part of that save path.
6. A user who has already refined/applied text can use the normal native Post now/Schedule buttons. Do not require another paid generation to publish a finished candidate. Include an explicit `Apply & post now`/`Apply & schedule` candidate action if needed for one-click completion; it is a fresh human action and uses the same integration callback.
7. Publication always saves all selected channels, exactly as the native form does, while text application changes only the disclosed scope. The action summary must make this distinction visible. To keep this small, do not add per-channel AI variants, new blocks, research, media creation, fresh recurring posts, or arbitrary natural-language action parsing.
8. Missing configuration: show `AI writing is not configured. Ask your administrator to configure OpenRouter.` Disable AI send, preserve normal editing/publishing, and offer capability retry. Do not show fabricated samples. A configured flag means a nonblank key exists, not that the key/billing/model was live-tested.
9. Dummy/template/set modes that do not perform normal native publication may use Write, but must not offer misleading AI publish actions. Already-published edits retain existing republish protections. Existing repeat settings stay untouched and, when present, are visible in the normal save summary; this feature creates no fresh-content recurrence.

## Global Constraints

- Baseline: Postiz v2.25.0, commit 8e42f09cb45c3b6be16656c2d23a372d5eb21053; no unrelated upstream upgrade.
- Runtime: Node >=22.12.0 <23.0.0 and pnpm 10.6.1; reuse declared dependencies and existing Postiz controls.
- Provider: server-side OpenRouter only at https://openrouter.ai/api/v1, using OPENROUTER_API_KEY and configurable OPENROUTER_MODEL, default openai/gpt-4.1-mini; no browser key or MCP.
- Generation: one structured provider call, maxRetries 0, timeout 30000 ms, max_tokens 4000, strict JSON schema, provider.require_parameters true, no tools or automatic corrective loop.
- Bounds: instruction 2000 characters; 1..10 channels and blocks; IDs 128 characters; block source 12000 characters; last 6 history messages of 2000 characters; combined input text 24000 characters; settings 8192 bytes; aggregate output 20000 characters.
- Cost controls: 10 generation requests per minute per organization and one active generation per organization with a token-owned Redis lease of 45 seconds.
- Draft application changes content only, preserves IDs/order/delays/media/settings/date/tags/repeater/other channel versions, and rejects stale or invalid results atomically.
- Publication intent comes only from a labelled user-selected Write/Post now/Schedule action; model output cannot publish, choose channels or choose dates.
- Publishing uses existing provider validation and native /posts saving, retains existing republish/shortlink behavior, and never automatically retries a post request with an unknown outcome.
- This update has no recurring generation, new image generation, database migration, Temporal workflow change, production deployment or real social/AI call during tests.
- Verification uses meaningful provider-mocked tests and an isolated headless browser; never access the user's browser or its profiles/cookies.

## API and exact contract

Use authenticated `PostsController` routes:

- `GET /posts/ai-text/capabilities`
- `POST /posts/ai-text`

Both apply the existing AI entitlement policy, `CheckPolicies([AuthorizationActions.Create, Sections.AI])`; normal authentication derives organization from the request. A 403 is distinct from missing configuration. Declare static routes consistently with existing controller routing.

Capability response:

```ts
type AiTextCapabilities = {
  configured: boolean;
  reason?: 'missing-provider-key';
};
```

Request, conceptually (DTO decorators enforce bounds):

```ts
type AiTextRequest = {
  instruction: string;                 // trim, nonblank, <= 2,000 characters
  channels: Array<{
    integrationId: string;             // 1..10 unique selected, <=128 characters each
    settings: Record<string, unknown>; // bounded provider settings, validation only
  }>;
  blocks: Array<{
    id: string;                        // 1..10 unique, <=128 characters each
    content: string;                   // current plain source/candidate, <=12,000 each
  }>;
  history: Array<{
    role: 'user' | 'assistant';
    content: string;                   // <=2,000 each, last 6 messages maximum
  }>;
};

type AiTextResponse = {
  blocks: Array<{ id: string; content: string }>;
  limits: Array<{
    integrationId: string;
    maximumCharacters: number | null; // null = provider has no effective explicit limit
    counts: Array<{ id: string; count: number }>;
  }>;
};
```

Bound total instruction/source/history text to 24,000 characters and settings payload to 8 KiB, with reasonable depth/field bounds. At least one block is required, but empty source is allowed. Reject unknown top-level and nested fields, duplicate/unknown output IDs, extra/missing/reordered output blocks, blank output, and aggregate output beyond a fixed 20,000-character ceiling. Do not silently truncate source/history server-side; client sends its bounded last messages and labels that older context is omitted where relevant. The API does not accept orgId, system messages, publication intent, date, media, credentials, URLs for fetching, or tools. Block IDs identify a supplied draft, not persisted post ownership; integration ownership is checked server-side. Return no raw integration rows.

`channels` contains the selected integrations whose text is governed by the current scope: channel scope has that selected integration; global scope has selected integrations inheriting global text. When none inherit global text, disable global AI with an explanation and offer selecting an existing channel. The frontend also captures the full selected-channel set for stale checks and the final publication summary.

Provider settings are needed because existing `maxLength(additionalSettings, settings)` can depend on current settings. Server resolves each owned integration, rejects deleted/disabled/missing/foreign channels, and obtains the social provider generically. Validate/transform only the known provider settings shape using its DTO before using it for length. Do not pass settings or integration `additionalSettings` into the model; derive safe metadata only. Do not require media for text generation. If required publication settings are missing, use a clear configuration error or conservative provider-approved metadata path, never guess a larger limit. Final `/posts/valid` remains authoritative for full settings/media correctness.

## Server and OpenRouter implementation

Recommended files:

- NEW `libraries/nestjs-libraries/src/dtos/posts/ai.text.dto.ts`: nested DTOs, bounds and response types suitable for type-only imports.
- EDIT `apps/backend/src/api/routes/posts.controller.ts`: capability/generation methods, local strict ValidationPipe, AI policy and throttling guard, request abort propagation.
- EDIT `libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts`: `aiTextCapabilities`/`generateAiText` orchestration; organization-scoped integration lookup, provider metadata/settings/count validation. No repository write is needed because nothing persists.
- NEW `libraries/nestjs-libraries/src/openai/ai.text.service.ts`: narrow injectable text-generation service using the already-installed OpenAI SDK configured for OpenRouter. Do not import/reconfigure the existing module-scope OpenAI client or change image/video/agents behavior.
- EDIT provider registration in `apps/backend/src/api/api.module.ts` and the actual existing module owning `PostsService` injection if necessary; follow current registration rather than inventing a posts.module file.
- EDIT `libraries/nestjs-libraries/src/throttler/throttler.provider.ts`: dedicated route-level AI guard using existing Redis throttler storage, authenticated org key.
- EDIT `.env.example`: document `OPENROUTER_API_KEY` and `OPENROUTER_MODEL=openai/gpt-4.1-mini`; never change real .env or deployment secrets.

Configure `new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey, maxRetries: 0, timeout: 30_000 })` lazily after verifying a trimmed nonblank `OPENROUTER_API_KEY`. Set model from trimmed `OPENROUTER_MODEL` with documented default `openai/gpt-4.1-mini`; reject malformed configuration safely. Use exactly one nonstreaming chat-completions call, a strict JSON schema response with required block IDs/text and `additionalProperties:false`, OpenRouter `provider: { require_parameters: true }`, a 4,000 output-token cap, no tools and no automatic corrective loop. Check SDK support for the OpenRouter-specific request extension and use a narrowly typed extension if necessary, rather than broad `any` casts. Runtime-validate the parsed response independently of schema guarantees. Treat refusal, missing choice, truncation/non-stop finish, empty output, and schema mismatch as failures.

System prompt permits text drafting only, keeps current block count/IDs, requests plain text and generic per-channel limits, and treats instruction/source/history as untrusted content. Serialize bounded user data separately; never interpolate whole Prisma rows, credentials, settings, media paths, raw organization objects, or publish instructions into the system message. A malicious draft asking for secrets/publication cannot cause tools or writes because neither exists in this service.

Rate default: 10 requests/minute/organization enforced by an actual route-level ThrottlerGuard (a decorator alone is ineffective here). Concurrency default: one active generation/org via a Redis lease with unique token and 45-second TTL; release in finally using token comparison, including timeout/abort/error. Leases expire after process failure and cannot delete a successor's lease. Tests inject/mock storage. Fail closed with a safe temporary-unavailable response if cost-control storage is unavailable; do not claim the existing minimal MockRedis has NX/lease semantics without implementing a test substitute. Keep quotas independent across organizations and release slot on cancellation. Propagate HTTP disconnect and timeout to SDK AbortSignal; cancellation guarantees no application even if provider work has already started.

Safe JSON errors: `{ code, message }`; examples 503 `AI_NOT_CONFIGURED`, 403 `AI_ACCESS_DENIED`, 400 `AI_INVALID_INPUT`/`AI_CHANNEL_UNAVAILABLE`, 429 `AI_RATE_LIMITED`/`AI_BUSY` with Retry-After, 502 `AI_INVALID_OUTPUT`/`AI_PROVIDER_UNAVAILABLE`, 504 `AI_TIMEOUT`, 422 `AI_REFUSED`/`AI_OUTPUT_TOO_LONG`. Provider bad key or credits maps to curated administrator-facing guidance, never raw provider error body. Log only safe category/status/request identifier, no prompt/key/response body.

For length, use the same deterministic text-to-editor representation used on Apply, then `stripHtmlValidation('normal', html, true)` and `countLength(providerIdentifier, normalized)`, with `provider.maxLength(additionalSettings, validatedSettings)` and existing falsy-limit semantics. Do not count raw HTML length or assume Unicode string length. Check each block against every applicable channel, not merely a numeric minimum, since providers can use distinct counters. Generic code contains no `if instagram/threads` branches. A small shared serialization helper is justified only if needed to prevent backend/frontend counting divergence; prefer adding to an existing appropriate content utility over a new algorithm-only module.

## Composer application and editor contract

EDIT `apps/frontend/src/components/new-launch/store.ts`:

Add one atomic `applyAiText({expected, blocks})` action returning `{applied:true}` or `{applied:false, reason:'stale'|'invalid'}`. The local `expected` snapshot includes modal/session identity, scope, selected integration IDs, which overrides exist, and ordered IDs plus exact raw content for all source blocks. The server never receives this as authority. Validate complete response before mutation. Inside one Zustand state transaction, re-read and compare expected state; update live objects with `{...block, content:safeEditorHtml}`. Preserve IDs, delays, media objects including unmodeled metadata, global/other override arrays, settings/ref identity, date, tags, repeater, comments, and selection. If channel override is absent, create a clone of current global blocks and change only text in that transaction. Do not invoke the old `setPosts`, regenerate IDs, or toggle overrides.

EDIT `apps/frontend/src/components/new-launch/editor.tsx`:

Synchronize external value changes into Tiptap without remounting: compare current document/HTML, then documented Tiptap v3 `setContent(..., {emitUpdate:false})` signature after installed-source verification. Do not write again on ordinary typing when already equal; guard normalization equivalence to avoid caret resets or update loops. Preserve live typing/caret behavior; do not promise an undo-history behavior until tested. Use literal text document nodes or escaped paragraph HTML preserving newlines, then the existing sanitizer as appropriate. `<script>`/HTML-looking output is displayed as text, not executed. Rich-text/mention formatting may become plain text and is disclosed near the candidate.

Remove only the composer's obsolete Copilot `setPosts` action/readable and `CopilotPopup` instructions when the new assistant is integrated. Retain standalone Agents, global Copilot wrapper, image/video generators, and their endpoints unchanged.

## Inline chat, stale guards, and native save integration

NEW `apps/frontend/src/components/new-launch/ai.text.assistant.tsx` owns prompt/history/candidate/request sequence/AbortController; a separate SWR hook obtains capability with org-aware key and `useFetch` handles generation. Keep mounted during the modal lifetime or abort on actual unmount. Use existing form components and translations in `libraries/react-shared-libraries/src/translation/locales/en/translation.json`.

Suggested boundary:

```ts
type AiSubmissionIntent = 'write' | 'now' | 'schedule';
type AiTextAssistantProps = {
  disabled: boolean;
  canPublish: boolean;
  onBusyChange(busy: boolean): void;
  onApplyAndSubmit(candidate: Candidate, intent: 'now'|'schedule'): Promise<SubmitResult>;
};
```

`Candidate` contains safe blocks and the local source snapshot; publishing intent is stored separately from model content. The parent should own any state needed across panel visibility changes. Avoid a second source of draft truth: candidate is a proposal until atomic application; store stays authoritative.

EDIT `manage.modal.tsx` mounts the assistant and uses a separate `aiBusy`, never commandeering the existing media `locked`. While generation or final application/submission runs, disable duplicate AI/native submission but retain Cancel for generation. Use synchronous refs as well as rendered disabled states to prevent two events in the same tick.

Refactor the body of `schedule(type)` minimally into a single shared async submission routine, still called by the existing buttons and AI callback. Return a typed result (`accepted`, `validation-failed`, `cancelled`, `failed`, `unknown`) so chat can reflect the actual outcome. Wrap loading in try/finally. Preserve provider `getAllValues`, `/posts/valid`, settings/media/length checks, republish behavior, shortlink choice, date/tags/repeat fields, `/posts` POST, and current cache/modal completion behavior. Success means queued/accepted, not already published. Do not introduce new persistence, duplicate-post retry logic, or Temporal calls.

For AI publish intent, capture a full publication snapshot at the human action: selected channels, all effective content, ordered blocks/media/delays, live provider settings, date, tags/repeat, existing-post identity. Re-read live provider refs rather than trusting possibly stale stored settings. Any publication-affecting change while generating invalidates that intent; retain a candidate only if still safe for text-only review. Before Apply, compare the source snapshot and publication snapshot. After the atomic store change, wait for the React commit/editor synchronization using an explicit pending-submission effect or callback, then read provider values and verify they exactly contain the applied text. Do not call a stale render's `schedule` closure immediately after a store write and assume provider refs have rerendered. This commit bridge must have a regression test.

The shared save routine snapshots its payload and checks the publication signature again after awaited validation/republish/shortlink steps, immediately before `/posts`. If the form changed, abort with a visible “Draft changed. Review and submit again” result. Use a submission mutex and disable form editing during final submission where already supported, but do not rely on disabled visuals as the sole guard. Existing user-required republish/shortlink choices can still occur. Failure before or during validation leaves the newly applied draft available for correction; it must not claim publication or roll back unrelated newer edits. Network failure after POST may have an unknown outcome: do not auto-retry or offer a misleading one-click replay; ask the user to check the calendar and use existing refresh flow.

Cancel increments request sequence before aborting, clears only that request's busy state and never mutates draft. Abort on source text/order/scope/selected-channel change, modal close, or a superseding request. Ignore late completions even if abort races. Media/settings/date edits during plain Write may be preserved by text-only merge; for publish intent they invalidate the captured publication request. Check candidates again atomically at Apply. Reject all invalid output together.

## Three implementation tasks with clean ownership

### Task 1: authenticated OpenRouter generation and server tests

Own DTO, controller additions, PostsService additions, AiTextService, module registration, throttle guard, env sample, backend tests and shared root Jest harness. Deliver capability plus typed generation contract, owned-channel/provider settings/length logic, safe errors, timeout/cancel/rate/concurrency bounds. Mock provider and Redis. Never write posts. Define/export the contract first so the other tasks can compile independently. Do not modify frontend.

Tests: real DTO transformation/validation and controller guards using a narrow Nest test module; missing/blank key and 403; foreign/deleted/disabled channel; malicious/unknown fields; one provider call with exact OpenRouter/model/schema/no-tools bounds; malformed/refused/truncated/too-long response; Unicode/provider counting equivalence; no secrets in prompt/response/logs; rate/concurrency isolation/release; disconnect/timeout; no post/Temporal/media calls. Use provider stubs for generic behavior and targeted Instagram 2200/2201 and Threads 500/501 fixtures without actual accounts.

### Task 2: atomic draft text application and Tiptap sync

Own store action, editor synchronization/removal of old composer action/readable, and focused store/editor tests. Implement against agreed text-only contract; no network/UI panel work. Coordinate serialization behavior with Task 1; if a shared helper is needed, one owner creates it and the other imports it.

Tests: global and override application; absent override creation; preserve every non-text field/object identity; no partial mutation on invalid blocks; stale content, channel switch, selected-set changes, ordered ID changes/deletion with reused IDs; literal HTML/newlines/emoji; real editor displays external update; ordinary typing keeps caret and causes no echo loop. Compare full before/after fixture state, including media metadata/settings refs/date/repeater. Test editor mode constraints actually supported by the existing composer.

### Task 3: inline chat and explicit native publication integration

Own new assistant, ManageModal integration/removal of popup, translations, shared save result/mutex/commit bridge, frontend integration tests and feature documentation. Task 1 owns the shared root Jest harness. Reuse Tasks 1/2 contracts. Coordinate only interface changes; do not edit Task 1 server files or Task 2 editor/store body.

Tests: empty draft prompt and refinement of candidate; Write never saves; Apply/Discard; preselected now/schedule has visible channel/date summary and calls shared native validation/save exactly once; model text saying “publish” never changes intent; stale before/after editor commit/after validation aborts; correct content reaches `getAllValues` after Apply; required media/settings prevents save; schedule date preserved; republish/shortlink behavior; double submit; missing key/capability retry/503/403/timeout; cancel/retry late-response race; modal unmount; preserve other operation lock; ambiguous POST failure has no automatic retry. No real channels or provider calls.

## Test bootstrap and release gates

Root Jest imports missing Nx and there are no tracked test sources. Task 1 replaces the stale root Jest configuration with explicit node/backend and jsdom/frontend projects using already-declared Jest/ts-jest and the existing aliases. Test files live in tests/ai-text/. No Nx dependency or additional runner is added. Root pnpm test exercises all new tests. Task 1 owns package/config setup; later tasks add their own tests without changing the shared harness. Backend tests use only a narrow module or direct service dependencies; no AppModule, database, Redis, Temporal or outbound network is started. Prisma client generation is local code generation and must not push/reset/connect a database.

Use Node 22 satisfying >=22.12 <23 and pnpm 10.6.1 with frozen lock. Initial harness/setup belongs to Task 1, allowing all three tasks to use the same runnable test command. Resolve missing generated Prisma types without production .env or databases. Record baseline compile/lint defects separately.

Run focused tests; frontend typecheck; backend compile; changed-file root lint if baseline permits; `git diff --check`. After integration, perform an isolated headless-browser smoke with fake authenticated fixtures and mocked AI/social endpoints, desktop/mobile, actual editor display, cancellation, missing configuration and native validation/save interception. Do not control the user's browser or publish. If full route fixtures are impractical, use a narrow nonpublic test harness and explicitly state its coverage limit. No live OpenRouter check is required with absent key. Follow root requirement for a final independent agent review against existing patterns and security/stale-state paths.

Build/deploy remains separate: no production access, credentials, image publication, schema migration, `pm2-run`, Prisma db push, orchestrator workflow changes, or full upstream upgrade. Keep patch on v2.25.0. Fork main is 135 cached commits ahead and overlaps composer files; any later rebase requires a separate conflict/regression pass. A fork PR must use the existing template and exact `# QA` steps and must not falsely tick its no-AI-authorship statement.

## Evidence and confidence

Verified locally: exact baseline, existing state/editor/submission hooks, native ownership/validation path, missing Nx test configuration, generic-provider rules and instructions. OpenRouter endpoint/strict schema/support for default model are supplied as already verified by the parent; this task did not repeat online verification. Config, rate/input limits and UI scope are explicit design choices, not existing measured product behavior. SDK/Tiptap runtime compatibility, test execution, actual browser behavior and live key/model availability remain unverified until implementation checks.

Confidence: 93% in architecture and ownership split, based on repository/discovery evidence. Confidence: 85% in the proposed focused test bootstrap working without transformer adjustments; actual dependencies are absent. No runtime success or production readiness is claimed.


## Fixed application interfaces

Task 1 exports AiTextCapabilities, AiTextBlock, AiTextChannel, AiTextHistoryMessage, AiTextResponse and AiTextRequestDto from libraries/nestjs-libraries/src/dtos/posts/ai.text.dto.ts. Shared plainTextToPostHtml(text: string): string is added to the existing sanitize.post.content.ts utility and is used by generation length validation and draft application.

Task 2 exports AiTextSourceSnapshot and AiTextApplyResult from store.ts and adds captureAiTextSource(): AiTextSourceSnapshot and applyAiText(expected: AiTextSourceSnapshot, blocks: AiTextBlock[]): AiTextApplyResult to the store. A monotonically incremented aiTextSession identifies each reset so reopening an identical draft cannot accept an old result. The snapshot includes session, scope, editor, ordered selected IDs, override existence, and ordered source IDs/raw content.

Task 3 uses these interfaces. It owns a distinct publication snapshot of the complete native save inputs, and shares one native submission routine between current buttons and AI. It preserves the existing curried schedule(type) caller contract if refactoring return semantics. A submission result is accepted, validation-failed, cancelled, failed or unknown; accepted means queued, not published.
