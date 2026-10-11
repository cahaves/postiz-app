# Native AI Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Cahaves ask OpenRouter to write/refine posts directly in the Postiz form and explicitly publish or schedule the generated result through native Postiz validation.

**Architecture:** An authenticated, bounded content-only endpoint resolves organization-owned channel constraints and requests structured text from OpenRouter. An atomic store action safely applies text, while an inline assistant handles conversation and calls the existing save path for a user-selected publication action.

**Tech Stack:** Existing NestJS, Prisma lookup services, Redis, OpenAI-compatible SDK, React 19, Zustand, Tiptap 3, SWR, Tailwind 3, Jest/ts-jest; Node 22 and pnpm 10.6.1.

**Spec:** docs/superpowers/specs/2026-10-11-native-ai-composer-design.md

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
- This update has no recurring generation, new image generation, database migration, Temporal workflow change or real social/AI call during tests. The user's later steering authorizes the separate production deployment follow-up below.
- Verification uses meaningful provider-mocked tests and an isolated headless browser; never access the user's browser or its profiles/cookies.

## Review Focus

- A late response after edits, channel changes, modal reset or a second request must not overwrite current content or publish an old draft.
- Empty/invalid provider configuration, unauthorized channels or unavailable Redis must fail before paid work and return useful errors without secrets.
- Multi-byte text, malformed model output and markup-looking text must use the same safe length/serialization rules as the native editor and publish validation.
- Automatic post/schedule must read committed generated text and current validated settings/media; generation alone and model-suggested actions never save a post.
- A timeout after the final post request has an unknown outcome: preserve the draft and direct the user to check the calendar, with no blind retry.

## Execution and workspace

The user explicitly requested implementation and sub-agents. Execute this plan sequentially with one fresh implementer and a fresh task reviewer after each task, then a whole-branch reviewer. Discovery agents may run in parallel; implementers share this isolated worktree and must not run concurrently.

Branch: codex/native-ai-composer, based on installed v2.25.0. GitHub fork main is 135 commits ahead and overlaps the composer. Create a separate codex/cahaves-v2.25 base branch when preparing the fork PR so the reviewed patch contains only this feature and does not silently upgrade/revert unrelated upstream changes.

Initial setup: dependencies installed from the frozen lock with lifecycle scripts suppressed, verified Node 22 downloaded into a gitignored local runtime. Use the configured Node 22 process environment for pnpm commands. No real .env is copied. Generate Prisma client locally if required, without database commands.

---

### Task 1: Authenticated OpenRouter writing and executable server tests

**Files:**
- Create: libraries/nestjs-libraries/src/dtos/posts/ai.text.dto.ts
- Create: libraries/nestjs-libraries/src/openai/ai.text.service.ts
- Modify: apps/backend/src/api/routes/posts.controller.ts
- Modify: libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts
- Modify: apps/backend/src/api/api.module.ts and libraries/nestjs-libraries/src/database/prisma/database.module.ts only as injection requires
- Modify: libraries/nestjs-libraries/src/throttler/throttler.provider.ts
- Modify: libraries/helpers/src/utils/sanitize.post.content.ts
- Modify: .env.example, jest.config.ts, jest.preset.js
- Create: tests/ai-text/backend.spec.ts, tests/ai-text/jest.backend.config.cjs, tests/ai-text/jest.frontend.config.cjs and shared test-only setup as required

**Interfaces:**
- Consumes: org from GetOrgFromRequest, IntegrationService.getIntegrationById(orgId,id), provider maxLength/DTO, stripHtmlValidation/countLength, existing Redis client and throttler storage.
- Produces: GET /posts/ai-text/capabilities and POST /posts/ai-text with the exact contract below; exported DTO/types; plainTextToPostHtml(text: string): string; a runnable root Jest harness.

```ts
export interface AiTextCapabilities { configured: boolean; reason?: 'missing-provider-key'; }
export interface AiTextBlock { id: string; content: string; }
export interface AiTextChannel { integrationId: string; settings: Record<string, unknown>; }
export interface AiTextHistoryMessage { role: 'user' | 'assistant'; content: string; }
export interface AiTextResponse {
  blocks: AiTextBlock[];
  limits: { integrationId: string; maximumCharacters: number | null;
    counts: { id: string; count: number }[] }[];
}
// AiTextRequestDto validates instruction, channels, blocks and history.
// PostsService.aiTextCapabilities(): AiTextCapabilities
// PostsService.generateAiText(orgId: string, dto: AiTextRequestDto,
//   signal?: AbortSignal): Promise<AiTextResponse>
```

- [x] **Step 1: Establish the runnable test harness and observe failing feature behavior.** Replace missing-Nx setup with two explicit existing-Jest projects; use Node for server tests and jsdom for frontend. Resolve aliases from tsconfig.base.json, support decorators and JSX, stub only external providers/storage, and fail unexpected outbound network. Record the existing root-test failure before changing the harness. Add actual DTO/route/service tests before feature implementation, including this behavior:

```ts
it('returns configuration unavailable without a provider request', async () => {
  delete process.env.OPENROUTER_API_KEY;
  expect(postsService.aiTextCapabilities()).toEqual({
    configured: false, reason: 'missing-provider-key',
  });
  await expect(postsService.generateAiText('org-a', validRequest))
    .rejects.toMatchObject({ response: { code: 'AI_NOT_CONFIGURED' } });
  expect(providerRequests).toEqual([]);
});
```

The test fixture is a supplied owned normal-editor channel, one block id block-a, empty source, instruction Write a launch caption, no history, settings supplied by that provider. Mock provider transport only; real DTO validation and service orchestration remain active. Run pnpm test --runInBand and record the expected missing-feature failure.

- [x] **Step 2: Implement DTO, capability and scoped channel/constraint orchestration.** Strict local ValidationPipe whitelists nested request fields and rejects unknown fields; enforce all Global Constraints bounds, uniqueness and settings depth/byte limits. Apply AI entitlement to both routes. Resolve every integration by authenticated org; reject foreign, deleted, disabled or unsupported context before the provider call. Validate allowed current provider settings without requiring media for generation. Derive limits generically; never send raw Prisma rows/settings/keys to the model. Add plainTextToPostHtml to the existing sanitizer utility, preserving line breaks and escaping literal markup; use it for native countLength equivalence.

- [x] **Step 3: Implement one bounded native OpenRouter call and cost controls.** Use existing OpenAI SDK with the fixed OpenRouter base URL, lazy nonblank key, configurable model, strict JSON schema matching the ordered requested block IDs, require_parameters true, timeout/retries/token limits from Global Constraints and no tools. Runtime-validate complete response, finish reason/refusal, ordered IDs, blank/size/length conditions. Add actual organization-keyed route throttling, token-owned Redis lease, disconnect abort and finally release; fail closed for storage errors. Map configuration, key/credits, rate, timeout, refusal, unavailable and malformed-output failures to curated code/message errors. No raw provider logging. Document env fields with empty key and the default model; leave current OpenAI/image/video/agent clients unchanged.

- [x] **Step 4: Prove boundaries with real validation and provider-mocked tests.** Cover malicious/unknown fields, source/history budgets, missing/foreign/deleted/disabled channels, API key omission from prompt/response, one request/no tools/no retries, OpenRouter exact body and configuration, refusal/truncation/invalid/duplicate/reordered IDs, plain markup/newlines, native unicode length (2200/2201 and 500/501), independent org quota, concurrent requests, owned lease release after abort/error/expiry, and storage outage. Assert no posts/Temporal/media calls occur. Tests must verify output and side effects, not source strings or mock presence.

- [x] **Step 5: Run the full new suite and backend build, commit and report.** Run pnpm test --runInBand, pnpm --filter ./apps/backend build where baseline permits, and git diff --check. Report any baseline compile/config defects by exact error. Commit only owned files, write TDD RED/GREEN evidence and test commands/results to the task report, then request the controller's task review. No pushes/servers/agents from the implementer.

### Task 2: Atomic draft application and visible editor updates

**Files:**
- Modify: apps/frontend/src/components/new-launch/store.ts
- Modify: apps/frontend/src/components/new-launch/editor.tsx
- Create: tests/ai-text/store.spec.ts and tests/ai-text/editor.spec.tsx
- Create: tests/ai-text/jsdom.environment.cjs (scoped optional-canvas fallback for text-only tests)
- Modify: tests/ai-text/jest.frontend.config.cjs (test-only environment selection)

**Interfaces:**
- Consumes: AiTextBlock type and plainTextToPostHtml from Task 1; current launch store and normal editor.
- Produces: AiTextSourceSnapshot/AiTextApplyResult plus store captureAiTextSource/applyAiText, and safe external Tiptap synchronization.

```ts
export interface AiTextSourceSnapshot {
  session: number;
  scope: string;
  editor: StoreState['editor'];
  selectedIntegrationIds: string[];
  internalExists: boolean;
  blocks: { id: string; content: string }[];
}
export type AiTextApplyResult =
  | { applied: true }
  | { applied: false; reason: 'stale' | 'invalid' };
// captureAiTextSource(): AiTextSourceSnapshot
// applyAiText(expected: AiTextSourceSnapshot, blocks: AiTextBlock[]): AiTextApplyResult
```

- [x] **Step 1: Read installed Tiptap source/docs and write failing store/editor tests.** Read Next use-client/client component docs and Tiptap setContent implementation. Keep the supported hook-based editor API because it is an existing component. Seed an actual store with two selected channels, source blocks, delays, media with alt/thumbnail metadata, tags/date/repeater and provider refs. The critical regression assertion is:

```ts
const expected = useLaunchStore.getState().captureAiTextSource();
const before = useLaunchStore.getState();
const result = useLaunchStore.getState().applyAiText(expected, [
  { id: 'block-a', content: 'New caption\nSecond line' },
]);
expect(result).toEqual({ applied: true });
expect(useLaunchStore.getState().global[0]).toEqual({
  ...before.global[0], content: '<p>New caption</p><p>Second line</p>',
});
expect(useLaunchStore.getState().global[0].media).toBe(before.global[0].media);
expect(useLaunchStore.getState().selectedIntegrations).toBe(before.selectedIntegrations);
```

Run focused tests via pnpm test --runInBand --testPathPattern='store|editor' and capture expected failure before implementation.

- [x] **Step 2: Add one atomic apply action and monotonically incremented modal session.** Capture scope/editor/full ordered selected IDs, override presence and ordered source IDs/raw text. Compare the live state in one Zustand update. Reject all invalid output together and return stale/invalid without mutation. On success map current live blocks with object spread and change content only; clone inherited global blocks into a new specific override once when needed, without toggling other overrides. Preserve all unrelated state and object identities. Increment aiTextSession on reset so old requests never match a reopened draft.

- [x] **Step 3: Synchronize external text into the real editor and retire unsafe composer Copilot action.** Use the documented Tiptap setContent option emitUpdate:false only when value differs from the editor's current representation, with effect dependencies preventing reapplication on ordinary rerenders. Preserve visible state and caret during typing; do not remount via replacement IDs. Remove the old composer's setPosts/readable only, leaving native standalone agent/AI media unchanged.

- [x] **Step 4: Cover stale/invalid applications and real editor behavior.** Test global/override/inherited scope, changed text/current scope/selected channels/order, duplicate/missing/extra IDs, deletion with reused IDs, modal reset and all-or-none mutation. Preserve current media/settings/date changes on text-only apply. Render the actual editor and verify applied literal markup/newlines are visible as text, external update does not emit an echo loop, and ordinary typing keeps caret. Do not assert a mocked editor's existence.

- [x] **Step 5: Run root suite and scoped typing checks, commit and report.** Run pnpm test --runInBand, the relevant frontend TypeScript check and git diff --check. Record pre-existing errors separately. Commit owned files only, write RED/GREEN evidence/report, and await controller review before Task 3.

### Task 3: Inline conversation and explicit native publish/schedule integration

**Files:**
- Create: apps/frontend/src/components/new-launch/ai.text.assistant.tsx
- Modify: apps/frontend/src/components/new-launch/manage.modal.tsx
- Modify: libraries/react-shared-libraries/src/translation/locales/en/translation.json
- Create: tests/ai-text/assistant.spec.tsx and tests/ai-text/publication.spec.tsx
- Create: tests/ai-text/browser fixture and headless smoke entry only as verification needs
- Modify: README.md or scoped feature documentation with setup and QA

**Interfaces:**
- Consumes: Task 1 API/types/helper; Task 2 atomic store and editor behavior; native provider refs and existing schedule(type) operation.
- Produces: inline assistant, explicit Write/Post now/Schedule controls, full publication snapshot/React commit bridge, and typed native submission results.

```ts
export type AiSubmissionIntent = 'write' | 'now' | 'schedule';
export type AiSubmissionResult =
  | { status: 'accepted' }
  | { status: 'validation-failed' | 'cancelled' | 'failed' | 'unknown' };
// Candidate = { source: AiTextSourceSnapshot; response: AiTextResponse }
// Native parent callback captures/rechecks a full publication snapshot,
// applies candidate, waits for the committed editor/provider state, and
// invokes the existing native schedule(intent) operation exactly once.
```

- [x] **Step 1: Write failing native assistant and publication regression tests.** Use real store and assistant/component integration with mocked API only. A Write request may contain the word publish but must not save. A preselected Post now request must produce generated content in the final native payload after editor commit, not the previous text. A rejected provider or missing media/settings must never call final /posts. Test the exact requested schedule date and a changed draft after awaited validation. Run pnpm test --runInBand --testPathPattern='assistant|publication' and record expected failures.

- [x] **Step 2: Add an accessible inline conversation using existing UI controls.** Insert below SelectCurrent and above EditorWrapper. Prompt, bounded modal-local user/assistant history, plain-text candidate preview, Apply/Discard and further refinement all use current scope; disclose text-only formatting and which channels final native save affects. Use a separate SWR capability hook and authenticated useFetch. Missing key, capability retry, 403, provider error, timeout and invalid result are useful inline states. Publish modes are labelled before request and use native date/time; disable them for template/set modes. Model content never supplies intent/date/channels. Remove the superseded composer CopilotPopup only.

- [x] **Step 3: Implement cancellation, stale guards and one native submission bridge.** Abort/invalidate old sequence on Cancel, source/scope/selection changes, unmount and superseding requests; ignore late completion. Use separate aiBusy plus synchronous mutex, leaving existing media locked ownership intact. Capture full live provider values/settings/media/date/tags/repeat/edit identity at the trusted publication action. Any change invalidates that publication. Apply atomically, wait for the React commit, then verify provider refs contain the applied text. Share the same native save routine with current buttons; retain validation, republish/shortlink choices and native settings/date/repeat payload. Recheck after asynchronous dialogs/validation before POST. Finally release loading on all branches. Expose accepted/blocked/error/unknown accurately; never report queued as already published and never blindly retry unknown POST outcomes.

- [x] **Step 4: Prove complete UX and native-save safety.** Cover blank prompt, empty draft, candidate refinement, Apply/Discard, inherited override disclosure, no applicable global channels, missing key/retry, cancellation races, stale apply/pub snapshots, editor commit regression, correct date, provider-required media/settings, generation without publication, explicit publication exactly once, double submit, republish/shortlink behavior and unknown-save outcome. Every network response fixture is synthetic; no real AI or social request is permitted.

- [x] **Step 5: Verify in an isolated headless browser and run final checks.** Exercise the actual assistant/editor and publication integration as far as possible with fake authenticated fixtures/API interception at desktop and mobile widths. Verify visible applied text, keyboard/error/cancel states and blocked missing media. Record any narrow harness limitation accurately. Run pnpm test --runInBand, frontend TypeScript/build and backend build as appropriate, changed-file root lint and git diff --check. Fix failures caused by this feature; list any baseline failure by name.

- [x] **Step 6: Commit, document setup and report.** Document OPENROUTER_API_KEY and configurable model, the three actions, text/media distinction, queued status and unknown-outcome behavior. Commit only owned files. Write complete RED/GREEN and browser evidence plus concerns to the report; leave production untouched and let controller run final independent review.

## Final integration and GitHub handoff

**User steering, 11 October 2026:** Refi requested direct updates to the Cahaves fork, no PR, followed by deployment to Cahaves Primary while retaining current credentials. This supersedes the earlier PR and code-only handoff below. Complete and independently review Tasks 1–3 first, then use the deployment follow-up. Do not merge or reset the newer upstream-based main branch; deploy the reviewed v2.25-based Cahaves feature branch.

- [x] Resolve each task review and collect final review package from the immutable v2.25 baseline to HEAD.
- [ ] A fresh whole-branch reviewer checks native patterns, organization/secret boundaries, state synchronization and publication race handling against the spec.
- [ ] Run covering tests for every final fix; run root suite once after integrated changes and record limitations without claiming real OpenRouter/provider publication.
- [ ] Push the reviewed codex/native-ai-composer directly to the user's Cahaves fork. The stable v2.25 base already exists. Create no PR, as explicitly requested in the later steering.
- [ ] Preserve source/worktree and meaningful evidence. Execute only the authorized Postiz deployment follow-up; never run schema push/reset/migration or merge/reset the newer fork main.

## Authorized deployment follow-up

### Task 4: Cahaves image packaging

Own only `Dockerfile.cahaves`, `var/docker/cahaves-start.sh`, `.github/workflows/cahaves-container.yml`, `.dockerignore`, and scoped deployment documentation. Follow the existing Postiz Docker/Nginx/PM2 composition. Use a GitHub-hosted native AMD64 builder instead of the memory-constrained Primary. Build from the reviewed fork commit with the frozen pnpm lock, existing Node 22 runtime and existing dependencies. Export an immutable `cahaves/postiz-app:native-ai-<commit>` Docker archive with a SHA256 checksum, OCI revision/source metadata and one-day artifact retention. The current GitHub token lacks package-read scopes and a newly published GHCR package is private, so deliver through the authorized repository artifact download instead of adding registry credentials. Never target upstream's registry or change existing upstream workflows. Keep every runtime secret out of build context and logs.

- [x] Add a Cahaves startup that starts the existing frontend/backend/orchestrator PM2 scripts and Nginx, without `prisma-db-push`, reset or schema migrations. Existing schema stays unchanged.
- [x] Add a scoped push-triggered image workflow for `codex/native-ai-composer`, with minimum job permissions and no production credentials. Validate packaging syntax; the actual Linux build remains a rollout gate below.
- [ ] Review the packaging diff and include it in the whole-branch review before pushing the final build commit.

### Task 5: Primary rollout and verification

- [ ] Snapshot sanitized container metadata and privately back up the existing server Compose/environment/access configuration, application/Temporal databases, and media. Verify the backup before replacement.
- [ ] Preserve the exact JWT encryption key, database/Redis/Meta credentials, existing connected-channel rows, persistent volumes, domain, access gate and provider scope. Update only the Postiz image and add OpenRouter environment mappings. If the OpenRouter key is absent, report that accurately and continue deploying the built feature.
- [ ] Download and verify the immutable AMD64 archive, transfer and load it on Primary, validate Compose without printing expanded secrets, and recreate only Postiz with `--no-deps`. Retain the previous image and configuration for immediate rollback.
- [ ] Verify application/backend/orchestrator health, trusted HTTPS, retained connected-channel metadata and private equality checks for credentials. Compare unrelated container IDs/start/restarts/OOM/health against the pre-rollout snapshot.
- [ ] Use a fresh isolated headless context only. Verify the deployed assistant with normal authentication where credentials are available, or report the signed-in limitation. Do not publish/schedule a real post or modify channel credentials during verification.
- [ ] Record deployed source commit, image identity, health, key-configuration status, backup/rollback locations and any limits; push directly to the Cahaves fork and create no PR.

## Review and verification record before image build

Tasks 1 and 2 were approved after their scoped reviews. Task 3 had one reproduced live provider-settings race during AI application; the fix retains and compares the original complete provider snapshot and was independently approved. The full suite now has 140 passing tests. Task 4 had two confirmed packaging findings: excluding the committed credential-free pnpm configuration conflicted with the frozen lock, and the old-image rollback command needed an explicit schema-safe override. Both were fixed and independently approved. No Critical or Important task-review finding remains.

Root final covering checks on the integrated source passed on 11 October 2026: `pnpm test --runInBand` (5 suites, 140 tests, exit 0) and the default Next 16.3.1 Turbopack production frontend build (exit 0 in a sanitized key-free environment). Earlier frontend TypeScript/backend production builds and synthetic isolated desktop/mobile browser checks passed. The browser fixture substitutes authentication/provider registry/media/date widgets; it does not prove live AI or social delivery. The pre-existing root ESLint FlatCompat circular React configuration failure is independently reproduced on pristine v2.25 and remains disclosed.

The live original-image Prisma schema and reviewed source have identical SHA256 `ed42d458e0ea3aef767b589220153474bd3eea3b1fd353291ab97caf1d1954f0`. The current deployment has two connected channels and matching private credential fields. OpenRouter is absent; the user was asked for a private key file path while deployment preparation continues. Linux image build, production rollout and real model/social delivery are not yet claimed.

## Implementation rulings and trade-offs

1. Execute the concrete plan under the user's explicit request for code, a plan and sub-agents, without a duplicate implementation-permission prompt. Wrong scope would require a reversible revision.
2. Reuse native Postiz controls in its separate fork; Cahaves umbrella HeroUI/shared-design instructions are local to the other repository. Wrong scope interpretation would require swapping the new controls.
3. Keep the installed v2.25 baseline because the fork's main is 135 commits ahead and changes the composer. A different baseline requires rebase and regression work.
4. Put the executable Jest foundation in Task 1, avoiding a later-task dependency cycle and repairing the existing missing-Nx bootstrap. A wrong harness choice requires configuration repair.
5. Use a test-only constructor-scoped optional-canvas fallback for jsdom, restore the original dependency, and leave production dependencies untouched. A wrong choice requires test-environment repair; canvas behavior is not covered.
6. Follow the later instruction to push directly and deploy the reviewed feature branch, with no PR and no reset of newer main. A different integration preference requires a later branch merge/rebase.
7. Build on a separate native AMD64 runner and bypass the default startup's schema push, preserving the data and previous image. Incorrect packaging requires image repair or application rollback.
8. Deliver a checksummed one-day repository artifact because existing GitHub credentials lack package-read scopes and new GHCR packages default private. A delivery problem requires a build/download retry; no registry permission expansion is introduced.
