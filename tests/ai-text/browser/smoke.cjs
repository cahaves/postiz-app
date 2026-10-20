const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const http = require('http');
const assert = require('assert/strict');
const esbuild = require('esbuild');
const sass = require('sass');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const {
  chromium,
} = require('/Users/refifauzan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = path.resolve(__dirname, '../../..');
const output =
  '/Users/refifauzan/.codex/visualizations/2026/09/30/01a0f37d-bab8-70d3-8594-33754125b241';
const stubs = new Set([
  '@gitroom/react/translation/get.transation.service.client',
  '@gitroom/helpers/utils/custom.fetch',
  '@gitroom/react/toaster/toaster',
  '@gitroom/frontend/components/layout/new-modal',
  '@gitroom/react/helpers/delete.dialog',
  '@gitroom/frontend/components/settings/shortlink-preference.component',
  '@gitroom/frontend/components/new-launch/picks.socials.component',
  '@gitroom/frontend/components/new-launch/select.current',
  '@gitroom/frontend/components/launches/helpers/date.picker',
  '@gitroom/frontend/components/launches/repeat.component',
  '@gitroom/frontend/components/launches/tags.component',
  '@gitroom/frontend/components/launches/select.customer',
  '@gitroom/frontend/components/new-launch/dummy.code.component',
  '@gitroom/frontend/components/launches/general.preview.component',
  '@gitroom/frontend/components/launches/internal.channels',
  '@gitroom/frontend/components/media/new.uploader',
  '@uppy/react',
  'emoji-picker-react',
  '@gitroom/frontend/components/media/media.component',
  '@gitroom/frontend/components/signature',
  '@gitroom/frontend/components/new-launch/add.post.button',
  '@gitroom/frontend/components/new-launch/providers/show.all.providers',
]);

(async () => {
  const temporary = await fs.mkdtemp(
    path.join(os.tmpdir(), 'postiz-ai-browser-')
  );
  let browser;
  let server;
  try {
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'fixture.tsx')],
      bundle: true,
      outfile: path.join(temporary, 'fixture.js'),
      platform: 'browser',
      format: 'iife',
      jsx: 'automatic',
      tsconfig: path.join(root, 'apps/frontend/tsconfig.json'),
      define: { 'process.env.NODE_ENV': '"development"' },
      plugins: [
        {
          name: 'synthetic-contexts',
          setup(build) {
            build.onResolve({ filter: /.*/ }, (args) =>
              stubs.has(args.path)
                ? { path: path.join(__dirname, 'stubs.tsx') }
                : undefined
            );
          },
        },
      ],
    });
    const styles = sass.compile(
      path.join(root, 'apps/frontend/src/app/global.scss'),
      {
        loadPaths: [path.join(root, 'node_modules')],
        silenceDeprecations: ['legacy-js-api'],
      }
    ).css;
    const config = require(path.join(
      root,
      'apps/frontend/tailwind.config.cjs'
    ));
    config.content = [
      path.join(root, 'apps/frontend/src/**/*.{ts,tsx}'),
      path.join(root, 'libraries/react-shared-libraries/src/**/*.{ts,tsx}'),
      path.join(__dirname, '*.tsx'),
    ];
    const css = (
      await postcss([tailwind(config)]).process(styles, { from: undefined })
    ).css;
    await fs.writeFile(path.join(temporary, 'fixture.css'), css);
    server = http.createServer(async (request, response) => {
      const name =
        request.url === '/fixture.js'
          ? 'fixture.js'
          : request.url === '/fixture.css'
          ? 'fixture.css'
          : null;
      if (name) {
        response.setHeader(
          'Content-Type',
          name.endsWith('js') ? 'text/javascript' : 'text/css'
        );
        response.end(await fs.readFile(path.join(temporary, name)));
        return;
      }
      if (request.url !== '/') {
        response.writeHead(204);
        response.end();
        return;
      }
      response.setHeader('Content-Type', 'text/html');
      response.end(
        '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body class="dark"><div id="root"></div><script src="/fixture.js"></script></body></html>'
      );
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({
      headless: true,
      executablePath:
        '/Users/refifauzan/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    });
    const context = await browser.newContext({
      timezoneId: 'Asia/Kuala_Lumpur',
    });
    const errors = [];
    let configured = true;
    let blockMedia = false;
    let holdGeneration = false;
    let held;
    const posts = [];
    const generations = [];
    const profileSaves = [];
    const profileReads = [];
    let writingProfile = {
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
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        errors.push(`Blocked outbound ${url.origin}`);
        await route.abort();
        return;
      }
      let body;
      if (url.pathname === '/posts/ai-text/capabilities') body = { configured };
      if (url.pathname === '/posts/ai-text/profile') {
        if (route.request().method() === 'POST') {
          const request = route.request().postDataJSON();
          assert.equal(request.revision, writingProfile.revision);
          profileSaves.push(request);
          writingProfile = {
            profile: request.profile,
            revision: writingProfile.revision + 1,
          };
        } else profileReads.push(writingProfile.revision);
        body = writingProfile;
      }
      if (url.pathname === '/posts/ai-text') {
        const request = route.request().postDataJSON();
        generations.push({
          request,
          profileRevision: writingProfile.revision,
        });
        if (request.writingProfileRevision !== writingProfile.revision) {
          await route.fulfill({
            status: 409,
            json: { message: 'Writing preferences changed.' },
          });
          return;
        }
        body = {
          blocks: [
            {
              id: 'synthetic-block',
              content:
                generations.length === 2
                  ? 'A suggestion from the previous writing preferences.'
                  : 'Fresh from the studio.\nA new collection arrives Friday.',
            },
          ],
          limits: [],
        };
        if (holdGeneration) {
          held = () => route.fulfill({ json: body }).catch(() => {});
          return;
        }
      }
      if (url.pathname.endsWith('internal-plugs')) body = { internalPlugs: [] };
      if (url.pathname === '/posts/valid')
        body = [
          {
            id: 'synthetic-channel',
            name: 'Studio updates',
            identifier: 'x',
            valid: true,
            errors: blockMedia ? 'Image is required' : true,
          },
        ];
      if (url.pathname === '/posts') {
        posts.push(route.request().postDataJSON());
        body = {};
      }
      if (body !== undefined) {
        await route.fulfill({ json: body });
        return;
      }
      await route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    const ready = async () => {
      await page.goto(origin);
      await page.getByRole('button', { name: 'Write', exact: true }).waitFor();
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll('section button')).some(
          (button) => button.textContent.trim() === 'Write' && !button.disabled
        )
      );
    };
    const send = async (intent = 'write') => {
      await page
        .getByRole('textbox', { name: 'Message to AI' })
        .fill('Write a short studio update');
      await page.getByRole('combobox', { name: 'Action' }).selectOption(intent);
      await page
        .getByRole('button', {
          name:
            intent === 'write'
              ? 'Write'
              : intent === 'now'
              ? 'Write & post now'
              : 'Write & schedule',
          exact: true,
        })
        .click();
    };
    await page.setViewportSize({ width: 1440, height: 1100 });
    await ready();
    await page.getByRole('button', { name: 'Write', exact: true }).click();
    await page
      .getByRole('alert')
      .filter({ hasText: 'Enter a message first.' })
      .waitFor();
    await page.getByRole('textbox', { name: 'Message to AI' }).focus();
    await page.keyboard.press('Tab');
    assert.equal(
      await page
        .getByRole('combobox', { name: 'Action' })
        .evaluate((element) => document.activeElement === element),
      true
    );
    assert.notEqual(
      await page
        .getByRole('combobox', { name: 'Action' })
        .evaluate((element) => getComputedStyle(element).boxShadow),
      'none'
    );
    await send();
    await page.getByRole('button', { name: 'Apply to draft' }).click();
    await page.waitForFunction(() =>
      document
        .querySelector('.tiptap')
        ?.textContent.includes('Fresh from the studio.')
    );
    assert.equal(posts.length, 0);
    await send();
    await page.getByRole('button', { name: 'Discard' }).waitFor();
    const conversation = page
      .locator('summary')
      .filter({ hasText: /^Recent conversation/ });
    await conversation.click();
    assert.equal(await conversation.locator('..').getAttribute('open'), '');
    await conversation.click();

    const draftBeforePreferences = await page.locator('.tiptap').textContent();
    await page.getByText('Writing preferences', { exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Language', exact: true })
      .selectOption('id');
    await page
      .getByRole('textbox', { name: 'Brand name', exact: true })
      .fill('Fixture Studio');
    await page
      .getByRole('textbox', { name: 'Brand facts', exact: true })
      .fill('This fixture describes a stationery collection.');
    await page
      .getByRole('button', { name: 'Add approved example', exact: true })
      .click();
    await page
      .getByRole('textbox', { name: 'Approved example 1', exact: true })
      .fill('Catatan baru buat ide yang baru.');
    assert.equal(
      await page
        .getByRole('button', { name: 'Write', exact: true })
        .isDisabled(),
      true
    );
    await page.getByLabel('Suggested text').waitFor({ state: 'hidden' });
    assert.equal(await conversation.count(), 0);
    assert.equal(generations.length, 2);
    await page
      .getByRole('button', { name: 'Save preferences', exact: true })
      .click();
    await page
      .getByText('Writing preferences saved.', { exact: true })
      .waitFor();
    assert.equal(profileSaves.length, 1);
    assert.deepEqual(profileSaves[0], {
      profile: {
        language: 'id',
        tone: 'friendly',
        brandName: 'Fixture Studio',
        audience: '',
        brandFacts: 'This fixture describes a stationery collection.',
        voiceNotes: '',
        examples: ['Catatan baru buat ide yang baru.'],
      },
      revision: 0,
    });
    assert.equal(
      await page.locator('.tiptap').textContent(),
      draftBeforePreferences
    );
    await send();
    await page.getByRole('button', { name: 'Discard', exact: true }).waitFor();
    assert.equal(generations.length, 3);
    assert.equal(generations[2].profileRevision, 1);
    assert.deepEqual(
      generations.map(({ request }) => request.writingProfileRevision),
      [0, 0, 1]
    );
    assert.deepEqual(generations[2].request.history, []);
    assert.deepEqual(generations[2].request.blocks, [
      {
        id: 'synthetic-block',
        content: 'Fresh from the studio.\nA new collection arrives Friday.',
      },
    ]);
    await page.screenshot({
      path: path.join(output, 'postiz-native-ai-desktop.png'),
      fullPage: true,
    });
    const readsBeforeConflict = profileReads.length;
    writingProfile = {
      profile: {
        ...writingProfile.profile,
        voiceNotes: 'Keep the stationery captions short and conversational.',
      },
      revision: 2,
    };
    await send('now');
    await page
      .getByText(
        'Writing preferences changed. Review the reloaded preferences and try again.',
        { exact: true }
      )
      .waitFor();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('section button')).some(
        (button) =>
          button.textContent.trim() === 'Write & post now' && !button.disabled
      )
    );
    assert.equal(profileReads.length, readsBeforeConflict + 1);
    assert.equal(profileReads.at(-1), 2);
    assert.equal(generations.length, 4);
    assert.equal(generations[3].request.writingProfileRevision, 1);
    assert.equal(posts.length, 0);
    assert.equal(await page.getByLabel('Suggested text').count(), 0);
    assert.equal(await conversation.count(), 0);
    holdGeneration = true;
    await send();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    for (let attempts = 0; !held && attempts < 500; attempts++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(held, 'Generation fixture must be intercepted before cancelling');
    await held();
    holdGeneration = false;
    assert.equal(
      await page.getByRole('button', { name: 'Apply to draft' }).count(),
      0
    );
    blockMedia = true;
    await send('now');
    await page
      .getByText(
        'Text applied. Fix the channel settings or media, then use the normal post controls.',
        { exact: true }
      )
      .waitFor();
    assert.equal(posts.length, 0);
    assert.equal(generations.at(-1).request.writingProfileRevision, 2);
    assert.deepEqual(generations.at(-1).request.history, []);
    blockMedia = false;
    await page.evaluate(() => {
      const state = window.fixture.store.getState();
      state.setChannelDate('synthetic-channel', state.date.add(2, 'day'));
    });
    await page
      .getByRole('combobox', { name: 'Action' })
      .selectOption('schedule');
    assert.match(
      await page
        .getByText(/Final save affects all selected channels:/)
        .textContent(),
      /Studio updates \(fixture\): 22\/12\/2026 20:34 \+08:00 \(UTC\+08:00\)/
    );
    await send('schedule');
    await page
      .getByText('Save accepted. Check the calendar for its status.', {
        exact: true,
      })
      .waitFor();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].date, '2026-12-20T12:34:00');
    assert.equal(posts[0].posts[0].date, '2026-12-22T12:34:00');
    assert.equal(
      posts[0].posts[0].value[0].content,
      '<p>Fresh from the studio.</p><p>A new collection arrives Friday.</p>'
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await ready();
    await page.getByText('Writing preferences', { exact: true }).click();
    assert.equal(
      await page
        .getByRole('combobox', { name: 'Language', exact: true })
        .inputValue(),
      'id'
    );
    assert.equal(
      await page
        .getByRole('textbox', { name: 'Approved example 1', exact: true })
        .inputValue(),
      'Catatan baru buat ide yang baru.'
    );
    await send();
    await page.getByRole('button', { name: 'Apply to draft' }).click();
    await page.waitForFunction(() =>
      document
        .querySelector('.tiptap')
        ?.textContent.includes('Fresh from the studio.')
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      ),
      true
    );
    await page.screenshot({
      path: path.join(output, 'postiz-native-ai-mobile.png'),
      fullPage: true,
    });
    configured = false;
    await page.reload();
    await page
      .getByText(
        'AI writing is not configured. Ask your administrator to configure OpenRouter.',
        { exact: true }
      )
      .waitFor();
    assert.equal(
      await page
        .getByRole('button', { name: 'Write', exact: true })
        .isDisabled(),
      true
    );
    configured = true;
    await page.getByRole('button', { name: 'Retry availability' }).click();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('section button')).some(
        (button) => button.textContent.trim() === 'Write' && !button.disabled
      )
    );
    const contrast = async () =>
      page.locator('section').evaluate((section) => {
        const rgb = (value) =>
          value
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number);
        const luminance = (color) =>
          rgb(color)
            .map((value) => {
              const ratio = value / 255;
              return ratio <= 0.04045
                ? ratio / 12.92
                : ((ratio + 0.055) / 1.055) ** 2.4;
            })
            .reduce(
              (sum, value, index) =>
                sum + value * [0.2126, 0.7152, 0.0722][index],
              0
            );
        return Math.min(
          ...Array.from(
            section.querySelectorAll('p,strong,summary,textarea,select,button')
          ).map((element) => {
            let parent = element;
            let background;
            while (parent) {
              const color = getComputedStyle(parent).backgroundColor;
              if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
                background = color;
                break;
              }
              parent = parent.parentElement;
            }
            const foreground = luminance(getComputedStyle(element).color);
            const backdrop = luminance(background || 'rgb(255, 255, 255)');
            return (
              (Math.max(foreground, backdrop) + 0.05) /
              (Math.min(foreground, backdrop) + 0.05)
            );
          })
        );
      });
    const darkContrast = await contrast();
    assert.ok(
      darkContrast >= 4.5,
      `Dark assistant text contrast ${darkContrast}`
    );
    await page.evaluate(() => {
      document.body.className = 'light';
    });
    const lightContrast = await contrast();
    assert.ok(
      lightContrast >= 4.5,
      `Light assistant text contrast ${lightContrast}`
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      ),
      true
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify(
        {
          status: 'PASS',
          browser: await browser.version(),
          timezone: await page.evaluate(
            () => Intl.DateTimeFormat().resolvedOptions().timeZone
          ),
          posts: posts.length,
          preferenceSaves: profileSaves.length,
          savedPreferenceRevision: writingProfile.revision,
          generationConflictRecovered: true,
          minimumAssistantTextContrast: {
            dark: darkContrast,
            light: lightContrast,
          },
          screenshots: [
            'postiz-native-ai-desktop.png',
            'postiz-native-ai-mobile.png',
          ].map((file) => path.join(output, file)),
          coverage:
            'Real ManageModal, assistant, writing preferences, editor, store and native withProvider; synthetic provider registry, API/auth/context/media/date controls. No full route or live account.',
        },
        null,
        2
      )
    );
  } finally {
    await browser?.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    await fs.rm(temporary, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
