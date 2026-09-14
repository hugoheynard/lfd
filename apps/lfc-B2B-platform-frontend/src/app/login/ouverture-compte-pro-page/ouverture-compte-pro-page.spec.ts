import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { AuthFacade, type ProRegistration } from '../../auth/auth.facade';
import { ClientChrome } from '../../client/client-chrome.service';
import { PRO_ACCOUNT_FR } from '../../client/copy/screens/pro-account.copy';
import { openShopAt } from '../../client/feature-access/feature-access.fixture';
import { OuvertureCompteProPage } from './ouverture-compte-pro-page';

describe('OuvertureCompteProPage', () => {
  let fixture: ComponentFixture<OuvertureCompteProPage>;
  let isAuthenticated: ReturnType<typeof signal<boolean>>;
  let asked: { kind: 'registerPro' | 'login'; target: string; payload: unknown }[];
  let navigated: string[];

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const button = (label: string): HTMLButtonElement => {
    const found = Array.from(el().querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes(label),
    );
    if (!found) {
      throw new Error(`Aucun bouton « ${label} » à l'écran.`);
    }
    return found;
  };

  const type = (index: number, value: string): void => {
    const input = el().querySelectorAll('input')[index];
    if (!input) {
      throw new Error(`Pas de champ n°${index} à l'écran.`);
    }
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  /** L'ordre du DOM : prénom, nom, e-mail, téléphone, enseigne. */
  const fillAll = (): void => {
    type(0, ' Pierre ');
    type(1, 'Marchand');
    type(2, 'pierre@brasserie-marchand.fr');
    type(3, '06 12 44 09 87');
    type(4, 'Brasserie Marchand');
  };

  function boot(authenticated = false): void {
    asked = [];
    navigated = [];
    isAuthenticated = signal(authenticated);
    const auth = {
      isAuthenticated,
      registerPro: (target: string, registration: ProRegistration): void => {
        asked.push({ kind: 'registerPro', target, payload: registration });
      },
      login: (target: string, hint?: string): void => {
        asked.push({ kind: 'login', target, payload: hint });
      },
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [OuvertureCompteProPage],
      providers: [provideRouter([]), { provide: AuthFacade, useValue: auth }],
    });
    const router = TestBed.inject(Router);
    router.navigateByUrl = (url): Promise<boolean> => {
      navigated.push(String(url));
      return Promise.resolve(true);
    };
    fixture = TestBed.createComponent(OuvertureCompteProPage);
    fixture.detectChanges();
  }

  it('garde le bouton inactif tant qu’un champ est vide', () => {
    boot();
    const submit = button(PRO_ACCOUNT_FR.door.submit);
    expect(submit.disabled).toBe(true);

    type(0, 'Pierre');
    type(1, 'Marchand');
    type(2, 'pierre@brasserie-marchand.fr');
    type(3, '06 12 44 09 87');
    expect(submit.disabled).toBe(true);

    type(4, '   ');
    expect(submit.disabled).toBe(true);

    type(4, 'Brasserie Marchand');
    expect(submit.disabled).toBe(false);
  });

  it('part chez Auth0 avec les cinq champs, et revient sur Mon compte', () => {
    boot();
    fillAll();

    button(PRO_ACCOUNT_FR.door.submit).click();

    expect(asked).toEqual([
      {
        kind: 'registerPro',
        target: '/mon-compte',
        payload: {
          firstName: 'Pierre',
          lastName: 'Marchand',
          email: 'pierre@brasserie-marchand.fr',
          phone: '06 12 44 09 87',
          enseigne: 'Brasserie Marchand',
        },
      },
    ]);
  });

  it('« Déjà client ? » connecte vers Mon compte, e-mail soufflé', () => {
    boot();
    type(2, 'pierre@brasserie-marchand.fr');

    button(PRO_ACCOUNT_FR.door.alreadyLink).click();

    expect(asked).toEqual([
      { kind: 'login', target: '/mon-compte', payload: 'pierre@brasserie-marchand.fr' },
    ]);
  });

  it('envoie qui est déjà connecté sur Mon compte', () => {
    boot(true);
    TestBed.tick();

    expect(navigated).toEqual(['/mon-compte']);
  });

  it('pose le chrome de l’entrée : ni menu, ni cloche, pas de barre au-delà du pli', () => {
    boot();
    TestBed.tick();
    const chrome = TestBed.inject(ClientChrome);

    expect(chrome.menu()).toBe(false);
    expect(chrome.bell()).toBeNull();
    expect(chrome.barOnDesktop()).toBe(false);
    expect(chrome.kicker()).toBe(PRO_ACCOUNT_FR.door.kicker);
  });

  /** Plan §3.1 : la promesse suit le niveau que le serveur a rendu, et se tait avant. */
  it('ne dit la promesse qu’une fois le niveau connu, et jamais boutique ouverte', () => {
    boot();
    expect(el().querySelector('app-shop-promise')).toBeNull();

    openShopAt('closed');
    fixture.detectChanges();
    expect(el().textContent).toContain(PRO_ACCOUNT_FR.promise.closed);

    openShopAt('order');
    fixture.detectChanges();
    expect(el().textContent).not.toContain(PRO_ACCOUNT_FR.promise.closed);
  });

  it('ne parle ni de devis traiteur, ni de rappel', () => {
    boot();
    const shown = (el().textContent ?? '').toLowerCase();

    expect(shown).not.toContain('traiteur');
    expect(shown).not.toContain('rappel');
  });
});
