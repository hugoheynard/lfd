import { HttpBackend } from '@angular/common/http';
import { type ApplicationRef, ErrorHandler } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { SHOP_COPY_PREVIEW_JOURNEYS } from '@lfd/contracts/shop-copy-preview';

import { App } from '../../../src/app/app';
import { ClientCart } from '../../../src/app/client/cart/client-cart.service';
import { ClientOrders } from '../../../src/app/client/client-orders.service';
import { DemoHttpBackend } from '../composition/demo-http-backend';
import { shadowBrowserStorage } from '../composition/memory-storage';
import { previewConfig } from '../composition/preview-config';
import { CopyMarkers } from '../copy-picking/copy-markers';
import { visibleKeys } from '../copy-picking/copy-highlighter';
import { PREVIEW_JOURNEYS } from './journeys';

/** Le temps laissé aux écrans pour finir leurs lectures après le parcours. */
const SETTLE_MS = 200;

/** Ce que l'application a levé, au lieu de le laisser à la console. */
class RecordingErrorHandler implements ErrorHandler {
  readonly errors: unknown[] = [];
  handleError(error: unknown): void {
    this.errors.push(error);
  }
}

describe('les parcours de l’aperçu', () => {
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

  for (const id of SHOP_COPY_PREVIEW_JOURNEYS) {
    it(`« ${id} » monte sans erreur, sans réseau et sans toucher au vrai stockage`, async () => {
      const realWrites = vi.spyOn(Storage.prototype, 'setItem');
      const fetches = vi.spyOn(globalThis, 'fetch');
      const xhrs = vi.spyOn(XMLHttpRequest.prototype, 'open');
      const storages = shadowBrowserStorage(window);
      const recorder = new RecordingErrorHandler();
      const markers = new CopyMarkers();
      const journey = PREVIEW_JOURNEYS[id];
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
      expect(storages.local).toBeDefined();
    });
  }

  it('« visitor-confirmation » passe la commande par le vrai chemin et la montre payée', async () => {
    shadowBrowserStorage(window);
    const journey = PREVIEW_JOURNEYS['visitor-confirmation'];
    app = await bootstrapApplication(App, previewConfig(journey.world, new CopyMarkers()));

    await journey.enter(app.injector);

    expect(app.injector.get(ClientOrders).latest()).toMatchObject({
      settlement: 'paid',
      loyaltyPointsWithAccount: 12,
      welcomeBonusPoints: 50,
    });
  });

  it('« customer-signed-in » garde le panier du parcours une fois la personne connue', async () => {
    shadowBrowserStorage(window);
    const journey = PREVIEW_JOURNEYS['customer-signed-in'];
    app = await bootstrapApplication(App, previewConfig(journey.world, new CopyMarkers()));

    await journey.enter(app.injector);

    expect(app.injector.get(ClientCart).count()).toBe(3);
  });

  /**
   * Lot T4 : les textes d'ÉCRAN (`screenCopy`) portent leur clé comme le
   * dictionnaire général — un clic sur le titre du dialogue « où » rend
   * `housePicker.title`, et la liste des clés visibles couvre l'espace.
   */
  it('« visitor-choosing-place » : un texte d’écran rend sa clé', async () => {
    shadowBrowserStorage(window);
    const markers = new CopyMarkers();
    const journey = PREVIEW_JOURNEYS['visitor-choosing-place'];
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
