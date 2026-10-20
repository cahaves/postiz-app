import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { SWRConfig } from 'swr';
import dayjs from 'dayjs';
import * as assistant from '../../apps/frontend/src/components/new-launch/ai.text.assistant';
import { useLaunchStore } from '../../apps/frontend/src/components/new-launch/store';
import { UserContext } from '../../apps/frontend/src/components/layout/user.context';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => globalThis.fetch,
}));

const response = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});
const generated = {
  blocks: [{ id: 'a', content: 'Fresh caption' }],
  limits: [],
};
const writingProfile = {
  profile: {
    language: 'auto',
    tone: 'friendly',
    brandName: '',
    audience: '',
    brandFacts: '',
    voiceNotes: '',
    examples: [],
  },
  revision: 0,
};
let api: jest.Mock;
let submit: jest.Mock;
const mount = (canPublish = true) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <UserContext.Provider value={{ orgId: 'test-org', role: 'ADMIN' } as any}>
        <assistant.AiTextAssistant
          disabled={false}
          canPublish={canPublish}
          onBusyChange={() => {}}
          capturePublication={async () => 'snapshot'}
          onApplyAndSubmit={submit}
        />
      </UserContext.Provider>
    </SWRConfig>
  );
const send = async (text = 'Write a caption') => {
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Write' }) as HTMLButtonElement)
        .disabled
    ).toBe(false)
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Message to AI' }), {
    target: { value: text },
  });
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Write' }))
  );
};
beforeEach(() => {
  useLaunchStore.getState().reset();
  const integration = {
    id: 'channel',
    name: 'Test channel',
    identifier: 'x',
    editor: 'normal',
  } as any;
  useLaunchStore.setState({
    editor: 'normal',
    global: [{ id: 'a', content: '', delay: 7, media: [] }],
    selectedIntegrations: [
      { integration, settings: { __type: 'x', whoCanReply: 'everyone' } },
    ],
  });
  api = jest.fn(async (url) => {
    if (url === '/posts/ai-text/capabilities')
      return response({ configured: true });
    if (url === '/posts/ai-text/profile') return response(writingProfile);
    if (url === '/posts/ai-text') return response(generated);
    throw new Error(`Unexpected fixture URL ${url}`);
  });
  globalThis.fetch = api;
  submit = jest.fn(async () => ({ status: 'accepted' }));
});
afterEach(cleanup);

it('writes from an empty draft, ignores publish language, and applies only on explicit Apply', async () => {
  mount();
  await send('Write and publish this now');
  await screen.findByLabelText('Suggested text');
  expect(submit).not.toHaveBeenCalled();
  expect(useLaunchStore.getState().global[0].content).toBe('');
  expect(
    JSON.parse(api.mock.calls.find(([url]) => url === '/posts/ai-text')[1].body)
  ).toMatchObject({
    writingProfileRevision: 0,
    channels: [
      { integrationId: 'channel', settings: { whoCanReply: 'everyone' } },
    ],
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apply to draft' }));
  expect(useLaunchStore.getState().global[0]).toEqual({
    id: 'a',
    content: '<p>Fresh caption</p>',
    delay: 7,
    media: [],
  });
});

it('refines the candidate and discards without changing the draft', async () => {
  mount();
  await send();
  await screen.findByLabelText('Suggested text');
  await send('Make it shorter');
  await waitFor(() =>
    expect(
      api.mock.calls.filter(([url]) => url === '/posts/ai-text')
    ).toHaveLength(2)
  );
  const request = JSON.parse(
    api.mock.calls.filter(([url]) => url === '/posts/ai-text')[1][1].body
  );
  expect(request.blocks).toEqual(generated.blocks);
  expect(request.history.map((item: any) => item.role)).toEqual([
    'user',
    'assistant',
  ]);
  await screen.findByRole('button', { name: 'Discard' });
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
  expect(screen.queryByRole('button', { name: 'Apply to draft' })).toBeNull();
  expect(useLaunchStore.getState().global[0].content).toBe('');
});

it.each([
  ['threads', false, 'stored'],
  ['threads', true, 'stored'],
  ['threads', false, 'form'],
  ['threads', true, 'form'],
  ['x', true, 'form'],
])(
  'keeps %s finisher=%s in native %s settings without sending it to AI',
  async (identifier, active, source) => {
    const selected = useLaunchStore.getState().selectedIntegrations[0];
    const providerSettings =
      identifier === 'x' ? { who_can_reply_post: 'everyone' } : {};
    const settings = {
      __type: identifier,
      ...providerSettings,
      active_thread_finisher: active,
      thread_finisher: 'A supplied ending that belongs to native publication.',
    };
    const original = JSON.parse(JSON.stringify(settings));
    const form = { getValues: () => ({ settings }) };
    useLaunchStore.setState({
      selectedIntegrations: [
        {
          ...selected,
          integration: { ...selected.integration, identifier },
          settings: source === 'stored' ? settings : {},
          ...(source === 'form' ? { ref: { current: form } as any } : {}),
        },
      ],
    });
    const before = useLaunchStore.getState().captureAiTextSource();
    mount();
    await send();
    await screen.findByLabelText('Suggested text');
    const payload = JSON.parse(
      api.mock.calls.find(([url]) => url === '/posts/ai-text')[1].body
    );
    expect(payload.channels).toEqual([
      { integrationId: 'channel', settings: providerSettings },
    ]);
    expect(useLaunchStore.getState().captureAiTextSource()).toEqual(before);
    fireEvent.click(screen.getByRole('button', { name: 'Apply to draft' }));
    const retained = useLaunchStore.getState().selectedIntegrations[0];
    expect(
      source === 'form'
        ? retained.ref.current.getValues().settings
        : retained.settings
    ).toEqual(original);
    expect(settings).toEqual(original);
    expect(submit).not.toHaveBeenCalled();
  }
);

it('blocks blank prompts and exposes missing configuration with retry', async () => {
  const base = api.getMockImplementation()!;
  api.mockImplementation(async () =>
    response({ configured: false, reason: 'missing-provider-key' })
  );
  mount();
  await screen.findByText(/AI writing is not configured/);
  expect(
    (screen.getByRole('button', { name: 'Write' }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
  api.mockImplementation(base);
  fireEvent.click(screen.getByRole('button', { name: 'Retry availability' }));
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Write' }) as HTMLButtonElement)
        .disabled
    ).toBe(false)
  );
  fireEvent.click(screen.getByRole('button', { name: 'Write' }));
  expect(
    api.mock.calls.filter(([url]) => url === '/posts/ai-text')
  ).toHaveLength(0);
  await screen.findByRole('alert');
});

it('ignores a late response after cancel or a source change', async () => {
  let resolve: (value: any) => void;
  const base = api.getMockImplementation()!;
  api.mockImplementation((url, options) =>
    url === '/posts/ai-text'
      ? new Promise((done) => {
          resolve = done;
        })
      : base(url, options)
  );
  mount();
  await send();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await act(async () => resolve!(response(generated)));
  expect(screen.queryByRole('button', { name: 'Apply to draft' })).toBeNull();
  await send();
  act(() => useLaunchStore.getState().setGlobalValueText(0, 'Manual change'));
  await act(async () => resolve!(response(generated)));
  expect(useLaunchStore.getState().global[0].content).toBe('Manual change');
  expect(screen.queryByRole('button', { name: 'Apply to draft' })).toBeNull();
});

it.each([403, 429, 502, 503, 504])(
  'keeps the draft unchanged and allows retry after generation HTTP %i',
  async (status) => {
    const base = api.getMockImplementation()!;
    api.mockImplementation(async (url, options) =>
      url === '/posts/ai-text' ? response({}, status) : base(url, options)
    );
    mount();
    await send();
    await screen.findByRole('alert');
    expect(useLaunchStore.getState().global[0].content).toBe('');
    expect(
      (screen.getByRole('button', { name: 'Write' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  }
);

it('rejects invalid block IDs without offering Apply', async () => {
  const base = api.getMockImplementation()!;
  api.mockImplementation(async (url, options) =>
    url === '/posts/ai-text'
      ? response({ blocks: [{ id: 'wrong', content: 'Bad' }], limits: [] })
      : base(url, options)
  );
  mount();
  await send();
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Apply to draft' })).toBeNull();
  expect(useLaunchStore.getState().global[0].content).toBe('');
});

it('discloses inherited channel versions and disables global writing when all channels override', async () => {
  useLaunchStore.setState({ current: 'channel' });
  mount();
  await screen.findByText(/Applying creates a separate text version/);
  await send();
  await screen.findByLabelText('Suggested text');
  fireEvent.click(screen.getByRole('button', { name: 'Apply to draft' }));
  expect(
    useLaunchStore.getState().internal[0].integrationValue[0].content
  ).toBe('<p>Fresh caption</p>');
  expect(useLaunchStore.getState().global[0].content).toBe('');
  act(() => useLaunchStore.getState().setCurrent('global'));
  await screen.findByText(/Select a channel that uses this text/);
  expect(
    (screen.getByRole('button', { name: 'Write' }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
});

it('only offers Write for dummy and template modes', async () => {
  mount(false);
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Write' }) as HTMLButtonElement)
        .disabled
    ).toBe(false)
  );
  expect(screen.queryByRole('option', { name: 'Write & post now' })).toBeNull();
  expect(screen.queryByRole('option', { name: 'Write & schedule' })).toBeNull();
});

it('preserves paragraph breaks when refining existing rich text', async () => {
  useLaunchStore
    .getState()
    .setGlobalValueText(0, '<p>First paragraph</p><p>Second<br>line</p>');
  mount();
  await send();
  await screen.findByLabelText('Suggested text');
  expect(
    JSON.parse(api.mock.calls.find(([url]) => url === '/posts/ai-text')[1].body)
      .blocks
  ).toEqual([{ id: 'a', content: 'First paragraph\nSecond\nline' }]);
});

it('clears conversation when a publishing session resets, even before the save resolves', async () => {
  let resolve: (value: any) => void;
  submit.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  mount();
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Write' }) as HTMLButtonElement)
        .disabled
    ).toBe(false)
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Message to AI' }), {
    target: { value: 'Make a post' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Action' }), {
    target: { value: 'now' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Write & post now' }));
  await waitFor(() => expect(resolve!).toBeDefined());
  act(() => useLaunchStore.getState().reset());
  await act(async () => resolve!({ status: 'accepted' }));
  expect(screen.queryByText(/Save accepted/)).toBeNull();
  expect(screen.queryByText(/Recent conversation/)).toBeNull();
});

it('reports null JSON as invalid AI output instead of exposing an implementation exception', async () => {
  const base = api.getMockImplementation()!;
  api.mockImplementation(async (url, options) =>
    url === '/posts/ai-text' ? response(null) : base(url, options)
  );
  mount();
  await send();
  expect((await screen.findByRole('alert')).textContent).toBe(
    'AI returned an invalid result. Your draft has not changed.'
  );
  expect(useLaunchStore.getState().global[0].content).toBe('');
});

it('invalidates a global candidate if its applicable channels change through an override', async () => {
  mount();
  await send();
  await screen.findByLabelText('Suggested text');
  act(() => {
    const integration =
      useLaunchStore.getState().selectedIntegrations[0].integration;
    useLaunchStore.setState({
      internal: [
        {
          integration,
          integrationValue: [
            { id: 'a', content: 'Separate version', delay: 0, media: [] },
          ],
        },
      ],
    });
  });
  expect(screen.queryByRole('button', { name: 'Apply to draft' })).toBeNull();
  expect(useLaunchStore.getState().global[0].content).toBe('');
});

it('waits for writing preferences before allowing generation', async () => {
  let resolve: (value: any) => void;
  const base = api.getMockImplementation()!;
  api.mockImplementation((url, options) =>
    url === '/posts/ai-text/profile'
      ? new Promise((done) => {
          resolve = done;
        })
      : base(url, options)
  );
  mount();
  await screen.findByText('Loading writing preferences…');
  const write = screen.getByRole('button', {
    name: 'Write',
  }) as HTMLButtonElement;
  expect(write.disabled).toBe(true);
  fireEvent.click(write);
  expect(
    api.mock.calls.filter(([url]) => url === '/posts/ai-text')
  ).toHaveLength(0);
  await act(async () => resolve!(response(writingProfile)));
  await send();
  await screen.findByLabelText('Suggested text');
});

it('blocks generation after a profile load failure and recovers through Retry preferences', async () => {
  const base = api.getMockImplementation()!;
  api.mockImplementation((url, options) =>
    url === '/posts/ai-text/profile'
      ? Promise.resolve(response({}, 503))
      : base(url, options)
  );
  mount();
  await screen.findByText('Could not load writing preferences.');
  const write = screen.getByRole('button', {
    name: 'Write',
  }) as HTMLButtonElement;
  expect(write.disabled).toBe(true);
  fireEvent.click(write);
  expect(
    api.mock.calls.filter(([url]) => url === '/posts/ai-text')
  ).toHaveLength(0);
  api.mockImplementation(base);
  fireEvent.click(screen.getByRole('button', { name: 'Retry preferences' }));
  await send();
  await screen.findByLabelText('Suggested text');
  expect(
    api.mock.calls.filter(([url]) => url === '/posts/ai-text/profile')
  ).toHaveLength(2);
});

it('blocks unsaved preferences and starts fresh after editing and saving the writing profile', async () => {
  mount();
  await send();
  await screen.findByLabelText('Suggested text');
  expect(screen.getByText(/Recent conversation/)).toBeTruthy();
  fireEvent.click(screen.getByText('Writing preferences'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Brand facts' }), {
    target: { value: 'Cahaves builds booking software.' },
  });
  const write = screen.getByRole('button', {
    name: 'Write',
  }) as HTMLButtonElement;
  expect(write.disabled).toBe(true);
  expect(screen.queryByLabelText('Suggested text')).toBeNull();
  expect(screen.queryByText(/Recent conversation/)).toBeNull();
  fireEvent.click(write);
  expect(
    api.mock.calls.filter(([url]) => url === '/posts/ai-text')
  ).toHaveLength(1);

  let resolve: (value: any) => void;
  const base = api.getMockImplementation()!;
  api.mockImplementation((url, options) =>
    url === '/posts/ai-text/profile' && options?.method === 'POST'
      ? new Promise((done) => {
          resolve = done;
        })
      : base(url, options)
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
  await screen.findByRole('button', { name: 'Saving…' });
  expect(write.disabled).toBe(true);
  const saved = {
    profile: {
      ...writingProfile.profile,
      brandFacts: 'Cahaves builds booking software.',
    },
    revision: 1,
  };
  await act(async () => resolve!(response(saved)));
  await screen.findByText('Writing preferences saved.');
  expect(screen.queryByLabelText('Suggested text')).toBeNull();
  expect(screen.queryByText(/Recent conversation/)).toBeNull();
  expect(useLaunchStore.getState().global[0].content).toBe('');

  await send('Write with the saved preferences');
  await screen.findByLabelText('Suggested text');
  const requests = api.mock.calls.filter(([url]) => url === '/posts/ai-text');
  expect(requests).toHaveLength(2);
  expect(JSON.parse(requests[1][1].body)).toMatchObject({
    writingProfileRevision: 1,
    history: [],
    blocks: [{ id: 'a', content: '' }],
  });
});

it('reloads a conflicting writing profile before accepting another generation and never publishes the rejected result', async () => {
  let resolveProfile: (value: any) => void;
  let profileReads = 0;
  let generations = 0;
  const base = api.getMockImplementation()!;
  api.mockImplementation((url, options) => {
    if (url === '/posts/ai-text/profile') {
      profileReads++;
      return profileReads === 1
        ? Promise.resolve(response({ ...writingProfile, revision: 7 }))
        : new Promise((done) => {
            resolveProfile = done;
          });
    }
    if (url === '/posts/ai-text' && ++generations === 2)
      return Promise.resolve(response({}, 409));
    return base(url, options);
  });
  mount();
  await send();
  await screen.findByLabelText('Suggested text');
  fireEvent.change(screen.getByRole('textbox', { name: 'Message to AI' }), {
    target: { value: 'Publish this revision' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Action' }), {
    target: { value: 'now' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Write & post now' }));
  await screen.findByText(
    'Writing preferences changed. Review the reloaded preferences and try again.'
  );
  await waitFor(() => expect(resolveProfile!).toBeDefined());
  expect(profileReads).toBe(2);
  expect(submit).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Suggested text')).toBeNull();
  expect(screen.queryByText(/Recent conversation/)).toBeNull();
  expect(
    (
      screen.getByRole('button', {
        name: 'Write & post now',
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(useLaunchStore.getState().global[0].content).toBe('');

  await act(async () =>
    resolveProfile!(
      response({
        profile: { ...writingProfile.profile, brandName: 'Reloaded brand' },
        revision: 8,
      })
    )
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole('button', {
          name: 'Write & post now',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
  );
  expect(generations).toBe(2);
  fireEvent.change(screen.getByRole('combobox', { name: 'Action' }), {
    target: { value: 'write' },
  });
  await send('Write with the reloaded preferences');
  await screen.findByLabelText('Suggested text');
  const requests = api.mock.calls
    .filter(([url]) => url === '/posts/ai-text')
    .map(([, options]) => JSON.parse(options.body));
  expect(requests.map((request) => request.writingProfileRevision)).toEqual([
    7, 7, 8,
  ]);
  expect(requests[2]).toMatchObject({
    history: [],
    blocks: [{ id: 'a', content: '' }],
  });
  expect(submit).not.toHaveBeenCalled();
});

it.each([false, true])(
  'summarizes effective channel dates with a single channel override and multiple channels=%s',
  async (multiple) => {
    const date = dayjs('2026-12-20T12:34:00Z');
    const override = dayjs('2026-12-22T09:15:00Z');
    const selected = useLaunchStore.getState().selectedIntegrations;
    useLaunchStore.setState({
      date,
      selectedIntegrations: multiple
        ? [
            ...selected,
            {
              integration: {
                ...selected[0].integration,
                id: 'second',
                name: 'Second channel',
              },
              settings: { __type: 'x' },
            },
          ]
        : selected,
      channelDates: { channel: override, unselected: date.add(5, 'day') },
    });
    mount();
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Write' }) as HTMLButtonElement)
          .disabled
      ).toBe(false)
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Action' }), {
      target: { value: 'schedule' },
    });
    const summary = screen.getByText(
      /Final save affects all selected channels:/
    ).textContent;
    expect(summary).toContain(
      `Test channel: ${override.format(
        'DD/MM/YYYY HH:mm Z'
      )} (UTC${override.format('Z')})`
    );
    expect(summary).not.toContain(
      `Test channel: ${date.format('DD/MM/YYYY HH:mm Z')}`
    );
    if (multiple)
      expect(summary).toContain(
        `Second channel: ${date.format('DD/MM/YYYY HH:mm Z')} (UTC${date.format(
          'Z'
        )})`
      );
    expect(summary).not.toContain(date.add(5, 'day').format('DD/MM/YYYY'));
  }
);
