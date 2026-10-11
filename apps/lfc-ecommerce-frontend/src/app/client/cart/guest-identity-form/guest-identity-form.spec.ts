import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { FR } from '../../copy/fr';
import { GuestIdentityForm, type GuestIdentity } from './guest-identity-form';

/**
 * **La saisie d'un visiteur sans compte.**
 *
 * Ce que ces cas tiennent, et qu'aucun typecheck ne voit : le téléphone est
 * REQUIS (D9), les deux adresses doivent coïncider **au sens du serveur** — à la
 * casse et aux espaces près —, et l'écart se dit pendant la frappe plutôt qu'au
 * clic. La dernière règle est la plus importante des trois : le QR part par
 * courriel, et un visiteur n'a aucun espace où le retrouver.
 */

/** Ce que le formulaire a rendu, dans l'ordre : la dernière valeur fait foi. */
let emitted: (GuestIdentity | null)[];
const last = (): GuestIdentity | null | undefined => emitted.at(-1);

function mount({ keep = false } = {}): ComponentFixture<GuestIdentityForm> {
  emitted = [];
  if (!keep) {
    localStorage.clear();
  }
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [GuestIdentityForm] });
  const fixture = TestBed.createComponent(GuestIdentityForm);
  fixture.componentInstance.identityChange.subscribe((value) => emitted.push(value));
  fixture.detectChanges();
  return fixture;
}

describe('GuestIdentityForm', () => {
  let fixture: ComponentFixture<GuestIdentityForm>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  /** Le champ dont le libellé visible est `label`. */
  const field = (label: string): HTMLInputElement => {
    const host = Array.from(el().querySelectorAll('fold-input')).find((node) =>
      (node.textContent ?? '').includes(label),
    );
    const input = host?.querySelector('input');
    if (!input) {
      throw new Error(`Pas de champ « ${label} ».`);
    }
    return input;
  };

  const type = (label: string, value: string): void => {
    const input = field(label);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  const fillAll = (email = 'jean@exemple.fr', again = 'jean@exemple.fr'): void => {
    type(FR.cart.guestFirstName, 'Jean');
    type(FR.cart.guestEmail, email);
    type(FR.cart.guestEmailAgain, again);
    type(FR.cart.guestPhone, '06 12 34 56 78');
  };

  it('🔴 ne laisse pas continuer tant qu’un des trois champs manque', () => {
    fixture = mount();
    expect(last()).toBeNull();

    type(FR.cart.guestFirstName, 'Jean');
    type(FR.cart.guestEmail, 'jean@exemple.fr');
    type(FR.cart.guestEmailAgain, 'jean@exemple.fr');
    // Le téléphone manque encore : D9 le rend obligatoire, c'est le seul
    // recours quand l'adresse est fausse.
    expect(last()).toBeNull();

    type(FR.cart.guestPhone, '06 12 34 56 78');
    expect(last()).not.toBeNull();
  });

  /** Quitte le champ `label`, comme un clic ailleurs ou une tabulation. */
  const leave = (label: string): void => {
    field(label).dispatchEvent(new Event('blur'));
    fixture.detectChanges();
  };

  /**
   * Hugo, 2026-10-11 : pendant qu'on tape la confirmation, elle diffère
   * forcément — on n'a pas fini. L'écart ne se dit qu'en la quittant, et se
   * tait dès qu'on y retape.
   */
  it('🔴 tait l’écart pendant la frappe, le dit en quittant la confirmation', () => {
    fixture = mount();
    fillAll('jean@exemple.fr', 'jean@exemple.f');

    expect(el().textContent).not.toContain(FR.cart.guestEmailMismatch);
    expect(last()).toBeNull();

    leave(FR.cart.guestEmailAgain);
    expect(el().textContent).toContain(FR.cart.guestEmailMismatch);

    type(FR.cart.guestEmailAgain, 'jean@exemple.fr');
    expect(el().textContent).not.toContain(FR.cart.guestEmailMismatch);
  });

  it('ne gronde pas un second champ encore vide', () => {
    fixture = mount();
    type(FR.cart.guestEmail, 'jean@exemple.fr');

    expect(el().textContent).not.toContain(FR.cart.guestEmailMismatch);
  });

  /**
   * 🔴 Le serveur retrouve un invité par une adresse normalisée
   * (`normalizeEmail` : minuscules, espaces retirés). Refuser ici une paire
   * qu'il tient pour identique ferait diverger l'écran de la règle réelle.
   */
  it('accepte deux adresses qui ne diffèrent que par la casse et les espaces', () => {
    fixture = mount();
    fillAll('Jean@Exemple.fr', '  jean@exemple.FR ');

    expect(el().textContent).not.toContain(FR.cart.guestEmailMismatch);
    expect(last()).not.toBeNull();
  });

  it('refuse une adresse sans arobase, sans attendre le serveur', () => {
    fixture = mount();
    fillAll('jean.exemple.fr', 'jean.exemple.fr');

    expect(last()).toBeNull();
  });

  it('rend l’identité DÉTOURÉE dès qu’elle est complète', () => {
    fixture = mount();
    type(FR.cart.guestFirstName, '  Jean ');
    type(FR.cart.guestEmail, ' jean@exemple.fr ');
    type(FR.cart.guestEmailAgain, 'jean@exemple.fr');
    type(FR.cart.guestPhone, ' 06 12 34 56 78 ');

    expect(last()).toEqual<GuestIdentity>({
      firstName: 'Jean',
      email: 'jean@exemple.fr',
      phone: '06 12 34 56 78',
    });
  });

  it('🔴 retombe à `null` quand un champ se vide après coup', () => {
    fixture = mount();
    fillAll();
    expect(last()).not.toBeNull();

    type(FR.cart.guestPhone, '');

    expect(last()).toBeNull();
  });

  /** Hugo, 2026-10-11 : quitter la fenêtre et revenir ne fait plus tout retaper. */
  it('retrouve la saisie d’une visite à l’autre', () => {
    fixture = mount();
    fillAll();

    fixture = mount({ keep: true });

    expect(field(FR.cart.guestFirstName).value).toBe('Jean');
    expect(field(FR.cart.guestEmailAgain).value).toBe('jean@exemple.fr');
    expect(last()).toEqual<GuestIdentity>({
      firstName: 'Jean',
      email: 'jean@exemple.fr',
      phone: '06 12 34 56 78',
    });
  });
});
