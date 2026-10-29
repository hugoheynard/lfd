import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { instantToLocal } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { COMMAND_TERMS_FR } from '../../copy/screens/command-terms.copy';
import { formatCents } from '../../format-money';
import { type OrderDraft, OrderContextStore, type ServiceChoice } from '../../order-context.store';
import { ClientCart } from '../client-cart.service';
import { CartBar } from './cart-bar';
import { ShopCopyOverrides } from '../../copy/shop-copy-overrides';
import { SoftKeyboard } from '../../soft-keyboard.service';

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
  readonly typing?: boolean;
}

/**
 * Le panier est DOUBLÉ sur ce que le pied lit — le compte et le devis : le
 * devis vient du serveur, et le semer rejouerait le chiffrage pour une ligne.
 */
function boot({
  choice = choiceToday(),
  count = 0,
  totalCents = 0,
  typing = false,
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
      { provide: SoftKeyboard, useValue: { open: signal(typing) } },
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
        deliveryAddressId: null,
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
    expect(el(fixture).querySelector('.total')?.textContent?.trim()).toBe(
      `${formatCents(2092)} TTC`,
    );
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

  /** Lot T4 des textes : un remplacement reçu redessine l'écran, sans rechargement. */
  it('se redessine quand un remplacement de son texte arrive', () => {
    const fixture = boot();
    TestBed.inject(ShopCopyOverrides).receive('fr', { 'commandTerms.edit': 'Retoucher' });
    fixture.detectChanges();

    expect(el(fixture).querySelector('.edit')?.textContent?.trim()).toBe('Retoucher');
  });
});

/** Le texte tel qu'on le lit : espaces de gabarit et insécables ramenés à un. */
const said = (node: Element | null): string =>
  (node?.textContent ?? '').replace(/\s+/gu, ' ').trim();

/** Le même pied, un brouillon de parcours posé (plan `plan-barre-qui-accompagne.md`). */
function bootDraft(draft: OrderDraft, docked = false): ComponentFixture<CartBar> {
  const fixture = boot({ choice: null });
  TestBed.inject(OrderContextStore).draft.set(draft);
  fixture.componentRef.setInput('docked', docked);
  fixture.detectChanges();
  return fixture;
}

describe('CartBar — la barre qui accompagne le parcours', () => {
  it('sans mode ni jour : « Choisissez le jour », seul', () => {
    const fixture = bootDraft({});

    expect(el(fixture).querySelector('.said')).toBeNull();
    expect(said(pay(fixture))).toBe(COMMAND_TERMS_FR.chooseDay);
  });

  it('partie de la porte du retrait : le mode et la maison, puis le jour à choisir', () => {
    const fixture = bootDraft({ mode: 'pickup', place: 'Le Labo' });

    expect(said(el(fixture).querySelector('.kicker'))).toBe(
      `${COMMAND_TERMS_FR.title} · ${COMMAND_TERMS_FR.pickup}`,
    );
    expect(said(el(fixture).querySelector('.promise'))).toBe('Le Labo');
    expect(said(pay(fixture))).toBe(COMMAND_TERMS_FR.chooseDay);
  });

  it('🔴 jour et maison : les deux, puis l’heure à choisir', () => {
    const fixture = bootDraft({
      date: instantToLocal(new Date()).day,
      mode: 'pickup',
      place: 'Le Labo',
    });

    expect(said(el(fixture).querySelector('.promise'))).toBe(`Le Labo · ${COMMAND_TERMS_FR.today}`);
    expect(said(pay(fixture))).toBe(COMMAND_TERMS_FR.chooseTime);
  });

  it('en livraison, le jour pris : l’adresse à choisir', () => {
    const fixture = bootDraft({ date: instantToLocal(new Date()).day, mode: 'delivery' });

    expect(said(pay(fixture))).toBe(COMMAND_TERMS_FR.chooseAddress);
  });

  it('le brouillon prime sur un choix déjà posé : on est en train de le refaire', () => {
    const fixture = boot();
    TestBed.inject(OrderContextStore).draft.set({ mode: 'pickup' });
    fixture.detectChanges();

    expect(el(fixture).querySelector('.edit')).toBeNull();
    expect(said(pay(fixture))).toBe(COMMAND_TERMS_FR.chooseDay);
  });

  it('émet `resume` au clic sur l’étape qui manque', () => {
    const fixture = bootDraft({ mode: 'pickup' });
    let resumed = 0;
    fixture.componentInstance.resume.subscribe(() => resumed++);

    pay(fixture)?.click();

    expect(resumed).toBe(1);
  });

  it('🔴 en pied de dialogue, l’étape n’est qu’un état : inactive', () => {
    const fixture = bootDraft({ mode: 'pickup' }, true);

    expect(pay(fixture)?.disabled).toBe(true);
  });

  it('🔴 en pied de dialogue sans brouillon, ne montre rien', () => {
    const fixture = boot();
    fixture.componentRef.setInput('docked', true);
    fixture.detectChanges();

    expect(el(fixture).querySelector('.foot')).toBeNull();
  });

  /** Hugo, 2026-10-29 : sur un téléphone, la barre couvrait le champ qu'on remplit. */
  it('se retire pendant une saisie au clavier de l’appareil', () => {
    expect(el(boot({ typing: true })).classList).toContain('typing');
  });

  it('reste là quand aucun champ n’a le clavier', () => {
    expect(el(boot()).classList).not.toContain('typing');
  });
});
