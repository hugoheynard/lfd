import {
  MAX_LINE_QUANTITY,
  MAX_LINE_WEIGHT_GRAMS,
  MAX_ORDER_LINES,
  orderLineInputSchema,
  orderQuotePayloadSchema,
  placeOrderPayloadSchema,
  saleUnitOfLine,
} from "../index.js";
import { shopQuoteLineSchema } from "../shop-quote.js";

/**
 * Un panier valide, dont ces cas ne font varier que les lignes.
 *
 * La clé d'idempotence en fait partie depuis qu'elle est au CONTRAT : un panier
 * sans elle n'est plus un panier valide, et ce fixture doit rester valide pour
 * que ces cas éprouvent bien la BORNE et non l'absence de clé.
 */
const PANIER = {
  companyId: null,
  idempotencyKey: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  salesTerms: null,
  fulfillmentMethod: "pickup" as const,
  pickupAddressId: "pick_labo",
  deliveryAddress: null,
  deliveryAddressId: null,
  requestedDeliveryDate: "2026-09-08",
  note: "",
};

const ligne = (quantity: number) => ({ sku: "VIE-001", quantity });

/**
 * 🔴 **La quantité n'avait pas de borne haute.**
 *
 * `positive()` accepte 2 000 000. Une ligne pareille passait les quatre portes,
 * entrait en base, partait au plan de production et comptait au chiffre
 * d'affaires — sans que rien, nulle part, ne la regarde. Ces cas tiennent la
 * borne **là où elle est posée** : au contrat, donc sur les quatre à la fois.
 */
describe("la borne de quantité", () => {
  it("accepte la plus grosse commande plausible", () => {
    expect(orderLineInputSchema.safeParse(ligne(MAX_LINE_QUANTITY)).success).toBe(true);
  });

  it("refuse une pièce de plus", () => {
    expect(orderLineInputSchema.safeParse(ligne(MAX_LINE_QUANTITY + 1)).success).toBe(false);
  });

  it("refuse toujours zéro et le négatif", () => {
    expect(orderLineInputSchema.safeParse(ligne(0)).success).toBe(false);
    expect(orderLineInputSchema.safeParse(ligne(-3)).success).toBe(false);
  });

  /**
   * Les portes qui ÉCRIVENT partagent une définition — la commande et le panier
   * de boutique. Une borne qui n'existerait qu'à la caisse laisserait chiffrer
   * un panier qu'on refuserait ensuite.
   *
   * ⚠️ **Ce cas incluait le devis, et affirmait « les quatre portes » jusqu'au
   * 2026-09-09.** Sa justification — « une borne qui n'existerait qu'au devis
   * laisserait entrer par la caisse ce qu'on avait interdit d'estimer » — vise
   * l'asymétrie **inverse** de celle qu'on a posée : ici le devis est le plus
   * large, la caisse la plus étroite, et on ne peut donc rien commander qu'on
   * n'ait pu estimer. C'est le sens qui compte, pas la symétrie.
   */
  it("vaut pour la commande ET la boutique — celles qui écrivent", () => {
    const trop = ligne(MAX_LINE_QUANTITY + 1);
    expect(shopQuoteLineSchema.safeParse(trop).success).toBe(false);
    expect(placeOrderPayloadSchema.safeParse({ ...PANIER, lines: [trop] }).success).toBe(false);
  });
});

/**
 * **Le devis n'est pas un panier**, et c'est un document extérieur qui l'a
 * établi : un devis de saison réel portait 101 380 pièces sur une ligne, et
 * quatre de ses quarante-quatre lignes — 43,6 % du montant — passaient la borne
 * (`test/devis-comptable-fixture.ts` dans `lfd-api`, relevé le 2026-09-09).
 *
 * Un devis n'écrit rien, n'encaisse rien et ne part pas au fournil. Ce que la
 * borne protège n'existe pas de ce côté.
 */
describe("la quantité du DEVIS, sans borne commerciale", () => {
  const devis = (quantity: number) =>
    orderQuotePayloadSchema.safeParse({ companyId: null, lines: [ligne(quantity)] }).success;

  it("chiffre une ligne que la commande refuse", () => {
    expect(devis(MAX_LINE_QUANTITY + 1)).toBe(true);
    expect(devis(101_380)).toBe(true);
  });

  it("refuse toujours zéro, le négatif et le non-entier", () => {
    expect(devis(0)).toBe(false);
    expect(devis(-3)).toBe(false);
    expect(devis(12.5)).toBe(false);
  });

  /**
   * 🔴 La seule borne qui reste, et ce n'est pas une borne de quantité : au-delà
   * du safe integer, `z.number().int()` accepte encore `1e308` — un entier au
   * sens de `Number.isInteger`, un flottant au sens de l'addition. Sans
   * `.safe()`, un total faux sortirait **sans qu'aucune erreur ne soit levée**.
   */
  it("refuse ce qui n'est plus un entier qu'on peut additionner", () => {
    expect(devis(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(devis(Number.MAX_SAFE_INTEGER + 2)).toBe(false);
    expect(devis(1e308)).toBe(false);
  });
});

/**
 * La boutique bornait déjà son panier à 100 lignes ; la commande, elle, ne
 * bornait rien. La porte protégée était donc l'ESTIMATION, et la porte ouverte
 * l'ÉCRITURE.
 */
describe("la borne du nombre de lignes", () => {
  const lignes = (count: number) => Array.from({ length: count }, (_, index) => ligne(index + 1));

  it("accepte le plus long panier plausible", () => {
    const parsed = placeOrderPayloadSchema.safeParse({
      ...PANIER,
      lines: lignes(MAX_ORDER_LINES),
    });
    expect(parsed.success).toBe(true);
  });

  it("refuse une ligne de plus", () => {
    const parsed = placeOrderPayloadSchema.safeParse({
      ...PANIER,
      lines: lignes(MAX_ORDER_LINES + 1),
    });
    expect(parsed.success).toBe(false);
  });

  it("refuse toujours un panier vide", () => {
    expect(placeOrderPayloadSchema.safeParse({ ...PANIER, lines: [] }).success).toBe(false);
  });
});

/** La vente au poids (`vente-au-poids.md`, P3) : une ligne dit son unité. */
describe("orderLineInputSchema — l'unité d'une ligne", () => {
  it("garde la borne des pièces, unité dite ou non", () => {
    expect(
      orderLineInputSchema.safeParse({ sku: "VIE-001", quantity: MAX_LINE_QUANTITY + 1 }).success,
    ).toBe(false);
    expect(
      orderLineInputSchema.safeParse({
        sku: "VIE-001",
        quantity: MAX_LINE_QUANTITY + 1,
        saleUnit: "piece",
      }).success,
    ).toBe(false);
  });

  it("laisse passer des grammes au-delà de la borne des pièces, jusqu'à la garde d'une tonne", () => {
    const line = { sku: "SAU-001", saleUnit: "weight" };

    expect(orderLineInputSchema.safeParse({ ...line, quantity: 12_500 }).success).toBe(true);
    expect(
      orderLineInputSchema.safeParse({ ...line, quantity: MAX_LINE_WEIGHT_GRAMS }).success,
    ).toBe(true);
    expect(
      orderLineInputSchema.safeParse({ ...line, quantity: MAX_LINE_WEIGHT_GRAMS + 1 }).success,
    ).toBe(false);
  });

  it("refuse une unité inconnue et un poids décimal — 1,25 kg s'écrit 1250", () => {
    expect(
      orderLineInputSchema.safeParse({ sku: "SAU-001", quantity: 1, saleUnit: "kg" }).success,
    ).toBe(false);
    expect(
      orderLineInputSchema.safeParse({ sku: "SAU-001", quantity: 1.25, saleUnit: "weight" })
        .success,
    ).toBe(false);
  });

  it("lit une ligne sans unité à la pièce", () => {
    expect(saleUnitOfLine({})).toBe("piece");
    expect(saleUnitOfLine({ saleUnit: "weight" })).toBe("weight");
  });
});
