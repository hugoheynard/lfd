import {
  MAX_LINE_QUANTITY,
  MAX_ORDER_LINES,
  orderLineInputSchema,
  orderQuotePayloadSchema,
  placeOrderPayloadSchema,
} from "../index.js";
import { shopQuoteLineSchema } from "../shop-quote.js";

/** Un panier valide, dont ces cas ne font varier que les lignes. */
const PANIER = {
  companyId: null,
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
   * Les quatre portes partagent UNE définition. Une borne qui n'existerait qu'à
   * la caisse laisserait chiffrer un panier qu'on refuserait ensuite ; une borne
   * qui n'existerait qu'au devis laisserait entrer par la caisse ce qu'on avait
   * interdit d'estimer.
   */
  it("vaut pour la commande, le devis ET la boutique", () => {
    const trop = ligne(MAX_LINE_QUANTITY + 1);
    expect(shopQuoteLineSchema.safeParse(trop).success).toBe(false);
    expect(orderQuotePayloadSchema.safeParse({ companyId: null, lines: [trop] }).success).toBe(
      false,
    );
    expect(placeOrderPayloadSchema.safeParse({ ...PANIER, lines: [trop] }).success).toBe(false);
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
