import type { CatalogItemView, DeliveryAddressView, OrderDraftView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { draftPayloadOf, draftSnapshotOf, restoreLines } from '../draft-payload';
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
  specs: {
    note: '',
    slots: { mode: 'everyday', slot: null },
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
    category: 'viennoiserie',
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
