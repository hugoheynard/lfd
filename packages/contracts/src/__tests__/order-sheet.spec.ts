import {
  atelierSheetSchema,
  clientSheetSchema,
  orderSheetSchema,
  staffSheetSchema,
} from "../order-sheet.js";

/**
 * Ce que ces cas éprouvent n'est pas « le schéma valide un objet valide » — il
 * le fait — mais **ce que la feuille refuse de laisser passer**.
 *
 * Le bon de commande porte une règle de sécurité : l'atelier ne voit aucun
 * montant, et le client ne voit ni SKU ni nom d'étage tarifaire. Tant que cette
 * règle vit dans un rendu, elle s'applique à la main autant de fois qu'il y a de
 * formats. Ici elle est dans la **forme**, et c'est le schéma qui la tient — y
 * compris contre une projection qui se tromperait d'audience.
 */

const FULFILLMENT = {
  method: "pickup" as const,
  address: null,
  pickupLabel: "Le Labo",
  window: null,
  contact: null,
  signatureRequired: false,
};

const CUSTOMER = { tradeName: "Trois Ponts", legalName: "SARL Trois Ponts" };

const COMMON = {
  orderId: "order_1",
  reference: "CMD-4812",
  placedAt: "2026-09-07T06:00:00.000Z",
  requestedFor: null,
  fulfillment: FULFILLMENT,
  note: "",
  origin: "self_service" as const,
  issuedAt: "2026-09-07T06:00:00.000Z",
  revision: 0,
};

const MONEY = {
  subtotalCents: 128_460,
  discountCents: 12_846,
  discountAdjustment: null,
  deliveryFeeCents: 0,
  lateFeeCents: 0,
  vatCents: 6_360,
  totalCents: 121_974,
  currency: "EUR",
};

describe("la feuille d'atelier", () => {
  it("n'a pas de montants, et n'en accepte pas qu'on lui en glisse", () => {
    const parsed = atelierSheetSchema.parse({
      ...COMMON,
      audience: "atelier",
      customer: CUSTOMER,
      lines: [{ sku: "PAIN-TRAD", productName: "Tradition", quantity: 12 }],
      // Une projection qui se tromperait d'audience : le schéma est la dernière
      // barrière avant le fournil, et il ne doit pas la laisser passer.
      money: MONEY,
    });

    expect(parsed).not.toHaveProperty("money");
  });

  it("garde le SKU — c'est par lui qu'on retrouve un article au four", () => {
    const parsed = atelierSheetSchema.parse({
      ...COMMON,
      audience: "atelier",
      customer: CUSTOMER,
      lines: [{ sku: "PAIN-TRAD", productName: "Tradition", quantity: 12 }],
    });

    expect(parsed.lines[0]?.sku).toBe("PAIN-TRAD");
  });
});

describe("la feuille du client", () => {
  const line = {
    productName: "Éclair",
    quantity: 4,
    unitPriceMillicents: 210_000,
    vatRate: 0.055,
    lineTotalCents: 840,
    priceLabels: ["Promotion de rentrée"],
  };

  it("porte les montants — c'est l'objet même de la pièce", () => {
    const parsed = clientSheetSchema.parse({
      ...COMMON,
      audience: "client",
      lines: [line],
      money: MONEY,
    });

    expect(parsed.money.totalCents).toBe(121_974);
  });

  it("laisse le SKU et la trace du prix à la porte", () => {
    const parsed = clientSheetSchema.parse({
      ...COMMON,
      audience: "client",
      lines: [{ ...line, sku: "PAT-ECLAIR", entryPriceMillicents: 250_000, floored: true }],
      money: MONEY,
    });

    expect(parsed.lines[0]).not.toHaveProperty("sku");
    expect(parsed.lines[0]).not.toHaveProperty("entryPriceMillicents");
    expect(parsed.lines[0]).not.toHaveProperty("floored");
  });

  it("garde le LIBELLÉ de l'étage, qui lui est destiné", () => {
    const parsed = clientSheetSchema.parse({
      ...COMMON,
      audience: "client",
      lines: [line],
      money: MONEY,
    });

    expect(parsed.lines[0]?.priceLabels).toEqual(["Promotion de rentrée"]);
  });
});

describe("la feuille du staff", () => {
  it("ajoute ce qu'il faut pour répondre au téléphone", () => {
    const parsed = staffSheetSchema.parse({
      ...COMMON,
      audience: "staff",
      customer: CUSTOMER,
      lines: [
        {
          sku: "PAT-ECLAIR",
          productName: "Éclair",
          quantity: 4,
          unitPriceMillicents: 210_000,
          vatRate: 0.055,
          lineTotalCents: 840,
          priceLabels: ["Promotion de rentrée"],
          entryPriceMillicents: 250_000,
          floored: false,
        },
      ],
      money: MONEY,
    });

    expect(parsed.lines[0]?.sku).toBe("PAT-ECLAIR");
    expect(parsed.lines[0]?.entryPriceMillicents).toBe(250_000);
  });

  it("accepte un tarif d'entrée absent sans le remplacer par le prix facturé", () => {
    // `null` couvre deux cas qu'on ne peut pas distinguer et qui se rendent
    // pareil : aucune règle n'a joué, ou la ligne ne porte aucune trace. Le
    // combler avec `unitPriceMillicents` affirmerait « aucune altération » sur
    // les seules commandes qu'on ne peut plus vérifier.
    const parsed = staffSheetSchema.parse({
      ...COMMON,
      audience: "staff",
      customer: CUSTOMER,
      lines: [
        {
          sku: "PAIN-TRAD",
          productName: "Tradition",
          quantity: 1,
          unitPriceMillicents: 120_000,
          vatRate: 0.055,
          lineTotalCents: 120,
          priceLabels: [],
          entryPriceMillicents: null,
          floored: false,
        },
      ],
      money: MONEY,
    });

    expect(parsed.lines[0]?.entryPriceMillicents).toBeNull();
  });
});

describe("l'union discriminée", () => {
  it("choisit le membre par l'audience, pas par la forme", () => {
    const atelier = orderSheetSchema.parse({
      ...COMMON,
      audience: "atelier",
      customer: CUSTOMER,
      lines: [{ sku: "PAIN-TRAD", productName: "Tradition", quantity: 2 }],
    });

    expect(atelier.audience).toBe("atelier");
    expect(atelier).not.toHaveProperty("money");
  });

  it("refuse une audience inconnue plutôt que de retomber sur un défaut", () => {
    const result = orderSheetSchema.safeParse({
      ...COMMON,
      audience: "comptable",
      lines: [],
    });

    expect(result.success).toBe(false);
  });

  it("refuse une feuille chiffrée sans ses montants", () => {
    const result = orderSheetSchema.safeParse({ ...COMMON, audience: "client", lines: [] });

    expect(result.success).toBe(false);
  });
});

describe("le tirage", () => {
  it("refuse une révision négative — un avenant ne se décompte pas", () => {
    const result = atelierSheetSchema.safeParse({
      ...COMMON,
      revision: -1,
      audience: "atelier",
      customer: CUSTOMER,
      lines: [],
    });

    expect(result.success).toBe(false);
  });

  it("accepte la révision zéro : la commande d'origine n'est pas une absence", () => {
    const parsed = atelierSheetSchema.parse({
      ...COMMON,
      audience: "atelier",
      customer: CUSTOMER,
      lines: [],
    });

    expect(parsed.revision).toBe(0);
  });
});
