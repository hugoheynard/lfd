import { TestBed } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { SHOP_PREVIEW_URL_TOKEN } from '../../data/shop-preview-config';
import { ShopCopyService } from '../../data/shop-copy.service';
import { adminView, entryView, FakeResizeObserver } from '../../shop-copy.testing';
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

beforeEach(() => vi.stubGlobal('ResizeObserver', FakeResizeObserver));
afterEach(() => vi.unstubAllGlobals());

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

describe('ShopPreview — la clientèle et les étapes', () => {
  afterEach(() => localStorage.removeItem('lfd.shop-copy.audience'));

  it('envoie la clientèle et l’étape ; changer de clientèle garde l’étape', async () => {
    const { fixture, link } = await render(`${ORIGIN}/apercu`);
    const frame = { postMessage: vi.fn() };
    link.attach(frame);
    link.receive({ origin: ORIGIN, source: frame, data: { source: SOURCE, type: 'ready' } });
    link.setStep('cart');
    TestBed.inject(CopyNavigation).setAudience('pro');
    await fixture.whenStable();
    expect(frame.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ audience: 'pro', step: 'cart' }),
      ORIGIN,
    );
  });

  it('cliquer une étape de la frise envoie un `show` sur cette étape — pour chaque étape', async () => {
    const { fixture, element, link } = await render(`${ORIGIN}/apercu`);
    TestBed.inject(CopyNavigation).setAudience('personal');
    const frame = { postMessage: vi.fn() };
    link.attach(frame);
    link.receive({ origin: ORIGIN, source: frame, data: { source: SOURCE, type: 'ready' } });
    await fixture.whenStable();
    const steps = ['welcome', 'routing', 'time', 'shop', 'cart', 'payment', 'confirmation'];
    for (const [index, step] of steps.entries()) {
      const segment = [...element.querySelectorAll<HTMLElement>('[role="radio"]')].find(
        (radio) => radio.textContent?.trim() === String(index + 1),
      );
      segment?.click();
      await fixture.whenStable();
      expect(frame.postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ audience: 'personal', step }),
        ORIGIN,
      );
    }
    [...element.querySelectorAll<HTMLElement>('[role="radio"]')]
      .find((radio) => radio.textContent?.includes('Hors commande'))
      ?.click();
    await fixture.whenStable();
    expect(frame.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ step: 'orders' }),
      ORIGIN,
    );
  });

  it('« Hors commande » n’existe que pour qui est connecté ; une étape absente se replie', async () => {
    const { fixture, element, link } = await render(`${ORIGIN}/apercu`);
    expect(element.textContent).not.toContain('Hors commande');
    const navigation = TestBed.inject(CopyNavigation);
    navigation.setAudience('personal');
    link.setStep('loyalty');
    await fixture.whenStable();
    expect(element.textContent).toContain('Hors commande');
    expect(element.textContent).toContain('Fidélité');
    // Le pro n'a pas de fidélité : son premier écran hors commande.
    navigation.setAudience('pro');
    expect(link.step()).toBe('orders');
  });

  it('dit qu’il n’y a pas d’étape de paiement au compte', async () => {
    const { fixture, element, link } = await render(`${ORIGIN}/apercu`);
    TestBed.inject(CopyNavigation).setAudience('pro');
    link.setStep('payment');
    await fixture.whenStable();
    expect(element.textContent).toContain('Pas d’étape de paiement au compte');
  });

  it('part en bureau : 1280 px réduits à la colonne, et le dit', async () => {
    const { fixture, element, link } = await render(`${ORIGIN}/apercu`);
    expect(link.viewport()).toBe('desktop');
    const observer = FakeResizeObserver.instances.at(-1);
    Object.defineProperty(fixture.nativeElement, 'clientWidth', { value: 640 });
    observer?.resize();
    await fixture.whenStable();
    const frame = element.querySelector('iframe');
    expect(frame?.style.width).toBe('1280px');
    expect(frame?.style.transform).toBe('scale(0.5)');
    expect(element.textContent).toContain('Aperçu réduit à 50 %');
    link.viewport.set('mobile');
    await fixture.whenStable();
    expect(element.textContent).not.toContain('Aperçu réduit');
  });

  it('débranche l’observateur de taille en partant', async () => {
    const { fixture } = await render(`${ORIGIN}/apercu`);
    const observer = FakeResizeObserver.instances.at(-1);
    fixture.destroy();
    expect(observer?.disconnected).toBe(true);
  });
});
