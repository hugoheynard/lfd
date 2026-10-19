import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { PickupAddressView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthFacade } from '../../auth/auth.facade';
import { SignInDialog } from '../../login/sign-in-dialog/sign-in-dialog';
import { ClientChrome } from '../client-chrome.service';
import { matchMediaAt } from '../mon-compte/account.fixture';
import { PRO_LANDING_FR } from '../copy/screens/pro-landing.copy';
import { ProLanding } from './pro-landing';

const LABO: PickupAddressView = {
  id: 'pick_labo',
  label: 'Le Labo',
  ligne1: 'Route de la Balme',
  ligne2: '',
  codePostal: '73150',
  ville: 'Val d’Isère',
  pays: 'France',
  discount: { mode: 'percent', bp: 1000 },
  discountAudiences: { b2b: true, b2c: true },
  opening: { proPickup: null, publicOpening: null },
};
const VILLAGE: PickupAddressView = {
  ...LABO,
  id: 'pick_village',
  label: 'Le Village',
  discount: { mode: 'percent', bp: 1500 },
  discountAudiences: { b2b: false, b2c: true },
};

interface Opened {
  readonly component: unknown;
  readonly data: unknown;
}

describe('ProLanding — l’accueil pro public (/pro)', () => {
  let fixture: ComponentFixture<ProLanding>;
  let opened: Opened[];
  let authenticated: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    opened = [];
    authenticated = signal(false);
    // `dialogSide()` lit `matchMedia` à l'ouverture ; le harnais n'en a pas.
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    TestBed.configureTestingModule({
      imports: [ProLanding],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthFacade, useValue: { isAuthenticated: authenticated } },
        {
          provide: FoldPanelHostService,
          useValue: {
            open: (component: unknown, options: { data?: unknown }): { close: () => void } => {
              opened.push({ component, data: options.data });
              return { close: (): void => undefined };
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(ProLanding);
    fixture.detectChanges();
  });

  /** La lecture publique des points pros, doublée. */
  function answer(body: readonly PickupAddressView[] | 'error'): void {
    const http = TestBed.inject(HttpTestingController);
    const req = http.expectOne(
      (r) => r.url.endsWith('/pickup-addresses') && r.params.get('audience') === 'pro',
    );
    expect(req.request.headers.has('Authorization')).toBe(false);
    if (body === 'error') {
      req.flush('ko', { status: 500, statusText: 'Server Error' });
    } else {
      req.flush(body);
    }
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function maybe(test: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      `[data-test="${test}"]`,
    );
  }

  it('montre un chargement discret tant que les points ne sont pas lus', () => {
    expect((fixture.nativeElement as HTMLElement).querySelector('fold-loading')).not.toBeNull();
    expect(maybe('pro-pickup-points')).toBeNull();
  });

  it('plusieurs points : leur nombre, et la meilleure remise PRO (pas celle des particuliers)', async () => {
    answer([LABO, VILLAGE]);
    await settle();
    expect(maybe('pro-pickup-points')?.textContent?.trim()).toBe('2 points de retrait');
    expect(maybe('pro-pickup-note')?.textContent).toContain('Jusqu’à −');
    expect(maybe('pro-pickup-note')?.textContent).toContain('10');
    expect(maybe('pro-pickup-note')?.textContent).not.toContain('15');
  });

  it('un seul point : son nom', async () => {
    answer([LABO]);
    await settle();
    expect(maybe('pro-pickup-points')?.textContent?.trim()).toBe('Je retire à Le Labo');
  });

  it('échec de lecture : la carte garde ses mots génériques, sans erreur', async () => {
    answer('error');
    await settle();
    expect(maybe('pro-pickup-points')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('fold-loading')).toBeNull();
    expect(maybe('pro-pickup-note')?.textContent?.trim()).toBe(PRO_LANDING_FR.pickup.note);
  });

  it('liste vide : la carte garde ses mots génériques', async () => {
    answer([]);
    await settle();
    expect(maybe('pro-pickup-points')).toBeNull();
    expect(maybe('pro-pickup-note')?.textContent?.trim()).toBe(PRO_LANDING_FR.pickup.note);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function el(test: string): HTMLElement {
    const found = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      `[data-test="${test}"]`,
    );
    if (!found) throw new Error(`absent : ${test}`);
    return found;
  }

  it('s’affiche sans connexion, avec son accroche et les deux modes', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain(PRO_LANDING_FR.kicker);
    expect(text).toContain(PRO_LANDING_FR.pickup.tag);
    expect(text).toContain(PRO_LANDING_FR.delivery.tag);
  });

  it('« Je me connecte » ouvre la connexion de la boutique, retour sur /mon-compte', () => {
    expect(el('pro-sign-in').textContent?.trim()).toBe(PRO_LANDING_FR.signIn);
    el('pro-sign-in').click();
    expect(opened).toEqual([
      { component: SignInDialog, data: { target: '/mon-compte', email: '' } },
    ]);
  });

  it('déjà reconnu, « Je me connecte » mène droit à /mon-compte sans dialogue', () => {
    authenticated.set(true);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    el('pro-sign-in').click();
    expect(navigate).toHaveBeenCalledWith('/mon-compte');
    expect(opened).toEqual([]);
  });

  it('« Ouvrir un compte pro » mène à /inscription#pro', () => {
    const link = el('pro-register').querySelector('a');
    expect(link?.textContent?.trim()).toBe(PRO_LANDING_FR.register);
    expect(link?.getAttribute('href')).toBe('/inscription#pro');
  });

  it('« Je visite la boutique » mène à /boutique', () => {
    const link = el('pro-browse');
    expect(link.textContent?.trim()).toBe(PRO_LANDING_FR.browse);
    expect(link.getAttribute('href')).toBe('/boutique');
  });

  it('un lien discret mène à la page des particuliers', () => {
    const link = el('pro-personal');
    expect(link.textContent?.trim()).toBe(PRO_LANDING_FR.personalLink);
    expect(link.getAttribute('href')).toBe('/bienvenue');
  });

  it('éteint la lèvre et la bande fixe, et les rallume en partant', () => {
    const chrome = TestBed.inject(ClientChrome);
    expect(chrome.bandLip()).toBe(false);
    fixture.destroy();
    expect(chrome.bandLip()).toBe(true);
    expect(chrome.bandNarrow()).toBe(true);
  });
});
