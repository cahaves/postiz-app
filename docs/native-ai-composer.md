# Native composer AI writing

Configure `OPENROUTER_API_KEY` on the server. `OPENROUTER_MODEL` defaults to `openai/gpt-4.1-mini`; a replacement must support the strict structured response used by this endpoint. Credentials never belong in browser configuration. A configured capability only confirms that a key is present. It does not confirm valid credentials, credit, model availability, or provider delivery.

Open a post and select its channels. The inline AI writing panel works on the current shared text or channel version. It keeps a short conversation in the open composer only. Refinement uses the latest suggestion; the last six conversation messages are retained, each limited to 2,000 characters. Applying a suggestion replaces text formatting with plain text while preserving existing media, block order, delays, settings, tags, scheduling, and repeat settings. Applying to an inherited channel creates its separate text version. Global writing is unavailable when every selected channel has its own text version.

Choose the action before sending:

- **Write** produces a suggestion. Apply or discard it, or send another message to refine it. Words such as “publish now” in a message do not publish in Write mode.
- **Write & post now** generates and applies text, then uses the existing post validation and save flow for all selected channels.
- **Write & schedule** uses the existing date/time field, including its displayed UTC offset. AI does not choose the date or channels.

Use the normal post controls to publish already applied text without paying for another generation. Template/set and dummy-output modes offer Write only. Existing required media/settings, republish decisions, shortlinks, and repeat settings remain part of the native save flow. AI generates text only; it cannot create media or recurring fresh content.

Cancel or edit the source to invalidate an in-flight suggestion. Publication also checks all selected content, media, settings, tags, repeat, date, and edit identity across generation, editor commit, validation, and confirmation dialogs. A changed form requires review and another deliberate submission. Validation failures leave the generated draft available for correction.

An accepted save means queued, not already delivered to a social network. If a POST loses its response or returns a server error, its outcome may be unknown. The UI does not retry it automatically. Check the calendar before posting again to avoid duplicates.

Missing configuration, access denial, busy/rate limits, timeouts, invalid responses, and provider failures appear inline. Availability can be checked again after an administrator configures OpenRouter. Normal editing and native post controls remain available when AI is unavailable.

## Verification

Run with Node 22.12 through 22.x and pnpm 10.6.1:

```sh
pnpm test --runInBand
pnpm exec tsc --noEmit --incremental false -p apps/frontend/tsconfig.json
```

The backend tests use synthetic OpenRouter/provider/Redis fixtures and block network access. Frontend tests execute the assistant, store, Tiptap editor, native provider wrapper, and ManageModal save flow, with unrelated app contexts and peripheral UI replaced by fixtures. They cover stale requests, metadata changes during generation/application/validation/dialogs, duplicate submission, validation failures, republish/update choices, unknown outcomes, and old responses after modal reset.

`tests/ai-text/browser/smoke.cjs` builds a temporary local fixture using installed dependencies, starts a server bound to `127.0.0.1`, and runs an isolated headless Chromium context in `Asia/Kuala_Lumpur`. It blocks nonlocal network access, intercepts every AI/post request with synthetic data, writes desktop/mobile screenshots, and closes the browser/server in `finally`. Its Playwright runtime, Chromium executable, and evidence directory are explicit local paths in the script and need adjustment on another workstation.

The browser fixture runs the real ManageModal, assistant, Tiptap, store, and `withProvider` implementation. The channel registry, auth/context responses, media UI, calendar picker, tags/repeat widgets, and social preview are synthetic. This is component integration QA, not a full authenticated app-route test or a live model/social publication test. No secret, database, production account, or social service is needed.
