'use client';

import React, { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import {
  postContentPlainText,
  sanitizePostContent,
} from '@gitroom/helpers/utils/sanitize.post.content';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { Textarea } from '@gitroom/react/form/textarea';
import { Select } from '@gitroom/react/form/select';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { AiTextSourceSnapshot, useLaunchStore } from './store';
import {
  AiWritingPreferences,
  WritingPreferencesState,
} from './ai.writing.preferences';
import type {
  AiTextCapabilities,
  AiTextResponse,
  AiTextHistoryMessage,
} from '@gitroom/nestjs-libraries/dtos/posts/ai.text.dto';

export type AiSubmissionIntent = 'write' | 'now' | 'schedule';
export type AiSubmissionResult = {
  status: 'accepted' | 'validation-failed' | 'cancelled' | 'failed' | 'unknown';
};
export type AiTextCandidate = {
  source: AiTextSourceSnapshot;
  response: AiTextResponse;
};

const useAiTextCapabilities = () => {
  const fetch = useFetch();
  const user = useUser();
  return useSWR<AiTextCapabilities>(
    ['ai-text-capabilities', user?.orgId],
    async () => {
      const response = await fetch('/posts/ai-text/capabilities');
      if (!response.ok)
        throw new Error(
          response.status === 403 ? 'AI_ACCESS_DENIED' : 'AI_UNAVAILABLE'
        );
      return response.json();
    },
    { shouldRetryOnError: false, revalidateOnFocus: false }
  );
};

export const AiTextAssistant = ({
  disabled,
  canPublish,
  onBusyChange,
  capturePublication,
  onApplyAndSubmit,
}: {
  disabled: boolean;
  canPublish: boolean;
  onBusyChange: (busy: boolean) => void;
  capturePublication: () => Promise<string>;
  onApplyAndSubmit: (
    candidate: AiTextCandidate,
    intent: 'now' | 'schedule',
    expected: string,
    signal: AbortSignal
  ) => Promise<AiSubmissionResult>;
}) => {
  const t = useT();
  const fetch = useFetch();
  const capability = useAiTextCapabilities();
  const user = useUser();
  const [profileReload, setProfileReload] = useState(0);
  const [writing, setWriting] = useState<WritingPreferencesState>({
    orgId: undefined,
    ready: false,
    dirty: false,
    revision: undefined,
  });
  const state = useLaunchStore();
  const channels = state.selectedIntegrations.filter(({ integration }) =>
    state.current === 'global'
      ? !state.internal.some((item) => item.integration.id === integration.id)
      : integration.id === state.current
  );
  const sourceKey = JSON.stringify({
    source: state.captureAiTextSource(),
    channels: channels.map(({ integration }) => integration.id),
    organizationId: user?.orgId,
    writingRevision:
      writing.orgId === user?.orgId ? writing.revision : undefined,
    writingDirty: writing.dirty,
  });
  const writingContext = JSON.stringify({
    organizationId: user?.orgId,
    profileOrganizationId: writing.orgId,
    revision: writing.revision,
    ready: writing.ready,
    dirty: writing.dirty,
  });
  const [prompt, setPrompt] = useState('');
  const [intent, setIntent] = useState<AiSubmissionIntent>('write');
  const [history, setHistory] = useState<AiTextHistoryMessage[]>([]);
  const [candidate, setCandidate] = useState<AiTextCandidate>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const active = useRef<AbortController | undefined>(undefined);
  const submitting = useRef(false);
  const previousSession = useRef(state.aiTextSession);
  const previousWritingContext = useRef(writingContext);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  const cancel = () => {
    sequence.current++;
    active.current?.abort();
    active.current = undefined;
    submitting.current = false;
    setBusy(false);
    busyCallback.current(false);
  };
  useEffect(() => {
    const preferencesChanged =
      previousWritingContext.current !== writingContext;
    const wasSubmitting = submitting.current;
    if (
      !submitting.current ||
      previousSession.current !== state.aiTextSession ||
      preferencesChanged
    ) {
      cancel();
      setCandidate(undefined);
      setHistory([]);
    }
    if (preferencesChanged && wasSubmitting) {
      setMessage(
        t(
          'ai_profile_changed_during_save',
          'Writing preferences changed while saving. Check the calendar before posting again.'
        )
      );
    }
    if (previousSession.current !== state.aiTextSession) {
      setMessage('');
      setError('');
      setPrompt('');
      setIntent('write');
    }
    previousSession.current = state.aiTextSession;
    previousWritingContext.current = writingContext;
  }, [sourceKey, writingContext]);
  useEffect(
    () => () => {
      sequence.current++;
      active.current?.abort();
      busyCallback.current(false);
    },
    []
  );

  const names = state.selectedIntegrations
    .map(({ integration }) => integration.name)
    .join(', ');
  const unavailable =
    disabled ||
    !!capability.error ||
    !capability.data?.configured ||
    writing.orgId !== user?.orgId ||
    !writing.ready ||
    writing.dirty ||
    !channels.length;
  const label =
    intent === 'now'
      ? t('ai_write_now', 'Write & post now')
      : intent === 'schedule'
      ? t('ai_write_schedule', 'Write & schedule')
      : t('ai_write', 'Write');

  const send = async () => {
    if (active.current || unavailable) return;
    if (!prompt.trim()) {
      setError(t('ai_prompt_required', 'Enter a message first.'));
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    const request = ++sequence.current;
    const source = state.captureAiTextSource();
    const action = canPublish ? intent : 'write';
    const instruction = prompt.trim();
    setBusy(true);
    onBusyChange(true);
    setError('');
    setMessage('');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const publication = action !== 'write' ? await capturePublication() : '';
      if (request !== sequence.current) return;
      timeout = setTimeout(() => controller.abort(), 35000);
      const response = await fetch('/posts/ai-text', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({
          instruction,
          writingProfileRevision: writing.revision,
          blocks:
            candidate?.response.blocks ||
            source.blocks.map((block) => ({
              ...block,
              content: postContentPlainText(
                sanitizePostContent(block.content).replace(
                  /<br\s*\/?>|<\/(?:p|li|h[1-3])>/gi,
                  '\n'
                )
              ).trimEnd(),
            })),
          channels: channels.map(({ integration, settings, ref }) => {
            const {
              __type,
              active_thread_finisher,
              thread_finisher,
              ...safeSettings
            } = ref?.current?.getValues()?.settings || settings || {};
            return { integrationId: integration.id, settings: safeSettings };
          }),
          history: history.slice(-6),
        }),
      });
      clearTimeout(timeout);
      if (request !== sequence.current || controller.signal.aborted) return;
      if (!response.ok) {
        if (response.status === 409) {
          setWriting((previous) => ({ ...previous, ready: false }));
          setProfileReload((previous) => previous + 1);
          setCandidate(undefined);
          setHistory([]);
        }
        const messages: Record<number, string> = {
          403: t(
            'ai_access_denied',
            'Your account does not have access to AI writing.'
          ),
          429: t(
            'ai_busy',
            'AI writing is busy or at its request limit. Try again shortly.'
          ),
          409: t(
            'ai_profile_changed',
            'Writing preferences changed. Review the reloaded preferences and try again.'
          ),
          504: t('ai_timeout', 'AI writing timed out. Try again.'),
          503: t(
            'ai_unavailable',
            'AI writing is unavailable. Ask your administrator to check OpenRouter.'
          ),
        };
        throw new Error(
          messages[response.status] ||
            t(
              'ai_request_failed',
              'Could not generate text. Check your channel settings and try again.'
            )
        );
      }
      const result: AiTextResponse = await response.json().catch(() => null);
      if (request !== sequence.current || controller.signal.aborted) return;
      if (
        !result ||
        !Array.isArray(result.blocks) ||
        result.blocks.length !== source.blocks.length ||
        result.blocks.some(
          (block, index) =>
            !block ||
            Object.keys(block).length !== 2 ||
            block.id !== source.blocks[index].id ||
            typeof block.content !== 'string' ||
            !block.content.trim()
        ) ||
        result.blocks.reduce((sum, block) => sum + block.content.length, 0) >
          20000
      ) {
        throw new Error(
          t(
            'ai_invalid_result',
            'AI returned an invalid result. Your draft has not changed.'
          )
        );
      }
      const next = { source, response: result };
      setCandidate(next);
      setHistory(
        [
          ...history,
          { role: 'user' as const, content: instruction.slice(0, 2000) },
          {
            role: 'assistant' as const,
            content: result.blocks
              .map((block) => block.content)
              .join('\n')
              .slice(0, 2000),
          },
        ].slice(-6)
      );
      setPrompt('');
      if (action !== 'write') {
        submitting.current = true;
        const outcome = await onApplyAndSubmit(
          next,
          action,
          publication,
          controller.signal
        );
        if (request !== sequence.current) return;
        setCandidate(undefined);
        const messages = {
          accepted: t(
            'ai_accepted',
            'Save accepted. Check the calendar for its status.'
          ),
          'validation-failed': t(
            'ai_validation_failed',
            'Text applied. Fix the channel settings or media, then use the normal post controls.'
          ),
          cancelled: t(
            'ai_draft_changed',
            'Draft changed or submission cancelled. Review it before submitting again.'
          ),
          failed: t(
            'ai_save_failed',
            'Could not save. Review the draft and channel settings.'
          ),
          unknown: t(
            'ai_save_unknown',
            'Save status is unknown. Check the calendar before posting again to avoid duplicates.'
          ),
        };
        setMessage(messages[outcome.status]);
      }
    } catch (reason) {
      if (request === sequence.current)
        setError(
          controller.signal.aborted
            ? t('ai_timeout', 'AI writing timed out. Try again.')
            : reason instanceof Error
            ? reason.message
            : t(
                'ai_request_failed',
                'Could not generate text. Check your channel settings and try again.'
              )
        );
    } finally {
      clearTimeout(timeout);
      if (request === sequence.current) {
        submitting.current = false;
        active.current = undefined;
        setBusy(false);
        onBusyChange(false);
      }
    }
  };

  return (
    <section
      aria-label={t('ai_writing', 'AI writing')}
      className="flex flex-col gap-[12px] my-[16px] text-textColor min-w-0 [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-textColor"
    >
      <strong>{t('ai_writing', 'AI writing')}</strong>
      <p className="text-[14px]">
        {t('ai_scope', 'Text scope:')}{' '}
        {state.current === 'global'
          ? t('ai_global', 'Shared text')
          : channels[0]?.integration.name}
        .{' '}
        {t(
          'ai_plain_text',
          'AI replaces text formatting. Media stays unchanged.'
        )}
      </p>
      {state.current !== 'global' &&
        !state.internal.some(
          (item) => item.integration.id === state.current
        ) && (
          <p>
            {t(
              'ai_creates_override',
              'Applying creates a separate text version for this channel.'
            )}
          </p>
        )}
      {!channels.length && (
        <p>
          {t(
            'ai_no_channels',
            'Select a channel that uses this text, or switch to a channel version.'
          )}
        </p>
      )}
      {!capability.data && !capability.error && (
        <p role="status">{t('ai_checking', 'Checking AI availability…')}</p>
      )}
      {capability.error && (
        <p role="alert">
          {capability.error.message === 'AI_ACCESS_DENIED'
            ? t(
                'ai_access_denied',
                'Your account does not have access to AI writing.'
              )
            : t('ai_availability_failed', 'Could not check AI availability.')}
        </p>
      )}
      {capability.data?.configured === false && (
        <p role="status">
          {t(
            'ai_not_configured',
            'AI writing is not configured. Ask your administrator to configure OpenRouter.'
          )}
        </p>
      )}
      {(capability.error || capability.data?.configured === false) && (
        <Button secondary onClick={() => capability.mutate()}>
          {t('ai_retry_availability', 'Retry availability')}
        </Button>
      )}
      {capability.data?.configured && (
        <AiWritingPreferences
          key={`${user?.orgId || 'workspace'}:${profileReload}`}
          disabled={busy || disabled}
          onStateChange={setWriting}
          reloadVersion={profileReload}
        />
      )}
      {!!history.length && (
        <details>
          <summary>
            {t(
              'ai_recent_conversation',
              'Recent conversation (last 6 messages, up to 2,000 characters each)'
            )}
          </summary>
          <ol className="flex flex-col gap-[8px] break-words">
            {history.map((item, index) => (
              <li key={index}>
                <strong>
                  {item.role === 'user'
                    ? t('ai_you', 'You')
                    : t('ai_writing', 'AI writing')}
                  :
                </strong>{' '}
                {item.content}
              </li>
            ))}
          </ol>
        </details>
      )}
      <Textarea
        disableForm
        name="ai-prompt"
        aria-label={t('ai_prompt', 'Message to AI')}
        label={t('ai_prompt', 'Message to AI')}
        maxLength={2000}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        disabled={busy || disabled}
        className="!min-h-[80px] !text-textColor focus-visible:ring-2 focus-visible:ring-forth"
      />
      <Select
        disableForm
        hideErrors
        name="ai-action"
        label={t('ai_action', 'Action')}
        aria-label={t('ai_action', 'Action')}
        value={intent}
        onChange={(event) =>
          setIntent(event.target.value as AiSubmissionIntent)
        }
        disabled={busy || disabled}
        className="focus-visible:ring-2 focus-visible:ring-forth"
      >
        <option value="write">{t('ai_write', 'Write')}</option>
        {canPublish && (
          <option value="now">{t('ai_write_now', 'Write & post now')}</option>
        )}
        {canPublish && (
          <option value="schedule">
            {t('ai_write_schedule', 'Write & schedule')}
          </option>
        )}
      </Select>
      <p className="text-[14px]">
        {intent === 'write' ? (
          t(
            'ai_write_only',
            'Write only creates a suggestion. Select a posting action to publish.'
          )
        ) : (
          <>
            {t('ai_save_channels', 'Final save affects all selected channels:')}{' '}
            {names}.{' '}
            {intent === 'schedule' &&
              state.selectedIntegrations
                .map(({ integration }) => {
                  const date = state.channelDates[integration.id] || state.date;
                  return `${integration.name}: ${date.format(
                    'DD/MM/YYYY HH:mm Z'
                  )} (UTC${date.format('Z')})`;
                })
                .join('; ')}{' '}
            {!!state.repeater &&
              `${t('ai_repeat', 'Existing repeat interval (days):')} ${
                state.repeater
              }.`}
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-[8px]">
        <Button
          onClick={send}
          disabled={busy || unavailable}
          className="focus-visible:ring-2 focus-visible:ring-textColor"
        >
          {busy ? t('ai_working', 'Working…') : label}
        </Button>
        {busy && !submitting.current && (
          <Button
            secondary
            onClick={() => {
              cancel();
              setMessage(
                t('ai_cancelled', 'Cancelled. Your draft has not changed.')
              );
            }}
          >
            {t('ai_cancel', 'Cancel')}
          </Button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {candidate && !busy && (
        <div className="flex flex-col gap-[12px] min-w-0">
          <div
            aria-label={t('ai_suggestion', 'Suggested text')}
            className="whitespace-pre-wrap break-words"
          >
            {candidate.response.blocks.map((block) => (
              <p key={block.id}>{block.content}</p>
            ))}
          </div>
          <div className="flex flex-wrap gap-[8px]">
            <Button
              disabled={disabled}
              onClick={() => {
                const result = useLaunchStore
                  .getState()
                  .applyAiText(candidate.source, candidate.response.blocks);
                setCandidate(undefined);
                setMessage(
                  result.applied
                    ? t('ai_applied', 'Text applied to draft.')
                    : t(
                        'ai_draft_changed',
                        'Draft changed or submission cancelled. Review it before submitting again.'
                      )
                );
              }}
            >
              {t('ai_apply', 'Apply to draft')}
            </Button>
            <Button secondary onClick={() => setCandidate(undefined)}>
              {t('ai_discard', 'Discard')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
};
