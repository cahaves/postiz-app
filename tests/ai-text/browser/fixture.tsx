import 'reflect-metadata';
import React, { createRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SWRConfig } from 'swr';
import dayjs from 'dayjs';
import { ManageModal } from '../../../apps/frontend/src/components/new-launch/manage.modal';
import { useLaunchStore } from '../../../apps/frontend/src/components/new-launch/store';
import { ExistingDataContextProvider } from '../../../apps/frontend/src/components/launches/helpers/use.existing.data';
import { UserContext } from '../../../apps/frontend/src/components/layout/user.context';

const integration = {
  id: 'synthetic-channel',
  name: 'Studio updates (fixture)',
  identifier: 'x',
  editor: 'normal',
  additionalSettings: '[]',
} as any;
useLaunchStore.getState().reset();
useLaunchStore.setState({
  editor: 'normal',
  date: dayjs('2026-12-20T12:34:00Z'),
  integrations: [integration],
  selectedIntegrations: [
    { integration, settings: { __type: 'x' }, ref: createRef() },
  ],
  global: [
    {
      id: 'synthetic-block',
      content: '<p>A quiet morning in the studio.</p>',
      delay: 0,
      media: [],
    },
  ],
});

const Fixture = () => {
  const [notice, setNotice] = useState('');
  (window as any).fixture = {
    notify: setNotice,
    store: useLaunchStore,
    closed: false,
  };
  return (
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <UserContext.Provider value={{ orgId: 'synthetic-org' } as any}>
        <ExistingDataContextProvider value={{ posts: [], settings: {} }}>
          <div className="h-screen flex flex-col">
            <div className="px-[20px] py-[8px] text-[14px]">
              Local QA fixture • No real account or publication
            </div>
            {notice && (
              <div role="status" className="px-[20px]">
                {notice}
              </div>
            )}
            <ManageModal
              date={useLaunchStore.getState().date}
              integrations={[integration]}
              reopenModal={() => {}}
              mutate={() => {}}
            />
          </div>
        </ExistingDataContextProvider>
      </UserContext.Provider>
    </SWRConfig>
  );
};
createRoot(document.getElementById('root')!).render(<Fixture />);
