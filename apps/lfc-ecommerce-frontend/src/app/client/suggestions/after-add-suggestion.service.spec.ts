import { TestBed } from '@angular/core/testing';
import { WORKSPACE_HEADER } from '@lfd/contracts/workspace';

import { StaffCartSuggestion } from '../cart/staff-cart-suggestion.service';
import { AfterAddSuggestion } from './after-add-suggestion.service';
import { answerCart, bootAfterAdd, CART_ROUTE, cartPick } from './after-add-suggestion.fixture';

describe('AfterAddSuggestion', () => {
  it('à une entrée : la suggestion du PANIER recalculée avec l’article, comptée à la règle', async () => {
    const { cart, entries, http, audience } = bootAfterAdd();
    const offer = TestBed.inject(AfterAddSuggestion);
    cart.add('VIE-001');
    entries.entered('VIE-001');

    const body = await answerCart(http, [cartPick('PAI-001')]);

    expect(body).toEqual({ skus: ['VIE-001'], target: null });
    expect(offer.current()).toEqual(cartPick('PAI-001'));
    expect(audience.events.map(({ event, origin }) => [event, origin])).toEqual([
      ['suggestion_shown', { source: 'staff', placement: '01jcart' }],
    ]);
  });

  it('sans règle applicable, rien', async () => {
    const { entries, http } = bootAfterAdd();
    const offer = TestBed.inject(AfterAddSuggestion);
    entries.entered('VIE-001');

    await answerCart(http, []);

    expect(offer.current()).toBeNull();
  });

  it('se tait panier ouvert : sa carte y parle déjà', () => {
    const { entries, http } = bootAfterAdd();
    TestBed.inject(AfterAddSuggestion);
    TestBed.inject(StaffCartSuggestion).open();
    entries.entered('VIE-001');
    TestBed.tick();

    http.expectNone(CART_ROUTE);
  });

  it('le « + » compte l’ajout, pas de clic, et ferme le retour', async () => {
    const { entries, http, audience } = bootAfterAdd();
    const offer = TestBed.inject(AfterAddSuggestion);
    entries.entered('VIE-001');
    await answerCart(http, [cartPick('PAI-001')]);

    offer.taken(cartPick('PAI-001'));

    expect(offer.current()).toBeNull();
    expect(audience.events.map(({ event }) => event)).toEqual([
      'suggestion_shown',
      'suggestion_added',
    ]);
  });

  it('ouvrir la fiche compte le clic, sans ajout, et ferme le retour', async () => {
    const { entries, http, audience } = bootAfterAdd();
    const offer = TestBed.inject(AfterAddSuggestion);
    entries.entered('VIE-001');
    await answerCart(http, [cartPick('PAI-001')]);

    offer.opened(cartPick('PAI-001'));

    expect(offer.current()).toBeNull();
    expect(audience.events.map(({ event }) => event)).toEqual([
      'suggestion_shown',
      'suggestion_clicked',
    ]);
  });

  /**
   * Lot d (brique par clé de contexte) : la proposition lue pour l'espace
   * quitté restait à l'écran après une bascule, et la demande portait
   * l'espace courant à l'envoi plutôt que celui qu'elle servait.
   */
  it('rien de l’ancien espace n’est rendu après une bascule', async () => {
    const { entries, http, workspace } = bootAfterAdd([], true);
    const offer = TestBed.inject(AfterAddSuggestion);
    entries.entered('VIE-001');
    TestBed.tick();
    const asked = await vi.waitFor(() => http.expectOne(MINE));
    expect(asked.request.headers.get(WORKSPACE_HEADER)).toBe('personal');
    asked.flush([cartPick('PAI-001')]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    TestBed.tick();
    expect(offer.current()).toEqual(cartPick('PAI-001'));

    workspace.current.set('cmp_pro');
    TestBed.tick();
    expect(offer.current()).toBeNull();
  });
});

const MINE = (request: { url: string }): boolean =>
  request.url.endsWith('/shop/suggestions/cart/mine');
