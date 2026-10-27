import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthFacade } from '../../auth/auth.facade';
import { ClientChrome } from '../client-chrome.service';
import { ClientOnboarding } from '../client-onboarding.service';
import { ProOnboarding } from '../pro-onboarding.service';
import { ClientShell } from './client-shell';

/**
 * Ce que la barre du haut tait quand l'écran le demande : le panier et
 * l'entrée du visiteur. Défaut inchangé pour tous les écrans ; seule la
 * landing `/pro` les éteint (2026-10-19).
 */
describe('ClientShell — panier et entrée de la barre', () => {
  let fixture: ComponentFixture<ClientShell>;

  beforeEach(() => {
    // La barre écoute le pli : il faut un `matchMedia` qui accepte un écouteur.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
    }));
    TestBed.configureTestingModule({
      imports: [ClientShell],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthFacade,
          useValue: {
            isAuthenticated: signal(false),
            user: signal(null),
            sessionExpired: signal(false),
          },
        },
        // Instanciés par le shell pour leurs effets de retour d'Auth0, hors sujet ici.
        { provide: ClientOnboarding, useValue: {} },
        { provide: ProOnboarding, useValue: { declarationUnderway: signal(false) } },
      ],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  const render = (): HTMLElement => {
    fixture = TestBed.createComponent(ClientShell);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('montre par défaut le panier et les liens de compte', () => {
    const host = render();
    expect(host.querySelector('app-client-cart-pill')).not.toBeNull();
    expect(host.querySelector('.sign')).not.toBeNull();
  });

  it('les masque quand l’écran éteint les deux signaux', () => {
    const chrome = TestBed.inject(ClientChrome);
    chrome.cart.set(false);
    chrome.entry.set(false);
    const host = render();
    expect(host.querySelector('app-client-cart-pill')).toBeNull();
    expect(host.querySelector('.sign')).toBeNull();
    chrome.cart.set(true);
    chrome.entry.set(true);
  });
});
