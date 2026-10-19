import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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

/**
 * La visite pro (Hugo, 2026-10-19) : un visiteur venu de `/pro` lit les tarifs
 * pro hors taxe ; un particulier et une personne reconnue ne voient rien changer.
 */
describe('ProVisit — l’affichage pro d’un visiteur', () => {
  let signedIn: WritableSignal<boolean>;

  beforeEach(() => {
    sessionStorage.clear();
    signedIn = signal(false);
    TestBed.configureTestingModule({
      providers: [
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

  it('un visiteur sans #pro garde le TTC', () => {
    expect(TestBed.inject(ProVisit).active()).toBe(false);
    expect(TestBed.inject(ShopPriceBasis).showsTtc()).toBe(true);
  });

  it('un visiteur arrivé par #pro passe en hors taxe', () => {
    TestBed.inject(ProVisit).enter();

    expect(TestBed.inject(ProVisit).active()).toBe(true);
    expect(TestBed.inject(ShopPriceBasis).showsTtc()).toBe(false);
  });

  it('une personne reconnue garde l’affichage de son espace', () => {
    signedIn.set(true);
    TestBed.inject(ProVisit).enter();

    expect(TestBed.inject(ProVisit).active()).toBe(false);
    // Espace personnel, sans société : le TTC, comme avant.
    expect(TestBed.inject(ShopPriceBasis).showsTtc()).toBe(true);
  });

  it('« Voir les prix TTC » efface le choix, pour la visite aussi', () => {
    const visit = TestBed.inject(ProVisit);
    visit.enter();
    visit.leave();

    expect(visit.active()).toBe(false);
    expect(sessionStorage.length).toBe(0);
  });

  it('le choix survit à une navigation : une nouvelle lecture le retrouve', () => {
    TestBed.inject(ProVisit).enter();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: AuthFacade, useValue: { isAuthenticated: signal(false) } }],
    });

    expect(TestBed.inject(ProVisit).active()).toBe(true);
  });

  it('la vitrine se lit à la source pro pendant la visite, publique sinon', async () => {
    const catalogue = TestBed.inject(ShopCatalogue);
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(ProVisit).enter();

    const pro = catalogue.hydrate();
    const request = http.expectOne((r) => r.url === PUBLIC_URL);
    expect(request.request.params.get('audience')).toBe('pro');
    request.flush(TEST_CATALOGUE);
    await pro;

    TestBed.inject(ProVisit).leave();
    TestBed.tick();
    const plain = http.expectOne((r) => r.url === PUBLIC_URL);
    expect(plain.request.params.has('audience')).toBe(false);
    plain.flush(TEST_CATALOGUE);
    http.verify();
  });
});
