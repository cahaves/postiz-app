import React, { createRef } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { SWRConfig, useSWRConfig } from 'swr';
import dayjs from 'dayjs';
import { ManageModal } from '../../apps/frontend/src/components/new-launch/manage.modal';
import { useLaunchStore } from '../../apps/frontend/src/components/new-launch/store';
import { ExistingDataContextProvider } from '../../apps/frontend/src/components/launches/helpers/use.existing.data';
import { UserContext } from '../../apps/frontend/src/components/layout/user.context';
import type { UseFormReturn } from 'react-hook-form';

const mockLiveForms = new Map<string, UseFormReturn>();
const mockClose = jest.fn();
const mockToast = jest.fn();
const mockDialog = jest.fn(async () => false);
const mockOpenModal = jest.fn();
const mockCloseById = jest.fn();
jest.mock('@copilotkit/react-ui', () => ({ CopilotPopup: () => null }));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => globalThis.fetch,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: mockToast }),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    closeAll: mockClose,
    openModal: mockOpenModal,
    closeById: mockCloseById,
  }),
}));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: (...args: any[]) => mockDialog(...args),
}));
jest.mock(
  '@gitroom/frontend/components/settings/shortlink-preference.component',
  () => ({ useShortlinkPreference: () => ({ data: { shortlink: 'ASK' } }) })
);
jest.mock(
  '@gitroom/frontend/components/new-launch/picks.socials.component',
  () => ({ PicksSocialsComponent: () => null })
);
jest.mock('@gitroom/frontend/components/new-launch/select.current', () => ({
  SelectCurrent: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/helpers/date.picker', () => ({
  DatePicker: () => null,
  DatePickerPanel: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/repeat.component', () => ({
  RepeatComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/tags.component', () => ({
  TagsComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/select.customer', () => ({
  SelectCustomer: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/new-launch/dummy.code.component',
  () => ({ DummyCodeComponent: () => null })
);
jest.mock(
  '@gitroom/frontend/components/launches/general.preview.component',
  () => ({ GeneralPreviewComponent: () => null })
);
jest.mock('@gitroom/frontend/components/launches/internal.channels', () => ({
  InternalChannels: () => null,
}));
jest.mock('@gitroom/frontend/components/media/new.uploader', () => ({
  useUppyUploader: () => ({ addFile: jest.fn() }),
}));
jest.mock('@uppy/react', () => ({ Dashboard: () => null }));
jest.mock('emoji-picker-react', () => ({
  __esModule: true,
  default: () => null,
  Theme: { DARK: 'dark' },
}));
jest.mock('@gitroom/frontend/components/media/media.component', () => ({
  MultiMediaComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/signature', () => ({
  SignatureBox: () => null,
}));
jest.mock('@gitroom/frontend/components/new-launch/add.post.button', () => ({
  AddPostButton: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/new-launch/providers/show.all.providers',
  () => {
    const React = require('react');
    const {
      useLaunchStore,
    } = require('../../apps/frontend/src/components/new-launch/store');
    const {
      withProvider,
      PostComment,
    } = require('../../apps/frontend/src/components/new-launch/providers/high.order.provider');
    const { useFormContext } = require('react-hook-form');
    const {
      useIntegration,
    } = require('../../apps/frontend/src/components/launches/helpers/use.integration');
    const Provider = withProvider({
      postComment: PostComment.ALL,
      minimumCharacters: [],
      maximumCharacters: 280,
      SettingsComponent: function SettingsFixture() {
        const form = useFormContext();
        const { integration } = useIntegration();
        React.useLayoutEffect(() => {
          mockLiveForms.set(integration.id, form);
          return () => {
            mockLiveForms.delete(integration.id);
          };
        }, [form, integration.id]);
        return null;
      },
    });
    return {
      Providers: [{ identifier: 'x', component: Provider }],
      ShowAllProviders: React.forwardRef((_: any, ref: any) => {
        const selected = useLaunchStore(
          (state: any) => state.selectedIntegrations
        );
        React.useImperativeHandle(ref, () => ({
          getAllValues: async () =>
            Promise.all(
              selected.map((item: any) => item.ref.current.getValues())
            ),
        }));
        return selected.map((item: any) => (
          <Provider
            key={item.integration.id}
            id={item.integration.id}
            ref={item.ref}
          />
        ));
      }),
    };
  }
);

const response = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});
let api: jest.Mock;
let mutate: jest.Mock;
let writingContext: {
  changeOrganization: (orgId: string) => void;
  revalidate: () => Promise<unknown>;
};
const WritingContext = ({ children }: { children: React.ReactNode }) => {
  const [orgId, setOrgId] = React.useState('test-org');
  const { mutate } = useSWRConfig();
  writingContext = {
    changeOrganization: setOrgId,
    revalidate: () =>
      mutate((key) => Array.isArray(key) && key[0] === 'ai-writing-profile'),
  };
  return (
    <UserContext.Provider value={{ orgId, role: 'ADMIN' } as any}>
      {children}
    </UserContext.Provider>
  );
};
const mount = (
  existing: any = {},
  strict = false,
  withWritingContext = false
) => {
  const composer = (
    <ExistingDataContextProvider value={existing}>
      <ManageModal
        date={useLaunchStore.getState().date}
        integrations={[]}
        reopenModal={() => {}}
        mutate={mutate}
      />
    </ExistingDataContextProvider>
  );
  const content = (
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      {withWritingContext ? (
        <WritingContext>{composer}</WritingContext>
      ) : (
        composer
      )}
    </SWRConfig>
  );
  return render(
    strict ? <React.StrictMode>{content}</React.StrictMode> : content
  );
};
const generate = async (action = 'now') => {
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Write' }) as HTMLButtonElement)
        .disabled
    ).toBe(false)
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Message to AI' }), {
    target: { value: 'A fresh post' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Action' }), {
    target: { value: action },
  });
  fireEvent.click(
    screen.getByRole('button', {
      name: action === 'now' ? 'Write & post now' : 'Write & schedule',
    })
  );
};

const mountSiblingDrafts = () => {
  const second = {
    id: 'second',
    name: 'Second channel',
    identifier: 'x',
    editor: 'normal',
  } as any;
  const state = useLaunchStore.getState();
  useLaunchStore.setState({
    current: 'channel',
    integrations: [...state.integrations, second],
    selectedIntegrations: [
      ...state.selectedIntegrations,
      { integration: second, settings: { __type: 'x' }, ref: createRef() },
    ],
    internal: [
      {
        integration: second,
        integrationValue: [
          { id: 'b', content: '<p>Second caption</p>', delay: 3, media: [] },
        ],
      },
    ],
    channelDates: { second: dayjs('2026-12-22T09:15:00Z') },
  });
  const base = api.getMockImplementation()!;
  api.mockImplementation((url, options) =>
    url === '/posts/valid'
      ? Promise.resolve(
          response(
            ['channel', 'second'].map((id) => ({
              id,
              name: id,
              identifier: 'x',
              valid: true,
              errors: true,
            }))
          )
        )
      : base(url, options)
  );
  mockOpenModal.mockImplementation((config) => render(config.children));
  return mount({
    integration: 'channel',
    group: 'first-group',
    posts: [{ id: 'a', state: 'DRAFT' }],
    siblings: [
      {
        integration: 'second',
        group: 'second-group',
        posts: [{ id: 'b', state: 'DRAFT' }],
      },
    ],
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLiveForms.clear();
  useLaunchStore.getState().reset();
  const integration = {
    id: 'channel',
    name: 'Test channel',
    identifier: 'x',
    editor: 'normal',
  } as any;
  useLaunchStore.setState({
    date: dayjs('2026-12-20T12:34:00Z'),
    editor: 'normal',
    global: [{ id: 'a', content: '<p>Old caption</p>', delay: 7, media: [] }],
    integrations: [integration],
    selectedIntegrations: [
      { integration, settings: { __type: 'x' }, ref: createRef() },
    ],
    tags: [{ value: 'tag', label: 'Launch' }],
    repeater: 3,
  });
  api = jest.fn(async (url) => {
    if (url.endsWith('capabilities')) return response({ configured: true });
    if (url === '/posts/ai-text/profile')
      return response({
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
      });
    if (url === '/posts/ai-text')
      return response({
        blocks: [{ id: 'a', content: 'Fresh caption' }],
        limits: [],
      });
    if (url === '/posts/valid')
      return response([
        {
          id: 'channel',
          name: 'Test channel',
          identifier: 'x',
          valid: true,
          errors: true,
        },
      ]);
    if (url === '/posts/should-shortlink') return response({ ask: false });
    if (url === '/posts') return response({});
    if (url.endsWith('internal-plugs')) return response({ internalPlugs: [] });
    throw new Error(`Unexpected fixture URL ${url}`);
  });
  globalThis.fetch = api;
  mutate = jest.fn();
});
afterEach(cleanup);

it.each(['revision', 'readiness', 'organization'])(
  'cancels publication when writing profile %s changes during native validation',
  async (change) => {
    let finishValidation: (value: any) => void;
    let profileRevision = 0;
    let profileAvailable = true;
    const base = api.getMockImplementation()!;
    api.mockImplementation((url, options) => {
      if (url === '/posts/valid')
        return new Promise((done) => {
          finishValidation = done;
        });
      if (url === '/posts/ai-text/profile')
        return Promise.resolve(
          response(
            {
              profile: {
                language: 'auto',
                tone: 'friendly',
                brandName: `Revision ${profileRevision}`,
                audience: '',
                brandFacts: '',
                voiceNotes: '',
                examples: [],
              },
              revision: profileRevision,
            },
            profileAvailable ? 200 : 503
          )
        );
      return base(url, options);
    });
    mount({}, false, true);
    await generate();
    await waitFor(() => expect(finishValidation!).toBeDefined());
    if (change === 'organization') {
      act(() => writingContext.changeOrganization('another-org'));
      await waitFor(() =>
        expect(
          api.mock.calls.filter(([url]) => url === '/posts/ai-text/profile')
        ).toHaveLength(2)
      );
    } else {
      profileRevision = change === 'revision' ? 2 : 0;
      profileAvailable = change !== 'readiness';
      await act(async () => {
        await writingContext.revalidate();
      });
      if (change === 'revision') await screen.findByDisplayValue('Revision 2');
      else await screen.findByText('Could not load writing preferences.');
    }
    await screen.findByText(
      'Writing preferences changed while saving. Check the calendar before posting again.'
    );
    await act(async () =>
      finishValidation!(
        response([{ id: 'channel', valid: true, errors: true }])
      )
    );
    expect(api.mock.calls.filter(([url]) => url === '/posts')).toHaveLength(0);
    expect(mockClose).not.toHaveBeenCalled();
    expect(screen.queryByText(/Save accepted/)).toBeNull();
  }
);

it('posts once with committed AI text through the actual editor, provider refs and native payload', async () => {
  const view = mount();
  await generate();
  await waitFor(() =>
    expect(api.mock.calls.filter(([url]) => url === '/posts')).toHaveLength(1)
  );
  const payload = JSON.parse(
    api.mock.calls.find(([url]) => url === '/posts')[1].body
  );
  expect(payload).toMatchObject({
    type: 'now',
    inter: 3,
    tags: [{ value: 'tag', label: 'Launch' }],
    posts: [
      {
        integration: { id: 'channel' },
        value: [
          { id: 'a', content: '<p>Fresh caption</p>', delay: 7, image: [] },
        ],
      },
    ],
  });
  expect(view.container.querySelector('.tiptap')?.textContent).toBe(
    'Fresh caption'
  );
  expect(
    useLaunchStore.getState().selectedIntegrations[0].ref?.current.getValues()
      .values[0].content
  ).toBe('<p>Fresh caption</p>');
});

it('schedules the exact native date and preserves shortlink choice', async () => {
  mount();
  await generate('schedule');
  await waitFor(() =>
    expect(api.mock.calls.filter(([url]) => url === '/posts')).toHaveLength(1)
  );
  expect(
    JSON.parse(api.mock.calls.find(([url]) => url === '/posts')[1].body)
  ).toMatchObject({
    type: 'schedule',
    date: '2026-12-20T12:34:00',
    shortLink: false,
  });
});

it.each([
  { valid: false, errors: true, settingsError: 'Choose a setting' },
  { valid: true, errors: 'Image is required' },
])(
  'keeps generated draft and never saves rejected native validation: %j',
  async (failure) => {
    const base = api.getMockImplementation()!;
    api.mockImplementation(async (url, options) =>
      url === '/posts/valid'
        ? response([
            { id: 'channel', name: 'Test', identifier: 'x', ...failure },
          ])
        : base(url, options)
    );
    mount();
    await generate();
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(api.mock.calls.filter(([url]) => url === '/posts')).toHaveLength(0);
    expect(useLaunchStore.getState().global[0].content).toBe(
      '<p>Fresh caption</p>'
    );
  }
);

it('cancels publication when tags change during awaited native validation', async () => {
  let resolve: (value: any) => void;
  const base = api.getMockImplementation()!;
  api.mockImplementation((url, options) =>
    url === '/posts/valid'
      ? new Promise((done) => {
          resolve = done;
        })
      : base(url, options)
  );
  mount();
  await generate();
  await waitFor(() => expect(resolve!).toBeDefined());
  act(() =>
    useLaunchStore.getState().setTags([{ value: 'new', label: 'Changed' }])
  );
  await act(async () =>
    resolve!(response([{ id: 'channel', valid: true, errors: true }]))
  );
  expect(api.mock.calls.filter(([url]) => url === '/posts')).toHaveLength(0);
  await screen.findByText(/Draft changed or submission cancelled/);
});

it('never retries an unknown POST outcome and releases loading', async () => {
  const base = api.getMockImplementation()!;
  api.mockImplementation(async (url, options) => {
    if (url === '/posts') throw new Error('Connection lost');
    return base(url, options);
  });
  mount();
  await generate();
  await screen.findByText(/Save status is unknown/);
  expect(api.mock.calls.filter(([url]) => url === '/posts')).toHaveLength(1);
  expect(mockClose).not.toHaveBeenCalled();
  expect(
    (
      screen.getByRole('button', {
        name: 'Write & post now',
      }) as HTMLButtonElement
    ).disabled
  ).toBe(false);
});

it('does not close or mutate a newly reset modal after an old POST response', async () => {
  let resolve: (value: any) => void;
  const base = api.getMockImplementation()!;
  api.mockImplementation((url, options) =>
    url === '/posts'
      ? new Promise((done) => {
          resolve = done;
        })
      : base(url, options)
  );
  mount();
  await generate();
  await waitFor(() => expect(resolve!).toBeDefined());
  act(() => {
    const state = useLaunchStore.getState();
    state.reset();
    useLaunchStore.setState({
      global: [{ id: 'new', content: '<p>New draft</p>', delay: 0, media: [] }],
    });
  });
  await act(async () => resolve!(response({})));
  expect(mockClose).not.toHaveBeenCalled();
  expect(mutate).not.toHaveBeenCalled();
  expect(useLaunchStore.getState().global[0].content).toBe('<p>New draft</p>');
});

it.each([
  'date',
  'channel-date',
  'media',
  'settings',
  'repeat',
  'other-channel',
])(
  'invalidates publication when %s changes during generation',
  async (field) => {
    let resolve: (value: any) => void;
    const base = api.getMockImplementation()!;
    api.mockImplementation((url, options) =>
      url === '/posts/ai-text'
        ? new Promise((done) => {
            resolve = done;
          })
        : base(url, options)
    );
    const integration = {
      id: 'second',
      name: 'Second',
      identifier: 'x',
      editor: 'normal',
    } as any;
    useLaunchStore.setState({
      selectedIntegrations: [
        ...useLaunchStore.getState().selectedIntegrations,
        { integration, settings: {}, ref: createRef() },
      ],
      internal: [
        {
          integration,
          integrationValue: [
            { id: 'other', content: 'Other content', delay: 0, media: [] },
          ],
        },
      ],
    });
    mount();
    await generate();
    await waitFor(() => expect(resolve!).toBeDefined());
    act(() => {
      const state = useLaunchStore.getState();
      if (field === 'date') state.setDate(dayjs('2027-01-01T00:00:00Z'));
      if (field === 'channel-date')
        state.setChannelDate('second', dayjs('2027-01-01T00:00:00Z'));
      if (field === 'media')
        state.setGlobalValueMedia(0, [{ id: 'media', path: '/synthetic.png' }]);
      if (field === 'repeat') state.setRepeater(7);
      if (field === 'settings')
        useLaunchStore.setState({
          selectedIntegrations: state.selectedIntegrations.map((item) => ({
            ...item,
            settings: { __type: 'x', changed: true },
          })),
        });
      if (field === 'other-channel')
        state.setInternalValueText('second', 0, 'Other manual change');
    });
    await act(async () =>
      resolve!(
        response({
          blocks: [{ id: 'a', content: 'Fresh caption' }],
          limits: [],
        })
      )
    );
    await screen.findByText(/Draft changed or submission cancelled/);
    expect(api.mock.calls.filter(([url]) => url === '/posts')).toHaveLength(0);
    expect(useLaunchStore.getState().global[0].content).toBe(
      '<p>Old caption</p>'
    );
  }
);

it.each(['Schedule all channels', 'Only Test channel'])(
  'preserves each channel date, group and save type when choosing %s',
  async (choice) => {
    mountSiblingDrafts();
    await generate('schedule');
    fireEvent.click(await screen.findByRole('button', { name: choice }));
    await waitFor(() => expect(mockClose).toHaveBeenCalledTimes(1));
    const requests = api.mock.calls
      .filter(([url]) => url === '/posts')
      .map(([, options]) => JSON.parse(options.body));
    expect(requests.map((request) => request.type)).toEqual(
      choice === 'Schedule all channels' ? ['schedule'] : ['schedule', 'draft']
    );
    expect(
      requests.every((request) => request.date === '2026-12-20T12:34:00')
    ).toBe(true);
    expect(requests.flatMap((request) => request.posts)).toMatchObject([
      {
        integration: { id: 'channel' },
        group: 'first-group',
        value: [{ id: 'a', content: '<p>Fresh caption</p>', delay: 7 }],
      },
      {
        integration: { id: 'second' },
        group: 'second-group',
        date: '2026-12-22T09:15:00',
        value: [{ id: 'b', content: '<p>Second caption</p>', delay: 3 }],
      },
    ]);
  }
);

it('cancels when a channel date changes during the channel selection confirmation', async () => {
  mountSiblingDrafts();
  await generate('schedule');
  const all = await screen.findByRole('button', {
    name: 'Schedule all channels',
  });
  act(() =>
    useLaunchStore
      .getState()
      .setChannelDate('second', dayjs('2027-01-01T00:00:00Z'))
  );
  fireEvent.click(all);
  await screen.findByText(/Draft changed or submission cancelled/);
  expect(api.mock.calls.filter(([url]) => url === '/posts')).toHaveLength(0);
  expect(mockClose).not.toHaveBeenCalled();
});

it('stops later channel saves when the draft changes after the first save', async () => {
  mountSiblingDrafts();
  let resolve: (value: any) => void;
  const base = api.getMockImplementation()!;
  api.mockImplementation((url, options) =>
    url === '/posts'
      ? new Promise((done) => {
          resolve = done;
        })
      : base(url, options)
  );
  await generate('schedule');
  fireEvent.click(
    await screen.findByRole('button', { name: 'Only Test channel' })
  );
  await waitFor(() => expect(resolve!).toBeDefined());
  act(() =>
    useLaunchStore
      .getState()
      .setChannelDate('second', dayjs('2027-01-01T00:00:00Z'))
  );
  await act(async () => resolve!(response({})));
  await screen.findByText(/Save status is unknown/);
  expect(api.mock.calls.filter(([url]) => url === '/posts')).toHaveLength(1);
  expect(mutate).toHaveBeenCalledTimes(1);
  expect(mockClose).not.toHaveBeenCalled();
});

it('reports a partial channel save without retrying when a later request is rejected', async () => {
  mountSiblingDrafts();
  const base = api.getMockImplementation()!;
  api.mockImplementation((url, options) =>
    url === '/posts' && JSON.parse(options.body).type === 'draft'
      ? Promise.resolve(response({ message: 'Rejected second channel' }, 400))
      : base(url, options)
  );
  await generate('schedule');
  fireEvent.click(
    await screen.findByRole('button', { name: 'Only Test channel' })
  );
  await screen.findByText(/Save status is unknown/);
  expect(api.mock.calls.filter(([url]) => url === '/posts')).toHaveLength(2);
  expect(mutate).toHaveBeenCalledTimes(1);
  expect(mockClose).not.toHaveBeenCalled();
});

it('preserves native shortlink confirmation and prevents duplicate native submit', async () => {
  let resolve: (value: any) => void;
  const base = api.getMockImplementation()!;
  api.mockImplementation((url, options) =>
    url === '/posts/should-shortlink'
      ? Promise.resolve(response({ ask: true }))
      : base(url, options)
  );
  mockDialog.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Save as Draft' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save as Draft' }));
  await waitFor(() => expect(resolve!).toBeDefined());
  await act(async () => resolve!(true));
  await waitFor(() =>
    expect(api.mock.calls.filter(([url]) => url === '/posts')).toHaveLength(1)
  );
  expect(
    JSON.parse(api.mock.calls.find(([url]) => url === '/posts')[1].body)
      .shortLink
  ).toBe(true);
});

it.each(['Republish the post', 'Just update the post details'])(
  'preserves the existing republish choice: %s',
  async (choice) => {
    mockOpenModal.mockImplementation((config) => render(config.children));
    mount({
      integration: 'channel',
      group: 'existing-group',
      posts: [{ id: 'post', state: 'PUBLISHED' }],
    });
    await generate();
    fireEvent.click(await screen.findByRole('button', { name: choice }));
    await waitFor(() =>
      expect(api.mock.calls.filter(([url]) => url === '/posts')).toHaveLength(1)
    );
    const payload = JSON.parse(
      api.mock.calls.find(([url]) => url === '/posts')[1].body
    );
    expect(payload.type).toBe(
      choice === 'Republish the post' ? 'now' : 'update'
    );
    expect(payload.republish).toBe(
      choice === 'Republish the post' ? true : undefined
    );
    expect(payload.posts[0].group).toBe('existing-group');
  }
);

it('does not call POST after an edit during shortlink confirmation', async () => {
  let resolve: (value: any) => void;
  const base = api.getMockImplementation()!;
  api.mockImplementation((url, options) =>
    url === '/posts/should-shortlink'
      ? Promise.resolve(response({ ask: true }))
      : base(url, options)
  );
  mockDialog.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  mount();
  await generate();
  await waitFor(() => expect(resolve!).toBeDefined());
  act(() => useLaunchStore.getState().setGlobalValueText(0, 'Manual edit'));
  await act(async () => resolve!(true));
  expect(api.mock.calls.filter(([url]) => url === '/posts')).toHaveLength(0);
});

it('keeps submission usable through React StrictMode effect cleanup', async () => {
  mount({}, true);
  await generate();
  await waitFor(() =>
    expect(api.mock.calls.filter(([url]) => url === '/posts')).toHaveLength(1)
  );
});

it('rejects a metadata change caused by another subscriber during the AI application commit', async () => {
  const stop = useLaunchStore.subscribe((state, previous) => {
    if (
      state.global[0]?.content === '<p>Fresh caption</p>' &&
      previous.global[0]?.content !== '<p>Fresh caption</p>'
    )
      state.setTags([{ value: 'changed-during-apply', label: 'Changed' }]);
  });
  mount();
  await generate();
  await waitFor(() =>
    expect(
      (
        screen.getByRole('button', {
          name: 'Write & post now',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
  );
  stop();
  expect(api.mock.calls.filter(([url]) => url === '/posts')).toHaveLength(0);
});

it('releases submission when the existing republish dialog is dismissed', async () => {
  mount({
    integration: 'channel',
    group: 'existing-group',
    posts: [{ state: 'PUBLISHED' }],
  });
  await generate();
  await waitFor(() => expect(mockOpenModal).toHaveBeenCalled());
  await act(async () => mockOpenModal.mock.calls[0][0].onClose?.());
  await screen.findByText(/Draft changed or submission cancelled/);
  expect(api.mock.calls.filter(([url]) => url === '/posts')).toHaveLength(0);
  expect(
    (
      screen.getByRole('button', {
        name: 'Write & post now',
      }) as HTMLButtonElement
    ).disabled
  ).toBe(false);
});

it('treats a server error after POST as an unknown outcome', async () => {
  const base = api.getMockImplementation()!;
  api.mockImplementation(async (url, options) =>
    url === '/posts'
      ? response({ message: 'Server error' }, 500)
      : base(url, options)
  );
  mount();
  await generate();
  await screen.findByText(/Save status is unknown/);
  expect(api.mock.calls.filter(([url]) => url === '/posts')).toHaveLength(1);
});

it('ignores a late rejection body after a modal session reset', async () => {
  let resolve: (value: any) => void;
  const base = api.getMockImplementation()!;
  api.mockImplementation(async (url, options) =>
    url === '/posts'
      ? {
          ok: false,
          status: 400,
          json: () =>
            new Promise((done) => {
              resolve = done;
            }),
        }
      : base(url, options)
  );
  mount();
  await generate();
  await waitFor(() => expect(resolve!).toBeDefined());
  act(() => useLaunchStore.getState().reset());
  await act(async () => resolve!({ message: 'Old rejected post' }));
  expect(mockToast).not.toHaveBeenCalled();
  expect(mockClose).not.toHaveBeenCalled();
});

it('prevents deletion while AI publication is generating', async () => {
  let resolve: (value: any) => void;
  const base = api.getMockImplementation()!;
  api.mockImplementation((url, options) =>
    url === '/posts/ai-text'
      ? new Promise((done) => {
          resolve = done;
        })
      : base(url, options)
  );
  mount({
    integration: 'channel',
    group: 'existing-group',
    posts: [{ state: 'DRAFT' }],
  });
  await generate();
  await waitFor(() => expect(resolve!).toBeDefined());
  const button = screen.getByRole('button', {
    name: 'Delete Post',
  }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.click(button);
  expect(mockDialog).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await act(async () =>
    resolve!(
      response({ blocks: [{ id: 'a', content: 'Fresh caption' }], limits: [] })
    )
  );
});

it.each(['channel', 'other'])(
  'cancels when live provider settings for %s change during AI application',
  async (changedChannel) => {
    const other = {
      id: 'other',
      name: 'Other channel',
      identifier: 'x',
      editor: 'normal',
    } as any;
    useLaunchStore.setState({
      selectedIntegrations: [
        ...useLaunchStore.getState().selectedIntegrations,
        { integration: other, settings: { __type: 'x' }, ref: createRef() },
      ],
      internal: [
        {
          integration: other,
          integrationValue: [
            { id: 'b', content: '<p>Other version</p>', delay: 2, media: [] },
          ],
        },
      ],
    });
    mount();
    await waitFor(() => expect(mockLiveForms.has(changedChannel)).toBe(true));
    const stop = useLaunchStore.subscribe((state, previous) => {
      if (
        state.global[0]?.content === '<p>Fresh caption</p>' &&
        previous.global[0]?.content !== '<p>Fresh caption</p>'
      ) {
        mockLiveForms.get(changedChannel)!.setValue('whoCanReply', 'followers');
      }
    });
    try {
      await generate();
      await waitFor(() =>
        expect(
          (
            screen.getByRole('button', {
              name: 'Write & post now',
            }) as HTMLButtonElement
          ).disabled
        ).toBe(false)
      );
      const state = useLaunchStore.getState();
      const changed = state.selectedIntegrations.find(
        (item) => item.integration.id === changedChannel
      )!;
      expect(changed.settings).toEqual({ __type: 'x' });
      expect(changed.ref?.current.getValues().settings).toEqual({
        __type: 'x',
        whoCanReply: 'followers',
      });
      expect(state.global[0].content).toBe('<p>Fresh caption</p>');
      expect(state.internal[0].integrationValue[0].content).toBe(
        '<p>Other version</p>'
      );
      expect(api.mock.calls.filter(([url]) => url === '/posts')).toHaveLength(
        0
      );
      await screen.findByText(/Draft changed or submission cancelled/);
    } finally {
      stop();
    }
  }
);

it.each(['global', 'channel'])(
  'publishes only authorized %s text while retaining original live settings and other channel versions',
  async (scope) => {
    const other = {
      id: 'other',
      name: 'Other channel',
      identifier: 'x',
      editor: 'normal',
    } as any;
    useLaunchStore.setState({
      current: scope,
      selectedIntegrations: [
        ...useLaunchStore.getState().selectedIntegrations,
        { integration: other, settings: { __type: 'x' }, ref: createRef() },
      ],
      internal: [
        {
          integration: other,
          integrationValue: [
            {
              id: 'b',
              content: '<p>Other version</p>',
              delay: 2,
              media: [
                {
                  id: 'media',
                  path: '/synthetic.png',
                  alt: 'Existing image',
                } as any,
              ],
            },
          ],
        },
      ],
    });
    mount();
    await waitFor(() => expect(mockLiveForms.size).toBe(2));
    act(() => {
      mockLiveForms.get('channel')!.setValue('whoCanReply', 'everyone');
      mockLiveForms.get('other')!.setValue('whoCanReply', 'followers');
    });
    await generate();
    await waitFor(() =>
      expect(api.mock.calls.filter(([url]) => url === '/posts')).toHaveLength(1)
    );
    const payload = JSON.parse(
      api.mock.calls.find(([url]) => url === '/posts')[1].body
    );
    expect(payload.posts).toMatchObject([
      {
        integration: { id: 'channel' },
        settings: { __type: 'x', whoCanReply: 'everyone' },
        value: [
          { id: 'a', content: '<p>Fresh caption</p>', delay: 7, image: [] },
        ],
      },
      {
        integration: { id: 'other' },
        settings: { __type: 'x', whoCanReply: 'followers' },
        value: [
          {
            id: 'b',
            content: '<p>Other version</p>',
            delay: 2,
            image: [
              { id: 'media', path: '/synthetic.png', alt: 'Existing image' },
            ],
          },
        ],
      },
    ]);
    expect(useLaunchStore.getState().global[0].content).toBe(
      scope === 'global' ? '<p>Fresh caption</p>' : '<p>Old caption</p>'
    );
  }
);
