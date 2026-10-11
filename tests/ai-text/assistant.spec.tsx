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
import * as assistant from '../../apps/frontend/src/components/new-launch/ai.text.assistant';
import { useLaunchStore } from '../../apps/frontend/src/components/new-launch/store';

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
let api: jest.Mock;
let submit: jest.Mock;
const mount = (canPublish = true) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <assistant.AiTextAssistant
        disabled={false}
        canPublish={canPublish}
        onBusyChange={() => {}}
        capturePublication={async () => 'snapshot'}
        onApplyAndSubmit={submit}
      />
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
  api = jest.fn(async (url) =>
    response(url.includes('capabilities') ? { configured: true } : generated)
  );
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

it('blocks blank prompts and exposes missing configuration with retry', async () => {
  api.mockImplementation(async () =>
    response({ configured: false, reason: 'missing-provider-key' })
  );
  mount();
  await screen.findByText(/AI writing is not configured/);
  expect(
    (screen.getByRole('button', { name: 'Write' }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
  api.mockImplementation(async (url) =>
    response(url.includes('capabilities') ? { configured: true } : generated)
  );
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
  api.mockImplementation((url) =>
    url.includes('capabilities')
      ? Promise.resolve(response({ configured: true }))
      : new Promise((done) => {
          resolve = done;
        })
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
    api.mockImplementation(async (url) =>
      response(
        url.includes('capabilities') ? { configured: true } : {},
        url.includes('capabilities') ? 200 : status
      )
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
  api.mockImplementation(async (url) =>
    response(
      url.includes('capabilities')
        ? { configured: true }
        : { blocks: [{ id: 'wrong', content: 'Bad' }], limits: [] }
    )
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
  api.mockImplementation(async (url) =>
    response(url.includes('capabilities') ? { configured: true } : null)
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
