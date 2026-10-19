import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { provideWorkspace, workspaceDouble } from '../client-workspace.fixture';
import { TEST_CATALOGUE } from './shop-catalogue.fixture';
import { ShopCatalogue } from './shop-catalogue.store';
import { ShopPriceBasis } from './shop-price-basis.service';
import { ProVisit } from './pro-visit.service';

const PUBLIC_URL = `${AUTH_CONFIG.apiBaseUrl}/shop/catalogue`;

@Component({ selector: 'app-blank', template: '' })
class Blank {}

/** Une adresse atteinte : c'est elle, et elle seule, qui dit la visite. */
async function at(url: string): Promise<void> {
  await TestBed.inject(Router).navigateByUrl(url);
}

/**
 * La visite pro (Hugo, 2026-10-19) : un visiteur venu de `/pro` lit les tarifs
 * pro hors taxe ; un particulier et une personne reconnue ne voient rien changer.
 */
describe('ProVisit — l’affichage pro d’un visiteur', () => {
  let signedIn: WritableSignal<boolean>;

  beforeEach(() => {
    signedIn = signal(false);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'boutique', component: Blank },
          { path: 'pro', component: Blank },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthFacade,
          useValue: { isAuthenticated: signedIn, accessToken$: () => of('jeton') },
        },
        provideWorkspace(workspaceDouble()),
      ],
    });
  });

  it('un visiteur sans #pro garde le TTC', async () => {
    await at('/boutique');

    expect(TestBed.inject(ProVisit).active()).toBe(false);
    expect(TestBed.inject(ShopPriceBasis).showsTtc()).toBe(true);
  });

  it('un visiteur arrivé par #pro passe en hors taxe', async () => {
    await at('/boutique#pro');

    expect(TestBed.inject(ProVisit).active()).toBe(true);
    expect(TestBed.inject(ShopPriceBasis).showsTtc()).toBe(false);
  });

  it('#pro ne vaut que sur la boutique', async () => {
    await at('/pro#pro');

    expect(TestBed.inject(ProVisit).active()).toBe(false);
  });

  it('un rayon dans l’adresse garde la visite', async () => {
    await at('/boutique?rayon=pains#pro');

    expect(TestBed.inject(ProVisit).active()).toBe(true);
  });

  it('une personne reconnue garde l’affichage de son espace', async () => {
    signedIn.set(true);
    await at('/boutique#pro');

    expect(TestBed.inject(ProVisit).active()).toBe(false);
    // Espace personnel, sans société : le TTC, comme avant.
    expect(TestBed.inject(ShopPriceBasis).showsTtc()).toBe(true);
  });

  it('« Voir les prix TTC » retire #pro de l’adresse, et la visite avec lui', async () => {
    await at('/boutique?rayon=pains#pro');
    await TestBed.inject(ProVisit).leave();

    expect(TestBed.inject(Router).url).toBe('/boutique?rayon=pains');
    expect(TestBed.inject(ProVisit).active()).toBe(false);
  });

  /**
   * Régression (Hugo, 2026-10-19) : revenu sur `/boutique` sans `#pro` après
   * une visite pro, on restait en hors taxe — le choix était gardé en
   * `sessionStorage`. L'adresse dit désormais ce qu'on voit.
   */
  it('revenu sur /boutique sans #pro après une visite pro, on lit le TTC', async () => {
    sessionStorage.setItem('lfd.shop.pro-visit', '1');
    await at('/boutique#pro');
    await at('/pro');
    await at('/boutique');

    expect(TestBed.inject(ProVisit).active()).toBe(false);
    expect(TestBed.inject(ShopPriceBasis).showsTtc()).toBe(true);
    sessionStorage.clear();
  });

  it('la vitrine se lit à la source pro pendant la visite, publique sinon', async () => {
    const catalogue = TestBed.inject(ShopCatalogue);
    const http = TestBed.inject(HttpTestingController);
    await at('/boutique#pro');

    const pro = catalogue.hydrate();
    const request = http.expectOne((r) => r.url === PUBLIC_URL);
    expect(request.request.params.get('audience')).toBe('pro');
    request.flush(TEST_CATALOGUE);
    await pro;

    await at('/boutique');
    TestBed.tick();
    const plain = http.expectOne((r) => r.url === PUBLIC_URL);
    expect(plain.request.params.has('audience')).toBe(false);
    plain.flush(TEST_CATALOGUE);
    http.verify();
  });
});
