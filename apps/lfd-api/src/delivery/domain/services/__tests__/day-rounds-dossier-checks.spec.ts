import { dossierChecksOf, type DossierOrderFacts } from "../day-rounds-dossier-checks.js";

function facts(orderId: string, overrides: Partial<DossierOrderFacts> = {}): DossierOrderFacts {
  return {
    orderId,
    roundTitle: "Camion 1 · passage 1",
    order: { reference: `ORD-${orderId}`, customerLabel: `Client ${orderId}`, cancelled: false },
    hasAddress: true,
    hasContact: true,
    linkedToAddressBook: true,
    shortfall: [],
    ...overrides,
  };
}

describe("dossierChecksOf — « À vérifier », les alertes de l'ancienne feuille de route", () => {
  it("ne retient pas une commande sans alerte", () => {
    expect(dossierChecksOf([facts("a")])).toEqual([]);
  });

  it("dit l'adresse non reliée au carnet, comme le badge de la feuille de route", () => {
    expect(dossierChecksOf([facts("a", { linkedToAddressBook: false })])).toEqual([
      {
        reference: "ORD-a",
        customerLabel: "Client a",
        roundTitle: "Camion 1 · passage 1",
        reasons: ["Adresse non reliée au carnet : ni point GPS, ni consignes, ni procédure"],
      },
    ]);
  });

  it("cumule les raisons d'une même commande, dans l'ordre des règles", () => {
    const [check] = dossierChecksOf([
      facts("a", {
        hasAddress: false,
        hasContact: false,
        shortfall: [
          { productName: "Baguette", quantity: 3 },
          { productName: "Tarte", quantity: 1 },
        ],
      }),
    ]);
    expect(check?.reasons).toEqual([
      "Aucune adresse sur la commande",
      "Aucun contact sur la commande",
      "Départ incomplet, ne part pas : 3 × Baguette, 1 × Tarte",
    ]);
  });

  it("nomme par son identifiant une commande que le commerce ne connaît pas, sans autre alerte", () => {
    const [check] = dossierChecksOf([
      facts("o_ghost", { order: null, hasAddress: false, linkedToAddressBook: false }),
    ]);
    expect(check).toMatchObject({
      reference: "o_ghost",
      customerLabel: "",
      reasons: ["Commande inconnue du commerce : aucune feuille à imprimer"],
    });
  });

  it("écarte une commande annulée : elle ne part pas", () => {
    expect(
      dossierChecksOf([
        facts("a", {
          order: { reference: "ORD-a", customerLabel: "A", cancelled: true },
          hasContact: false,
        }),
      ]),
    ).toEqual([]);
  });

  it("trie par référence et garde « hors tournée » (null)", () => {
    const checks = dossierChecksOf([
      facts("b", { hasContact: false }),
      facts("a", { hasContact: false, roundTitle: null }),
    ]);
    expect(checks.map((check) => [check.reference, check.roundTitle])).toEqual([
      ["ORD-a", null],
      ["ORD-b", "Camion 1 · passage 1"],
    ]);
  });
});
