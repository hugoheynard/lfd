import type { OrderLineView, OrderView } from "@lfd/contracts";

import { atelierSheetOf, clientSheetOf, staffSheetOf } from "../order-sheet.js";

/** Le client de la commande, tel que le lecteur de production le compose. */
const CUSTOMER = { tradeName: "Trois Ponts", legalName: "SARL Trois Ponts" };

/**
 * Ce que ces cas éprouvent est une **frontière de sécurité**, pas une mise en
 * page : la projection est le seul endroit qui décide de ce qui quitte le
 * serveur. Un champ qu'elle laisse passer est dans l'onglet réseau du client,
 * qu'un écran l'affiche ou non.
 */

function line(overrides: Partial<OrderLineView> = {}): OrderLineView {
  return {
    sku: "PAT-ECLAIR",
    productName: "Éclair",
    unitPriceMillicents: 210_000,
    vatRate: 0.055,
    quantity: 4,
    lineTotalCents: 840,
    pricing: {
      basePriceMillicents: 250_000,
      // Consigné depuis le 2026-09-09 : `false` dit « la chaîne n'est pas
      // passée sous zéro », `null` dirait « on ne sait pas ».
      clampedToZero: false,
      steps: [
        {
          stage: "mercuriale",
          ruleId: "rule_42",
          label: "Promotion de rentrée",
          scope: null,
          resultMillicents: 210_000,
          supersedes: [],
        },
      ],
      floored: false,
      floorDecision: null,
      commitment: null,
    },
    allergens: null,
    ...overrides,
  };
}

function order(overrides: Partial<OrderView> = {}): OrderView {
  return {
    id: "order_1",
    orderNumber: "CMD-4812",
    status: "placed",
    paymentStatus: "paid",
    requestedDeliveryDate: "2026-09-08",
    fulfillmentMethod: "pickup",
    deliveryAddressId: null,
    deliveryAddress: null,
    pickupAddress: {
      label: "Labo — Pantin",
      pays: "France",
      ligne1: "route de la Balme",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
    },
    fulfillment: {
      window: { value: null, source: "default" },
      contact: { value: null, source: "default" },
      signatureRequired: { value: false, source: "default" },
    },
    note: "",
    subtotalCents: 128_460,
    discountCents: 12_846,
    discountAdjustment: null,
    deliveryFeeCents: 0,
    // Retrait : aucun frais de zone, donc aucun barème à figer.
    deliveryFeeAdjustment: null,
    lateFeeAdjustment: null,
    lateFeeCents: 0,
    vatCents: 6_360,
    vatShares: [{ rate: 5.5, amountCents: 6_360 }],
    totalCents: 121_974,
    currency: "EUR",
    customerLabel: "Hôtel des Trois Ponts",
    companyId: "cmp_1",
    fromSubscriptionId: null,
    origin: "self_service",
    placedByStaffId: null,
    recurringDeltas: null,
    placedAt: "2026-09-07T06:00:00.000Z",
    lines: [line()],
    handoverToken: "tok_secret_42",
    confirmedAt: null,
    readyAt: null,
    handedOverAt: null,
    ...overrides,
  };
}

describe("la feuille de l'atelier", () => {
  it("ne porte aucun montant — la propriété n'existe pas", () => {
    const sheet = atelierSheetOf(order(), CUSTOMER);

    // Une feuille oubliée sur un plan de travail ne raconte pas les prix
    // négociés à qui la ramasse, et celle d'une livraison voyage dans le carton.
    expect(sheet).not.toHaveProperty("money");
    expect(JSON.stringify(sheet)).not.toContain("210000");
  });

  it("garde le SKU : c'est par lui qu'on retrouve un article au four", () => {
    expect(atelierSheetOf(order(), CUSTOMER).lines[0]?.sku).toBe("PAT-ECLAIR");
  });

  it("ne porte aucune trace de prix, pas même un libellé d'étage", () => {
    expect(JSON.stringify(atelierSheetOf(order(), CUSTOMER))).not.toContain("Promotion de rentrée");
  });
});

describe("la feuille du client", () => {
  it("porte les montants figés, recopiés et non recalculés", () => {
    const sheet = clientSheetOf(order());

    expect(sheet.money.totalCents).toBe(121_974);
    expect(sheet.money.subtotalCents).toBe(128_460);
  });

  it("laisse sortir le SKU, mais NI le tarif d'entrée NI le nom de l'étage", () => {
    // 🔴 Ce cas refusait AUSSI le SKU jusqu'au 2026-09-07. Le bon de commande
    // dessiné lui donne une colonne, sur décision explicite.
    //
    // Le cœur de la projection n'a pas bougé pour autant, et il est ici : le
    // tarif d'entrée et le nom de l'étage disent COMMENT un prix a été fabriqué.
    // Les masquer au rendu les laisserait dans la charge utile — et trois
    // commandes empilées reconstituent la grille. Un SKU, lui, ne dit rien d'un
    // prix : c'est une référence d'article, que le client lit sur son bon.
    const payload = JSON.stringify(clientSheetOf(order()));

    expect(payload).toContain("PAT-ECLAIR");
    expect(payload).not.toContain("250000");
    expect(payload).not.toContain("mercuriale");
    expect(payload).not.toContain("rule_42");
  });

  it("garde le LIBELLÉ de l'étage, qui lui est destiné", () => {
    expect(clientSheetOf(order()).lines[0]?.priceLabels).toEqual(["Promotion de rentrée"]);
  });

  it("rend une liste vide quand la ligne ne porte aucune trace", () => {
    // Pas une phrase inventée : une commande antérieure au gel de la trace ne
    // doit pas s'afficher comme une commande sans geste tarifaire.
    const sheet = clientSheetOf(order({ lines: [line({ pricing: null })] }));

    expect(sheet.lines[0]?.priceLabels).toEqual([]);
  });
});

describe("la feuille du staff", () => {
  it("ajoute le SKU et la trace, sans changer un seul montant", () => {
    const client = clientSheetOf(order());
    const staff = staffSheetOf(order(), CUSTOMER);

    expect(staff.lines[0]?.sku).toBe("PAT-ECLAIR");
    expect(staff.lines[0]?.entryPriceMillicents).toBe(250_000);
    // Le vocabulaire diffère, jamais les montants : c'est ce qui permet au
    // commercial et au client de tomber juste au téléphone.
    expect(staff.money).toEqual(client.money);
    expect(staff.lines[0]?.lineTotalCents).toBe(client.lines[0]?.lineTotalCents);
  });

  it("tait le tarif d'entrée quand il est ÉGAL au prix facturé", () => {
    // Aucune règle n'a joué : il n'y a rien à barrer, et afficher un prix barré
    // identique ferait croire à une remise qui n'existe pas.
    const sheet = staffSheetOf(
      order({ lines: [line({ unitPriceMillicents: 250_000, lineTotalCents: 1_000 })] }),
      CUSTOMER,
    );

    expect(sheet.lines[0]?.entryPriceMillicents).toBeNull();
  });

  it("tait le tarif d'entrée quand la ligne ne porte AUCUNE trace", () => {
    // L'autre cas, indistinguable du premier à la lecture : le combler avec le
    // prix facturé affirmerait « aucune altération » sur les seules commandes
    // qu'on ne peut plus vérifier.
    const sheet = staffSheetOf(order({ lines: [line({ pricing: null })] }), CUSTOMER);

    expect(sheet.lines[0]?.entryPriceMillicents).toBeNull();
    expect(sheet.lines[0]?.floored).toBe(false);
  });
});

describe("l'acheminement", () => {
  it("retient l'adresse de RETRAIT sur une commande retirée", () => {
    expect(atelierSheetOf(order(), CUSTOMER).fulfillment.address?.ville).toBe("Val d'Isère");
  });

  it("retient l'adresse LIVRÉE sur une commande en coursier", () => {
    const sheet = atelierSheetOf(
      order({
        fulfillmentMethod: "delivery",
        deliveryAddress: {
          label: "Boutique",
          pays: "France",
          ligne1: "12 rue du Coin Ferrand",
          ligne2: "",
          codePostal: "73150",
          ville: "Tignes",
        },
      }),
      CUSTOMER,
    );

    expect(sheet.fulfillment.address?.ville).toBe("Tignes");
  });
});

describe("le jeton de remise", () => {
  it("ne figure sur AUCUNE des trois feuilles", () => {
    // La règle de l'autoscan, rendue structurelle : le jeton n'est pas un champ
    // de la feuille, donc aucun rendu ne peut l'imprimer sur un papier qui
    // voyage dans le carton.
    const sheets = [
      atelierSheetOf(order(), CUSTOMER),
      clientSheetOf(order()),
      staffSheetOf(order(), CUSTOMER),
    ];

    for (const sheet of sheets) {
      expect(JSON.stringify(sheet)).not.toContain("tok_secret_42");
    }
  });
});

describe("le client sur la feuille", () => {
  it("est porté par le fournil et le bureau, qui doivent trouver la bonne pile", () => {
    expect(atelierSheetOf(order(), CUSTOMER).customer.legalName).toBe("SARL Trois Ponts");
    expect(staffSheetOf(order(), CUSTOMER).customer.tradeName).toBe("Trois Ponts");
  });

  it("est PRÉSENT sur la feuille du client — un document se classe", () => {
    // 🔴 Ce cas exigeait son absence : « un bon de commande qu'on vous tend n'a
    // pas à vous dire qui vous êtes ». L'argument tenait pour un papier qu'on
    // tend au comptoir. Il ne tient plus pour un PDF, qui part par courriel, se
    // range dans un dossier comptable et se transmet à un tiers — un document
    // sans destinataire n'y est plus classable.
    //
    // ⚠️ Les deux champs portent la même valeur : `OrderView` ne connaît que la
    // raison sociale, et l'enseigne demanderait une jointure de plus. Le rendu
    // n'affiche alors qu'une ligne, plutôt qu'un nom commercial inventé.
    const customer = clientSheetOf(order()).customer;

    expect(customer.legalName).toBe("Hôtel des Trois Ponts");
    expect(customer.tradeName).toBe(customer.legalName);
  });
});

describe("le tirage", () => {
  it("date la feuille de la RÉVISION, pas du rendu", () => {
    // Deux projections successives doivent être identiques au champ près : c'est
    // ce qui rendra l'écriture du PDF idempotente sans verrou.
    const first = clientSheetOf(order());
    const second = clientSheetOf(order());

    expect(first.issuedAt).toBe("2026-09-07T06:00:00.000Z");
    expect(first).toEqual(second);
  });

  it("compte zéro avenant, et c'est vrai — le mécanisme n'existe pas", () => {
    expect(clientSheetOf(order()).revision).toBe(0);
  });
});
