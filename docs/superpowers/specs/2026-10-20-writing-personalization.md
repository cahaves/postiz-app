# Research-informed writing preferences

The native composer assistant should use a saved workspace voice for Indonesian and English Instagram and Threads drafts. Refi requested actual public-post research, editable personalization, and direct commits to the Cahaves fork without a PR. Existing publication choices remain explicit in the composer.

Public engagement is evidence to inspect, not a score to optimize blindly. Research records canonical URLs, observation dates, visible metrics and their limits. Higher reply counts can include author replies, complaints and repeated promotions. The initial voice is therefore a provisional editorial choice: friendly, specific and useful; introduce a product when it addresses the supplied problem. It is not a claim of engagement lift.

## Behavior

- Save one writing profile per organization, read through the authenticated application only. Admins can edit; authorized AI users can read and generate with it.
- Fields: `language` (`auto`, `id`, `en`), `tone` (`friendly`, `professional`, `casual`), `brandName` (100 characters), `audience` (1000), `brandFacts` (3000), `voiceNotes` (2000), and up to five `examples` (1200 characters each). Defaults are auto language, friendly tone and empty brand fields/examples.
- The profile response is `{ profile, revision }`. Missing profiles have revision zero. Saving requires the expected revision, returns the incremented revision, and rejects stale updates with HTTP 409. Unknown fields and invalid/oversized content are rejected.
- Brand facts are user-supplied context. Examples guide phrasing only; never import another author's revenue, testimonials, personal experience, identity or product claims. Keep facts grounded in the current brief and saved facts. No social scraping or fine-tuning runs on generation.
- Current writing instructions take precedence over examples, saved style and research defaults, subject to the system's fact, format and action constraints.
- Indonesian: readable conversational language, preserve established pronouns, allow useful technical English, no imposed gue/lu, regional identity or fixed English percentage. English: concrete everyday language, restrained promotion, no invented founder story or compulsory hook.
- Threads: a self-contained thought, relevant product detail and an optional question only when an answer is useful. Instagram: context for supplied media; never invent unseen visuals, or request swipes/watch actions without supplied context. Replies answer the actual comment first without unrelated promotion or fabricated staff signatures.
- Provider-specific guidance lives on the existing social-provider interface and provider implementations. Generic services do not branch on platform names. Existing server character limits remain authoritative.
- Keep strict JSON response validation, bounded input, organization ownership checks, cancellation and publication safeguards. Never send integration credentials or account settings to the model.

## Interface and persistence

Use native Postiz Input, Textarea, Select and Button controls in an expandable Writing preferences section inside AI writing. Explain that preferences are shared and examples guide future drafts. Save explicitly; show loading, failure, stale-edit and saved states. Generation waits for preferences to load and for unsaved edits to be saved or discarded. Editing or saving a profile clears stale suggestions and conversation context. Generation includes the displayed writingProfileRevision; a mismatch returns HTTP 409 before calling the model and forces a fresh profile load. A profile/workspace/readiness change also cancels pending publication validation. Non-admins see the saved profile read-only.

Use a separate `AiWritingProfile` Prisma model keyed by organizationId, with JSON profile, revision and updatedAt. Add only its optional organization relation, with cascading delete. Existing organization read shapes and public API/MCP responses are not extended. Follow DTO, controller, service and repository layers. Database preparation is additive and must not use accept-data-loss.

## Delivery and verification

Implement in the existing main worktree. First reconcile the previously deployed native-AI branch with fork main and verify the conflict resolution. Test profile bounds, tenant isolation, admin policy, concurrency, prompt data isolation, frontend save/failure/unsaved states and unchanged publishing safeguards. Run type checks, builds and separate headless browser checks. Obtain a fresh pattern/security review. Commit and push only this task's work to origin/main; do not create a PR. Preserve production credentials and volumes if rolling out. A source push alone must not be described as a live deployment.
