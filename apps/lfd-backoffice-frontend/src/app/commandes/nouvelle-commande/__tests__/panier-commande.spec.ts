import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type {
  AdminOrderEstimateView,
  DeliveryAvailabilityView,
  StaffPermission,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';

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

/** Les droits de l'agent — aucun par défaut, posés par le test qui en a besoin. */
let granted: StaffPermission[] = [];

beforeEach(() => {
  granted = [];
  TestBed.configureTestingModule({
    providers: [
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => granted.includes(p) } },
    ],
  });
});

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
  // L'acheteur que les saisies complètes choisissent (`u_1`) est proposé.
  set('buyers', [
    { userId: 'u_1', firstName: 'Léa', lastName: 'Martin', email: 'lea@exemple.fr', role: 'owner' },
  ]);
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

  it('dit que la date de départ n’est qu’une proposition, jusqu’au choix', () => {
    const { fixture, host } = mountFull(new CartStore());
    expect(host.querySelector('[data-date-proposed]')).not.toBeNull();

    const input = host.querySelector<HTMLInputElement>('input[type="date"]');
    if (input === null) throw new Error('champ de date absent');
    input.value = '2099-01-15';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(host.querySelector('[data-date-proposed]')).toBeNull();
  });

  /** Hugo, 2026-11-23 : il fallait défiler pour atteindre la validation. */
  it('🔴 la validation vient en tête, avant les réglages et les lignes', () => {
    const cart = new CartStore();
    const host = mount(cart);

    const actions = host.querySelector('[data-panier-actions]');
    const views = host.querySelector('fold-tabs, [data-panier-split]');
    expect(actions).not.toBeNull();
    expect(views).not.toBeNull();
    // `DOCUMENT_POSITION_FOLLOWING` : les vues viennent APRÈS la validation.
    expect(
      (actions?.compareDocumentPosition(views as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('ouvre sur « Paramétrer la commande »', () => {
    const { component } = mountFull(new CartStore());
    expect(component.view()).toBe('settings');
  });

  it('le bloc de validation et ses refus restent dans les deux vues', () => {
    const { fixture, host, component } = mountFull(new CartStore());
    const texts = (): string[] =>
      [...host.querySelectorAll('.pan-actions fold-callout')].map((c) => c.textContent);

    const inSettings = texts();
    component.view.set('lines');
    fixture.detectChanges();

    expect(inSettings.length).toBeGreaterThan(0);
    expect(texts().map(firstLine)).toEqual(inSettings.map(firstLine));
  });

  it('dans le tiroir d’une tablette : réglages et lignes côte à côte, sans bascule', () => {
    // Le test n'a pas de `matchMedia` : la largeur vaut celle d'une tablette.
    const { host } = mountFull(new CartStore(), { headed: false });

    expect(host.querySelector('[data-panier-split]')).not.toBeNull();
    expect(host.querySelector('fold-tabs')).toBeNull();
    expect(host.textContent).toContain('Commande portée par');
    expect(host.textContent).toContain('Ajoutez des articles');
    // Les deux vues sont là : aucun refus ne propose d'aller voir l'autre.
    expect(host.querySelector('.pan-actions fold-button-icon')).toBeNull();
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
    expect(host.querySelector('.pan-actions [aria-label="Voir le panier"]')).toBeNull();
  });
});

function firstLine(text: string): string {
  return (text.split(/Paramétrer la commande|Voir le panier/u)[0] ?? '').trim();
}

function footButton(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll<HTMLButtonElement>('.pan-actions button')].find(
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
    expect(host.querySelector('.pan-actions')?.textContent).toContain('L’heure limite est passée.');
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
    expect(host.querySelector('.pan-actions fold-callout[variant="info"]')?.textContent).toContain(
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

    const waiting = [...host.querySelectorAll<HTMLButtonElement>('.pan-actions button')].find(
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
  return [...host.querySelectorAll<HTMLButtonElement>('.pan-actions button')].find(
    (b) => b.textContent.trim() === 'Valider la commande',
  );
}

/** Plan clients publics, B5 : un organisme public part au compte, sans choix ni lien. */
describe('PanierCommande — un organisme public', () => {
  it('ne propose aucun règlement à choisir, et dit le compte et Chorus', () => {
    const { host } = mountFull(new CartStore(), { payerIsPublic: true, linkOffered: false });

    expect(host.querySelector('input[name="settlement"]')).toBeNull();
    expect(host.querySelector('[data-public-payer]')?.textContent).toContain(
      'au compte, facture Chorus',
    );
  });

  it('ne dit pas « aucun crédit accordé » à un public dont le compte ne règle pas', () => {
    const { host } = mountFull(new CartStore(), {
      payerIsPublic: true,
      settlesOnAccount: false,
      linkOffered: false,
    });

    expect(host.textContent).not.toContain('aucun crédit ne lui a été accordé');
  });
});

/** Plan des dépassements, § 3.7 : la ligne fermée par la limite de son produit. */
describe('PanierCommande — la limite d’un produit', () => {
  const exceeded: AdminOrderEstimateView = {
    ...ESTIMATE,
    cutoff: {
      status: 'open',
      until: null,
      exceeded: [
        { sku: 'VIE-001', daysBefore: 2, time: '12:00', limitAt: '2030-01-01T11:00:00.000Z' },
      ],
      closedByItemLimit: [{ sku: 'VIE-001', exceedable: true }],
    },
  };

  function inLines(estimate: AdminOrderEstimateView, draft = readyDraft()) {
    const mounted = mountFull(filledCart(), { estimate, draft });
    draft.fulfillment.set(readyDraft().fulfillment());
    mounted.component.view.set('lines');
    mounted.fixture.detectChanges();
    return { ...mounted, draft };
  }

  it('dépassable : dit la limite, propose « Passer outre », et retient la validation', () => {
    const { host } = inLines(exceeded);
    expect(squash(host.querySelector('[data-item-limit]')?.textContent)).toContain(
      'Limite dépassée — ce produit se commande 2 jours avant, 12:00.',
    );
    expect(host.querySelector('[data-item-limit-override]')).not.toBeNull();
    expect(host.querySelector('[data-item-limit-reason]')).toBeNull();
    expect(validate(host)).toBeUndefined();
  });

  it('« Passer outre » ouvre le motif, obligatoire ; un motif rouvre la validation', () => {
    const { fixture, host, draft } = inLines(exceeded);
    host.querySelector<HTMLButtonElement>('[data-item-limit-override]')?.click();
    fixture.detectChanges();
    expect(host.querySelector('[data-item-limit-reason]')).not.toBeNull();
    expect(host.querySelector('.pan-actions')?.textContent).toContain('Indiquez pourquoi');

    draft.itemLimitReason.set('Le client a appelé avant midi.');
    fixture.detectChanges();
    expect(host.querySelector('.pan-actions')?.textContent).not.toContain('Indiquez pourquoi');
    expect(validate(host)).toBeDefined();
  });

  it('non dépassable : « ne se commande plus », sans geste', () => {
    const { host } = inLines({
      ...ESTIMATE,
      cutoff: {
        status: 'open',
        until: null,
        exceeded: [],
        closedByItemLimit: [{ sku: 'VIE-001', exceedable: false }],
      },
    });
    expect(host.querySelector('[data-item-limit]')?.textContent).toContain(
      'Ce produit ne se commande plus pour ce jour.',
    );
    expect(host.querySelector('[data-item-limit-override]')).toBeNull();
  });

  it('un refus « motif manquant » ramène à la vue des lignes', () => {
    const draft = readyDraft();
    const { fixture, component } = mountFull(filledCart(), { estimate: exceeded, draft });
    expect(component.view()).toBe('settings');
    draft.itemLimitReasonAsked.set(true);
    fixture.detectChanges();
    expect(component.view()).toBe('lines');
    expect(draft.itemLimitReasonAsked()).toBe(false);
  });
});

/** Plan de la commande offerte, O6 : un troisième règlement, sous un droit à part. */
describe('PanierCommande — la commande offerte', () => {
  const settlementValues = (host: HTMLElement): string[] =>
    [...host.querySelectorAll<HTMLInputElement>('input[name="settlement"]')].map((r) => r.value);

  function offeredDraft(): DraftStore {
    const draft = readyDraft();
    draft.settlement.set('offered');
    return draft;
  }

  it('sans le droit d’offrir, le choix « Offerte » est absent', () => {
    const { host } = mountFull(filledCart());
    expect(settlementValues(host)).toEqual(['account', 'link']);
  });

  it('avec le droit, « Offerte » est proposé après le lien', () => {
    granted = ['b2b_offer_order:write'];
    const { host } = mountFull(filledCart());
    expect(settlementValues(host)).toEqual(['account', 'link', 'offered']);
  });

  it('au comptoir, avec le droit : le compte et l’offre', () => {
    granted = ['b2b_offer_order:write'];
    const { host } = mountFull(filledCart(), { linkOffered: false });
    expect(settlementValues(host)).toEqual(['account', 'offered']);
  });

  it('choisir « Offerte » le garde, et montre la nature, le motif et la phrase', () => {
    granted = ['b2b_offer_order:write'];
    const draft = readyDraft();
    const { fixture, host } = mountFull(filledCart(), { draft });
    expect(host.querySelector('[data-offer]')).toBeNull();

    const offered = host.querySelector<HTMLInputElement>(
      'input[name="settlement"][value="offered"]',
    );
    offered?.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(draft.settlement()).toBe('offered');
    expect(host.querySelector('fold-listbox[data-offer-nature]')).not.toBeNull();
    expect(host.querySelector('fold-textarea[data-offer-note]')).not.toBeNull();
    expect(squash(host.querySelector('[data-offer]')?.textContent)).toContain(
      'ni facturée ni prélevée',
    );
  });

  it('bloque la validation tant que la nature et le motif manquent', () => {
    granted = ['b2b_offer_order:write'];
    const draft = offeredDraft();
    const { fixture, host } = mountFull(filledCart(), { draft, estimate: ESTIMATE });

    expect(host.textContent).toContain('choisissez sa nature');
    expect(host.textContent).toContain('écrivez-le en quelques mots');
    expect(validate(host)).toBeUndefined();

    draft.offerNature.set('tasting');
    draft.offerNote.set('   ');
    fixture.detectChanges();
    expect(host.textContent).not.toContain('choisissez sa nature');
    expect(validate(host)).toBeUndefined();

    draft.offerNote.set('Dégustation au salon');
    // Le sélecteur d'acheminement, sans point connu, émet son propre refus au
    // montage : on repose l'acheminement résolu par-dessus.
    draft.fulfillment.set(readyDraft().fulfillment());
    fixture.detectChanges();
    expect(validate(host)?.disabled).toBe(false);
  });

  it('un brouillon repris en « Offerte » sans le droit ne part pas', () => {
    const { host } = mountFull(filledCart(), { draft: offeredDraft(), estimate: ESTIMATE });
    expect(host.textContent).toContain('demande un droit que vous n’avez pas');
    expect(validate(host)).toBeUndefined();
  });

  it('la validation rend le motif complet avec `offered`', () => {
    granted = ['b2b_offer_order:write'];
    const draft = offeredDraft();
    draft.offerNature.set('goodwill');
    draft.offerNote.set('  Geste après réclamation ');
    const { fixture, host, component } = mountFull(filledCart(), { draft, estimate: ESTIMATE });
    const emitted: unknown[] = [];
    component.place.subscribe((value) => emitted.push(value));
    draft.fulfillment.set(readyDraft().fulfillment());
    fixture.detectChanges();

    validate(host)?.click();
    fixture.detectChanges();
    expect(squash(host.querySelector('.pan-actions fold-callout')?.textContent)).toContain(
      'ni facturée ni prélevée',
    );
    [...host.querySelectorAll<HTMLButtonElement>('.pan-confirm button')]
      .find((b) => b.textContent.trim() === 'Confirmer')
      ?.click();

    expect(emitted).toEqual([
      expect.objectContaining({
        settlement: 'offered',
        offer: { nature: 'goodwill', note: 'Geste après réclamation', notifyCustomer: false },
      }),
    ]);
  });

  it('🔴 « Prévenir le client » est décoché par défaut, et coché il part avec le motif', () => {
    granted = ['b2b_offer_order:write'];
    const draft = offeredDraft();
    draft.offerNature.set('tasting');
    draft.offerNote.set('Dégustation');
    const { fixture, host, component } = mountFull(filledCart(), { draft, estimate: ESTIMATE });
    const emitted: unknown[] = [];
    component.place.subscribe((value) => emitted.push(value));
    draft.fulfillment.set(readyDraft().fulfillment());
    fixture.detectChanges();

    expect(host.querySelector('[data-offer-notify]')).not.toBeNull();
    expect(draft.offerNotifiesCustomer()).toBe(false);
    draft.offerNotifiesCustomer.set(true);
    fixture.detectChanges();
    validate(host)?.click();
    fixture.detectChanges();
    [...host.querySelectorAll<HTMLButtonElement>('.pan-confirm button')]
      .find((b) => b.textContent.trim() === 'Confirmer')
      ?.click();

    expect(emitted).toEqual([
      expect.objectContaining({
        offer: { nature: 'tasting', note: 'Dégustation', notifyCustomer: true },
      }),
    ]);
  });
});

/** En tiroir (tablette, téléphone), l'en-tête de la page est caché sous la feuille. */
describe('PanierCommande — le brouillon en tiroir', () => {
  const draftButton = (host: HTMLElement): HTMLButtonElement | undefined =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent.trim() === 'Enregistrer le brouillon',
    );

  it('en colonne : pas de bouton, l’en-tête de la page le porte', () => {
    expect(draftButton(mount2({}))).toBeUndefined();
  });

  it('en tiroir : le bouton est là et demande l’enregistrement', () => {
    const { host, component } = mountFull(new CartStore(), { offersDraft: true });
    let asked = 0;
    component.saveDraft.subscribe(() => (asked += 1));
    const button = draftButton(host);
    expect(button).toBeDefined();
    button?.click();
    expect(asked).toBe(1);
  });

  it('pendant l’enregistrement : il se grise et le dit', () => {
    const host = mountFull(new CartStore(), { offersDraft: true, savingDraft: true }).host;
    const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent.trim() === 'Enregistrement…',
    );
    expect(button?.disabled).toBe(true);
  });
});
