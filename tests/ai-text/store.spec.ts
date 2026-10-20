import dayjs from 'dayjs';
import { createRef } from 'react';
import { useLaunchStore } from '../../apps/frontend/src/components/new-launch/store';

const channel = (id: string) => ({ id, identifier: 'test', name: id } as any);
const block = (id: string, content: string) => ({
  id,
  content,
  delay: 17,
  media: [
    { id: 'image', path: '/image', thumbnail: '/thumb', alt: 'Description' },
  ],
});
const output = () => [
  { id: 'block-a', content: 'New caption\nSecond line' },
  { id: 'block-b', content: '<script>alert("literal")</script>' },
];

beforeEach(() => {
  useLaunchStore.getState().reset();
  useLaunchStore.setState({
    editor: 'normal',
    current: 'global',
    selectedIntegrations: ['a', 'b'].map((id) => ({
      integration: channel(id),
      settings: { preserved: id },
      ref: createRef(),
    })),
    global: [
      block('block-a', '<p>Old A</p>'),
      block('block-b', '<p>Old B</p>'),
    ],
    internal: [
      {
        integration: channel('b'),
        integrationValue: [block('other', 'Override')],
      },
    ],
    tags: [{ label: 'Tag', value: 'tag' }],
    date: dayjs('2027-01-02'),
    repeater: 7,
  });
});

it('captures an independent snapshot of exact ordered source text and selected channels', () => {
  const state = useLaunchStore.getState();
  const snapshot = state.captureAiTextSource();
  expect(snapshot).toEqual({
    session: state.aiTextSession,
    scope: 'global',
    editor: 'normal',
    selectedIntegrationIds: ['a', 'b'],
    internalExists: false,
    blocks: [
      { id: 'block-a', content: '<p>Old A</p>' },
      { id: 'block-b', content: '<p>Old B</p>' },
    ],
  });
  expect(snapshot.blocks[0]).not.toBe(state.global[0]);
});

it('changes only global content and preserves all unrelated state and identities', () => {
  const expected = useLaunchStore.getState().captureAiTextSource();
  const before = useLaunchStore.getState();
  const result = before.applyAiText(expected, output());
  expect(result).toEqual({ applied: true });
  const after = useLaunchStore.getState();
  expect(after.global[0]).toEqual({
    ...before.global[0],
    content: '<p>New caption</p><p>Second line</p>',
  });
  expect(after.global[1].content).toBe(
    '<p>&lt;script&gt;alert(&quot;literal&quot;)&lt;/script&gt;</p>'
  );
  expect(after.global[0].media).toBe(before.global[0].media);
  expect(after.selectedIntegrations).toBe(before.selectedIntegrations);
  expect(after.internal).toBe(before.internal);
  expect({ ...after, global: before.global }).toEqual(before);
});

it('updates an existing override without changing global or other overrides', () => {
  useLaunchStore.setState({
    current: 'b',
    internal: [
      {
        integration: channel('a'),
        integrationValue: [block('other', 'Other')],
      },
      {
        integration: channel('b'),
        integrationValue: [block('block-a', 'Specific')],
      },
    ],
  });
  const before = useLaunchStore.getState();
  expect(before.captureAiTextSource().internalExists).toBe(true);
  expect(
    before.applyAiText(before.captureAiTextSource(), [output()[0]])
  ).toEqual({ applied: true });
  const after = useLaunchStore.getState();
  expect(after.global).toBe(before.global);
  expect(after.internal[0]).toBe(before.internal[0]);
  expect(after.internal[1].integration).toBe(before.internal[1].integration);
  expect(after.internal[1].integrationValue[0]).toEqual({
    ...before.internal[1].integrationValue[0],
    content: '<p>New caption</p><p>Second line</p>',
  });
  expect(after.internal[1].integrationValue[0].media).toBe(
    before.internal[1].integrationValue[0].media
  );
});

it('creates exactly one inherited override using current live non-text values', () => {
  useLaunchStore.setState({ current: 'a' });
  const expected = useLaunchStore.getState().captureAiTextSource();
  useLaunchStore.getState().setGlobalDelay(0, 99);
  useLaunchStore
    .getState()
    .setGlobalValueMedia(0, [{ id: 'new-image', path: '/new' }]);
  useLaunchStore.setState({
    date: dayjs('2027-02-03'),
    tags: [{ label: 'New', value: 'new' }],
    repeater: 14,
  });
  const before = useLaunchStore.getState();
  expect(before.applyAiText(expected, output())).toEqual({ applied: true });
  const after = useLaunchStore.getState();
  expect(after.global).toBe(before.global);
  expect(after.internal).toHaveLength(2);
  expect(after.internal[0]).toBe(before.internal[0]);
  expect(after.internal[1].integration).toBe(
    before.selectedIntegrations[0].integration
  );
  expect(after.internal[1].integrationValue[0]).toEqual({
    ...before.global[0],
    content: '<p>New caption</p><p>Second line</p>',
  });
  expect(after.internal[1].integrationValue[0].media).toBe(
    before.global[0].media
  );
  expect({ ...after, internal: before.internal }).toEqual(before);
  expect(after.applyAiText(expected, output())).toEqual({
    applied: false,
    reason: 'stale',
  });
  expect(useLaunchStore.getState()).toBe(after);
});

it.each([
  ['text', () => useLaunchStore.getState().setGlobalValueText(0, 'Edited')],
  ['scope', () => useLaunchStore.getState().setCurrent('a')],
  ['editor', () => useLaunchStore.getState().setEditor('html')],
  [
    'selection',
    () =>
      useLaunchStore.setState({
        selectedIntegrations: useLaunchStore
          .getState()
          .selectedIntegrations.slice(1),
      }),
  ],
  [
    'selection order',
    () =>
      useLaunchStore.setState({
        selectedIntegrations: [
          ...useLaunchStore.getState().selectedIntegrations,
        ].reverse(),
      }),
  ],
  [
    'block order with reused IDs',
    () => useLaunchStore.getState().changeOrderGlobal(0, 'down'),
  ],
  [
    'deletion with reused IDs',
    () => useLaunchStore.getState().deleteGlobalValue(0),
  ],
  [
    'override creation',
    () => {
      useLaunchStore.getState().setCurrent('a');
      useLaunchStore.getState().addRemoveInternal('a');
    },
  ],
] as const)('rejects stale %s without any mutation', (_, mutate) => {
  const expected = useLaunchStore.getState().captureAiTextSource();
  mutate();
  const before = useLaunchStore.getState();
  expect(before.applyAiText(expected, output())).toEqual({
    applied: false,
    reason: 'stale',
  });
  expect(useLaunchStore.getState()).toBe(before);
});

it('rejects override removal or creation even when inherited text is identical', () => {
  useLaunchStore.setState({ current: 'a' });
  const inherited = useLaunchStore.getState().captureAiTextSource();
  useLaunchStore.getState().addRemoveInternal('a');
  const specific = useLaunchStore.getState().captureAiTextSource();
  const before = useLaunchStore.getState();
  expect(before.applyAiText(inherited, output())).toEqual({
    applied: false,
    reason: 'stale',
  });
  expect(useLaunchStore.getState()).toBe(before);
  before.addRemoveInternal('a');
  expect(useLaunchStore.getState().applyAiText(specific, output())).toEqual({
    applied: false,
    reason: 'stale',
  });
});

it('rejects old requests after reset and reseeding the identical draft', () => {
  const before = useLaunchStore.getState();
  const expected = before.captureAiTextSource();
  before.reset();
  const session = useLaunchStore.getState().aiTextSession;
  useLaunchStore.setState({ ...before, aiTextSession: session });
  expect(session).toBeGreaterThan(expected.session);
  expect(useLaunchStore.getState().applyAiText(expected, output())).toEqual({
    applied: false,
    reason: 'stale',
  });
});

it.each([
  [],
  [output()[0]],
  [...output(), { id: 'extra', content: 'Extra' }],
  [output()[0], output()[0]],
  [output()[1], output()[0]],
  [output()[0], { id: 'block-b', content: null }],
  [output()[0], { id: 'block-b', content: 'x'.repeat(20001) }],
  null,
])('rejects invalid output atomically: %j', (blocks) => {
  const before = useLaunchStore.getState();
  expect(
    before.applyAiText(before.captureAiTextSource(), blocks as any)
  ).toEqual({ applied: false, reason: 'invalid' });
  expect(useLaunchStore.getState()).toBe(before);
});

it('preserves live global media, settings, refs, delay, date and tags changed after capture', () => {
  const expected = useLaunchStore.getState().captureAiTextSource();
  useLaunchStore.getState().setGlobalDelay(0, 88);
  useLaunchStore
    .getState()
    .setGlobalValueMedia(0, [{ id: 'live', path: '/live' }]);
  useLaunchStore.setState({
    selectedIntegrations: useLaunchStore
      .getState()
      .selectedIntegrations.map((entry) => ({
        ...entry,
        settings: { live: true },
      })),
    date: dayjs('2027-03-04'),
    tags: [],
  });
  const before = useLaunchStore.getState();
  expect(before.applyAiText(expected, output())).toEqual({ applied: true });
  const after = useLaunchStore.getState();
  expect(after.global[0].delay).toBe(88);
  expect(after.global[0].media).toBe(before.global[0].media);
  expect(after.selectedIntegrations).toBe(before.selectedIntegrations);
  expect(after.date).toBe(before.date);
  expect(after.tags).toBe(before.tags);
});

it('rejects sparse output without throwing or partially applying content', () => {
  const before = useLaunchStore.getState();
  const blocks = new Array(2);
  blocks[0] = output()[0];
  expect(before.applyAiText(before.captureAiTextSource(), blocks)).toEqual({
    applied: false,
    reason: 'invalid',
  });
  expect(useLaunchStore.getState()).toBe(before);
});
