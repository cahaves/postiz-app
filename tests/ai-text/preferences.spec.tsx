import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { SWRConfig } from 'swr';
import { UserContext } from '../../apps/frontend/src/components/layout/user.context';
import { AiWritingPreferences } from '../../apps/frontend/src/components/new-launch/ai.writing.preferences';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => globalThis.fetch,
}));

const defaults = {
  language: 'auto',
  tone: 'friendly',
  brandName: '',
  audience: '',
  brandFacts: '',
  voiceNotes: '',
  examples: [],
};
const response = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});
let api: jest.Mock;
let changed: jest.Mock;
const mount = (role = 'ADMIN', orgId = 'org-one') => {
  const result = render(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <UserContext.Provider value={{ role, orgId } as any}>
        <AiWritingPreferences disabled={false} onStateChange={changed} />
      </UserContext.Provider>
    </SWRConfig>
  );
  fireEvent.click(screen.getByText('Writing preferences'));
  return result;
};
beforeEach(() => {
  changed = jest.fn();
  api = jest.fn(async (_url, options) =>
    response(
      options?.method === 'POST'
        ? { ...JSON.parse(options.body), revision: 1 }
        : { profile: defaults, revision: 0 }
    )
  );
  globalThis.fetch = api;
});
afterEach(cleanup);
const edit = async () => {
  const field = await screen.findByRole('textbox', { name: 'Brand facts' });
  fireEvent.change(field, {
    target: { value: 'Cahaves builds booking software.' },
  });
};

it('loads workspace defaults, reports dirty state, and saves facts with the expected revision', async () => {
  mount();
  await waitFor(() =>
    expect(changed).toHaveBeenLastCalledWith({
      orgId: 'org-one',
      ready: true,
      dirty: false,
      revision: 0,
    })
  );
  await edit();
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({ dirty: true })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
  await screen.findByText('Writing preferences saved.');
  const body = JSON.parse(
    api.mock.calls.find(([, options]) => options?.method === 'POST')[1].body
  );
  expect(body).toEqual({
    profile: { ...defaults, brandFacts: 'Cahaves builds booking software.' },
    revision: 0,
  });
  expect(body).not.toHaveProperty('organizationId');
  await waitFor(() =>
    expect(changed).toHaveBeenLastCalledWith(
      expect.objectContaining({ dirty: false, revision: 1 })
    )
  );
});

it('retains edits on conflict and reloads only when requested', async () => {
  mount();
  await edit();
  api.mockImplementation(async (_url, options) =>
    response(
      options?.method === 'POST'
        ? {}
        : {
            profile: { ...defaults, brandName: 'Latest saved brand' },
            revision: 2,
          },
      options?.method === 'POST' ? 409 : 200
    )
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
  await screen.findByText(
    'Someone updated these preferences. Reload the saved version before editing again.'
  );
  expect(
    (
      screen.getByRole('textbox', {
        name: 'Brand facts',
      }) as HTMLTextAreaElement
    ).value
  ).toBe('Cahaves builds booking software.');
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({ dirty: true })
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Reload saved preferences' })
  );
  await waitFor(() =>
    expect(
      (screen.getByRole('textbox', { name: 'Brand name' }) as HTMLInputElement)
        .value
    ).toBe('Latest saved brand')
  );
  expect(
    (
      screen.getByRole('textbox', {
        name: 'Brand facts',
      }) as HTMLTextAreaElement
    ).value
  ).toBe('');
});

it('blocks generation state after load failure and supports retry', async () => {
  api.mockResolvedValue(response({}, 503));
  mount();
  await screen.findByText('Could not load writing preferences.');
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({ ready: false })
  );
  api.mockResolvedValue(response({ profile: defaults, revision: 0 }));
  fireEvent.click(screen.getByRole('button', { name: 'Retry preferences' }));
  await waitFor(() =>
    expect(changed).toHaveBeenLastCalledWith(
      expect.objectContaining({ ready: true })
    )
  );
});

it('shows saved preferences read-only for ordinary members', async () => {
  mount('USER');
  expect(
    (
      (await screen.findByRole('textbox', {
        name: 'Brand facts',
      })) as HTMLTextAreaElement
    ).disabled
  ).toBe(true);
  expect(screen.queryByRole('button', { name: 'Save preferences' })).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Add approved example' })
  ).toBeNull();
});

it('limits approved examples to five and discards unsaved edits', async () => {
  mount();
  await screen.findByRole('textbox', { name: 'Brand facts' });
  for (let i = 0; i < 5; i++)
    fireEvent.click(
      screen.getByRole('button', { name: 'Add approved example' })
    );
  expect(
    screen.getAllByRole('textbox', { name: /Approved example \d/ })
  ).toHaveLength(5);
  expect(
    (
      screen.getByRole('button', {
        name: 'Add approved example',
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  fireEvent.click(
    screen.getByRole('button', { name: 'Discard preference edits' })
  );
  expect(
    screen.queryAllByRole('textbox', { name: /Approved example \d/ })
  ).toHaveLength(0);
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({ dirty: false })
  );
});

it('keeps failed saves editable without reporting success', async () => {
  mount();
  await edit();
  api.mockRejectedValue(new Error('network offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
  await screen.findByText(
    'Could not save writing preferences. Your edits are still here.'
  );
  expect(screen.queryByText('Writing preferences saved.')).toBeNull();
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({ dirty: true })
  );
});

it('reloads the current profile when discarding edits after a conflict', async () => {
  mount();
  await edit();
  api.mockImplementation(async (_url, options) =>
    response(
      options?.method === 'POST'
        ? {}
        : { profile: { ...defaults, brandName: 'Current brand' }, revision: 3 },
      options?.method === 'POST' ? 409 : 200
    )
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
  await screen.findByText(
    'Someone updated these preferences. Reload the saved version before editing again.'
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Discard preference edits' })
  );
  await waitFor(() =>
    expect(changed).toHaveBeenLastCalledWith({
      orgId: 'org-one',
      ready: true,
      dirty: false,
      revision: 3,
    })
  );
  expect(
    (screen.getByRole('textbox', { name: 'Brand name' }) as HTMLInputElement)
      .value
  ).toBe('Current brand');
});

it('fails closed for malformed successful profile responses', async () => {
  api.mockResolvedValue(
    response({ profile: { language: 'auto' }, revision: 0 })
  );
  mount();
  await screen.findByText('Could not load writing preferences.');
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({ ready: false })
  );
});
