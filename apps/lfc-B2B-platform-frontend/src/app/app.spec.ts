import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { servedByClientShell } from './app';
import { routes } from './app.routes';
import { ClientFeatureAccess } from './client/feature-access/client-feature-access.service';
import { DEFAULT_SURFACES } from './client/feature-access/feature-access.fixture';

/**
 * Le chrome PRO ne doit jamais s'enrouler autour d'un écran CLIENT.
 *
 * Ce test existe parce que la règle a été tenue par une liste d'adresses écrite
 * à la main, et qu'elle a dérivé au premier écran ajouté : la boutique cliente
 * héritait du rail, de l'en-tête et du lanceur mobile de l'ancienne app dès que
 * la personne était connectée.
 */
describe('Le chrome de l’app', () => {
  let router: Router;

  const at = async (url: string): Promise<boolean> => {
    await router.navigateByUrl(url);
    return servedByClientShell(router.routerState.snapshot.root);
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        // Les niveaux sont POSÉS, pas lus : la garde de boutique lisait l'API
        // locale, et quand elle ne répondait pas, le repli attendait une session
        // Auth0 qui ne vient jamais en test — dépassement à 5 s, sur du code
        // inchangé (constaté le 2026-09-15, API de dev arrêtée).
        {
          provide: ClientFeatureAccess,
          useFactory: () => {
            const access = new ClientFeatureAccess();
            access.load = () => Promise.resolve();
            access.receive({ shop: 'order', ...DEFAULT_SURFACES });
            return access;
          },
        },
      ],
    });
    router = TestBed.inject(Router);
  });

  it('reconnaît TOUS les écrans clients, pas seulement ceux d’une liste', async () => {
    for (const url of [
      '/',
      '/bienvenue',
      '/connexion',
      '/nouvelle-commande',
      '/nouvelle-commande/boutique',
      '/nouvelle-commande/panier',
      '/nouvelle-commande/confirmee',
    ]) {
      expect(await at(url), url).toBe(true);
    }
  });

  it('une adresse inconnue retombe côté client, pas dans l’ancien chrome', async () => {
    expect(await at('/rien-du-tout')).toBe(true);
  });
});
