import type { CatalogItemView, DeliveryAddressView, OrderDraftView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import type { FulfillmentChoice } from '../acheminement-commande/acheminement-commande';
import {
  buyerOf,
  composedDraftOf,
  draftPayloadOf,
  draftPretaxOf,
  draftSnapshotOf,
  offerOf,
  placePayloadOf,
  pretaxToKeepOf,
  restoreLines,
} from '../draft-payload';
import { DraftStore, NEW_ADDRESS } from '../draft.store';

const SHOP: DeliveryAddressView = {
  id: 'addr_1',
  label: 'Boutique',
  ligne1: '12 avenue Foch',
  ligne2: '',
  codePostal: '92100',
  ville: 'Boulogne',
  pays: 'France',
  isDefault: true,
  procedureStepCount: 0,
  depositAllowed: false,
  specs: {
    note: '',
    slotList: { mode: 'everyday', slots: [] },
    deliveryContact: null,
    gps: null,
    signatureRequired: false,
  },
};

const CATALOGUE: readonly CatalogItemView[] = [
  {
    sku: 'VIE-001',
    name: 'Croissant',
    unitPriceMillicents: 120,
    vatRate: 5.5,
    family: { id: 'fam_01J9V1', name: 'Viennoiseries', position: 1 },
    category: null,
  },
];

function viewOf(overrides: Partial<OrderDraftView>): OrderDraftView {
  return {
    companyId: 'cmp_1',
    savedAt: '2026-08-15T09:00:00.000Z',
    savedByStaffId: 'staff_1',
    buyerUserId: null,
    fulfillmentMethod: 'pickup',
    pickupAddressId: null,
    deliveryAddress: null,
    requestedDeliveryDate: null,
    requestedWindow: null,
    note: '',
    settlement: 'link',
    offerNature: null,
    offerNote: '',
    offerNotifiesCustomer: false,
    itemLimitOverrideReason: '',
    estimatedPretaxCents: null,
    lines: [],
    ...overrides,
  };
}

describe('la traduction écran ↔ brouillon', () => {
  it('conserve l’adresse retenue, pas le rang du carnet', () => {
    // Le serveur garde des faits : l'adresse livrée, et non « la première du
    // carnet » — un carnet réordonné ne doit pas changer la livraison.
    const draft = new DraftStore();
    draft.method.set('delivery');

    const payload = draftPayloadOf(draft.snapshot(), [], [SHOP]);

    expect(payload.deliveryAddress?.ligne1).toBe('12 avenue Foch');
  });

  it('rouvre sur l’entrée du carnet quand l’adresse s’y trouve encore', () => {
    const snapshot = draftSnapshotOf(
      viewOf({
        fulfillmentMethod: 'delivery',
        deliveryAddress: {
          label: '',
          ligne1: '12 avenue Foch',
          ligne2: '',
          codePostal: '92100',
          ville: 'Boulogne',
          pays: 'France',
        },
      }),
      [SHOP],
    );

    expect(snapshot.addressId).toBe('addr_1');
  });

  it('rouvre la saisie, garnie, quand l’adresse n’est plus au carnet', () => {
    const snapshot = draftSnapshotOf(
      viewOf({
        fulfillmentMethod: 'delivery',
        deliveryAddress: {
          label: '',
          ligne1: '5 rue Neuve',
          ligne2: '',
          codePostal: '92200',
          ville: 'Neuilly',
          pays: 'France',
        },
      }),
      [SHOP],
    );

    expect(snapshot.addressId).toBe(NEW_ADDRESS);
    expect(snapshot.address.ligne1).toBe('5 rue Neuve');
  });

  it('re-résout les prix au catalogue du jour', () => {
    // Une saisie mise de côté la semaine dernière ne doit pas rouvrir sur un
    // tarif périmé qu'on annoncerait au téléphone.
    const restored = restoreLines(viewOf({ lines: [{ sku: 'VIE-001', quantity: 40 }] }), CATALOGUE);

    expect(restored.lines).toEqual([
      { sku: 'VIE-001', name: 'Croissant', unitPriceMillicents: 120, quantity: 40 },
    ]);
    expect(restored.dropped).toEqual([]);
  });

  /** P5 : un brouillon au poids se rouvre en grammes, au pas du catalogue du jour. */
  it('rouvre une ligne au poids avec son unité, son pas et son minimum', () => {
    const gravlax: CatalogItemView = {
      sku: 'SAU-001',
      name: 'Gravlax',
      unitPriceMillicents: 4_200_000,
      vatRate: 5.5,
      family: null,
      category: null,
      saleUnit: 'weight',
      weightStepGrams: 100,
      weightMinGrams: null,
    };
    const restored = restoreLines(
      viewOf({ lines: [{ sku: 'SAU-001', quantity: 500, saleUnit: 'weight' }] }),
      [gravlax],
    );

    expect(restored.lines).toEqual([
      {
        sku: 'SAU-001',
        name: 'Gravlax',
        unitPriceMillicents: 4_200_000,
        quantity: 500,
        saleUnit: 'weight',
        step: 100,
        minimum: 100,
      },
    ]);
  });

  /** Plan `catalogue/plan-quantite-minimale.md`, Q6 : le plancher du jour suit la ligne. */
  /** Hugo, 2026-11-23 : l'équipe n'est pas tenue au minimum d'achat d'une pièce. */
  it('🔴 rouvre une pièce SANS le minimum de pièces du catalogue', () => {
    const catalogue = [{ ...CATALOGUE[0]!, minQuantity: 6 }];
    const restored = restoreLines(viewOf({ lines: [{ sku: 'VIE-001', quantity: 2 }] }), catalogue);

    expect(restored.lines).toEqual([
      { sku: 'VIE-001', name: 'Croissant', unitPriceMillicents: 120, quantity: 2 },
    ]);
  });

  it('retire — et signale — un SKU que le catalogue ne connaît plus', () => {
    const restored = restoreLines(viewOf({ lines: [{ sku: 'PAT-002', quantity: 6 }] }), CATALOGUE);

    expect(restored.lines).toEqual([]);
    expect(restored.dropped).toEqual(['PAT-002']);
  });

  /**
   * 🔴 **La tranche convenue survit à un appel interrompu** (2026-09-11).
   * L'écran vient de gagner la question ; si le brouillon ne la retenait pas,
   * le commercial y répondrait deux fois — et la seconde réponse ne serait pas
   * forcément la même que ce qu'il a dit au client.
   */
  it('🔴 garde la tranche convenue, aller et retour', () => {
    const draft = new DraftStore();
    draft.window.set({ start: '05:00', end: '06:00' });

    const payload = draftPayloadOf(draft.snapshot(), [], [SHOP]);
    expect(payload.requestedWindow).toEqual({ start: '05:00', end: '06:00' });

    const reopened = draftSnapshotOf(viewOf({ requestedWindow: payload.requestedWindow }), [SHOP]);
    expect(reopened.window).toEqual({ start: '05:00', end: '06:00' });
  });

  it('un brouillon interrompu avant le créneau se rouvre sans créneau', () => {
    // Le créneau est obligatoire à la PASSATION, pas dans un brouillon : exiger
    // ici refuserait d'enregistrer l'appel coupé au milieu, ce pour quoi le
    // brouillon existe.
    expect(draftSnapshotOf(viewOf({ requestedWindow: null }), [SHOP]).window).toBeNull();
  });
});

describe('draftPretaxOf — le Total HT gardé avec le brouillon', () => {
  const AMOUNTS = { pretaxCents: 4210, lateFeeCents: 0 };

  it('garde le Total HT de l’estimation de CETTE saisie', () => {
    expect(draftPretaxOf(AMOUNTS, true, false)).toBe(4210);
  });

  it('rien quand l’estimation n’est pas celle de la saisie en cours', () => {
    expect(draftPretaxOf(AMOUNTS, false, false)).toBeNull();
  });

  it('rien en retrait immédiat : la reprise ne le retrouverait pas', () => {
    expect(draftPretaxOf(AMOUNTS, true, true)).toBeNull();
  });

  it('rien avec un supplément de retard : il tient à l’heure de l’enregistrement', () => {
    expect(draftPretaxOf({ pretaxCents: 4710, lateFeeCents: 500 }, true, false)).toBeNull();
  });

  it('rien sans montants (composition refusée)', () => {
    expect(draftPretaxOf(null, true, false)).toBeNull();
  });

  it('le payload porte le montant passé, `null` par défaut', () => {
    const draft = new DraftStore();
    expect(draftPayloadOf(draft.snapshot(), [], []).estimatedPretaxCents).toBeNull();
    expect(draftPayloadOf(draft.snapshot(), [], [], 4210).estimatedPretaxCents).toBe(4210);
  });
});

describe('pretaxToKeepOf — attendre le prix avant d’enregistrer', () => {
  const AMOUNTS = { pretaxCents: 4210, lateFeeCents: 0 };
  const never = (): Promise<null> => Promise.reject(new Error('ne doit pas redemander'));

  it('prix prêt : il le garde sans redemander', async () => {
    const kept = await pretaxToKeepOf({
      ready: true,
      amounts: AMOUNTS,
      immediate: false,
      currentKey: () => 'k1',
      fetch: never,
    });
    expect(kept).toBe(4210);
  });

  it('prix en calcul : il l’attend, au lieu d’enregistrer « — »', async () => {
    const kept = await pretaxToKeepOf({
      ready: false,
      amounts: null,
      immediate: false,
      currentKey: () => 'k1',
      fetch: () => Promise.resolve(AMOUNTS),
    });
    expect(kept).toBe(4210);
  });

  it('la saisie a bougé pendant l’attente : rien plutôt qu’un prix d’une autre saisie', async () => {
    let key = 'k1';
    const kept = await pretaxToKeepOf({
      ready: false,
      amounts: null,
      immediate: false,
      currentKey: () => key,
      fetch: () => {
        key = 'k2';
        return Promise.resolve(AMOUNTS);
      },
    });
    expect(kept).toBeNull();
  });

  it('saisie incomplète : rien à attendre', async () => {
    const kept = await pretaxToKeepOf({
      ready: false,
      amounts: null,
      immediate: false,
      currentKey: () => null,
      fetch: never,
    });
    expect(kept).toBeNull();
  });

  /**
   * Régression : un calcul refusé (heure limite passée) faisait échouer
   * l'enregistrement, et les changements de la commerciale se perdaient.
   */
  it('🔴 calcul refusé : le brouillon se garde quand même, sans Total HT', async () => {
    const kept = await pretaxToKeepOf({
      ready: false,
      amounts: null,
      immediate: false,
      currentKey: () => 'k1',
      fetch: () => Promise.reject(new Error('orders.cutoff.past')),
    });
    expect(kept).toBeNull();
  });
});

function composed<T>(draft: T | null): T {
  if (draft === null) {
    throw new Error('la saisie devait se composer');
  }
  return draft;
}

describe('la commande offerte — le motif', () => {
  const PICKUP: FulfillmentChoice = {
    method: 'pickup',
    pickupAddressId: 'pk_1',
    deliveryAddress: null,
    saveToBook: false,
    window: { start: '09:00', end: '10:00' },
    issue: null,
  };
  const decisions = (offerNature: 'tasting' | null, offerNote: string) => ({
    buyerUserId: 'usr_1',
    fulfillment: PICKUP,
    requestedDate: '2030-01-02',
    note: '',
    settlement: 'offered' as const,
    offerNature,
    offerNote,
    offerNotifiesCustomer: false,
    immediate: false,
    empty: false,
  });

  it('le brouillon garde la nature et le texte, et la reprise les relit', () => {
    const draft = new DraftStore();
    draft.settlement.set('offered');
    draft.offerNature.set('tasting');
    draft.offerNote.set('Dégustation pour le salon');

    const payload = draftPayloadOf(draft.snapshot(), [], []);
    expect(payload.offerNature).toBe('tasting');
    expect(payload.offerNote).toBe('Dégustation pour le salon');

    const reopened = new DraftStore();
    reopened.restore(
      draftSnapshotOf(
        viewOf({
          settlement: payload.settlement,
          offerNature: payload.offerNature,
          offerNote: payload.offerNote,
          offerNotifiesCustomer: false,
        }),
        [],
      ),
    );
    expect(reopened.settlement()).toBe('offered');
    expect(reopened.offerNature()).toBe('tasting');
    expect(reopened.offerNote()).toBe('Dégustation pour le salon');
  });

  it('un brouillon d’avant l’offre se rouvre sans motif', () => {
    const snapshot = draftSnapshotOf(viewOf({}), []);
    expect(snapshot.offerNature).toBeNull();
    expect(snapshot.offerNote).toBe('');
  });

  it('le motif n’existe qu’en `offered`, complet et rogné', () => {
    expect(offerOf('offered', 'tasting', '  Salon  ')).toEqual({
      nature: 'tasting',
      note: 'Salon',
      notifyCustomer: false,
    });
    // Le client n'est prévenu que sur demande (Hugo, 2026-11-23).
    expect(offerOf('offered', 'tasting', 'Salon', true)?.notifyCustomer).toBe(true);
    expect(offerOf('offered', null, 'Salon')).toBeNull();
    expect(offerOf('offered', 'tasting', '   ')).toBeNull();
    expect(offerOf('link', 'tasting', 'Salon')).toBeNull();
  });

  it('l’estimation part sans `offer` tant que le motif est incomplet', () => {
    const draft = composedDraftOf(decisions('tasting', ''));
    const payload = placePayloadOf('cmp_1', composed(draft), [], 'commercial');
    expect(payload.settlement).toBe('offered');
    expect('offer' in payload).toBe(false);
  });

  it('la passation porte `offer` avec `offered`', () => {
    const draft = composedDraftOf(decisions('tasting', ' Salon du chocolat '));
    const payload = placePayloadOf('cmp_1', composed(draft), [], 'commercial');
    expect(payload.settlement).toBe('offered');
    expect(payload.offer).toEqual({
      nature: 'tasting',
      note: 'Salon du chocolat',
      notifyCustomer: false,
    });
  });

  it('un autre règlement ne porte jamais de motif, même saisi', () => {
    const draft = composedDraftOf({ ...decisions('tasting', 'Salon'), settlement: 'account' });
    expect('offer' in placePayloadOf('cmp_1', composed(draft), [], 'commercial')).toBe(false);
  });
});

/** Régression : un brouillon gardait un acheteur que la saisie ne propose plus. */
describe('buyerOf', () => {
  const owner = {
    userId: 'usr_owner',
    firstName: 'A',
    lastName: 'B',
    email: 'a@b.fr',
    role: 'owner' as const,
  };

  it('garde le choix quand il est proposé', () => {
    expect(buyerOf('usr_owner', [owner])).toBe('usr_owner');
  });

  it('🔴 oublie un choix qui n’est plus proposé, au profit du détenteur', () => {
    expect(buyerOf('usr_invited', [owner])).toBe('usr_owner');
  });

  it('sans personne à proposer : aucun acheteur', () => {
    expect(buyerOf('usr_invited', [])).toBeNull();
  });
});

describe('le motif du dépassement des limites — gardé avec le brouillon', () => {
  it('enregistré, il revient à la reprise, et le dépassement est rouvert', () => {
    const draft = new DraftStore();
    draft.itemLimitOverriding.set(true);
    draft.itemLimitReason.set('Commande du salon, la prod est prévenue');

    const payload = draftPayloadOf(draft.snapshot(), [], []);
    expect(payload.itemLimitOverrideReason).toBe('Commande du salon, la prod est prévenue');

    const reopened = new DraftStore();
    reopened.restore(
      draftSnapshotOf(viewOf({ itemLimitOverrideReason: payload.itemLimitOverrideReason }), []),
    );
    expect(reopened.itemLimitReason()).toBe('Commande du salon, la prod est prévenue');
    expect(reopened.itemLimitOverriding()).toBe(true);
  });

  it('un brouillon sans motif ne rouvre pas le dépassement', () => {
    const reopened = new DraftStore();
    reopened.restore(draftSnapshotOf(viewOf({}), []));
    expect(reopened.itemLimitReason()).toBe('');
    expect(reopened.itemLimitOverriding()).toBe(false);
  });
});
