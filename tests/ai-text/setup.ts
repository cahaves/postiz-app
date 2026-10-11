import 'reflect-metadata';
import { TextEncoder, TextDecoder } from 'util';
import { ioRedis } from './redis.module';
Object.assign(globalThis, { TextEncoder, TextDecoder });
beforeEach(() => {
  Object.assign(ioRedis, { status: undefined, eval: undefined });
  globalThis.fetch = jest.fn(() =>
    Promise.reject(new Error('Unexpected outbound fetch'))
  );
  for (const moduleName of ['http', 'https']) {
    const transport = require(moduleName);
    jest.spyOn(transport, 'request').mockImplementation(() => {
      throw new Error('Unexpected outbound request');
    });
    jest.spyOn(transport, 'get').mockImplementation(() => {
      throw new Error('Unexpected outbound request');
    });
  }
});
afterEach(() => jest.restoreAllMocks());
