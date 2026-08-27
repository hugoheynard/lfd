import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthFacade, type PendingProfile } from '../../auth/auth.facade';

import { ClientChrome } from '../../client/client-chrome.service';
import { fill } from '../../client/copy/client-copy.service';
import { FR } from '../../client/copy/fr';
import { AccueilPage } from './accueil-page';

/**
 * L'écran est piloté par le DOM : ses membres sont `protected`, et ce qui compte
 * est ce que voit la personne qui l'utilise.
 */
describe('AccueilPage', () => {
  let fixture: ComponentFixture<AccueilPage>;
  let chrome: ClientChrome;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => el().textContent ?? '';

  const button = (label: string): HTMLButtonElement => {
    const found = Array.from(el().querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes(label),
    );
    if (!found) {
      throw new Error(`Aucun bouton « ${label} » à l'écran.`);
    }
    return found;
  };

  const click = (label: string): void => {
    button(label).click();
    fixture.detectChanges();
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

  /** L'ordre des champs : prénom, téléphone, e-mail — celui du DOM aux deux plis. */
  const FIRST = 0;
  const TEL = 1;
  const MAIL = 2;

  const fillSignup = (): void => {
    type(FIRST, 'Pierre');
    type(TEL, '06 12 44 09 87');
    type(MAIL, 'pierre@brasserie-marchand.fr');
  };

  /** Ce que l'écran demande à Auth0 — la seule chose qu'on veuille observer. */
  let asked: { kind: 'register' | 'login'; target: string; payload: unknown }[];

  beforeEach(() => {
    asked = [];
    const auth = {
      isAuthenticated: signal(false),
      pendingProfile: signal<PendingProfile | null>(null),
      register: (target: string, profile?: PendingProfile): void => {
        asked.push({ kind: 'register', target, payload: profile });
      },
      login: (target: string, hint?: string): void => {
        asked.push({ kind: 'login', target, payload: hint });
      },
    };
    TestBed.configureTestingModule({
      imports: [AccueilPage],
      providers: [provideRouter([]), { provide: AuthFacade, useValue: auth }],
    });
    fixture = TestBed.createComponent(AccueilPage);
    chrome = TestBed.inject(ClientChrome);
    fixture.detectChanges();
  });

  it("ouvre sur l'accueil visiteur, sans retour possible", () => {
    expect(text()).toContain(FR.signup.eyebrow);
    // Le sur-titre et le retour vivent dans l'en-tête du shell : l'écran les
    // PUBLIE, il ne les dessine plus.
    expect(chrome.kicker()).toBe(FR.chrome.kickerWelcome);
    expect(chrome.back()).toBeNull();
  });

  it("garde la pastille de marque : un visiteur n'a ni menu ni cloche", () => {
    expect(chrome.menu()).toBeNull();
    expect(chrome.bell()).toBeNull();
  });

  it("le formulaire est replié, et « S'inscrire » l'ouvre", () => {
    // Le pli lui-même est une affaire de largeur, donc de CSS — ce que le test
    // vérifie, c'est le CONTRAT que le CSS suit : l'état annoncé aux
    // technologies d'assistance, et le champ qui prend le curseur.
    const open = button(FR.signup.open);
    expect(open.getAttribute('aria-expanded')).toBe('false');
    expect(open.getAttribute('aria-controls')).toBe(
      el().querySelector('.fields')?.getAttribute('id'),
    );

    open.click();
    fixture.detectChanges();

    expect(button(FR.signup.open).getAttribute('aria-expanded')).toBe('true');
  });

  it("refuse la création tant que les trois champs n'y sont pas", () => {
    expect(button(FR.signup.submit).disabled).toBe(true);

    type(FIRST, 'Pierre');
    type(TEL, '06 12 44 09 87');
    expect(button(FR.signup.submit).disabled).toBe(true);

    type(MAIL, 'pierre@brasserie-marchand.fr');
    expect(button(FR.signup.submit).disabled).toBe(false);
  });

  it('les trois champs partent chez Auth0, avec la personne', () => {
    // Prénom et téléphone n'existent nulle part chez Auth0 : ils voyagent avec
    // elle, et se poseront sur le compte au retour.
    fillSignup();
    click(FR.signup.submit);

    expect(asked).toEqual([
      {
        kind: 'register',
        target: '/commande',
        payload: {
          firstName: 'Pierre',
          email: 'pierre@brasserie-marchand.fr',
          phone: '06 12 44 09 87',
        },
      },
    ]);
  });

  it("« Déjà client ? » souffle l'e-mail déjà tapé à l'écran de connexion", () => {
    // Ce n'est plus un lien à attendre : Auth0 reconnaît la passkey. Mais qui
    // vient de taper son adresse chez nous n'a pas à la retaper chez lui.
    type(MAIL, 'pierre@brasserie-marchand.fr');
    click(FR.doors.alreadyTitle);

    expect(asked).toEqual([
      { kind: 'login', target: '/commande', payload: 'pierre@brasserie-marchand.fr' },
    ]);
  });

  it('le créneau « au four » reste affiché, et refuse le doigt', () => {
    click(FR.pro.cta);

    const closed = Array.from(el().querySelectorAll('button.slot')).find((b) =>
      (b.textContent ?? '').includes('12 h – 14 h'),
    ) as HTMLButtonElement | undefined;

    expect(closed).toBeDefined();
    expect(closed?.textContent).toContain(FR.rappel.slotOven);
    expect(closed?.disabled).toBe(true);
  });

  it("un créneau confirmé remonte dans l'encart pro, et s'annule", () => {
    click(FR.pro.cta);
    expect(button(FR.rappel.ctaIdle).disabled).toBe(true);

    click('14 h – 15 h');
    click(FR.rappel.ctaReady);

    expect(text()).toContain(fill(FR.pro.booked, { slot: '14 h – 15 h' }));
    expect(text()).toContain('06 12 44 09 87');

    click(FR.pro.cancel);
    expect(text()).toContain(FR.pro.title);
  });
});
