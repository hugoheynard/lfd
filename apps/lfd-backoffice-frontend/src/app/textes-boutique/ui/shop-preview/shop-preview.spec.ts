import { TestBed } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { SHOP_PREVIEW_URL_TOKEN } from '../../data/shop-preview-config';
import { ShopCopyService } from '../../data/shop-copy.service';
import { adminView, entryView } from '../../shop-copy.testing';
import { CopyNavigation } from '../../state/copy-navigation';
import { DraftWriter } from '../../state/draft-writer';
import { PreviewLink } from '../../state/preview-link';
import { ShopCopyStore } from '../../state/shop-copy-store';
import { CLOSED_POLL_MS, PREVIEW_WINDOW_NAME, ShopPreview } from './shop-preview';

const ORIGIN = 'https://apercu.example';
const SOURCE = 'lfc-shop-copy-preview';

async function render(url: string) {
  TestBed.configureTestingModule({
    imports: [ShopPreview],
    providers: [
      ShopCopyStore,
      CopyNavigation,
      DraftWriter,
      PreviewLink,
      { provide: SHOP_PREVIEW_URL_TOKEN, useValue: url },
      {
        provide: ShopCopyService,
        useValue: {
          load: () =>
            Promise.resolve(
              adminView([
                entryView('cart.title', 'cart', 'Panier', {
                  locales: { fr: { publishedText: 'Mon panier' } },
                }),
              ]),
            ),
        },
      },
      { provide: NotifyService, useValue: { error: vi.fn() } },
      { provide: PermissionsStore, useValue: { can: (_: StaffPermission) => true } },
    ],
  });
  await TestBed.inject(ShopCopyStore).load();
  const fixture = TestBed.createComponent(ShopPreview);
  await fixture.whenStable();
  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    link: TestBed.inject(PreviewLink),
  };
}

describe('ShopPreview — l’aperçu', () => {
  it('sans adresse configurée, dit « Aperçu indisponible »', async () => {
    const { element } = await render('');
    expect(element.textContent).toContain('Aperçu indisponible');
    expect(element.querySelector('iframe')).toBeNull();
  });

  it('attend ready, puis n’écrit qu’à l’origine de l’aperçu', async () => {
    const { fixture, link, element } = await render(`${ORIGIN}/apercu`);
    expect(element.querySelector('iframe')).not.toBeNull();
    const frame = { postMessage: vi.fn() };
    link.attach(frame);
    link.receive({ origin: ORIGIN, source: frame, data: { source: SOURCE, type: 'ready' } });
    await fixture.whenStable();
    expect(frame.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'show',
        locale: 'fr',
        published: { 'cart.title': 'Mon panier' },
      }),
      ORIGIN,
    );
  });

  it('ignore un « pick » venu d’une autre fenêtre ; ouvre la clé venue de l’iframe', async () => {
    const { link } = await render(`${ORIGIN}/apercu`);
    const navigation = TestBed.inject(CopyNavigation);
    const frame = { postMessage: vi.fn() };
    link.attach(frame);
    link.receive({
      origin: ORIGIN,
      source: {},
      data: { source: SOURCE, type: 'pick', key: 'cart.title' },
    });
    expect(navigation.selectedKey()).toBeNull();
    link.receive({
      origin: ORIGIN,
      source: frame,
      data: { source: SOURCE, type: 'pick', key: 'cart.title' },
    });
    expect(navigation.selectedKey()).toBe('cart.title');
  });
});

/**
 * Une vraie `Window` (celle d'une iframe jsdom) pour jouer la fenêtre détachée :
 * on observe ce qu'on lui écrit, et l'on décide quand elle est fermée.
 */
function fakePopup() {
  const holder = document.createElement('iframe');
  document.body.append(holder);
  const popup = holder.contentWindow;
  if (popup === null) {
    throw new Error('jsdom n’a pas donné de fenêtre');
  }
  let closed = false;
  Object.defineProperty(popup, 'closed', { get: () => closed });
  const postMessage = vi.spyOn(popup, 'postMessage').mockImplementation(() => undefined);
  const focus = vi.spyOn(popup, 'focus').mockImplementation(() => undefined);
  const close = vi.spyOn(popup, 'close').mockImplementation(() => {
    closed = true;
  });
  return {
    popup,
    postMessage,
    focus,
    close,
    shut: () => {
      closed = true;
    },
  };
}

function button(element: HTMLElement, label: string): HTMLButtonElement {
  const found = [...element.querySelectorAll('button')].find((b) => b.textContent.includes(label));
  if (found === undefined) {
    throw new Error(`bouton « ${label} » introuvable`);
  }
  return found;
}

describe('ShopPreview — la fenêtre détachée', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('ouvre l’aperçu dans une fenêtre nommée, et la colonne le dit à la place de l’iframe', async () => {
    const { fixture, element, link } = await render(`${ORIGIN}/apercu`);
    const { popup } = fakePopup();
    const open = vi.spyOn(window, 'open').mockReturnValue(popup);

    button(element, 'Ouvrir dans une fenêtre').click();
    await fixture.whenStable();

    expect(open).toHaveBeenCalledWith(
      `${ORIGIN}/apercu`,
      PREVIEW_WINDOW_NAME,
      'popup,width=430,height=900',
    );
    expect(link.detached()).toBe(true);
    expect(element.querySelector('iframe')).toBeNull();
    expect(element.textContent).toContain('L’aperçu est ouvert dans une autre fenêtre');
  });

  it('une seule cible : un second clic ramène la fenêtre, et l’iframe n’est plus écoutée', async () => {
    const { fixture, element, link } = await render(`${ORIGIN}/apercu`);
    const navigation = TestBed.inject(CopyNavigation);
    const iframe = { postMessage: vi.fn() };
    link.attach(iframe);
    const { popup, postMessage, focus } = fakePopup();
    const open = vi.spyOn(window, 'open').mockReturnValue(popup);

    button(element, 'Ouvrir dans une fenêtre').click();
    await fixture.whenStable();
    button(element, 'Ouvrir dans une fenêtre').click();
    expect(open).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(2);

    const pick = { source: SOURCE, type: 'pick', key: 'cart.title' };
    link.receive({ origin: ORIGIN, source: iframe, data: pick });
    expect(navigation.selectedKey()).toBeNull();

    link.receive({ origin: ORIGIN, source: popup, data: { source: SOURCE, type: 'ready' } });
    await fixture.whenStable();
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'show' }), ORIGIN);
    expect(iframe.postMessage).not.toHaveBeenCalled();

    link.receive({ origin: 'https://ailleurs.example', source: popup, data: pick });
    expect(navigation.selectedKey()).toBeNull();
    link.receive({ origin: ORIGIN, source: popup, data: pick });
    expect(navigation.selectedKey()).toBe('cart.title');
  });

  it('rétablit l’iframe quand la fenêtre est fermée', async () => {
    const { fixture, element, link } = await render(`${ORIGIN}/apercu`);
    const { popup, shut } = fakePopup();
    vi.spyOn(window, 'open').mockReturnValue(popup);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });

    button(element, 'Ouvrir dans une fenêtre').click();
    vi.advanceTimersByTime(CLOSED_POLL_MS);
    expect(link.detached()).toBe(true);

    shut();
    vi.advanceTimersByTime(CLOSED_POLL_MS);
    await fixture.whenStable();

    expect(link.detached()).toBe(false);
    expect(element.querySelector('iframe')).not.toBeNull();
    // Le message tardif de la fenêtre fermée n'est plus lu.
    link.receive({
      origin: ORIGIN,
      source: popup,
      data: { source: SOURCE, type: 'pick', key: 'cart.title' },
    });
    expect(TestBed.inject(CopyNavigation).selectedKey()).toBeNull();
  });

  it('« Ramener ici » ferme la fenêtre et rétablit l’iframe', async () => {
    const { fixture, element, link } = await render(`${ORIGIN}/apercu`);
    const { popup, close } = fakePopup();
    vi.spyOn(window, 'open').mockReturnValue(popup);

    button(element, 'Ouvrir dans une fenêtre').click();
    await fixture.whenStable();
    button(element, 'Ramener ici').click();
    await fixture.whenStable();

    expect(close).toHaveBeenCalled();
    expect(link.detached()).toBe(false);
    expect(element.querySelector('iframe')).not.toBeNull();
  });
});
