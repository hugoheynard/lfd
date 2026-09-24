import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { instantToLocal } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { COMMAND_TERMS_FR } from '../../copy/screens/command-terms.copy';
import { formatCents } from '../../format-money';
import { OrderContextStore, type ServiceChoice } from '../../order-context.store';
import { ClientCart } from '../client-cart.service';
import { CartBar } from './cart-bar';

/** Le choix tel que l'accueil l'écrit, sur la journée du jour. */
function choiceToday(): ServiceChoice {
  return {
    mode: 'pickup',
    place: 'Le Labo',
    at: 'au Labo',
    address: "Route de la Balme, Val d'Isère",
    pickupAddressId: 'pick_labo',
    slot: '7 h 15',
    window: { start: '07:15', end: '07:30' },
    date: instantToLocal(new Date()).day,
  };
}

interface Monde {
  readonly choice?: ServiceChoice | null;
  readonly count?: number;
  readonly totalCents?: number;
}

/**
 * Le panier est DOUBLÉ sur ce que le pied lit — le compte et le devis : le
 * devis vient du serveur, et le semer rejouerait le chiffrage pour une ligne.
 */
function boot({
  choice = choiceToday(),
  count = 0,
  totalCents = 0,
}: Monde = {}): ComponentFixture<CartBar> {
  localStorage.clear();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CartBar],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ClientCart,
        useValue: { count: signal(count), totals: signal({ discountCents: 0, totalCents }) },
      },
    ],
  });
  TestBed.inject(OrderContextStore).choice.set(choice);
  const fixture = TestBed.createComponent(CartBar);
  fixture.detectChanges();
  return fixture;
}

const el = (fixture: ComponentFixture<CartBar>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const pay = (fixture: ComponentFixture<CartBar>): HTMLButtonElement | null =>
  el(fixture).querySelector<HTMLButtonElement>('.pay');

describe('CartBar — le pied collé', () => {
  it('rappelle le service retenu en première ligne', () => {
    const fixture = boot();

    expect(el(fixture).querySelector('.kicker')?.textContent?.trim()).toBe(
      `${COMMAND_TERMS_FR.title} · ${COMMAND_TERMS_FR.pickup}`,
    );
    expect(el(fixture).querySelector('.promise')?.textContent).toContain('Le Labo');
    expect(el(fixture).querySelector('.promise')?.textContent).toContain('7 h 15');
  });

  it('dit « Livraison » quand le mode est la livraison', () => {
    const today = choiceToday();
    const fixture = boot({
      choice: {
        mode: 'delivery',
        place: 'Hôtel',
        at: 'à l’hôtel',
        address: today.address,
        slot: today.slot,
        window: today.window,
        date: today.date,
        codePostal: '73150',
        deliveryAddress: {
          label: 'Hôtel',
          ligne1: 'Route de la Balme',
          ligne2: '',
          codePostal: '73150',
          ville: "Val d'Isère",
          pays: 'France',
        },
      },
    });

    expect(el(fixture).querySelector('.kicker')?.textContent).toContain(COMMAND_TERMS_FR.delivery);
  });

  /** Ne pas avoir choisi n'est pas un manque : pas de ligne 1, le bouton reste. */
  it('sans service, n’a pas de première ligne mais garde le bouton', () => {
    const fixture = boot({ choice: null, count: 2 });

    expect(el(fixture).querySelector('.said')).toBeNull();
    expect(pay(fixture)).not.toBeNull();
  });

  it('panier vide : le bouton est une pastille inactive « Panier vide », sans total', () => {
    const fixture = boot();

    expect(pay(fixture)?.disabled).toBe(true);
    expect(pay(fixture)?.textContent).toContain(COMMAND_TERMS_FR.emptyShort);
    expect(el(fixture).querySelector('.total')).toBeNull();
  });

  it('porte le compte à gauche et le total du devis à droite', () => {
    const fixture = boot({ count: 14, totalCents: 2092 });

    expect(pay(fixture)?.disabled).toBe(false);
    expect(el(fixture).querySelector('.count')?.textContent?.trim()).toBe('14');
    expect(pay(fixture)?.textContent).toContain(COMMAND_TERMS_FR.pay);
    expect(el(fixture).querySelector('.total')?.textContent?.trim()).toBe(formatCents(2092));
  });

  it('émet `pay` au clic sur Régler', () => {
    const fixture = boot({ count: 1, totalCents: 150 });
    let paid = 0;
    fixture.componentInstance.pay.subscribe(() => paid++);

    pay(fixture)?.click();

    expect(paid).toBe(1);
  });

  it('émet `edit` au clic sur « Modifier »', () => {
    const fixture = boot();
    let edited = 0;
    fixture.componentInstance.edit.subscribe(() => edited++);

    const edit = el(fixture).querySelector<HTMLButtonElement>('.edit');
    expect(edit?.textContent?.trim()).toBe(COMMAND_TERMS_FR.edit);
    edit?.click();

    expect(edited).toBe(1);
  });
});
