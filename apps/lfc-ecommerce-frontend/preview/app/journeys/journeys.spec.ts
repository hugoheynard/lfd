import { HttpBackend } from '@angular/common/http';
import { type ApplicationRef, ErrorHandler } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { Router } from '@angular/router';
import {
  SHOP_COPY_AUDIENCES,
  shopCopyPreviewStepsOf,
  type ShopCopyAudience,
  type ShopCopyPreviewStep,
} from '@lfd/contracts/shop-copy-preview';

import { App } from '../../../src/app/app';
import { ClientCart } from '../../../src/app/client/cart/client-cart.service';
import { ClientOrders } from '../../../src/app/client/client-orders.service';
import { DemoHttpBackend } from '../composition/demo-http-backend';
import { shadowBrowserStorage } from '../composition/memory-storage';
import { previewConfig } from '../composition/preview-config';
import { CopyMarkers } from '../copy-picking/copy-markers';
import { visibleKeys } from '../copy-picking/copy-highlighter';
import type { PreviewJourney } from './preview-world';
import { previewScene } from './journeys';

function scene(audience: ShopCopyAudience, step: ShopCopyPreviewStep): PreviewJourney {
  const found = previewScene(audience, step);
  if (found === null) {
    throw new Error(`aucune scène ${audience}/${step}`);
  }
  return found;
}

/**
 * Ce qui prouve qu'une scène montre SON écran : des clés que seul cet écran
 * (ou ce dialogue) affiche — le titre du dialogue « où » à l'étape 2, le
 * formulaire invité dans le panier du visiteur, « au compte · carte » dans
 * celui du pro… Relevées en jouant chaque scène le 2026-10-11.
 */
const EXPECTED_KEYS: Readonly<Record<string, readonly string[]>> = {
  'visitor/welcome': ['accueilPublic.screenTitle', 'chrome.signIn'],
  'visitor/routing': ['housePicker.title', 'housePicker.lead'],
  'visitor/time': ['slotPicker.title'],
  'visitor/shop': ['commandTerms.title', 'shop.priceTtc'],
  'visitor/cart': ['cart.whoTitle', 'cart.guestFirstName'],
  'visitor/payment': ['pay.title', 'pay.amount'],
  'visitor/confirmation': ['done.joinTitle', 'done.guestMailTitle'],
  'personal/welcome': ['accueilPublic.hello.title', 'chrome.workspaceCurrentPersonal'],
  'personal/routing': ['housePicker.title'],
  'personal/time': ['slotPicker.title'],
  'personal/shop': ['commandTerms.title', 'shop.priceTtc'],
  'personal/cart': ['cart.pay', 'cart.pickupGroup'],
  'personal/payment': ['pay.title'],
  'personal/confirmation': ['done.title', 'done.paidOnline'],
  'personal/orders': ['orders.title'],
  'personal/loyalty': ['loyalty.title', 'loyalty.balanceLabel'],
  'pro/welcome': ['accueilPublic.doors.courier.title', 'chrome.workspaceRolePro'],
  'pro/routing': ['deliveryAddress.title'],
  'pro/time': ['slotPicker.title'],
  'pro/shop': ['shop.priceHt', 'cart.totalPretax'],
  'pro/cart': ['cart.settleTitle', 'cart.settleAccount', 'cart.settleCard'],
  'pro/payment': ['pay.title'],
  'pro/confirmation': ['done.titleAccount', 'done.onAccountPretax'],
  'pro/orders': ['orders.title'],
  'pro/account': ['account.title'],
};

const SCENES = SHOP_COPY_AUDIENCES.flatMap((audience) =>
  shopCopyPreviewStepsOf(audience).map((step) => ({ audience, step })),
);

/** Le temps laissé aux écrans pour finir leurs lectures après le parcours. */
const SETTLE_MS = 200;

/** Ce que l'application a levé, au lieu de le laisser à la console. */
class RecordingErrorHandler implements ErrorHandler {
  readonly errors: unknown[] = [];
  handleError(error: unknown): void {
    this.errors.push(error);
  }
}

describe('les scènes de l’aperçu (clientèle × étape)', () => {
  let app: ApplicationRef | null = null;

  beforeEach(() => {
    // jsdom n'a pas `matchMedia` ; la boutique le lit pour choisir le côté d'un dialogue.
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
    app?.destroy();
    app = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('une scène par clientèle et par étape — et pas de fidélité au visiteur', () => {
    expect(SCENES).toHaveLength(7 + 2 + 2 + 7 + 7);
    expect(previewScene('visitor', 'loyalty')).toBeNull();
    expect(previewScene('pro', 'loyalty')).toBeNull();
    expect(previewScene('personal', 'account')).toBeNull();
  });

  for (const { audience, step } of SCENES) {
    it(`« ${audience}/${step} » monte sans erreur, sans réseau, sans écriture non simulée`, async () => {
      const realWrites = vi.spyOn(Storage.prototype, 'setItem');
      const fetches = vi.spyOn(globalThis, 'fetch');
      const xhrs = vi.spyOn(XMLHttpRequest.prototype, 'open');
      const storages = shadowBrowserStorage(window);
      const recorder = new RecordingErrorHandler();
      const markers = new CopyMarkers();
      const journey = scene(audience, step);
      const config = previewConfig(journey.world, markers);

      app = await bootstrapApplication(App, {
        providers: [...config.providers, { provide: ErrorHandler, useValue: recorder }],
      });
      await journey.enter(app.injector);
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
      await app.whenStable();

      const backend = app.injector.get(HttpBackend);
      expect(backend).toBeInstanceOf(DemoHttpBackend);
      expect(backend instanceof DemoHttpBackend ? backend.unserved : null).toEqual([]);
      expect(recorder.errors).toEqual([]);
      expect(fetches).not.toHaveBeenCalled();
      expect(xhrs).not.toHaveBeenCalled();
      expect(realWrites).not.toHaveBeenCalled();
      // L'écran montre des textes du dictionnaire, marqués de leur clé.
      expect(visibleKeys(document.body, markers).length).toBeGreaterThan(0);
      // L'écran ATTENDU est là, pas seulement un écran : ses textes distinctifs.
      expect(visibleKeys(document.body, markers)).toEqual(
        expect.arrayContaining([
          ...(EXPECTED_KEYS[`${audience}/${step}`] ?? ['(aucune clé attendue déclarée)']),
        ]),
      );
      expect(storages.local).toBeDefined();
    });
  }

  for (const audience of SHOP_COPY_AUDIENCES) {
    it(`« ${audience}/payment » arrive sur l’écran de règlement de la commande passée`, async () => {
      shadowBrowserStorage(window);
      const journey = scene(audience, 'payment');
      app = await bootstrapApplication(App, previewConfig(journey.world, new CopyMarkers()));

      await journey.enter(app.injector);

      expect(app.injector.get(Router).url).toMatch(/^\/reglement\/.+/u);
    });
  }

  it('« pro/confirmation » passe la commande au compte, sans règlement', async () => {
    shadowBrowserStorage(window);
    const journey = scene('pro', 'confirmation');
    app = await bootstrapApplication(App, previewConfig(journey.world, new CopyMarkers()));

    await journey.enter(app.injector);

    expect(app.injector.get(ClientOrders).latest()).toMatchObject({ onAccount: true });
  });

  it('« visitor/confirmation » passe la commande par le vrai chemin et la montre payée', async () => {
    shadowBrowserStorage(window);
    const journey = scene('visitor', 'confirmation');
    app = await bootstrapApplication(App, previewConfig(journey.world, new CopyMarkers()));

    await journey.enter(app.injector);

    expect(app.injector.get(ClientOrders).latest()).toMatchObject({
      settlement: 'paid',
      loyaltyPointsWithAccount: 12,
      welcomeBonusPoints: 50,
    });
  });

  it('« personal/cart » garde le panier du parcours une fois la personne connue', async () => {
    shadowBrowserStorage(window);
    const journey = scene('personal', 'cart');
    app = await bootstrapApplication(App, previewConfig(journey.world, new CopyMarkers()));

    await journey.enter(app.injector);

    expect(app.injector.get(ClientCart).count()).toBe(3);
  });

  /**
   * Lot T4 : les textes d'ÉCRAN (`screenCopy`) portent leur clé comme le
   * dictionnaire général — un clic sur le titre du dialogue « où » rend
   * `housePicker.title`, et la liste des clés visibles couvre l'espace.
   */
  it('« visitor/routing » : un texte d’écran rend sa clé', async () => {
    shadowBrowserStorage(window);
    const markers = new CopyMarkers();
    const journey = scene('visitor', 'routing');
    app = await bootstrapApplication(App, previewConfig(journey.world, markers));
    await journey.enter(app.injector);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    await app.whenStable();

    const title = document.body.querySelector('fold-panel-body .screen')?.textContent ?? '';
    expect(markers.keyAt(title, title.length - 1)).toBe('housePicker.title');
    expect(visibleKeys(document.body, markers)).toEqual(
      expect.arrayContaining(['housePicker.title', 'housePicker.lead']),
    );
  });
});
