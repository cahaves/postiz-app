const importTimeTransportErrors = ['net', 'tls'].map((name) => {
  try {
    require(name).connect({ host: '127.0.0.1', port: 1 });
    return undefined;
  } catch (error) {
    return (error as Error).message;
  }
});

import { AiTextService } from '@gitroom/nestjs-libraries/openai/ai.text.service';
import { AiTextRequestDto } from '@gitroom/nestjs-libraries/dtos/posts/ai.text.dto';
import { ValidationPipe } from '@nestjs/common';

const request = {
  instruction: 'Write a launch caption',
  channels: [{ integrationId: 'channel-a', settings: {} }],
  blocks: [{ id: 'block-a', content: '' }],
  history: [],
};

describe('native AI text boundaries', () => {
  it('returns configuration unavailable without a provider request', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const service = new AiTextService();
    expect(service.capabilities()).toEqual({
      configured: false,
      reason: 'missing-provider-key',
    });
    await expect(service.generate('org-a', request, [])).rejects.toMatchObject({
      response: { code: 'AI_NOT_CONFIGURED' },
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it('rejects unknown request fields with real nested DTO validation', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    await expect(
      pipe.transform(
        {
          ...request,
          channels: [{ ...request.channels[0], token: 'malicious' }],
        },
        { type: 'body', metatype: AiTextRequestDto }
      )
    ).rejects.toBeDefined();
    await expect(
      pipe.transform(request, { type: 'body', metatype: AiTextRequestDto })
    ).resolves.toMatchObject(request);
  });
});

jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.repository',
  () => ({ PostsRepository: class {} })
);
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/short-linking/short.link.service', () => ({
  ShortLinkService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/openai/openai.service', () => ({
  OpenaiService: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));

import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { plainTextToPostHtml } from '@gitroom/helpers/utils/sanitize.post.content';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { IsIn } from 'class-validator';
import { LeaseRedis } from './redis';

class ProviderSettings {
  @IsIn(['caption'])
  mode: string;
}
const fixtureRequest = {
  ...request,
  channels: [{ integrationId: 'channel-a', settings: { mode: 'caption' } }],
};
const writes = jest.fn();
const provider = {
  editor: 'normal',
  dto: ProviderSettings,
  maxLength: () => 2200,
  post: writes,
  checkValidity: writes,
};
const lookup = jest.fn(async () => ({
  id: 'channel-a',
  organizationId: 'org-a',
  providerIdentifier: 'instagram',
  disabled: false,
  deletedAt: null,
  token: 'private-token',
  additionalSettings: '[]',
}));
function postsService(redis = new LeaseRedis()) {
  return new PostsService(
    { createPost: writes } as never,
    { getSocialIntegration: () => provider } as never,
    { getIntegrationById: lookup } as never,
    { createMedia: writes } as never,
    {} as never,
    {} as never,
    { startWorkflow: writes } as never,
    {} as never,
    new AiTextService(redis as never) as never
  );
}

describe('server orchestration', () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    lookup.mockClear();
    writes.mockClear();
  });
  it('exposes capabilities and rejects missing configuration without writes', async () => {
    const posts = postsService();
    expect(posts.aiTextCapabilities()).toEqual({
      configured: false,
      reason: 'missing-provider-key',
    });
    await expect(
      posts.generateAiText('org-a', fixtureRequest)
    ).rejects.toMatchObject({ response: { code: 'AI_NOT_CONFIGURED' } });
    expect(writes).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });
  it('escapes literal markup and preserves native newline text', () => {
    const text = '<script>alert("x")</script> & hi\n\nlaunch 🚀';
    expect(plainTextToPostHtml(text)).toContain('&lt;script&gt;');
    expect(stripHtmlValidation('normal', plainTextToPostHtml(text), true)).toBe(
      text
    );
  });
});

function completion(
  blocks = [{ id: 'block-a', content: 'Launch today 🚀' }],
  overrides = {}
) {
  return {
    id: 'provider-request',
    object: 'chat.completion',
    created: 1,
    model: 'model',
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: JSON.stringify({ blocks }) },
        ...overrides,
      },
    ],
  };
}
function providerFetch(result: unknown = completion(), status = 200) {
  return jest.fn(
    async () =>
      new Response(JSON.stringify(result), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
  );
}

describe('generation scope and native limits', () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'key-for-provider-only';
    delete process.env.OPENROUTER_MODEL;
    lookup.mockImplementation(async () => ({
      id: 'channel-a',
      organizationId: 'org-a',
      providerIdentifier: 'instagram',
      disabled: false,
      deletedAt: null,
      token: 'private-token',
      additionalSettings: '[]',
    }));
    globalThis.fetch = providerFetch();
    writes.mockClear();
  });
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
  });
  it('uses owned channel settings and returns counts without writes or secrets', async () => {
    const result = await postsService().generateAiText('org-a', fixtureRequest);
    expect(result).toEqual({
      blocks: [{ id: 'block-a', content: 'Launch today 🚀' }],
      limits: [
        {
          integrationId: 'channel-a',
          maximumCharacters: 2200,
          counts: [{ id: 'block-a', count: 15 }],
        },
      ],
    });
    expect(lookup).toHaveBeenCalledWith('org-a', 'channel-a');
    const body = String((globalThis.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body).not.toContain('private-token');
    expect(body).not.toContain('key-for-provider-only');
    expect(JSON.parse(JSON.parse(body).messages[1].content)).not.toHaveProperty(
      'settings'
    );
    expect(JSON.stringify(result)).not.toContain('private-token');
    expect(writes).not.toHaveBeenCalled();
  });
  it.each(['missing', 'foreign', 'deleted', 'disabled', 'unsupported'])(
    'rejects %s channels before provider',
    async (kind) => {
      const record = await lookup();
      lookup.mockResolvedValueOnce(
        kind === 'missing'
          ? null
          : ({
              ...record,
              ...(kind === 'foreign'
                ? { organizationId: 'org-b' }
                : kind === 'deleted'
                ? { deletedAt: new Date() }
                : kind === 'disabled'
                ? { disabled: true }
                : {}),
            } as never)
      );
      const original = provider.editor;
      if (kind === 'unsupported') provider.editor = 'markdown';
      try {
        await expect(
          postsService().generateAiText('org-a', fixtureRequest)
        ).rejects.toMatchObject({
          response: { code: 'AI_CHANNEL_UNAVAILABLE' },
        });
        expect(globalThis.fetch).not.toHaveBeenCalled();
      } finally {
        provider.editor = original;
      }
    }
  );
  it.each([
    {},
    { mode: 'wrong' },
    { mode: 'caption', accessToken: 'injected' },
  ])('rejects invalid current provider settings %j', async (settings) => {
    await expect(
      postsService().generateAiText('org-a', {
        ...fixtureRequest,
        channels: [{ integrationId: 'channel-a', settings }],
      })
    ).rejects.toMatchObject({ response: { code: 'AI_INVALID_INPUT' } });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it.each([2200, 2201])(
    'applies Instagram native limit at %i UTF-16 units',
    async (size) => {
      globalThis.fetch = providerFetch(
        completion([
          { id: 'block-a', content: '🚀'.repeat(100) + 'x'.repeat(size - 200) },
        ])
      );
      const result = postsService().generateAiText('org-a', fixtureRequest);
      if (size === 2200)
        expect((await result).limits[0].counts[0].count).toBe(2200);
      else
        await expect(result).rejects.toMatchObject({
          response: { code: 'AI_OUTPUT_TOO_LONG' },
        });
    }
  );
  it.each([500, 501])(
    'applies Threads native byte limit at %i bytes',
    async (size) => {
      const record = await lookup();
      lookup.mockResolvedValueOnce({
        ...record,
        providerIdentifier: 'threads',
      });
      const original = provider.maxLength;
      provider.maxLength = () => 500;
      globalThis.fetch = providerFetch(
        completion([
          { id: 'block-a', content: '🚀'.repeat(100) + 'x'.repeat(size - 400) },
        ])
      );
      try {
        const result = postsService().generateAiText('org-a', fixtureRequest);
        if (size === 500)
          expect((await result).limits[0].counts[0].count).toBe(500);
        else
          await expect(result).rejects.toMatchObject({
            response: { code: 'AI_OUTPUT_TOO_LONG' },
          });
      } finally {
        provider.maxLength = original;
      }
    }
  );
});

describe('strict request budgets', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const transform = (value: unknown) =>
    pipe.transform(value, { type: 'body', metatype: AiTextRequestDto });
  it.each([
    { instruction: ' ' },
    { instruction: 'x'.repeat(2001) },
    { orgId: 'org-b' },
    { channels: [] },
    { blocks: [] },
    { channels: Array(11).fill(request.channels[0]) },
    { blocks: [request.blocks[0], request.blocks[0]] },
    { channels: [request.channels[0], request.channels[0]] },
    { blocks: [{ id: 'x'.repeat(129), content: '' }] },
    { blocks: [{ id: 'a', content: 'x'.repeat(12001) }] },
    { history: Array(7).fill({ role: 'user', content: 'hi' }) },
    { history: [{ role: 'system', content: 'evil' }] },
    { history: [{ role: 'user', content: 'x'.repeat(2001) }] },
    {
      blocks: [
        { id: 'a', content: 'x'.repeat(12000) },
        { id: 'b', content: 'x'.repeat(12000) },
      ],
    },
    {
      channels: [{ integrationId: 'a', settings: { huge: 'x'.repeat(8192) } }],
    },
    {
      channels: [
        {
          integrationId: 'a',
          settings: { a: { a: { a: { a: { a: { a: { a: {} } } } } } } },
        },
      ],
    },
    { blocks: [{ ...request.blocks[0], action: 'publish' }] },
  ])('rejects invalid payload %#', async (patch) => {
    await expect(transform({ ...request, ...patch })).rejects.toBeDefined();
  });
});

describe('bounded OpenRouter transport', () => {
  let redis: LeaseRedis;
  let service: AiTextService;
  beforeEach(() => {
    redis = new LeaseRedis();
    service = new AiTextService(redis as never);
    process.env.OPENROUTER_API_KEY = '  provider-secret  ';
    delete process.env.OPENROUTER_MODEL;
    globalThis.fetch = providerFetch();
  });
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
  });
  it('sends one fixed OpenRouter call with exact schema and no tools', async () => {
    process.env.OPENROUTER_MODEL = '  openai/gpt-4.1-mini  ';
    expect(
      await service.generate('org-a', request, [{ maximumCharacters: 2200 }])
    ).toEqual([{ id: 'block-a', content: 'Launch today 🚀' }]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(options.headers.get('authorization')).toBe('Bearer provider-secret');
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({
      model: 'openai/gpt-4.1-mini',
      max_tokens: 4000,
      stream: false,
      provider: { require_parameters: true },
      response_format: {
        type: 'json_schema',
        json_schema: {
          strict: true,
          schema: {
            additionalProperties: false,
            required: ['blocks'],
            properties: { blocks: { minItems: 1, maxItems: 1 } },
          },
        },
      },
    });
    expect(body.tools).toBeUndefined();
    expect(body.messages).toHaveLength(2);
    expect(redis.data.size).toBe(0);
  });
  it.each([
    ['missing choice', { choices: [] }, 'AI_INVALID_OUTPUT'],
    [
      'truncation',
      completion(undefined, { finish_reason: 'length' }),
      'AI_INVALID_OUTPUT',
    ],
    [
      'refusal',
      completion(undefined, { message: { refusal: 'private provider text' } }),
      'AI_REFUSED',
    ],
    [
      'invalid JSON',
      completion(undefined, { message: { content: '{' } }),
      'AI_INVALID_OUTPUT',
    ],
    [
      'unknown key',
      completion(undefined, {
        message: {
          content: JSON.stringify({
            blocks: [{ id: 'block-a', content: 'hi' }],
            action: 'publish',
          }),
        },
      }),
      'AI_INVALID_OUTPUT',
    ],
    [
      'wrong ID',
      completion([{ id: 'block-b', content: 'hi' }]),
      'AI_INVALID_OUTPUT',
    ],
    [
      'empty',
      completion([{ id: 'block-a', content: ' ' }]),
      'AI_INVALID_OUTPUT',
    ],
    ['missing block', completion([]), 'AI_INVALID_OUTPUT'],
    [
      'duplicate blocks',
      completion([
        { id: 'block-a', content: 'a' },
        { id: 'block-a', content: 'b' },
      ]),
      'AI_INVALID_OUTPUT',
    ],
    [
      'oversize',
      completion([{ id: 'block-a', content: 'x'.repeat(20001) }]),
      'AI_OUTPUT_TOO_LONG',
    ],
  ])(
    'rejects %s output, releases lease, and never retries',
    async (_label, result, code) => {
      globalThis.fetch = providerFetch(result);
      await expect(
        service.generate('org-a', request, [])
      ).rejects.toMatchObject({ response: { code } });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(redis.data.size).toBe(0);
    }
  );
  it('rejects reordered blocks even with valid IDs', async () => {
    const dto = {
      ...request,
      blocks: [
        { id: 'a', content: '' },
        { id: 'b', content: '' },
      ],
    };
    globalThis.fetch = providerFetch(
      completion([
        { id: 'b', content: 'B' },
        { id: 'a', content: 'A' },
      ])
    );
    await expect(service.generate('org-a', dto, [])).rejects.toMatchObject({
      response: { code: 'AI_INVALID_OUTPUT' },
    });
  });
  it.each([
    [401, 'AI_PROVIDER_CONFIGURATION'],
    [402, 'AI_PROVIDER_CONFIGURATION'],
    [403, 'AI_PROVIDER_CONFIGURATION'],
    [429, 'AI_RATE_LIMITED'],
    [500, 'AI_PROVIDER_UNAVAILABLE'],
  ])(
    'curates provider status %i without exposing raw errors',
    async (status: number, code: string) => {
      globalThis.fetch = providerFetch(
        { error: { message: 'provider-secret raw prompt' } },
        status
      );
      try {
        await service.generate('org-a', request, []);
        throw new Error('Expected failure');
      } catch (error) {
        expect(error).toMatchObject({ response: { code } });
        expect(JSON.stringify(error)).not.toContain('provider-secret');
        expect(JSON.stringify(error)).not.toContain('raw prompt');
      }
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(redis.data.size).toBe(0);
    }
  );
  it('fails closed when storage or NX/lease support is unavailable', async () => {
    redis.fail = true;
    await expect(service.generate('org-a', request, [])).rejects.toMatchObject({
      response: { code: 'AI_PROVIDER_UNAVAILABLE' },
    });
    await expect(
      new AiTextService().generate('org-a', request, [])
    ).rejects.toMatchObject({ response: { code: 'AI_PROVIDER_UNAVAILABLE' } });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it('allows independent orgs but only one active call for the same org', async () => {
    let finish: (result: Response) => void;
    globalThis.fetch = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      )
      .mockImplementation(providerFetch());
    const running = service.generate('org-a', request, []);
    while (!(globalThis.fetch as jest.Mock).mock.calls.length)
      await new Promise((resolve) => setImmediate(resolve));
    await expect(service.generate('org-a', request, [])).rejects.toMatchObject({
      response: { code: 'AI_BUSY' },
    });
    await expect(service.generate('org-b', request, [])).resolves.toHaveLength(
      1
    );
    finish(
      new Response(JSON.stringify(completion()), {
        headers: { 'Content-Type': 'application/json' },
      })
    );
    await running;
    expect(redis.data.size).toBe(0);
  });
  it('does not delete a successor lease when the first lease has expired', async () => {
    globalThis.fetch = jest.fn(async () => {
      const entry = redis.data.get('ai-text:lease:org-a');
      entry.expires = Date.now() - 1;
      await redis.set(
        'ai-text:lease:org-a',
        'successor-token',
        'PX',
        45000,
        'NX'
      );
      return new Response(JSON.stringify(completion()), {
        headers: { 'Content-Type': 'application/json' },
      });
    });
    await service.generate('org-a', request, []);
    expect(redis.data.get('ai-text:lease:org-a').value).toBe('successor-token');
  });
  it('aborts an active provider request and releases its owned lease', async () => {
    const controller = new AbortController();
    globalThis.fetch = jest.fn(
      async (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true }
          );
        })
    );
    const running = service.generate('org-a', request, [], controller.signal);
    while (!(globalThis.fetch as jest.Mock).mock.calls.length)
      await new Promise((resolve) => setImmediate(resolve));
    controller.abort();
    await expect(running).rejects.toMatchObject({
      response: { code: 'AI_CANCELLED' },
    });
    expect(redis.data.size).toBe(0);
  });
  it('aborts on its 30 second timeout and releases the lease', async () => {
    jest.useFakeTimers();
    globalThis.fetch = jest.fn(
      async (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true }
          );
        })
    );
    try {
      const running = service.generate('org-a', request, []);
      const assertion = expect(running).rejects.toMatchObject({
        response: { code: 'AI_TIMEOUT' },
      });
      await jest.advanceTimersByTimeAsync(30001);
      await assertion;
      expect(redis.data.size).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

jest.mock('@gitroom/nestjs-libraries/agent/agent.graph.service', () => ({
  AgentGraphService: class {},
}));
import {
  PostsController,
  AiTextExceptionFilter,
} from '@gitroom/backend/api/routes/posts.controller';
import { AiTextThrottlerGuard } from '@gitroom/nestjs-libraries/throttler/throttler.provider';
import {
  GUARDS_METADATA,
  PIPES_METADATA,
  EXCEPTION_FILTERS_METADATA,
} from '@nestjs/common/constants';
import { CHECK_POLICIES_KEY } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { Reflector } from '@nestjs/core';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { EventEmitter } from 'events';

function httpContext(
  orgId: string,
  requestEvents = new EventEmitter(),
  responseEvents = new EventEmitter()
) {
  const headers: Record<string, unknown> = {};
  const req = Object.assign(requestEvents, {
    org: { id: orgId },
    headers: {},
    path: '/posts/ai-text',
    method: 'POST',
    url: '/posts/ai-text',
  });
  const res = Object.assign(responseEvents, {
    writableEnded: false,
    getHeader: (name: string) => headers[name],
    header: (name: string, value: unknown) => {
      headers[name] = value;
    },
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  });
  const context = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    getHandler: () => PostsController.prototype.generateAiText,
    getClass: () => PostsController,
    getType: () => 'http',
  };
  return { context, req, res, headers };
}
class QuotaStorage {
  entries = new Map<string, { hits: number; expires: number }>();
  fail = false;
  async increment(key: string, ttl: number, limit: number) {
    if (this.fail) throw new Error('storage-secret');
    let entry = this.entries.get(key);
    if (!entry || entry.expires <= Date.now()) {
      entry = { hits: 0, expires: Date.now() + ttl };
      this.entries.set(key, entry);
    }
    entry.hits++;
    return {
      totalHits: entry.hits,
      timeToExpire: Math.ceil(ttl / 1000),
      isBlocked: entry.hits > limit,
      timeToBlockExpire: 60,
    };
  }
}

describe('authenticated AI routes', () => {
  it('requires AI entitlement on both routes and strict local validation on generation', () => {
    for (const method of [
      PostsController.prototype.aiTextCapabilities,
      PostsController.prototype.generateAiText,
    ]) {
      expect(Reflect.getMetadata(CHECK_POLICIES_KEY, method)).toEqual([
        [AuthorizationActions.Create, Sections.AI],
      ]);
      expect(Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, method)).toContain(
        AiTextExceptionFilter
      );
    }
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        PostsController.prototype.generateAiText
      )
    ).toContain(AiTextThrottlerGuard);
    expect(
      Reflect.getMetadata(
        PIPES_METADATA,
        PostsController.prototype.generateAiText
      )[0]
    ).toBeInstanceOf(ValidationPipe);
  });
  it('propagates client disconnect to provider and removes listeners in finally', async () => {
    process.env.OPENROUTER_API_KEY = 'provider-key';
    const { req, res } = httpContext('org-a');
    globalThis.fetch = jest.fn(
      async (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(new Error('disconnected')),
            { once: true }
          );
        })
    );
    const controller = new PostsController(
      postsService(),
      {} as never,
      {} as never
    );
    const running = controller.generateAiText(
      { id: 'org-a' } as never,
      fixtureRequest,
      req as never,
      res as never
    );
    while (!(globalThis.fetch as jest.Mock).mock.calls.length)
      await new Promise((resolve) => setImmediate(resolve));
    res.emit('close');
    await expect(running).rejects.toMatchObject({
      response: { code: 'AI_CANCELLED' },
    });
    expect(req.listenerCount('aborted')).toBe(0);
    expect(res.listenerCount('close')).toBe(0);
    delete process.env.OPENROUTER_API_KEY;
  });
  it('curates entitlement denial to a safe 403', () => {
    const { context, res } = httpContext('org-a');
    new AiTextExceptionFilter().catch(
      new SubscriptionException({
        section: Sections.AI,
        action: AuthorizationActions.Create,
      }),
      context as never
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      code: 'AI_ACCESS_DENIED',
      message: 'AI writing is not available for this organization.',
    });
  });
  it('returns Retry-After for busy or provider rate-limit failures', () => {
    const { context, headers } = httpContext('org-a');
    new AiTextExceptionFilter().catch(
      new (require('@nestjs/common').HttpException)(
        { code: 'AI_BUSY', message: 'Busy' },
        429
      ),
      context as never
    );
    expect(headers['Retry-After']).toBe('45');
  });
});

describe('organization route quotas', () => {
  const originalStatus = ioRedis.status;
  const originalEval = ioRedis.eval;
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'provider-key';
    Object.assign(ioRedis, { status: 'ready', eval: async () => 1 });
  });
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    Object.assign(ioRedis, { status: originalStatus, eval: originalEval });
  });
  it('enforces 10 per minute with independent organization quotas', async () => {
    const guard = new AiTextThrottlerGuard(
      [{ name: 'default', ttl: 3600000, limit: 90 }],
      new QuotaStorage(),
      new Reflector()
    );
    await guard.onModuleInit();
    const orgA = httpContext('org-a');
    const orgB = httpContext('org-b');
    for (let i = 0; i < 10; i++)
      expect(await guard.canActivate(orgA.context as never)).toBe(true);
    await expect(
      guard.canActivate(orgA.context as never)
    ).rejects.toMatchObject({ response: { code: 'AI_RATE_LIMITED' } });
    expect(orgA.headers['Retry-After']).toBe(60);
    expect(await guard.canActivate(orgB.context as never)).toBe(true);
    expect(orgB.headers['X-RateLimit-Limit']).toBe(10);
  });
  it('fails closed for unavailable storage and does not disclose its error', async () => {
    const storage = new QuotaStorage();
    storage.fail = true;
    const guard = new AiTextThrottlerGuard(
      [{ ttl: 60000, limit: 10 }],
      storage,
      new Reflector()
    );
    await guard.onModuleInit();
    const { context } = httpContext('org-a');
    await expect(guard.canActivate(context as never)).rejects.toMatchObject({
      response: { code: 'AI_PROVIDER_UNAVAILABLE' },
    });
    Object.assign(ioRedis, { status: undefined, eval: undefined });
    storage.fail = false;
    await expect(guard.canActivate(context as never)).rejects.toMatchObject({
      response: { code: 'AI_PROVIDER_UNAVAILABLE' },
    });
  });
});

describe('additional defensive bounds', () => {
  it('rejects UTF-16 instruction overflow and blank block IDs', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    for (const patch of [
      { instruction: '🚀'.repeat(1001) },
      { blocks: [{ id: ' ', content: '' }] },
    ]) {
      await expect(
        pipe.transform(
          { ...request, ...patch },
          { type: 'body', metatype: AiTextRequestDto }
        )
      ).rejects.toBeDefined();
    }
  });
  it('returns configuration error before quota storage when the provider is missing', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const guard = new AiTextThrottlerGuard(
      [{ ttl: 60000, limit: 10 }],
      new QuotaStorage(),
      new Reflector()
    );
    await guard.onModuleInit();
    await expect(
      guard.canActivate(httpContext('org-a').context as never)
    ).rejects.toMatchObject({ response: { code: 'AI_NOT_CONFIGURED' } });
  });
});

jest.mock(
  '@gitroom/backend/services/auth/permissions/permissions.service',
  () => ({ PermissionsService: class {} })
);
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { PoliciesGuard } from '@gitroom/backend/services/auth/permissions/permissions.guard';
import { AgentGraphService } from '@gitroom/nestjs-libraries/agent/agent.graph.service';
import { ShortLinkService } from '@gitroom/nestjs-libraries/short-linking/short.link.service';
import { IncomingMessage, ServerResponse } from 'http';
import { Duplex } from 'stream';

describe('Nest route execution without a listening socket', () => {
  let app: import('@nestjs/common').INestApplication;
  let entitled: boolean;
  const originalStatus = ioRedis.status;
  const originalEval = ioRedis.eval;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ ttl: 60000, limit: 10 }],
          storage: new QuotaStorage(),
        }),
      ],
      controllers: [PostsController],
      providers: [
        AiTextThrottlerGuard,
        { provide: PostsService, useFactory: () => postsService() },
        { provide: AgentGraphService, useValue: {} },
        { provide: ShortLinkService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.use((req: Record<string, unknown>, _res: unknown, next: () => void) => {
      req.org = {
        id: 'org-a',
        createdAt: new Date(),
        users: [{ role: 'ADMIN' }],
      };
      next();
    });
    app.useGlobalGuards(
      new PoliciesGuard(new Reflector(), {
        check: async () => ({ can: () => entitled }),
      } as never)
    );
    await app.init();
  });
  beforeEach(() => {
    entitled = true;
    process.env.OPENROUTER_API_KEY = 'provider-only';
    Object.assign(ioRedis, { status: 'ready', eval: async () => 1 });
    lookup.mockImplementation(async () => ({
      id: 'channel-a',
      organizationId: 'org-a',
      providerIdentifier: 'instagram',
      disabled: false,
      deletedAt: null,
      token: 'private-token',
      additionalSettings: '[]',
    }));
    globalThis.fetch = providerFetch();
  });
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    Object.assign(ioRedis, { status: originalStatus, eval: originalEval });
  });
  afterAll(async () => app.close());
  function dispatch(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ status: number; body: unknown }> {
    const socket = new Duplex({
      read() {},
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    const req = new IncomingMessage(socket);
    req.method = method;
    req.url = path;
    Object.assign(req, { body });
    const res = new ServerResponse(req);
    return new Promise((resolve, reject) => {
      res.end = ((chunk: string) => {
        resolve({ status: res.statusCode, body: JSON.parse(String(chunk)) });
        return res;
      }) as typeof res.end;
      app
        .getHttpAdapter()
        .getInstance()
        .handle(req, res, (error: unknown) =>
          reject(error || new Error('Route not handled'))
        );
    });
  }
  it('executes capability and generation routes through real Nest validation and guards', async () => {
    expect(await dispatch('GET', '/posts/ai-text/capabilities')).toEqual({
      status: 200,
      body: { configured: true },
    });
    const result = await dispatch('POST', '/posts/ai-text', fixtureRequest);
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      blocks: [{ id: 'block-a', content: 'Launch today 🚀' }],
    });
  });
  it('returns curated entitlement denial on both routes before provider', async () => {
    entitled = false;
    for (const [method, path] of [
      ['GET', '/posts/ai-text/capabilities'],
      ['POST', '/posts/ai-text'],
    ]) {
      expect(await dispatch(method, path, fixtureRequest)).toMatchObject({
        status: 403,
        body: { code: 'AI_ACCESS_DENIED' },
      });
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it('rejects unknown nested fields before provider with safe input errors', async () => {
    expect(
      await dispatch('POST', '/posts/ai-text', {
        ...fixtureRequest,
        blocks: [{ ...request.blocks[0], action: 'publish' }],
      })
    ).toMatchObject({ status: 400, body: { code: 'AI_INVALID_INPUT' } });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('quota response duration', () => {
  it('preserves the throttler Retry-After duration through the route filter', () => {
    const { context, headers, res } = httpContext('org-a');
    headers['Retry-After'] = '60';
    Object.assign(res, { getHeader: (name: string) => headers[name] });
    new AiTextExceptionFilter().catch(
      new (require('@nestjs/common').HttpException)(
        { code: 'AI_RATE_LIMITED', message: 'Limited' },
        429
      ),
      context as never
    );
    expect(headers['Retry-After']).toBe('60');
  });
});

describe('storage deadlines', () => {
  it('fails closed when a Redis lease command never completes', async () => {
    process.env.OPENROUTER_API_KEY = 'provider-key';
    jest.useFakeTimers();
    const redis = new LeaseRedis();
    redis.set = () => new Promise(() => {});
    try {
      const result = new AiTextService(redis as never).generate(
        'org-a',
        request,
        []
      );
      const assertion = expect(result).rejects.toMatchObject({
        response: { code: 'AI_PROVIDER_UNAVAILABLE' },
      });
      await jest.advanceTimersByTimeAsync(3001);
      await assertion;
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
      delete process.env.OPENROUTER_API_KEY;
    }
  });
});

describe('import-time Redis isolation', () => {
  it('ignores an inherited dummy REDIS_URL without constructing storage or connecting', async () => {
    const previousUrl = process.env.REDIS_URL;
    const previousKey = process.env.OPENROUTER_API_KEY;
    process.env.REDIS_URL = 'redis://127.0.0.1:1/test-only-inherited-url';
    process.env.OPENROUTER_API_KEY = 'test-provider-key';
    const constructed = jest.fn(() => {
      throw new Error('Unexpected real Redis construction');
    });
    jest.doMock('ioredis', () => ({
      __esModule: true,
      default: constructed,
      Redis: constructed,
    }));
    const connect = jest
      .spyOn(require('net').Socket.prototype, 'connect')
      .mockImplementation(() => {
        throw new Error('Unexpected socket connection');
      });
    let isolatedService: AiTextService;
    let importFailure: unknown;
    try {
      jest.isolateModules(() => {
        try {
          const {
            AiTextService: IsolatedService,
          } = require('@gitroom/nestjs-libraries/openai/ai.text.service');
          isolatedService = new IsolatedService();
        } catch (error) {
          importFailure = error;
        }
      });
      expect(constructed).not.toHaveBeenCalled();
      expect(connect).not.toHaveBeenCalled();
      expect(importFailure).toBeUndefined();
      await expect(
        isolatedService.generate('org-isolated', request, [])
      ).rejects.toMatchObject({
        response: { code: 'AI_PROVIDER_UNAVAILABLE' },
      });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      jest.dontMock('ioredis');
      connect.mockRestore();
      if (previousUrl === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = previousUrl;
      if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = previousKey;
    }
  });
});

it('blocks TCP and TLS transports during test module import', () => {
  expect(importTimeTransportErrors).toEqual([
    'Unexpected outbound net.connect',
    'Unexpected outbound tls.connect',
  ]);
});
