import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { servedByClientShell } from './app';
import { routes } from './app.routes';

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
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    router = TestBed.inject(Router);
  });

  it('reconnaît TOUS les écrans clients, pas seulement ceux d’une liste', async () => {
    for (const url of [
      '/',
      '/bienvenue',
      '/connexion',
      '/commande',
      '/commande/boutique',
      '/commande/panier',
      '/commande/confirmee',
    ]) {
      expect(await at(url), url).toBe(true);
    }
  });

  it('une adresse inconnue retombe côté client, pas dans l’ancien chrome', async () => {
    expect(await at('/rien-du-tout')).toBe(true);
  });
});
