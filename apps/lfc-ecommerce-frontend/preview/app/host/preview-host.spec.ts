import { SHOP_COPY_PREVIEW_SOURCE } from '@lfd/contracts/shop-copy-preview';

import { shadowBrowserStorage } from '../composition/memory-storage';
import { OPENER_GRACE_MS, PreviewHost } from './preview-host';

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

/**
 * Une fenêtre ouverte par `window.open` : sans parent (le sien est elle-même),
 * avec un opener qui note ce qu'on lui envoie, et un `resizeTo` observé.
 */
function openedWindow(
  opener: { postMessage: (message: unknown, origin: string) => void },
  resizeTo: (width: number, height: number) => void = () => undefined,
): Window {
  const opened: Window = new Proxy(window, {
    get(target, property) {
      if (property === 'parent') {
        return opened;
      }
      if (property === 'opener') {
        return opener;
      }
      if (property === 'resizeTo') {
        return resizeTo;
      }
      const value: unknown = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return opened;
}

const SHOW = {
  source: SHOP_COPY_PREVIEW_SOURCE,
  type: 'show',
  audience: 'visitor',
  step: 'welcome',
  locale: 'fr',
  viewport: 'mobile',
  drafts: {},
  published: {},
  highlight: null,
};

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
      audience: 'visitor',
      step: 'welcome',
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
    // Attendre la RÉPONSE, pas une durée (borne sous les 5 s du test) : 800 ms fixes ne suffisaient pas sur
    // la CI chargée (deux échecs de suite le 2026-10-12), où la scène monte
    // plus lentement qu'en local.
    await vi.waitFor(
      () => {
        expect(parent.postMessage.mock.calls.some(([message]) => isVisibleKeys(message))).toBe(
          true,
        );
      },
      { timeout: 4_500, interval: 50 },
    );

    const targets = new Set(parent.postMessage.mock.calls.map(([, origin]) => origin));
    expect([...targets]).toEqual([EDITOR]);
    expect(parent.postMessage.mock.calls.some(([message]) => isVisibleKeys(message))).toBe(true);
  });

  it('une autre étape REJOUE la scène : l’étape 2 ouvre le dialogue « où »', async () => {
    const parent = { postMessage: vi.fn<(message: unknown, origin: string) => void>() };
    await new PreviewHost(framedWindow(parent), ALLOWED, shadowBrowserStorage(window)).start();
    deliver(EDITOR, parent, SHOW);
    await settle(800);
    parent.postMessage.mockClear();

    deliver(EDITOR, parent, { ...SHOW, step: 'routing' });
    await settle(1500);

    const keys = parent.postMessage.mock.calls
      .map(([message]) => message)
      .filter(isVisibleKeys)
      .flatMap((message) => Reflect.get(Object(message), 'keys') as readonly string[]);
    expect(keys).toEqual(expect.arrayContaining(['housePicker.title']));
  });

  describe('ouvert dans une fenêtre par le back-office', () => {
    it('annonce `ready` à l’opener, aux seules origines du back-office, jamais à « * »', async () => {
      const opener = { postMessage: vi.fn<(message: unknown, origin: string) => void>() };

      await new PreviewHost(openedWindow(opener), ALLOWED, shadowBrowserStorage(window)).start();

      expect(opener.postMessage.mock.calls).toEqual(
        ALLOWED.map((origin) => [{ source: SHOP_COPY_PREVIEW_SOURCE, type: 'ready' }, origin]),
      );
      expect(opener.postMessage.mock.calls.some(([, origin]) => origin === '*')).toBe(false);
    });

    it('joue le `show` de l’opener, ne répond qu’à son origine, et prend la largeur demandée', async () => {
      const opener = { postMessage: vi.fn<(message: unknown, origin: string) => void>() };
      const resizeTo = vi.fn<(width: number, height: number) => void>();
      await new PreviewHost(
        openedWindow(opener, resizeTo),
        ALLOWED,
        shadowBrowserStorage(window),
      ).start();
      opener.postMessage.mockClear();

      // Même origine, autre émetteur : ignoré.
      deliver(EDITOR, {}, SHOW);
      await settle(50);
      expect(resizeTo).not.toHaveBeenCalled();

      deliver(EDITOR, opener, SHOW);
      // Même raison qu'au-dessus : attendre la réponse, pas une durée.
      await vi.waitFor(
        () => {
          expect(opener.postMessage).toHaveBeenCalled();
          expect(resizeTo).toHaveBeenCalled();
        },
        { timeout: 4_500, interval: 50 },
      );

      const targets = new Set(opener.postMessage.mock.calls.map(([, origin]) => origin));
      expect([...targets]).toEqual([EDITOR]);
      expect(resizeTo).toHaveBeenCalledWith(430, expect.any(Number));
    });

    it('refuse un opener d’une origine non autorisée, puis montre l’écran « hors cadre »', async () => {
      const opener = { postMessage: vi.fn<(message: unknown, origin: string) => void>() };
      await new PreviewHost(openedWindow(opener), ALLOWED, shadowBrowserStorage(window)).start();
      opener.postMessage.mockClear();

      deliver('https://evil.example', opener, SHOW);
      await settle(OPENER_GRACE_MS + 300);

      expect(document.querySelector('app-client-shell')).toBeNull();
      expect(document.body.textContent).toContain("Cet aperçu s'ouvre depuis le back-office");
      expect(opener.postMessage).not.toHaveBeenCalled();
    });
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
