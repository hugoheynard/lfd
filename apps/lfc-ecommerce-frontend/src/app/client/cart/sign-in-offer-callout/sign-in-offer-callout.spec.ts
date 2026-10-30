import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { SignInOfferView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ClientCart } from '../client-cart.service';
import { SignInOfferCallout } from './sign-in-offer-callout';

/** L'invitation à se connecter (plan des promotions, § 8, lot L10). */
function render(offer: SignInOfferView | null): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: ClientCart, useValue: { signInOffer: signal(offer) } }],
  });
  const fixture = TestBed.createComponent(SignInOfferCallout);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function said(host: HTMLElement): string | undefined {
  return host.querySelector('[data-sign-in-offer]')?.textContent?.trim();
}

describe('SignInOfferCallout', () => {
  it('dit le pourcentage qu’une connexion ouvrirait', () => {
    expect(said(render({ effect: { kind: 'percent', basisPoints: 2_000 } }))).toBe(
      'Vous avez un compte ? Connectez-vous pour profiter de −20 %.',
    );
  });

  it('dit un montant, et une décimale de pourcentage', () => {
    expect(said(render({ effect: { kind: 'amount', millicents: 50_000 } }))).toBe(
      'Vous avez un compte ? Connectez-vous pour profiter de −0,50 €.',
    );
    expect(said(render({ effect: { kind: 'percent', basisPoints: 1_250 } }))).toBe(
      'Vous avez un compte ? Connectez-vous pour profiter de −12,5 %.',
    );
  });

  it('invite sans chiffre quand la promotion pose un prix', () => {
    expect(said(render({ effect: null }))).toBe(
      'Vous avez un compte ? Connectez-vous pour profiter de vos prix d’inscrit.',
    );
  });

  it('ne dit rien sans promotion réservée aux inscrits', () => {
    expect(render(null).querySelector('fold-callout')).toBeNull();
  });
});
