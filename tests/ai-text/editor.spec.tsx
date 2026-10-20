import React, { createRef } from 'react';
import { act, render, waitFor, cleanup } from '@testing-library/react';
import type { Editor as TiptapEditor } from '@tiptap/core';
import {
  Editor,
  EditorWrapper,
  OnlyEditor,
} from '../../apps/frontend/src/components/new-launch/editor';
import { useLaunchStore } from '../../apps/frontend/src/components/new-launch/store';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => globalThis.fetch,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: jest.fn() }),
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.existing.data',
  () => ({ useExistingData: () => ({}) })
);
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
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: jest.fn(),
}));
jest.mock('@gitroom/frontend/components/new-launch/add.post.button', () => ({
  AddPostButton: () => null,
}));

beforeEach(() => {
  useLaunchStore.getState().reset();
  useLaunchStore.setState({
    editor: 'normal',
    global: [
      { id: 'block-a', content: '<p>Original</p>', delay: 4, media: [] },
    ],
  });
});
afterEach(cleanup);

it('updates the real Editor visibly for external value changes without an echo', async () => {
  const onChange = jest.fn();
  const props = {
    totalPosts: 1,
    value: '<p>Original</p>',
    onChange,
    comments: true,
    selectedIntegration: [],
    dummy: false,
    chars: {},
  };
  const view = render(<Editor {...props} />);
  await waitFor(() =>
    expect(view.container.querySelector('.tiptap')?.textContent).toBe(
      'Original'
    )
  );
  const element = view.container.querySelector('.tiptap');
  view.rerender(
    <Editor
      {...props}
      value={'<p>&lt;script&gt;literal&lt;/script&gt;</p><p>Second line</p>'}
    />
  );
  await waitFor(() =>
    expect(element?.textContent).toBe('<script>literal</script>Second line')
  );
  expect(view.container.querySelector('.tiptap')).toBe(element);
  expect(element?.querySelector('script')).toBeNull();
  expect(element?.querySelectorAll('p')).toHaveLength(2);
  expect(onChange).not.toHaveBeenCalled();
});

it('applies store text into EditorWrapper without replacing its editor DOM', async () => {
  const view = render(<EditorWrapper totalPosts={1} value="" />);
  await waitFor(() =>
    expect(view.container.querySelector('.tiptap')?.textContent).toBe(
      'Original'
    )
  );
  const element = view.container.querySelector('.tiptap');
  act(() => {
    const state = useLaunchStore.getState();
    expect(
      state.applyAiText(state.captureAiTextSource(), [
        { id: 'block-a', content: '<img src=x onerror=alert(1)>\nSecond' },
      ])
    ).toEqual({ applied: true });
  });
  await waitFor(() =>
    expect(element?.textContent).toBe('<img src=x onerror=alert(1)>Second')
  );
  expect(view.container.querySelector('.tiptap')).toBe(element);
  expect(element?.querySelector('img')).toBeNull();
  expect(useLaunchStore.getState().global[0].content).toBe(
    '<p>&lt;img src=x onerror=alert(1)&gt;</p><p>Second</p>'
  );
});

it('keeps caret and document transaction count on typing echoes and normalized equivalent values', async () => {
  const ref = createRef<{ editor: TiptapEditor }>();
  const onChange = jest.fn();
  const view = render(
    <OnlyEditor
      ref={ref}
      editorType="normal"
      value="<p>Original</p>"
      onChange={onChange}
    />
  );
  await waitFor(() => expect(ref.current?.editor).toBeTruthy());
  const editor = ref.current!.editor;
  act(() => {
    editor.commands.setTextSelection(4);
    editor.commands.insertContent('X');
  });
  expect(editor.getText()).toBe('OriXginal');
  expect(onChange).toHaveBeenCalledTimes(1);
  const selection = editor.state.selection;
  const transaction = jest.fn();
  editor.on('transaction', transaction);
  view.rerender(
    <OnlyEditor
      ref={ref}
      editorType="normal"
      value={editor.getHTML()}
      onChange={onChange}
    />
  );
  expect(editor.state.selection).toBe(selection);
  expect(transaction).not.toHaveBeenCalled();
  act(() =>
    editor.commands.setContent('<p>A &quot;quote&quot;</p>', {
      emitUpdate: false,
    })
  );
  act(() => editor.commands.setTextSelection(3));
  const normalizedSelection = editor.state.selection;
  transaction.mockClear();
  view.rerender(
    <OnlyEditor
      ref={ref}
      editorType="normal"
      value='<p>A "quote"</p>'
      onChange={onChange}
    />
  );
  expect(editor.getHTML()).toBe('<p dir="auto">A "quote"</p>');
  expect(editor.state.selection).toBe(normalizedSelection);
  expect(transaction).not.toHaveBeenCalled();
  expect(onChange).toHaveBeenCalledTimes(1);
});
