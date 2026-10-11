import { SHOP_COPY_PREVIEW_SOURCE } from '@lfd/contracts/shop-copy-preview';

import { shadowBrowserStorage } from '../composition/memory-storage';
import { PreviewHost } from './preview-host';

const EDITOR = 'http://127.0.0.1:7317';
const ALLOWED = ['http://localhost:7317', EDITOR];

/** Une fenêtre encadrée : la vraie de jsdom, avec un parent qui note ce qu'on lui envoie. */
function framedWindow(parent: { postMessage: (message: unknown, origin: string) => void }): Window {
  return new Proxy(window, {
    get(target, property) {
      if (property === 'parent') {
        return parent;
      }
      const value: unknown = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** Un message tel que le navigateur le livre — l'origine et l'émetteur sont ceux qu'il atteste. */
function deliver(origin: string, source: unknown, data: unknown): void {
  window.dispatchEvent(Object.assign(new Event('message'), { origin, source, data }));
}

const settle = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('l’hôte de l’aperçu', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string): MediaQueryList =>
      Object.assign(new EventTarget(), {
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
      }),
    );
    document.body.innerHTML = '<app-root></app-root>';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hors cadre, ne montre que l’écran « depuis le back-office » et n’envoie rien', async () => {
    const posted = vi.spyOn(window, 'postMessage');

    await new PreviewHost(window, ALLOWED, shadowBrowserStorage(window)).start();

    expect(document.body.textContent).toContain("Cet aperçu s'ouvre depuis le back-office");
    expect(posted).not.toHaveBeenCalled();
  });

  it('encadré, annonce `ready` aux seules origines du back-office, jamais à « * »', async () => {
    const parent = { postMessage: vi.fn<(message: unknown, origin: string) => void>() };

    await new PreviewHost(framedWindow(parent), ALLOWED, shadowBrowserStorage(window)).start();

    expect(parent.postMessage.mock.calls).toEqual(
      ALLOWED.map((origin) => [{ source: SHOP_COPY_PREVIEW_SOURCE, type: 'ready' }, origin]),
    );
  });

  it('joue le parcours d’un `show` du back-office, puis ne répond qu’à son origine', async () => {
    const parent = { postMessage: vi.fn<(message: unknown, origin: string) => void>() };
    await new PreviewHost(framedWindow(parent), ALLOWED, shadowBrowserStorage(window)).start();
    parent.postMessage.mockClear();

    // Une autre origine, puis un autre émetteur : ignorés sans bruit.
    const show = {
      source: SHOP_COPY_PREVIEW_SOURCE,
      type: 'show',
      journey: 'visitor-first-visit',
      locale: 'fr',
      viewport: 'mobile',
      drafts: {},
      published: {},
      highlight: null,
    };
    deliver('https://evil.example', parent, show);
    deliver(EDITOR, {}, show);
    await settle(50);
    expect(document.querySelector('fold-page-layout, app-client-shell')).toBeNull();

    deliver(EDITOR, parent, show);
    await settle(800);

    const targets = new Set(parent.postMessage.mock.calls.map(([, origin]) => origin));
    expect([...targets]).toEqual([EDITOR]);
    expect(parent.postMessage.mock.calls.some(([message]) => isVisibleKeys(message))).toBe(true);
  });
});

function isVisibleKeys(message: unknown): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'visible-keys'
  );
}
