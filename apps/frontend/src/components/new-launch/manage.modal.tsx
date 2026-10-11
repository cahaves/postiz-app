'use client';

import React, {
  FC,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AddEditModalProps } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { PicksSocialsComponent } from '@gitroom/frontend/components/new-launch/picks.socials.component';
import { EditorWrapper } from '@gitroom/frontend/components/new-launch/editor';
import { SelectCurrent } from '@gitroom/frontend/components/new-launch/select.current';
import { ShowAllProviders } from '@gitroom/frontend/components/new-launch/providers/show.all.providers';
import { useExistingData } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { DatePicker } from '@gitroom/frontend/components/launches/helpers/date.picker';
import { useShallow } from 'zustand/react/shallow';
import { RepeatComponent } from '@gitroom/frontend/components/launches/repeat.component';
import { TagsComponent } from '@gitroom/frontend/components/launches/tags.component';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { capitalize } from 'lodash';
import { SelectCustomer } from '@gitroom/frontend/components/launches/select.customer';
import { flushSync } from 'react-dom';
import { plainTextToPostHtml } from '@gitroom/helpers/utils/sanitize.post.content';
import {
  AiTextAssistant,
  AiTextCandidate,
  AiSubmissionResult,
} from './ai.text.assistant';
import { DummyCodeComponent } from '@gitroom/frontend/components/new-launch/dummy.code.component';
import { CreationMethodBadge } from '@gitroom/frontend/components/launches/creation.method.badge';
import {
  SettingsIcon,
  ChevronDownIcon,
  CloseIcon,
  TrashIcon,
  DropdownArrowSmallIcon,
} from '@gitroom/frontend/components/ui/icons';
import { useHasScroll } from '@gitroom/frontend/components/ui/is.scroll.hook';
import { useShortlinkPreference } from '@gitroom/frontend/components/settings/shortlink-preference.component';
import dayjs from 'dayjs';
import { Button } from '@gitroom/react/form/button';
import { useClickOutside } from '@mantine/hooks';

export const ManageModal: FC<AddEditModalProps> = (props) => {
  const t = useT();
  const fetch = useFetch();
  const ref = useRef<any>(null);
  const existingData = useExistingData();
  const [loading, setLoading] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const aiBusyRef = useRef(false);
  const saving = useRef(false);
  const mounted = useRef(true);
  const latest = useRef({ existingData, props });
  latest.current = { existingData, props };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const changeAiBusy = useCallback((value: boolean) => {
    aiBusyRef.current = value;
    if (mounted.current) setAiBusy(value);
  }, []);

  const draftSignature = useCallback(() => {
    const state = useLaunchStore.getState();
    return JSON.stringify({
      session: state.aiTextSession,
      scope: state.current,
      editor: state.editor,
      global: state.global,
      internal: state.internal.map(({ integration, integrationValue }) => ({
        id: integration.id,
        integrationValue,
      })),
      selected: state.selectedIntegrations.map(({ integration, settings }) => ({
        id: integration.id,
        stripLinks: integration.stripLinks,
        settings,
      })),
      date: state.date.toISOString(),
      tags: state.tags,
      repeater: state.repeater,
      existing: latest.current.existingData,
      dummy: latest.current.props.dummy,
      set: !!latest.current.props.addEditSets,
    });
  }, []);
  const capturePublication = useCallback(async () => {
    const before = draftSignature();
    const values = await ref.current?.getAllValues();
    if (
      !mounted.current ||
      before !== draftSignature() ||
      !values?.length ||
      values.some((value: any) => !value)
    )
      throw new Error('Draft changed. Review and submit again.');
    return JSON.stringify({ draft: before, values });
  }, [draftSignature]);
  const toaster = useToaster();
  const modal = useModals();
  const [showSettings, setShowSettings] = useState(false);
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');
  const [showPostNow, setShowPostNow] = useState(false);
  const postNowRef = useClickOutside<HTMLDivElement>(() => {
    setShowPostNow(false);
  });
  const { data: shortlinkPreferenceData } = useShortlinkPreference();

  const { addEditSets, mutate, customClose, dummy } = props;

  const {
    selectedIntegrations,
    hide,
    date,
    setDate,
    repeater,
    setRepeater,
    tags,
    setTags,
    integrations,
    setSelectedIntegrations,
    locked,
    current,
    activateExitButton,
    setHide,
  } = useLaunchStore(
    useShallow((state) => ({
      hide: state.hide,
      setHide: state.setHide,
      date: state.date,
      setDate: state.setDate,
      current: state.current,
      repeater: state.repeater,
      setRepeater: state.setRepeater,
      tags: state.tags,
      setTags: state.setTags,
      selectedIntegrations: state.selectedIntegrations,
      integrations: state.integrations,
      setSelectedIntegrations: state.setSelectedIntegrations,
      locked: state.locked,
      activateExitButton: state.activateExitButton,
    }))
  );

  useEffect(() => {
    if (hide) {
      setHide(false);
    }
  }, [hide]);

  const currentIntegrationText = useMemo(() => {
    if (current === 'global') {
      return (
        <div className="flex items-center gap-[10px]">
          <div className="relative">
            <SettingsIcon size={15} className="text-white" />
          </div>
          <div>Settings</div>
        </div>
      );
    }

    const currentIntegration = integrations.find((p) => p.id === current)!;

    return (
      <div className="flex items-center gap-[10px]">
        <div className="relative">
          <img
            src={`/icons/platforms/${currentIntegration.identifier}.png`}
            className="w-[20px] h-[20px] rounded-[4px]"
            alt={currentIntegration.identifier}
          />
          <SettingsIcon
            size={15}
            className="text-white absolute -end-[5px] -bottom-[5px]"
          />
        </div>
        <div>
          {currentIntegration.name} {t('channel_settings', 'Settings')}
        </div>
      </div>
    );
  }, [current]);

  const changeCustomer = useCallback(
    (customer: string) => {
      const neededIntegrations = integrations.filter(
        (p) => p?.customer?.id === customer
      );
      setSelectedIntegrations(
        neededIntegrations.map((p) => ({
          settings: {},
          selectedIntegrations: p,
        }))
      );
    },
    [integrations]
  );

  const askClose = useCallback(async () => {
    if (!activateExitButton || dummy) {
      return;
    }

    if (
      await deleteDialog(
        t(
          'are_you_sure_you_want_to_close_this_modal_all_data_will_be_lost',
          'Are you sure you want to close this modal? (all data will be lost)'
        ),
        t('yes_close_it', 'Yes, close it!')
      )
    ) {
      if (customClose) {
        customClose();
        return;
      }
      modal.closeAll();
    }
  }, [activateExitButton, dummy]);

  const deletePost = useCallback(async () => {
    if (saving.current || aiBusyRef.current) return;
    setLoading(true);
    if (
      !(await deleteDialog(
        t(
          'are_you_sure_you_want_to_delete_post',
          'Are you sure you want to delete this post?'
        ),
        t('yes_delete_it', 'Yes, delete it!')
      ))
    ) {
      setLoading(false);
      return;
    }
    await fetch(`/posts/${existingData.group}`, {
      method: 'DELETE',
    });
    mutate();
    modal.closeAll();
    return;
  }, [existingData, mutate, modal]);

  const schedule = useCallback(
    (
        type: 'draft' | 'now' | 'schedule' | 'update',
        expected?: string,
        signal?: AbortSignal
      ) =>
      async (): Promise<AiSubmissionResult> => {
        if (
          saving.current ||
          (!expected && aiBusyRef.current) ||
          useLaunchStore.getState().locked
        )
          return { status: 'cancelled' };
        saving.current = true;
        const session = useLaunchStore.getState().aiTextSession;
        const sameSession = () =>
          mounted.current &&
          useLaunchStore.getState().aiTextSession === session;
        let postStarted = false;
        let accepted = false;
        setLoading(true);
        try {
          const snapshot = expected || (await capturePublication());
          const checkCurrent = async () => {
            if (
              signal?.aborted ||
              !sameSession() ||
              snapshot !== (await capturePublication())
            )
              throw new Error('AI_DRAFT_CHANGED');
          };
          await checkCurrent();
          let republish = false;
          if (
            (type === 'now' || type === 'schedule') &&
            (existingData?.posts?.[0]?.state === 'PUBLISHED' ||
              (existingData?.posts?.[0]?.state === 'QUEUE' &&
                dayjs().isAfter(date.utc())))
          ) {
            const channels = selectedIntegrations
              .map((p) => p.integration.name)
              .join(', ');
            const isRecurring =
              !!repeater || !!existingData?.posts?.[0]?.intervalInDays;

            const whatToDo = await new Promise((resolve) => {
              const dialogId = makeId(20);
              const choose = (choice: 'update' | 'republish') => {
                modal.closeById(dialogId);
                resolve(choice);
              };
              modal.openModal({
                id: dialogId,
                onClose: () => resolve('cancelled'),
                title: t('what_do_you_want_to_do', 'What do you want to do?'),
                children: (
                  <div className="flex flex-col">
                    <div className="text-[20px] mb-[20px]">
                      {t(
                        'post_already_published_republish_warning',
                        'This post was already published. Republishing will publish it again to'
                      )}{' '}
                      {channels} {t('republish_at', 'at')}{' '}
                      {date.format('DD/MM/YYYY HH:mm')}.
                      {isRecurring && (
                        <div className="mt-[10px]">
                          {t(
                            'republish_recurring_note',
                            'This is a recurring post: your changes apply to all future recurrences starting now.'
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex w-full gap-[10px]">
                      <div className="flex-1 flex">
                        <Button
                          type="button"
                          className="flex-1"
                          onClick={() => choose('update')}
                        >
                          {t(
                            'just_update_post_details',
                            'Just update the post details'
                          )}
                        </Button>
                      </div>
                      <div className="flex-1 flex">
                        <Button
                          type="button"
                          className="flex-1"
                          onClick={() => choose('republish')}
                        >
                          {t('republish_the_post', 'Republish the post')}
                        </Button>
                      </div>
                    </div>
                  </div>
                ),
              });
            });

            await checkCurrent();
            if (whatToDo === 'cancelled') return { status: 'cancelled' };

            if (whatToDo === 'update') {
              type = 'update';
            }

            if (whatToDo === 'republish') {
              republish = true;
            }
          }

          // Pull the local values to build the payload, but rely on the server
          // (`/posts/valid`) for the actual validation — checkValidity now lives
          // server-side so it can't be bypassed.
          const allValues = await ref.current.getAllValues();
          await checkCurrent();

          const integrationById = (id: string) =>
            selectedIntegrations.find((p) => p.integration.id === id);

          const group = existingData.group || makeId(10);

          const posts = allValues.map((post: any) => ({
            integration: {
              id: post.id,
            },
            group,
            settings: { ...(post.settings || {}) },
            value: post.values.map((value: any) => ({
              ...(value.id ? { id: value.id } : {}),
              content: value.content,
              delay: value.delay || 0,
              image:
                (value?.media || []).map(
                  ({ id, path, alt, thumbnail, thumbnailTimestamp }: any) => ({
                    id,
                    path,
                    alt,
                    thumbnail,
                    thumbnailTimestamp,
                  })
                ) || [],
            })),
          }));

          if (!dummy) {
            const validationResponse = await fetch('/posts/valid', {
              method: 'POST',
              body: JSON.stringify({ type, posts }),
            });
            await checkCurrent();
            if (!validationResponse.ok) throw new Error('VALIDATION_FAILED');
            const checkAllValid = await validationResponse.json();
            await checkCurrent();

            const focus = (id: string, where: 'fix' | 'preview') => {
              integrationById(id)?.ref?.current?.[where]?.();
            };

            const notEnoughChars = checkAllValid.filter(
              (p: any) => p.emptyContent
            );

            for (const item of notEnoughChars) {
              toaster.show(
                `${capitalize(item.identifier.split('-')[0])} (${item.name}):` +
                  ' ' +
                  t(
                    'post_needs_content_or_image',
                    'Your post should have at least one character or one image.'
                  ),
                'warning'
              );
              setLoading(false);
              focus(item.id, 'preview');
              return { status: 'validation-failed' };
            }

            if (type !== 'draft') {
              for (const item of checkAllValid) {
                if (item.valid === false) {
                  toaster.show(
                    `${capitalize(item.identifier.split('-')[0])} (${
                      item.name
                    }): ${
                      item.settingsError ||
                      t('please_fix_your_settings', 'Please fix your settings')
                    }`,
                    'warning'
                  );
                  focus(item.id, 'fix');
                  setLoading(false);
                  setShowSettings(true);
                  return { status: 'validation-failed' };
                }

                if (item.errors !== true) {
                  toaster.show(
                    `${capitalize(item.identifier.split('-')[0])} (${
                      item.name
                    }): ${item.errors}`,
                    'warning'
                  );
                  focus(item.id, 'preview');
                  setLoading(false);
                  setShowSettings(false);
                  return { status: 'validation-failed' };
                }

                if (item.tooLong) {
                  toaster.show(
                    `${item.name} (${item.identifier}) ${t(
                      'post_is_too_long',
                      'post is too long, please fix it'
                    )}`,
                    'warning'
                  );
                  focus(item.id, 'preview');
                  setLoading(false);
                  return { status: 'validation-failed' };
                }
              }
            }
          }

          const shortlinkPreference =
            shortlinkPreferenceData?.shortlink || 'ASK';

          let shortLink = false;

          if (!dummy && shortlinkPreference !== 'NO') {
            const shortlinkResponse = await fetch('/posts/should-shortlink', {
              method: 'POST',
              body: JSON.stringify({
                messages: allValues
                  // platforms that remove links won't keep shortlinks either
                  .filter(
                    (p: any) => !integrationById(p.id)?.integration?.stripLinks
                  )
                  .flatMap((p: any) => p.values.flatMap((a: any) => a.content)),
              }),
            });
            await checkCurrent();
            if (!shortlinkResponse.ok) throw new Error('SHORTLINK_FAILED');
            const shortLinkUrl = await shortlinkResponse.json();
            await checkCurrent();

            if (shortLinkUrl.ask) {
              if (shortlinkPreference === 'YES') {
                // Automatically shortlink without asking
                shortLink = true;
              } else {
                // ASK: Show the dialog
                shortLink = await deleteDialog(
                  t(
                    'shortlink_urls_question',
                    'Do you want to shortlink the URLs? it will let you get statistics over clicks'
                  ),
                  t('yes_shortlink_it', 'Yes, shortlink it!'),
                  undefined,
                  t('no_original_urls', 'No, original URLs')
                );
                await checkCurrent();
              }
            }
          }

          const data = {
            type,
            ...(republish ? { republish } : {}),
            ...(repeater ? { inter: repeater } : {}),
            tags,
            shortLink,
            date: date.utc().format('YYYY-MM-DDTHH:mm:ss'),
            posts,
          };

          await checkCurrent();

          if (dummy) {
            modal.openModal({
              title: '',
              children: <DummyCodeComponent code={data} />,
              classNames: {
                modal: 'w-[100%] bg-transparent text-textColor',
              },
              size: '100%',
              withCloseButton: false,
              closeOnEscape: true,
              closeOnClickOutside: true,
            });

            setLoading(false);
          }

          if (!dummy) {
            if (addEditSets) {
              addEditSets(data);
            } else {
              postStarted = true;
              const response = await fetch('/posts', {
                method: 'POST',
                body: JSON.stringify(data),
              });

              if (!response.ok) {
                if (response.status >= 500)
                  throw new Error('POST_OUTCOME_UNKNOWN');
                postStarted = false;
                if (!sameSession()) return { status: 'failed' };
                if (response.status !== 402) {
                  const { message } = await response.json().catch(() => ({}));
                  if (!sameSession()) return { status: 'failed' };
                  toaster.show(
                    typeof message === 'string'
                      ? message
                      : t('post_save_failed', 'Could not save the post'),
                    'warning'
                  );
                }
                setLoading(false);
                return { status: 'failed' };
              }
              accepted = true;
            }

            if (!sameSession()) return { status: 'accepted' };

            if (!addEditSets) {
              mutate();
              toaster.show(
                !existingData.integration
                  ? t('added_successfully', 'Added successfully')
                  : t('updated_successfully', 'Updated successfully')
              );
            }
            if (customClose) {
              setTimeout(() => {
                if (sameSession()) customClose();
              }, 2000);
            }

            if (!addEditSets) {
              modal.closeAll();
            }
          }
          return { status: 'accepted' };
        } catch (error) {
          const status = accepted
            ? 'accepted'
            : postStarted
            ? 'unknown'
            : signal?.aborted ||
              !sameSession() ||
              (error instanceof Error && error.message === 'AI_DRAFT_CHANGED')
            ? 'cancelled'
            : 'failed';
          if (sameSession())
            toaster.show(
              status === 'unknown'
                ? t(
                    'ai_save_unknown',
                    'Save status is unknown. Check the calendar before posting again to avoid duplicates.'
                  )
                : status === 'cancelled'
                ? t(
                    'ai_draft_changed',
                    'Draft changed or submission cancelled. Review it before submitting again.'
                  )
                : t('post_save_failed', 'Could not save the post'),
              'warning'
            );
          return { status };
        } finally {
          saving.current = false;
          if (sameSession()) setLoading(false);
        }
      },
    [
      ref,
      repeater,
      tags,
      date,
      addEditSets,
      dummy,
      shortlinkPreferenceData,
      selectedIntegrations,
      existingData,
      mutate,
      modal,
      customClose,
      fetch,
      toaster,
      t,
      capturePublication,
    ]
  );

  const applyAndSubmit = useCallback(
    async (
      candidate: AiTextCandidate,
      intent: 'now' | 'schedule',
      expected: string,
      signal: AbortSignal
    ): Promise<AiSubmissionResult> => {
      if (
        dummy ||
        addEditSets ||
        saving.current ||
        signal.aborted ||
        expected !== (await capturePublication())
      )
        return { status: 'cancelled' };
      const intended = JSON.parse(JSON.parse(expected).draft);
      const override = intended.internal.find(
        (item: any) => item.id === candidate.source.scope
      );
      const blocks = (override?.integrationValue || intended.global).map(
        (block: any, index: number) => ({
          ...block,
          content: plainTextToPostHtml(
            candidate.response.blocks[index].content
          ),
        })
      );
      if (candidate.source.scope === 'global') intended.global = blocks;
      else if (override) override.integrationValue = blocks;
      else
        intended.internal.push({
          id: candidate.source.scope,
          integrationValue: blocks,
        });
      let applied = false;
      // Commit subscribers before reading native provider refs; a store write alone
      // leaves their imperative handles pointing at the previous render.
      flushSync(() => {
        applied = useLaunchStore
          .getState()
          .applyAiText(candidate.source, candidate.response.blocks).applied;
      });
      if (
        !applied ||
        signal.aborted ||
        draftSignature() !== JSON.stringify(intended)
      )
        return { status: 'cancelled' };
      const committed = await capturePublication();
      const values = JSON.parse(committed).values;
      const state = useLaunchStore.getState();
      if (
        state.aiTextSession !== candidate.source.session ||
        values.some((post: any) => {
          const blocks =
            state.internal.find((item) => item.integration.id === post.id)
              ?.integrationValue || state.global;
          return (
            post.values.length !== blocks.length ||
            post.values.some(
              (block: any, index: number) =>
                block.id !== blocks[index].id ||
                block.content !== blocks[index].content
            )
          );
        })
      )
        return { status: 'cancelled' };
      return schedule(intent, committed, signal)();
    },
    [dummy, addEditSets, capturePublication, schedule, draftSignature]
  );

  return (
    <div className="w-full h-full flex-1 p-[40px] mobile:p-0 mobile:h-auto mobile:min-h-full flex relative">
      <div className="flex flex-1 min-w-0 bg-newBgColorInner rounded-[20px] mobile:rounded-none flex-col">
        <div className="flex-1 flex mobile:contents">
          <div className="flex flex-col flex-1 min-w-0 border-e border-newBorder mobile:border-e-0 mobile:flex-none">
            <div className="bg-newBgColor h-[65px] rounded-s-[20px] !rounded-b-[0] mobile:rounded-none flex items-center gap-[12px] px-[20px] mobile:px-[16px] text-[20px] font-[600]">
              {t('create_post_title', 'Create Post')}
              <CreationMethodBadge
                creationMethod={existingData?.posts?.[0]?.creationMethod}
                size="sm"
              />
              <div className="hidden mobile:block ms-auto cursor-pointer">
                <CloseIcon onClick={askClose} className="text-[#A3A3A3]" />
              </div>
            </div>
            <div className="hidden mobile:flex mx-[12px] mt-[12px] p-[4px] border border-newTableBorder rounded-[8px] text-[14px] font-[500]">
              {(['edit', 'preview'] as const).map((tab) => (
                <div
                  key={tab}
                  onClick={() => setMobileTab(tab)}
                  className={clsx(
                    'flex-1 pt-[6px] pb-[5px] cursor-pointer text-center rounded-[6px]',
                    mobileTab === tab && 'text-textItemFocused bg-boxFocused'
                  )}
                >
                  {tab === 'edit'
                    ? t('edit', 'Edit')
                    : t('post_preview', 'Post Preview')}
                </div>
              ))}
            </div>
            <div
              className={clsx(
                'flex-1 flex flex-col gap-[16px]',
                mobileTab === 'preview' && 'mobile:hidden'
              )}
            >
              <div
                className={clsx('flex-1 relative', showSettings && 'hidden')}
              >
                <div
                  id="social-content"
                  className="gap-[32px] flex flex-col pe-[8px] pt-[20px] ps-[20px] mobile:px-[12px] mobile:static absolute top-0 left-0 w-full h-full mobile:h-auto overflow-x-hidden overflow-y-scroll mobile:overflow-y-visible scrollbar scrollbar-thumb-newColColor scrollbar-track-newBgColorInner"
                >
                  <div className="flex w-full">
                    <div className="flex flex-1">
                      <PicksSocialsComponent toolTip={true} />
                    </div>
                    <div>
                      {!dummy && (
                        <SelectCustomer
                          onChange={changeCustomer}
                          integrations={integrations}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex flex-1 gap-[6px] flex-col">
                    <div>{!existingData.integration && <SelectCurrent />}</div>
                    <AiTextAssistant
                      disabled={locked || loading}
                      canPublish={!dummy && !addEditSets}
                      onBusyChange={changeAiBusy}
                      capturePublication={capturePublication}
                      onApplyAndSubmit={applyAndSubmit}
                    />
                    <div className="flex-1 flex">
                      {!hide && <EditorWrapper totalPosts={1} value="" />}
                    </div>
                    <div
                      id="social-empty"
                      className={clsx(
                        'pb-[16px]'
                        // current !== 'global' && 'hidden'
                      )}
                    />
                  </div>
                </div>
              </div>
              <div
                id="wrapper-settings"
                className={clsx(
                  'pb-[20px] px-[20px] mobile:px-[12px] select-none',
                  showSettings && 'flex-1 flex pt-[20px]',
                  current === 'global' && 'hidden'
                )}
              >
                <div className="flex-1 flex flex-col rounded-[12px] gap-[12px] overflow-hidden bg-newSettings">
                  <div
                    onClick={() => setShowSettings(!showSettings)}
                    className={clsx(
                      'bg-[#612BD3] rounded-[12px] flex items-center gap-[8px] cursor-pointer p-[12px]',
                      showSettings ? '!rounded-b-none' : ''
                    )}
                  >
                    <div className="flex-1 text-[14px] font-[600] text-white">
                      {currentIntegrationText}
                    </div>
                    <div>
                      <ChevronDownIcon
                        rotated={showSettings}
                        className="text-white"
                      />
                    </div>
                  </div>
                  <div
                    className={clsx(
                      !showSettings ? 'hidden' : 'flex-1',
                      'text-[14px] text-textColor font-[500] relative'
                    )}
                  >
                    <div className="absolute mobile:static left-0 top-0 w-full h-full mobile:h-auto flex flex-col overflow-x-hidden overflow-y-auto scrollbar scrollbar-thumb-newBgColorInner scrollbar-track-newColColor">
                      <div
                        id="social-settings"
                        className="flex flex-col gap-[20px] bg-newBgColor"
                      />
                    </div>
                  </div>
                  <style>
                    {`#social-settings [data-id="${current}"] {display: block !important;}`}
                  </style>
                </div>
              </div>
            </div>
          </div>
          <div
            className={clsx(
              'w-[580px] tablet:w-[440px] mobile:!w-full flex flex-col mobile:order-3 mobile:flex-1',
              mobileTab === 'edit' && 'mobile:hidden'
            )}
          >
            <div className="bg-newBgColor h-[65px] rounded-e-[20px] !rounded-b-[0] mobile:hidden flex items-center px-[20px] text-[20px] font-[600]">
              <div className="flex-1">{t('post_preview', 'Post Preview')}</div>
              <div className="cursor-pointer mobile:hidden">
                <CloseIcon onClick={askClose} className="text-[#A3A3A3]" />
              </div>
            </div>
            <div className="flex-1 relative">
              <Scrollable
                scrollClasses="!pe-[20px]"
                className="absolute mobile:static top-0 p-[20px] pe-[8px] mobile:p-[12px] left-0 w-full h-full mobile:h-auto overflow-x-hidden overflow-y-scroll mobile:overflow-y-visible scrollbar scrollbar-thumb-newColColor scrollbar-track-newBgColorInner"
              >
                <ShowAllProviders ref={ref} />
              </Scrollable>
            </div>
          </div>
        </div>
        <div className="select-none h-[84px] py-[20px] border-t border-newBorder flex items-center mobile:contents">
          <div
            className={clsx(
              'flex-1 flex ps-[20px] gap-[8px] mobile:order-2 mobile:flex-wrap mobile:flex-none mobile:p-[12px]',
              mobileTab === 'preview' && 'mobile:hidden'
            )}
          >
            {!dummy && (
              <TagsComponent
                name="tags"
                label={t('tags', 'Tags')}
                initial={tags}
                onChange={(e) => {
                  setTags(e.target.value);
                }}
              />
            )}

            {!dummy && (
              <RepeatComponent repeat={repeater} onChange={setRepeater} />
            )}
          </div>
          <div className="pe-[20px] flex items-center justify-end gap-[8px] mobile:order-4 mobile:sticky mobile:bottom-0 mobile:z-[20] mobile:mt-auto mobile:flex-wrap mobile:p-[12px] mobile:bg-newBgColorInner mobile:border-t mobile:border-newBorder">
            {existingData?.integration && (
              <button
                onClick={deletePost}
                disabled={loading || locked || aiBusy}
                className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 flex text-[#FF3F3F] gap-[8px] items-center text-[15px] font-[600]"
              >
                <div>
                  <TrashIcon />
                </div>
                <div>{t('delete_post', 'Delete Post')}</div>
              </button>
            )}
            <DatePicker onChange={setDate} date={date} />
            {!addEditSets && (
              <button
                disabled={
                  selectedIntegrations.length === 0 ||
                  loading ||
                  locked ||
                  aiBusy
                }
                onClick={schedule('draft')}
                className="relative cursor-pointer disabled:cursor-not-allowed px-[20px] h-[44px] bg-btnSimple justify-center items-center flex rounded-[8px] text-[15px] font-[600]"
              >
                {loading && (
                  <div className="absolute left-[50%] top-[50%] -translate-y-[50%] -translate-x-[50%]">
                    <div className="animate-spin h-[20px] w-[20px] border-4 border-textColor border-t-transparent rounded-full" />
                  </div>
                )}
                <div className={clsx(loading && 'invisible')}>
                  {t('save_as_draft', 'Save as Draft')}
                </div>
              </button>
            )}
            {addEditSets && (
              <button
                className="text-white text-[15px] font-[600] min-w-[180px] mobile:basis-full btnSub disabled:cursor-not-allowed disabled:opacity-80 outline-none gap-[8px] flex justify-center items-center h-[44px] rounded-[8px] bg-[#612BD3] ps-[20px] pe-[16px]"
                disabled={
                  selectedIntegrations.length === 0 ||
                  loading ||
                  locked ||
                  aiBusy
                }
                onClick={schedule('draft')}
              >
                Save Set
              </button>
            )}
            {!addEditSets && (
              <div
                ref={postNowRef}
                className="group cursor-pointer relative mobile:basis-full"
              >
                <button
                  disabled={
                    selectedIntegrations.length === 0 ||
                    loading ||
                    locked ||
                    aiBusy
                  }
                  onClick={schedule('schedule')}
                  className="text-white relative min-w-[180px] mobile:w-full btnSub disabled:cursor-not-allowed disabled:opacity-80 outline-none gap-[8px] flex justify-center items-center h-[44px] rounded-[8px] bg-[#612BD3] ps-[20px] pe-[16px]"
                >
                  {loading && (
                    <div className="absolute left-[50%] top-[50%] -translate-y-[50%] -translate-x-[50%]">
                      <div className="animate-spin h-[20px] w-[20px] border-4 border-white border-t-transparent rounded-full" />
                    </div>
                  )}
                  <div
                    className={clsx(
                      'text-[15px] font-[600] mobile:flex-1',
                      loading && 'invisible'
                    )}
                  >
                    {selectedIntegrations.length === 0
                      ? t('check_circles_above', 'Check the circles above')
                      : dummy
                      ? t('create_output', 'Create output')
                      : !existingData?.integration
                      ? t('add_to_calendar', 'Add to calendar')
                      : existingData?.posts?.[0]?.state === 'DRAFT'
                      ? t('schedule', 'Schedule')
                      : t('update', 'Update')}
                  </div>
                  {!dummy && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowPostNow(!showPostNow);
                      }}
                      className="flex justify-center items-center h-[20px] w-[20px] pt-[4px] mobile:pt-0 mobile:h-[44px] mobile:w-[44px] mobile:-me-[16px] mobile:border-s mobile:border-white/20 arrow-change"
                    >
                      <DropdownArrowSmallIcon
                        className={clsx(
                          'group-hover:rotate-180 text-white',
                          showPostNow && 'rotate-180'
                        )}
                      />
                    </div>
                  )}
                </button>

                {!dummy && (
                  <button
                    onClick={schedule('now')}
                    disabled={
                      selectedIntegrations.length === 0 ||
                      loading ||
                      locked ||
                      aiBusy
                    }
                    className={clsx(
                      'rounded-[8px] z-[300] disabled:cursor-not-allowed disabled:opacity-80 absolute bottom-[100%] -left-[12px] mobile:left-0 p-[12px] mobile:px-0 w-[206px] mobile:w-full bg-newBgColorInner',
                      showPostNow ? 'flex' : 'hidden group-hover:flex'
                    )}
                  >
                    <div className="text-white rounded-[8px] bg-[#D82D7E] h-[44px] w-full flex justify-center items-center post-now">
                      {t('post_now', 'Post Now')}
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const Scrollable: FC<{
  className: string;
  scrollClasses: string;
  children: ReactNode;
}> = ({ className, scrollClasses, children }) => {
  const ref = useRef(undefined);
  const hasScroll = useHasScroll(ref);
  return (
    <div className={clsx(className, hasScroll && scrollClasses)} ref={ref}>
      {children}
    </div>
  );
};
