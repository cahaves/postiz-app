'use client';

import React, { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { Textarea } from '@gitroom/react/form/textarea';
import { Select } from '@gitroom/react/form/select';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import type {
  AiWritingProfile,
  AiWritingProfileResponse,
} from '@gitroom/nestjs-libraries/dtos/posts/ai.writing.profile.dto';

export type WritingPreferencesState = {
  orgId: string | undefined;
  ready: boolean;
  dirty: boolean;
  revision: number | undefined;
};

const useWritingProfile = (reloadVersion: number) => {
  const fetch = useFetch();
  const user = useUser();
  return useSWR<AiWritingProfileResponse>(
    ['ai-writing-profile', user?.orgId, reloadVersion],
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch('/posts/ai-text/profile', {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('PROFILE_UNAVAILABLE');
        const result = await response.json();
        if (
          !Number.isInteger(result?.revision) ||
          result.revision < 0 ||
          !['auto', 'id', 'en'].includes(result?.profile?.language) ||
          !['friendly', 'professional', 'casual'].includes(
            result?.profile?.tone
          ) ||
          !['brandName', 'audience', 'brandFacts', 'voiceNotes'].every(
            (key) => typeof result.profile[key] === 'string'
          ) ||
          !Array.isArray(result.profile.examples) ||
          !result.profile.examples.every(
            (value: unknown) => typeof value === 'string'
          )
        ) {
          throw new Error('PROFILE_UNAVAILABLE');
        }
        return result;
      } finally {
        clearTimeout(timeout);
      }
    },
    { shouldRetryOnError: false, revalidateOnFocus: false }
  );
};

export const AiWritingPreferences = ({
  disabled,
  onStateChange,
  reloadVersion = 0,
}: {
  disabled: boolean;
  onStateChange: (state: WritingPreferencesState) => void;
  reloadVersion?: number;
}) => {
  const t = useT();
  const fetch = useFetch();
  const user = useUser();
  const saved = useWritingProfile(reloadVersion);
  const [editing, setEditing] = useState<AiWritingProfileResponse>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(false);
  const active = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  const canEdit = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';
  const dirty = !!editing || saving;
  const draft = editing?.profile || saved.data?.profile;
  const locked = disabled || saving || !canEdit;

  useEffect(() => {
    onStateChange({
      orgId: user?.orgId,
      ready: !!saved.data && !saved.error,
      dirty,
      revision: saved.data?.revision,
    });
  }, [user?.orgId, saved.data, saved.error, dirty, onStateChange]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, []);

  const update = (values: Partial<AiWritingProfile>) => {
    if (locked || !saved.data || !draft) return;
    setEditing({
      revision: editing?.revision ?? saved.data.revision,
      profile: { ...draft, ...values },
    });
    setMessage('');
  };
  const save = async () => {
    if (!editing || locked || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setSaving(true);
    setError('');
    setMessage('');
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/posts/ai-text/profile', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({
          ...editing,
          profile: {
            ...editing.profile,
            examples: editing.profile.examples.filter((example) =>
              example.trim()
            ),
          },
        }),
      });
      if (controller.signal.aborted) return;
      if (!response.ok) {
        if (response.status === 409) {
          setConflict(true);
          setError(
            t(
              'ai_profile_conflict',
              'Someone updated these preferences. Reload the saved version before editing again.'
            )
          );
          return;
        }
        throw new Error('SAVE_FAILED');
      }
      const result = await response.json();
      if (controller.signal.aborted) return;
      await saved.mutate(result, false);
      setEditing(undefined);
      setConflict(false);
      setMessage(t('ai_profile_saved', 'Writing preferences saved.'));
    } catch {
      if (mounted.current)
        setError(
          t(
            'ai_profile_save_failed',
            'Could not save writing preferences. Your edits are still here.'
          )
        );
    } finally {
      clearTimeout(timeout);
      if (mounted.current) setSaving(false);
      if (active.current === controller) active.current = undefined;
    }
  };
  const reload = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await saved.mutate();
      setEditing(undefined);
      setConflict(false);
    } catch {
      setError(
        t('ai_profile_load_failed', 'Could not load writing preferences.')
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-[8px] min-w-0">
      {!saved.data && !saved.error && (
        <p role="status">
          {t('ai_profile_loading', 'Loading writing preferences…')}
        </p>
      )}
      {saved.error && (
        <div role="alert" className="flex flex-col items-start gap-[8px]">
          <p>
            {t('ai_profile_load_failed', 'Could not load writing preferences.')}
          </p>
          <Button secondary disabled={disabled || saving} onClick={reload}>
            {t('ai_profile_retry', 'Retry preferences')}
          </Button>
        </div>
      )}
      <details>
        <summary className="cursor-pointer focus-visible:ring-2 focus-visible:ring-textColor">
          {t('ai_profile_title', 'Writing preferences')}
        </summary>
        {draft && (
          <div className="flex flex-col gap-[12px] min-w-0 pt-[12px]">
            <p className="text-[14px]">
              {t(
                'ai_profile_intro',
                'Shared with this workspace. Defaults use friendly, specific language with relevant product mentions. Your instructions and examples shape the voice.'
              )}
            </p>
            {!canEdit && (
              <p>
                {t(
                  'ai_profile_readonly',
                  'Ask a workspace administrator to edit these preferences.'
                )}
              </p>
            )}
            <Select
              disableForm
              hideErrors
              name="ai-language"
              label={t('ai_profile_language', 'Language')}
              aria-label={t('ai_profile_language', 'Language')}
              value={draft.language}
              disabled={locked}
              onChange={(event) =>
                update({
                  language: event.target.value as AiWritingProfile['language'],
                })
              }
              className="focus-visible:ring-2 focus-visible:ring-textColor"
            >
              <option value="auto">
                {t('ai_profile_language_auto', 'Follow my message or draft')}
              </option>
              <option value="id">
                {t('ai_profile_language_id', 'Indonesian')}
              </option>
              <option value="en">
                {t('ai_profile_language_en', 'English')}
              </option>
            </Select>
            <Select
              disableForm
              hideErrors
              name="ai-tone"
              label={t('ai_profile_tone', 'Tone')}
              aria-label={t('ai_profile_tone', 'Tone')}
              value={draft.tone}
              disabled={locked}
              onChange={(event) =>
                update({ tone: event.target.value as AiWritingProfile['tone'] })
              }
              className="focus-visible:ring-2 focus-visible:ring-textColor"
            >
              <option value="friendly">
                {t('ai_profile_friendly', 'Friendly')}
              </option>
              <option value="professional">
                {t('ai_profile_professional', 'Professional')}
              </option>
              <option value="casual">{t('ai_profile_casual', 'Casual')}</option>
            </Select>
            <Input
              disableForm
              name="ai-brand-name"
              label={t('ai_profile_brand', 'Brand name')}
              aria-label={t('ai_profile_brand', 'Brand name')}
              maxLength={100}
              value={draft.brandName}
              disabled={locked}
              onChange={(event) => update({ brandName: event.target.value })}
              className="focus-within:ring-2 focus-within:ring-textColor"
            />
            {(
              [
                ['audience', t('ai_profile_audience', 'Audience'), 1000],
                ['brandFacts', t('ai_profile_facts', 'Brand facts'), 3000],
                ['voiceNotes', t('ai_profile_notes', 'Voice notes'), 2000],
              ] as const
            ).map(([field, label, maximum]) => (
              <Textarea
                key={field}
                disableForm
                name={`ai-profile-${field}`}
                label={label}
                aria-label={label}
                value={draft[field]}
                maxLength={maximum}
                disabled={locked}
                onChange={(event) => update({ [field]: event.target.value })}
                className="!min-h-[80px] !text-textColor focus-visible:ring-2 focus-visible:ring-textColor"
              />
            ))}
            <p className="text-[14px]">
              {t(
                'ai_profile_example_help',
                'Add posts you have approved. Examples guide phrasing; put product details and claims in Brand facts. Voice notes can specify pronouns, slang, emojis or calls to action.'
              )}
            </p>
            {draft.examples.map((example, index) => (
              <div key={index} className="flex flex-col gap-[4px]">
                <Textarea
                  disableForm
                  name={`ai-example-${index}`}
                  label={`${t('ai_profile_example', 'Approved example')} ${
                    index + 1
                  }`}
                  aria-label={`${t('ai_profile_example', 'Approved example')} ${
                    index + 1
                  }`}
                  maxLength={1200}
                  value={example}
                  disabled={locked}
                  onChange={(event) =>
                    update({
                      examples: draft.examples.map((value, item) =>
                        item === index ? event.target.value : value
                      ),
                    })
                  }
                  className="!min-h-[80px] !text-textColor focus-visible:ring-2 focus-visible:ring-textColor"
                />
                {canEdit && (
                  <Button
                    secondary
                    disabled={locked}
                    onClick={() =>
                      update({
                        examples: draft.examples.filter(
                          (_, item) => item !== index
                        ),
                      })
                    }
                  >
                    {t('ai_profile_remove_example', 'Remove example')}{' '}
                    {index + 1}
                  </Button>
                )}
              </div>
            ))}
            {canEdit && (
              <div className="flex flex-wrap gap-[8px]">
                <Button
                  secondary
                  disabled={locked || draft.examples.length >= 5}
                  onClick={() => update({ examples: [...draft.examples, ''] })}
                >
                  {t('ai_profile_add_example', 'Add approved example')}
                </Button>
                <Button
                  disabled={locked || !editing || conflict}
                  onClick={save}
                >
                  {saving
                    ? t('ai_profile_saving', 'Saving…')
                    : t('ai_profile_save', 'Save preferences')}
                </Button>
                {editing && (
                  <Button
                    secondary
                    disabled={locked}
                    onClick={() => {
                      if (conflict) {
                        void reload();
                        return;
                      }
                      setEditing(undefined);
                      setError('');
                      setMessage('');
                      setConflict(false);
                    }}
                  >
                    {t('ai_profile_discard', 'Discard preference edits')}
                  </Button>
                )}
              </div>
            )}
            {conflict && (
              <Button secondary disabled={locked} onClick={reload}>
                {t('ai_profile_reload', 'Reload saved preferences')}
              </Button>
            )}
            {error && <p role="alert">{error}</p>}
            {message && <p role="status">{message}</p>}
          </div>
        )}
      </details>
      {dirty && (
        <p role="status">
          {t(
            'ai_profile_unsaved',
            'Save or discard preference edits before writing.'
          )}
        </p>
      )}
    </div>
  );
};
