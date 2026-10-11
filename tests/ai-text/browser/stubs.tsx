import React, { forwardRef, useImperativeHandle } from 'react';
import { useLaunchStore } from '../../../apps/frontend/src/components/new-launch/store';
import {
  withProvider,
  PostComment,
} from '../../../apps/frontend/src/components/new-launch/providers/high.order.provider';

export const useT = () => (_: string, fallback: string) => fallback;
export const useFetch = () => window.fetch.bind(window);
export const useToaster = () => ({
  show: (message: string) => (window as any).fixture.notify(message),
});
export const useModals = () => ({
  closeAll: () => {
    (window as any).fixture.closed = true;
  },
  openModal: () => {
    throw new Error('Dialog is outside this browser fixture');
  },
});
export const useShortlinkPreference = () => ({ data: { shortlink: 'NO' } });
export const deleteDialog = async () => false;
export const useUppyUploader = () => ({ addFile: () => {} });
export const PicksSocialsComponent = () => <p>Studio updates (fixture)</p>;
export const SelectCurrent = () => <p>Shared text</p>;
export const DatePicker = ({ date }: any) => (
  <span>{date.format('DD/MM/YYYY HH:mm')}</span>
);
export const RepeatComponent = () => null;
export const TagsComponent = () => null;
export const SelectCustomer = () => null;
export const DummyCodeComponent = () => null;
export const InternalChannels = () => null;
export const GeneralPreviewComponent = () => null;
export const MultiMediaComponent = () => null;
export const SignatureBox = () => null;
export const AddPostButton = () => null;
export const Dashboard = () => null;
export const Theme = { DARK: 'dark' };
export default () => null;

const Provider = withProvider({
  postComment: PostComment.ALL,
  minimumCharacters: [],
  maximumCharacters: 280,
  SettingsComponent: null,
});
export const ShowAllProviders = forwardRef((_: any, ref) => {
  const selected = useLaunchStore((state) => state.selectedIntegrations);
  useImperativeHandle(ref, () => ({
    getAllValues: async () =>
      Promise.all(selected.map((item) => item.ref?.current.getValues())),
  }));
  return (
    <>
      {selected.map((item) => (
        <Provider
          key={item.integration.id}
          id={item.integration.id}
          ref={item.ref}
        />
      ))}
    </>
  );
});
