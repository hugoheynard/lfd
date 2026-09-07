import type { AtelierSheet, ClientSheet, StaffSheet } from '@lfd/contracts';

import { orderSheetFileName, renderOrderSheetText } from '../order-sheet-text';

/**
 * Le cas qui ouvre ce fichier est une **régression** : `renderDeliveryNote`
 * imprimait `BON DE LIVRAISON` en tête d'un document dont la ligne suivante
 * pouvait dire « Retrait au laboratoire ». Un bon de livraison pour une commande
 * que personne ne livre (corrigé le 2026-09-07).
 */

const COMMON = {
  orderId: 'order_1',
  reference: 'CMD-4812',
  placedAt: '2026-09-07T06:00:00.000Z',
  requestedFor: '2026-09-08',
  fulfillment: {
    method: 'pickup' as const,
    address: {
      ligne1: 'route de la Balme',
      ligne2: '',
      codePostal: '73150',
      ville: "Val d'Isère",
    },
    window: null,
    contact: null,
    signatureRequired: false,
  },
  note: '',
  issuedAt: '2026-09-07T06:00:00.000Z',
  revision: 0,
};

const MONEY = {
  subtotalCents: 1000,
  discountCents: 100,
  discountAdjustment: null,
  deliveryFeeCents: 0,
  lateFeeCents: 0,
  vatCents: 50,
  totalCents: 950,
  currency: 'EUR',
};

function atelier(overrides: Partial<AtelierSheet> = {}): AtelierSheet {
  return {
    ...COMMON,
    audience: 'atelier',
    lines: [{ sku: 'PAIN-TRAD', productName: 'Tradition', quantity: 12 }],
    ...overrides,
  };
}

function client(overrides: Partial<ClientSheet> = {}): ClientSheet {
  return {
    ...COMMON,
    audience: 'client',
    lines: [
      {
        productName: 'Tradition',
        quantity: 12,
        unitPriceMillicents: 120_000,
        vatRate: 0.055,
        lineTotalCents: 1000,
        priceLabels: [],
      },
    ],
    money: MONEY,
    ...overrides,
  };
}

function staff(): StaffSheet {
  return {
    ...COMMON,
    audience: 'staff',
    lines: [
      {
        sku: 'PAIN-TRAD',
        productName: 'Tradition',
        quantity: 12,
        unitPriceMillicents: 120_000,
        vatRate: 0.055,
        lineTotalCents: 1000,
        priceLabels: [],
        entryPriceMillicents: 150_000,
        floored: false,
      },
    ],
    money: MONEY,
  };
}

describe("l'en-tête", () => {
  it('annonce un BON DE COMMANDE, jamais une livraison — y compris sur un RETRAIT', () => {
    // Régression : l'en-tête était en dur `BON DE LIVRAISON`, sous une ligne
    // « Acheminement : Retrait au laboratoire ». Le document tirait son nom d'un
    // de ses champs.
    const text = renderOrderSheetText(atelier());

    expect(text.startsWith('BON DE COMMANDE')).toBe(true);
    expect(text).not.toContain('BON DE LIVRAISON');
    expect(text).toContain('Acheminement  : Retrait au laboratoire');
  });

  it("nomme la livraison quand c'en est une, sans changer de titre", () => {
    const text = renderOrderSheetText(
      atelier({
        fulfillment: {
          ...COMMON.fulfillment,
          method: 'delivery',
          address: {
            ligne1: '12 rue du Coin Ferrand',
            ligne2: '',
            codePostal: '73150',
            ville: 'Tignes',
          },
        },
      }),
    );

    expect(text.startsWith('BON DE COMMANDE')).toBe(true);
    expect(text).toContain('Acheminement  : Livraison par coursier');
    expect(text).toContain('Tignes');
  });

  it("tait la date souhaitée quand la commande n'en porte pas", () => {
    expect(renderOrderSheetText(atelier({ requestedFor: null }))).not.toContain('Souhaitée le');
  });
});

describe("la feuille de l'atelier", () => {
  it("ne contient AUCUN montant — il n'y en a pas à imprimer", () => {
    const text = renderOrderSheetText(atelier());

    expect(text).not.toMatch(/€|\bHT\b|\bTTC\b|DÉCOMPTE/u);
  });

  it('ouvre chaque ligne par sa quantité et la ferme par son SKU', () => {
    expect(renderOrderSheetText(atelier())).toContain('   12 × Tradition (PAIN-TRAD)');
  });

  it("ne porte pas la mention « ce n'est pas une facture » — rien ne prête à confusion", () => {
    expect(renderOrderSheetText(atelier())).not.toContain("Ce n'est pas une facture");
  });
});

describe('la feuille chiffrée', () => {
  it("porte le décompte, dans l'ordre où les termes se sont appliqués", () => {
    const text = renderOrderSheetText(client());

    expect(text).toContain('DÉCOMPTE');
    expect(text).toContain('Sous-total HT');
    expect(text).toContain('Remise');
    expect(text).toContain('Total TTC');
  });

  it("DIT qu'elle n'est pas une facture", () => {
    // Le seul écart entre les deux pièces est un numéro de série que la
    // plateforme n'a pas : un document chiffré muet là-dessus sera classé comme
    // une facture par le premier comptable qui le reçoit.
    expect(renderOrderSheetText(client())).toContain("Ce n'est pas une facture.");
  });

  it("tait les termes à zéro plutôt que d'imprimer des lignes vides", () => {
    const text = renderOrderSheetText(client());

    expect(text).not.toContain('Coursier');
    expect(text).not.toContain('Surtaxe');
  });

  it("n'imprime pas de SKU sur la feuille du client, et en imprime sur celle du staff", () => {
    expect(renderOrderSheetText(client())).not.toContain('PAIN-TRAD');
    expect(renderOrderSheetText(staff())).toContain('PAIN-TRAD');
  });
});

describe('le pied', () => {
  it('date le bon de la RÉVISION, et la nomme', () => {
    // Sans ces deux mentions, deux versions du même bon circulent après un
    // avenant sans qu'on puisse les distinguer.
    const text = renderOrderSheetText(atelier());

    expect(text).toMatch(/Arrêté le .+ · révision 0/u);
  });

  it("dit « Arrêté », jamais « Tiré » — l'instant est celui de la révision", () => {
    const text = renderOrderSheetText(atelier());

    expect(text).not.toContain('Tiré le');
  });
});

describe('la note', () => {
  it('la rend quand il y en a une', () => {
    expect(renderOrderSheetText(atelier({ note: 'Sonner au 2e' }))).toContain(
      'Note : Sonner au 2e',
    );
  });

  it("ne laisse pas une étiquette vide quand il n'y en a pas", () => {
    expect(renderOrderSheetText(atelier())).not.toContain('Note :');
  });
});

describe('le nom de fichier', () => {
  it("porte l'audience : deux exemplaires ne se confondent pas sur un bureau", () => {
    expect(orderSheetFileName(atelier())).toBe('bon-de-commande-CMD-4812-atelier.txt');
    expect(orderSheetFileName(client())).toBe('bon-de-commande-CMD-4812-client.txt');
  });
});
