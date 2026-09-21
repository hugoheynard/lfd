import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { FR } from '../../copy/fr';
import { GuestIdentityDialog, type GuestIdentity } from './guest-identity-dialog';

/**
 * **La saisie d'un visiteur sans compte.**
 *
 * Ce que ces cas tiennent, et qu'aucun typecheck ne voit : le téléphone est
 * REQUIS (D9), les deux adresses doivent coïncider **au sens du serveur** — à la
 * casse et aux espaces près —, et l'écart se dit pendant la frappe plutôt qu'au
 * clic. La dernière règle est la plus importante des trois : le QR part par
 * courriel, et un visiteur n'a aucun espace où le retrouver.
 */

let closed: unknown[];

function mount(): ComponentFixture<GuestIdentityDialog> {
  closed = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [GuestIdentityDialog],
    providers: [
      // Le VRAI `FoldPanelRef`, branché sur un journal : c'est par lui que
      // l'identité remonte au panier, et c'est donc lui qu'on éprouve.
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (result) => closed.push(result)) },
    ],
  });
  const fixture = TestBed.createComponent(GuestIdentityDialog);
  fixture.detectChanges();
  return fixture;
}

describe('GuestIdentityDialog', () => {
  let fixture: ComponentFixture<GuestIdentityDialog>;

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

  const button = (text: string): HTMLButtonElement => {
    const found = Array.from(el().querySelectorAll<HTMLButtonElement>('button[foldButton]')).find(
      (b) => (b.textContent ?? '').includes(text),
    );
    if (!found) {
      throw new Error(`Pas de bouton « ${text} ».`);
    }
    return found;
  };

  const fillAll = (email = 'jean@exemple.fr', again = 'jean@exemple.fr'): void => {
    type(FR.cart.guestFirstName, 'Jean');
    type(FR.cart.guestEmail, email);
    type(FR.cart.guestEmailAgain, again);
    type(FR.cart.guestPhone, '06 12 34 56 78');
  };

  it('🔴 ne laisse pas continuer tant qu’un des trois champs manque', () => {
    fixture = mount();
    expect(button(FR.cart.guestConfirm).disabled).toBe(true);

    type(FR.cart.guestFirstName, 'Jean');
    type(FR.cart.guestEmail, 'jean@exemple.fr');
    type(FR.cart.guestEmailAgain, 'jean@exemple.fr');
    // Le téléphone manque encore : D9 le rend obligatoire, c'est le seul
    // recours quand l'adresse est fausse.
    expect(button(FR.cart.guestConfirm).disabled).toBe(true);

    type(FR.cart.guestPhone, '06 12 34 56 78');
    expect(button(FR.cart.guestConfirm).disabled).toBe(false);
  });

  it('🔴 dit l’écart entre les deux adresses PENDANT la frappe', () => {
    fixture = mount();
    fillAll('jean@exemple.fr', 'jean@exemple.f');

    expect(el().textContent).toContain(FR.cart.guestEmailMismatch);
    expect(button(FR.cart.guestConfirm).disabled).toBe(true);
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
    expect(button(FR.cart.guestConfirm).disabled).toBe(false);
  });

  it('refuse une adresse sans arobase, sans attendre le serveur', () => {
    fixture = mount();
    fillAll('jean.exemple.fr', 'jean.exemple.fr');

    expect(button(FR.cart.guestConfirm).disabled).toBe(true);
  });

  it('rend l’identité DÉTOURÉE en se fermant', () => {
    fixture = mount();
    type(FR.cart.guestFirstName, '  Jean ');
    type(FR.cart.guestEmail, ' jean@exemple.fr ');
    type(FR.cart.guestEmailAgain, 'jean@exemple.fr');
    type(FR.cart.guestPhone, ' 06 12 34 56 78 ');

    button(FR.cart.guestConfirm).click();

    expect(closed).toHaveLength(1);
    expect(closed[0]).toEqual<GuestIdentity>({
      firstName: 'Jean',
      email: 'jean@exemple.fr',
      phone: '06 12 34 56 78',
    });
  });

  it('🔴 rend `undefined` quand on repart — fermer n’est pas commander', () => {
    fixture = mount();
    fillAll();

    button(FR.cart.guestCancel).click();

    expect(closed).toEqual([undefined]);
  });
});
