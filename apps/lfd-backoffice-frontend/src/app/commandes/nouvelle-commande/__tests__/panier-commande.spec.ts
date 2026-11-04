import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { AdminOrderEstimateView, DeliveryAvailabilityView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { CartStore } from '../cart.store';
import { DraftStore } from '../draft.store';
import { PanierCommande } from '../panier-commande/panier-commande';

/**
 * Le panier de droite (décision Hugo du 2026-11-03) : les réglages d'abord,
 * les lignes ensuite, et le récapitulatif en haut à droite dès qu'il y a une
 * ligne. Deux vues — réglages ou lignes — sous un même pied.
 */
const OPEN_TO_ALL: DeliveryAvailabilityView = {
  openToB2b: true,
  openToB2c: true,
  windowMode: 'slot',
  updatedAt: null,
  updatedBy: null,
};

function mount(cart: CartStore): HTMLElement {
  return mountFull(cart).host;
}

function mountFull(
  cart: CartStore,
  extra: Readonly<Record<string, unknown>> = {},
): {
  fixture: ComponentFixture<PanierCommande>;
  host: HTMLElement;
  component: PanierCommande;
} {
  const fixture = TestBed.createComponent(PanierCommande);
  const set = fixture.componentRef.setInput.bind(fixture.componentRef);
  set('cart', cart);
  set('draft', new DraftStore());
  set('companyName', 'Le Bistrot');
  set('buyers', []);
  set('pickups', []);
  set('addresses', []);
  set('zones', []);
  set('deliveryAvailability', OPEN_TO_ALL);
  set('audience', 'b2b');
  set('settlesOnAccount', true);
  // L'estimation répond à la saisie : le cas ordinaire (plan total vu, T3).
  set('estimateReady', true);
  for (const [name, value] of Object.entries(extra)) {
    set(name, value);
  }
  fixture.detectChanges();
  return {
    fixture,
    host: fixture.nativeElement as HTMLElement,
    component: fixture.componentInstance,
  };
}

describe('PanierCommande — en-tête et ordre', () => {
  it('panier vide : rien à droite du titre', () => {
    const host = mount(new CartStore());
    expect(host.querySelector('.pan-summary')).toBeNull();
  });

  /**
   * Sans estimation, aucun montant : le panier ne calcule plus de sous-total à
   * côté de celle-ci (« une seule arithmétique », 2026-11-04).
   */
  it('avec des lignes, sans estimation : articles et « Prix à confirmer »', () => {
    const cart = new CartStore();
    cart.add({ sku: 'VIE-001', name: 'Croissant', unitPriceMillicents: 200_000 }, 7);
    const host = mount(cart);

    const summary = host.querySelector('.pan-summary')?.textContent.replace(/\s+/g, ' ').trim();
    expect(summary).toBe('7 articles · Prix à confirmer');
    expect(host.textContent).toContain('dès que le retrait ou la livraison est choisi');
  });

  it('ouvre sur « Paramétrer la commande »', () => {
    const { component } = mountFull(new CartStore());
    expect(component.view()).toBe('settings');
  });

  it('le pied et ses refus restent dans les deux vues', () => {
    const { fixture, host, component } = mountFull(new CartStore());
    const texts = (): string[] =>
      [...host.querySelectorAll('.pan-foot fold-callout')].map((c) => c.textContent);

    const inSettings = texts();
    component.view.set('lines');
    fixture.detectChanges();

    expect(inSettings.length).toBeGreaterThan(0);
    expect(texts().map(firstLine)).toEqual(inSettings.map(firstLine));
  });

  it('un refus sur les lignes renvoie au panier depuis les réglages', () => {
    const { fixture, host, component } = mountFull(new CartStore());
    const go = footButton(host, 'Voir le panier');

    go.click();
    fixture.detectChanges();

    expect(component.view()).toBe('lines');
  });

  it('un refus sur un réglage renvoie aux réglages depuis le panier', () => {
    const cart = new CartStore();
    cart.add({ sku: 'VIE-001', name: 'Croissant', unitPriceMillicents: 200_000 }, 1);
    const { fixture, host, component } = mountFull(cart);
    component.view.set('lines');
    fixture.detectChanges();

    // Aucune date posée : le refus vit dans les réglages.
    footButton(host, 'Paramétrer la commande').click();
    fixture.detectChanges();

    expect(component.view()).toBe('settings');
    expect(host.querySelector('.pan-foot [aria-label="Voir le panier"]')).toBeNull();
  });
});

function firstLine(text: string): string {
  return (text.split(/Paramétrer la commande|Voir le panier/u)[0] ?? '').trim();
}

function footButton(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll<HTMLButtonElement>('.pan-foot button')].find(
    (b) => b.textContent.trim() === label || b.getAttribute('aria-label') === label,
  );
  if (found === undefined) {
    throw new Error(`aucun bouton « ${label} » au pied`);
  }
  return found;
}

const ESTIMATE: AdminOrderEstimateView = {
  amounts: {
    vatMethod: 'line_ht',
    lines: [],
    subtotalCents: 1_400,
    discountCents: 0,
    discountTtcCents: null,
    discounts: [],
    deliveryFeeCents: 0,
    deliveryFeeTtcCents: null,
    lateFeeCents: 250,
    lateFeeVatRatePercent: 20,
    vatCents: 127,
    vatShares: [
      { rate: 5.5, amountCents: 77 },
      { rate: 20, amountCents: 50 },
    ],
    pretaxCents: 1_650,
    totalCents: 1_777,
  },
  cutoff: null,
  refusal: null,
  warnings: [],
};

function filledCart(): CartStore {
  const cart = new CartStore();
  cart.add({ sku: 'VIE-001', name: 'Croissant', unitPriceMillicents: 200_000 }, 7);
  return cart;
}

const squash = (text: string | null | undefined): string =>
  (text ?? '').replace(/\s+/gu, ' ').trim();

describe('PanierCommande — l’estimation (lot P2)', () => {
  it('au lien : en-tête au TTC, et la phrase « calculés à la validation » disparaît', () => {
    const host = mount2({ estimate: ESTIMATE, draft: draftSettled('link') });
    expect(squash(host.querySelector('.pan-summary')?.textContent)).toBe(
      '7 articles · Total TTC 17,77 €',
    );
    expect(host.textContent).not.toContain('calculés à la validation');
  });

  it('au compte : en-tête au seul Total HT (F5)', () => {
    const host = mount2({ estimate: ESTIMATE, draft: draftSettled('account') });
    expect(squash(host.querySelector('.pan-summary')?.textContent)).toBe(
      '7 articles · Total HT 16,50 €',
    );
  });

  it('au lien : le détail, par la règle partagée, montre surtaxe, TVA et TTC', () => {
    const text = detailOf(draftSettled('link'));
    expect(text).toContain('Surtaxe de retard HT');
    expect(text).toContain('TVA');
    expect(text).toContain('Total TTC');
  });

  it('au compte : le détail ne montre ni TVA ni TTC, et dit où les trouver', () => {
    const text = detailOf(draftSettled('account'));
    expect(text).toContain('Total HT');
    expect(text).toContain('TVA et TTC sur la facture du mois');
    expect(text).not.toContain('Total TTC');
    expect(text).not.toMatch(/(^|\/ )TVA /u);
  });

  it('un refus du serveur bloque la validation, avec la flèche vers sa vue', () => {
    const refused = {
      ...ESTIMATE,
      amounts: null,
      refusal: { code: 'orders.cutoff.past', message: 'L’heure limite est passée.' },
    };
    const { host } = mountFull(filledCart(), { estimate: refused });
    expect(host.querySelector('.pan-foot')?.textContent).toContain('L’heure limite est passée.');
    expect(validate(host)).toBeUndefined();
  });

  it('un avertissement se dit sans retenir la validation', () => {
    const cart = filledCart();
    const draft = readyDraft();
    const warned = {
      ...ESTIMATE,
      warnings: [
        { code: 'orders.shelf.short', message: 'Reste en vitrine au moment du calcul : 3.' },
      ],
    };
    const { fixture, host } = mountFull(cart, { estimate: warned, draft });
    // Le sélecteur d'acheminement, sans point connu, émet son propre refus au
    // montage : on repose l'acheminement résolu par-dessus.
    draft.fulfillment.set(readyDraft().fulfillment());
    fixture.detectChanges();
    expect(host.querySelector('.pan-foot fold-callout[variant="info"]')?.textContent).toContain(
      'Reste en vitrine',
    );
    expect(validate(host)).toBeDefined();
  });

  /** Plan total vu, T3 (Hugo, 2026-11-03) : pas de validation sur une estimation en vol. */
  it('grise la validation tant que l’estimation n’est pas celle de la saisie', () => {
    const draft = readyDraft();
    const { fixture, host } = mountFull(filledCart(), {
      estimate: ESTIMATE,
      draft,
      estimateReady: false,
    });
    draft.fulfillment.set(readyDraft().fulfillment());
    fixture.detectChanges();

    const waiting = [...host.querySelectorAll<HTMLButtonElement>('.pan-foot button')].find(
      (b) => b.textContent.trim() === 'Calcul du montant…',
    );
    expect(waiting?.disabled).toBe(true);
    expect(validate(host)).toBeUndefined();

    fixture.componentRef.setInput('estimateReady', true);
    fixture.detectChanges();
    expect(validate(host)?.disabled).toBe(false);
  });

  it('au comptoir, le lien de règlement n’est pas proposé (E4)', () => {
    const { host } = mountFull(filledCart(), { linkOffered: false });
    const radios = [...host.querySelectorAll<HTMLInputElement>('input[name="settlement"]')];
    expect(radios.map((r) => r.value)).toEqual(['account']);
  });
});

function draftSettled(settlement: 'account' | 'link'): DraftStore {
  const draft = new DraftStore();
  draft.settlement.set(settlement);
  return draft;
}

/** Les libellés du détail des montants, joints — vue « lignes ». */
function detailOf(draft: DraftStore): string {
  const { fixture, host, component } = mountFull(filledCart(), { estimate: ESTIMATE, draft });
  component.view.set('lines');
  fixture.detectChanges();
  return squash(
    [...host.querySelectorAll('app-montants-panier fold-field')]
      .map((f) => f.textContent)
      .join(' / '),
  );
}

function mount2(extra: Readonly<Record<string, unknown>>): HTMLElement {
  return mountFull(filledCart(), extra).host;
}

/** Un brouillon où rien ne manque : interlocuteur, jour, acheminement résolu. */
function readyDraft(): DraftStore {
  const draft = new DraftStore();
  draft.buyerUserId.set('u_1');
  draft.settlement.set('account');
  draft.fulfillment.set({
    method: 'pickup',
    pickupAddressId: 'pk_1',
    deliveryAddress: null,
    saveToBook: false,
    window: null,
    issue: null,
  });
  return draft;
}

function validate(host: HTMLElement): HTMLButtonElement | undefined {
  return [...host.querySelectorAll<HTMLButtonElement>('.pan-foot button')].find(
    (b) => b.textContent.trim() === 'Valider la commande',
  );
}
