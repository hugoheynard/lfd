import type { BillingAddressPayload } from "@lfd/contracts";

import {
  EmptyOrderError,
  InvalidOrderFulfillmentError,
  InvalidOrderPaymentError,
} from "../../errors/order-errors.js";
import type { OrderLineInput } from "../../value-objects/order-line.js";
import { Order, type DraftOrderInput } from "../order.js";
import { millicentsFromCents } from "@lfd/money";

const ADDRESS: BillingAddressPayload = {
  label: "",
  ligne1: "1 rue du Test",
  ligne2: "",
  codePostal: "73000",
  ville: "Chambéry",
  pays: "France",
};

/**
 * Le prix se donne en **centimes** — un tarif s'écrit comme on le prononce — et
 * entre dans la ligne en millicentimes, l'unité des prix unitaires. Les totaux
 * attendus plus bas restent donc des centimes, ce qu'ils sont.
 */
const food = (qty: number, priceCents = 200, rate = 5.5): OrderLineInput => ({
  sku: "VIE-001",
  productName: "Croissant",
  unitPriceMillicents: millicentsFromCents(priceCents),
  vatRate: rate,
  quantity: qty,
});

function draftInput(over: Partial<DraftOrderInput> = {}): DraftOrderInput {
  return {
    companyId: null,
    placedByStaffId: null,
    // L'acheminement CONVENU, figé à la commande : ici, le défaut du point.
    agreed: {
      window: { value: null, source: "default" },
      contact: { value: null, source: "default" },
      signatureRequired: { value: false, source: "default" },
    },
    placedByUserId: "user_1",
    fulfillment: {
      method: "pickup",
      deliveryZoneId: null,
      deliveryAddress: null,
      pickupAddress: ADDRESS,
    },
    requestedDeliveryDate: null,
    note: "",
    // Aucune version posée : le cas de toutes les commandes antérieures à la
    // première validation, et le seul défaut honnête — « on ne sait pas ».
    catalogVersionId: null,
    lines: [food(2)],
    discountCents: 0,
    discountAdjustment: null,
    deliveryFeeCents: 0,
    deliveryFeeAdjustment: null,
    lateFeeCents: 0,
    lateFeeAdjustment: null,
    ...over,
  };
}

/** Compose puis règle en différé (le chemin le plus court vers `toPersistence`). */
function deferred(over: Partial<DraftOrderInput> = {}): ReturnType<Order["toPersistence"]> {
  const order = Order.draft(draftInput(over));
  order.deferPayment();
  return order.toPersistence();
}

describe("Order.draft — calcul monétaire", () => {
  it("calcule sous-total, TVA par taux et total TTC", () => {
    // 3 × 200 = 600 HT ; TVA 5,5 % = round(600 × 0,055) = 33 ; total = 633.
    const state = deferred({ lines: [food(3)] });
    expect(state.subtotalCents).toBe(600);
    expect(state.vatCents).toBe(33);
    expect(state.totalCents).toBe(633);
    expect(state.lines).toEqual([
      {
        sku: "VIE-001",
        productName: "Croissant",
        unitPriceMillicents: 200_000,
        vatRate: 5.5,
        quantity: 3,
        lineTotalCents: 600,
        // Ligne fabriquée à la main : sans résolution, il n'y a rien à tracer.
        pricing: null,
        allergens: null,
      },
    ]);
  });

  it("déduit la remise avant la TVA et le total", () => {
    // 400 HT, taux 0, remise 80 → total = max(0, 400 − 80) = 320.
    const state = deferred({ lines: [food(2, 200, 0)], discountCents: 80 });
    expect(state.subtotalCents).toBe(400);
    expect(state.discountCents).toBe(80);
    expect(state.totalCents).toBe(320);
  });

  it("ajoute le frais de livraison et sa TVA (20 %)", () => {
    // 400 HT (taux 0) + frais 2000 → TVA livraison = 400 ; total = 400 + 2000 + 400 = 2800.
    const state = deferred({
      lines: [food(2, 200, 0)],
      // Le barème qui les produit, exigé depuis le 2026-09-09 : des frais sans
      // origine ne se relisent pas sur une facture.
      deliveryFeeAdjustment: { mode: "amount", cents: 2_000 },
      fulfillment: {
        method: "delivery",
        deliveryZoneId: "z1",
        deliveryAddress: ADDRESS,
        pickupAddress: null,
      },
      deliveryFeeCents: 2000,
      lateFeeCents: 0,
      lateFeeAdjustment: null,
    });
    expect(state.deliveryFeeCents).toBe(2000);
    expect(state.vatCents).toBe(400);
    expect(state.totalCents).toBe(2800);
  });

  it("refuse une commande sans ligne", () => {
    expect(() => Order.draft(draftInput({ lines: [] }))).toThrow(EmptyOrderError);
  });

  it("refuse une remise ou un frais négatif", () => {
    expect(() => Order.draft(draftInput({ discountCents: -1 }))).toThrow(InvalidOrderPaymentError);
    expect(() => Order.draft(draftInput({ deliveryFeeCents: -1 }))).toThrow(
      InvalidOrderPaymentError,
    );
  });

  it("fige l'ajustement qui a produit la remise", () => {
    // 400 HT, -20 % → 80. Le taux part en persistance À CÔTÉ du montant : c'est
    // lui qui permettra d'écrire « Retrait −20 % » et pas juste « Remise 0,80 € ».
    const state = deferred({
      lines: [food(2, 200, 0)],
      discountCents: 80,
      discountAdjustment: { mode: "percent", bp: 2000 },
    });

    expect(state.discountAdjustment).toEqual({ mode: "percent", bp: 2000 });
  });

  it("refuse un ajustement qui NE REPRODUIT PAS le montant retenu", () => {
    // Sans ce refus, une commande porterait « −20 % » à côté d'une remise de
    // 0,12 € : le libellé et le chiffre se contrediraient sur la facture.
    expect(() =>
      Order.draft(
        draftInput({
          lines: [food(2, 200, 0)],
          discountCents: 12,
          discountAdjustment: { mode: "percent", bp: 2000 },
        }),
      ),
    ).toThrow(InvalidOrderPaymentError);
  });

  /**
   * 🔴 **Le barème de zone est figé avec ses frais** (défaut R5, corrigé le
   * 2026-09-09).
   *
   * C'était le dernier terme du panier à n'avoir que son montant, alors que
   * `delivery_zones.fee_value` est **mutable** : une facture émise dans six mois
   * aurait chiffré « Livraison 20,00 € » sans jamais pouvoir dire « Val d'Isère,
   * 20 € forfaitaires », ni prouver que ce forfait était celui du jour.
   */
  it("🔴 fige le barème de zone qui a produit les frais", () => {
    const state = deferred({
      lines: [food(2, 200, 0)],
      deliveryFeeCents: 2_000,
      deliveryFeeAdjustment: { mode: "amount", cents: 2_000 },
    });

    expect(state.deliveryFeeAdjustment).toEqual({ mode: "amount", cents: 2_000 });
  });

  it("refuse des frais de zone que leur barème ne reproduit pas", () => {
    expect(() =>
      Order.draft(
        draftInput({
          lines: [food(2, 200, 0)],
          deliveryFeeCents: 2_000,
          deliveryFeeAdjustment: { mode: "amount", cents: 1_500 },
        }),
      ),
    ).toThrow(InvalidOrderPaymentError);
  });

  it("refuse des frais de zone sans barème qui les justifie", () => {
    expect(() =>
      Order.draft(draftInput({ lines: [food(2, 200, 0)], deliveryFeeCents: 2_000 })),
    ).toThrow(InvalidOrderPaymentError);
  });

  /**
   * ⚠️ **Des frais ne sont PAS bornés par le panier**, à la différence d'une
   * remise : une course peut coûter plus cher qu'un petit panier. La garde
   * compare donc par `cartAdjustmentCents`, et ce cas le tient — il échouerait
   * si quelqu'un recopiait `discountCentsOf` par symétrie.
   */
  it("accepte des frais plus élevés que le panier", () => {
    const state = deferred({
      lines: [food(1, 200, 0)],
      deliveryFeeCents: 2_000,
      deliveryFeeAdjustment: { mode: "amount", cents: 2_000 },
    });

    expect(state.deliveryFeeCents).toBe(2_000);
  });

  /** Un RETRAIT n'a pas de frais : lui exiger un barème serait exiger la trace d'un geste absent. */
  it("laisse un retrait sans barème de zone", () => {
    expect(deferred({ lines: [food(2, 200, 0)] }).deliveryFeeAdjustment).toBeNull();
  });

  it("accepte une remise en euros fixes, elle aussi vérifiée", () => {
    const state = deferred({
      lines: [food(2, 200, 0)],
      discountCents: 150,
      discountAdjustment: { mode: "amount", cents: 150 },
    });

    expect(state.discountAdjustment).toEqual({ mode: "amount", cents: 150 });
  });

  /**
   * 🔴 **Régression : une remise fixe supérieure au panier s'enregistrait
   * telle quelle.**
   *
   * 50 € de remise sur 4 € de marchandise donnaient une commande portant
   * `subtotal = 400`, `discount = 5000` et `total = 0`. La ligne ne
   * s'additionnait pas, et elle contredisait le devis de la boutique — que
   * `ventilateVat` bornait déjà de son côté : le client voyait −4 €, la
   * commande gardait −50 €.
   *
   * La borne est posée à la source (`CartAdjustments`) ; l'agrégat la
   * REDEMANDE, parce qu'il ne fait confiance à aucun appelant.
   */
  it("BORNE une remise fixe plus grande que le panier", () => {
    const state = deferred({
      lines: [food(2, 200, 0)],
      discountCents: 400,
      discountAdjustment: { mode: "amount", cents: 5000 },
    });

    expect(state.subtotalCents).toBe(400);
    expect(state.discountCents).toBe(400);
    expect(state.totalCents).toBe(0);
    // L'ajustement reste celui du point, non borné : c'est le RÉGLAGE qui a
    // produit la remise, pas la remise. Ce que la facture additionne est
    // `discountCents`, et lui tient dans le panier.
    expect(state.discountAdjustment).toEqual({ mode: "amount", cents: 5000 });
  });

  it("refuse une remise fixe annoncée AU-DELÀ de la borne", () => {
    // L'appelant qui n'a pas borné se fait refuser, plutôt que d'écrire une
    // ligne qui ne s'additionne pas.
    expect(() =>
      Order.draft(
        draftInput({
          lines: [food(2, 200, 0)],
          discountCents: 5000,
          discountAdjustment: { mode: "amount", cents: 5000 },
        }),
      ),
    ).toThrow(InvalidOrderPaymentError);
  });
});

describe("Order.draft — acheminement", () => {
  it("retrait : garde le point, coupe zone et adresse de livraison", () => {
    const state = deferred();
    expect(state.fulfillmentMethod).toBe("pickup");
    expect(state.pickupAddress).toEqual(ADDRESS);
    expect(state.deliveryZoneId).toBeNull();
    expect(state.deliveryAddress).toBeNull();
  });

  it("retrait sans point : refus", () => {
    expect(() =>
      Order.draft(
        draftInput({
          fulfillment: {
            method: "pickup",
            deliveryZoneId: null,
            deliveryAddress: null,
            pickupAddress: null,
          },
        }),
      ),
    ).toThrow(InvalidOrderFulfillmentError);
  });

  it("coursier : garde zone + adresse, coupe le point ; refuse si l'un manque", () => {
    const state = deferred({
      lines: [food(2, 200, 0)],
      fulfillment: {
        method: "delivery",
        deliveryZoneId: "z1",
        deliveryAddress: ADDRESS,
        pickupAddress: ADDRESS,
      },
    });
    expect(state.deliveryZoneId).toBe("z1");
    expect(state.deliveryAddress).toEqual(ADDRESS);
    expect(state.pickupAddress).toBeNull();

    expect(() =>
      Order.draft(
        draftInput({
          fulfillment: {
            method: "delivery",
            deliveryZoneId: "z1",
            deliveryAddress: null,
            pickupAddress: null,
          },
        }),
      ),
    ).toThrow(InvalidOrderFulfillmentError);
  });
});

describe("Order — la version du catalogue", () => {
  /**
   * L'agrégat **porte** l'estampille sans jamais la relire : elle répond à
   * « d'où venaient ces articles », et rien dans le calcul monétaire n'en
   * dépend. Ce cas tient donc une seule chose — qu'elle traverse.
   */
  it("reporte la version reçue jusqu’à la persistance", () => {
    expect(deferred({ catalogVersionId: "cver_7" })).toMatchObject({
      catalogVersionId: "cver_7",
    });
  });

  /**
   * 🔴 `null` est une RÉPONSE — « on ne sait pas » —, pas un trou à combler.
   * Toute commande passée avant la première validation en est là, et fabriquer
   * une version par défaut inventerait une provenance.
   */
  it("garde `null` quand aucune version n’a encore été posée", () => {
    expect(deferred({ catalogVersionId: null })).toMatchObject({ catalogVersionId: null });
  });
});

describe("Order — règlement", () => {
  it("différé : not_required, sans intention", () => {
    const state = deferred();
    expect(state.paymentStatus).toBe("not_required");
    expect(state.stripePaymentIntentId).toBeNull();
  });

  it("carte : pending + intention rattachée", () => {
    const order = Order.draft(draftInput());
    order.payByCard("pi_123");
    const state = order.toPersistence();
    expect(state.paymentStatus).toBe("pending");
    expect(state.stripePaymentIntentId).toBe("pi_123");
  });

  it("refuse une carte sur un total nul", () => {
    const order = Order.draft(draftInput({ lines: [food(1, 0, 0)] }));
    expect(order.totalCents).toBe(0);
    expect(() => order.payByCard("pi_123")).toThrow(InvalidOrderPaymentError);
  });

  it("refuse de persister une commande au règlement non décidé", () => {
    const order = Order.draft(draftInput());
    expect(() => order.toPersistence()).toThrow(InvalidOrderPaymentError);
  });
});
