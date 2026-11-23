import { describe, expect, it } from "@jest/globals";

import {
  adminOrderEstimatePayloadSchema,
  adminPlaceOrderPayloadSchema,
  hasWindowWhenPickedUp,
  ORDER_OFFER_NATURES,
  ORDER_OFFER_NOTE_MAX_LENGTH,
  orderOfferNatureLabel,
  orderOfferNatureSchema,
} from "../admin-order.js";

/**
 * **Le créneau de retrait, exigé par le contrat** — la porte posée le
 * 2026-09-11.
 *
 * Jusque-là l'écran de saisie staff n'envoyait aucune tranche, et un retrait ne
 * prend AUCUN défaut d'heure : le champ était donc silencieusement facultatif,
 * et toute commande prise au téléphone arrivait au comptoir sans créneau. Elle
 * n'avait alors aucun rang dans la file, personne ne savait quand attendre le
 * client, et rien ne pouvait être en retard. Un retard, lui, se gère.
 */
describe("hasWindowWhenPickedUp", () => {
  it("accepte un retrait qui porte sa tranche", () => {
    expect(
      hasWindowWhenPickedUp({
        fulfillmentMethod: "pickup",
        requestedWindow: { start: "07:00", end: "08:00" },
      }),
    ).toBe(true);
  });

  it("🔴 refuse un retrait sans tranche — absente comme explicitement nulle", () => {
    // Les deux disaient la même chose au serveur, faute de défaut à reprendre :
    // « pas d'heure ». Elles doivent donc tomber par le même chemin.
    expect(hasWindowWhenPickedUp({ fulfillmentMethod: "pickup" })).toBe(false);
    expect(hasWindowWhenPickedUp({ fulfillmentMethod: "pickup", requestedWindow: null })).toBe(
      false,
    );
  });

  it("🔴 n'exige RIEN en coursier", () => {
    // La fenêtre légitime d'une livraison est celle du CARNET, que le serveur
    // lit à partir de l'adresse. L'exiger dans la charge utile ferait écraser
    // par l'écran ce que le compte a déclaré.
    expect(hasWindowWhenPickedUp({ fulfillmentMethod: "delivery" })).toBe(true);
    expect(hasWindowWhenPickedUp({ fulfillmentMethod: "delivery", requestedWindow: null })).toBe(
      true,
    );
  });
});

describe("adminPlaceOrderPayloadSchema", () => {
  const base = {
    companyId: "cmp_1",
    expectedTotalCents: 4230,
    buyerUserId: "usr_1",
    settlement: "link" as const,
    requestedDeliveryDate: "2026-09-12",
    fulfillmentMethod: "pickup" as const,
    pickupAddressId: "pick_1",
    lines: [{ sku: "VIE-001", quantity: 12 }],
  };

  it("laisse passer un retrait avec sa tranche", () => {
    expect(
      adminPlaceOrderPayloadSchema.safeParse({
        ...base,
        requestedWindow: { start: "07:00", end: "08:00" },
      }).success,
    ).toBe(true);
  });

  /** Plan total vu, T3 : obligatoire à la passation, absent de l'estimation. */
  it("refuse une passation sans total vu, que l'estimation, elle, n'exige pas", () => {
    const unseen: Partial<typeof base> = { ...base };
    delete unseen.expectedTotalCents;
    const window = { requestedWindow: { start: "07:00", end: "08:00" } };
    const refused = adminPlaceOrderPayloadSchema.safeParse({ ...unseen, ...window });

    expect(refused.success).toBe(false);
    expect(refused.error?.issues[0]?.path).toEqual(["expectedTotalCents"]);
    expect(adminOrderEstimatePayloadSchema.safeParse({ ...unseen, ...window }).success).toBe(true);
  });

  it("🔴 refuse un retrait sans tranche, et nomme le GESTE", () => {
    // Le message est lu par du personnel qui n'a pas le code sous les yeux : il
    // dit quoi faire, pas quel champ manque (CLAUDE.md §0).
    const refused = adminPlaceOrderPayloadSchema.safeParse(base);

    expect(refused.success).toBe(false);
    expect(refused.error?.issues[0]?.message).toContain("créneau de retrait");
    expect(refused.error?.issues[0]?.path).toEqual(["requestedWindow"]);
  });
});

/** La commande offerte (plan `plan-commande-offerte.md`, O0) : le motif suit le règlement. */
describe("la commande offerte au contrat", () => {
  const base = {
    companyId: "cmp_1",
    expectedTotalCents: 0,
    buyerUserId: "usr_1",
    requestedDeliveryDate: "2026-09-12",
    fulfillmentMethod: "pickup" as const,
    pickupAddressId: "pick_1",
    requestedWindow: { start: "07:00", end: "08:00" },
    lines: [{ sku: "VIE-001", quantity: 12 }],
  };
  const offer = { nature: "tasting" as const, note: "Dégustation mariage Dupont" };

  it("accepte une commande offerte qui porte son motif, à la passation comme à l'estimation", () => {
    const payload = { ...base, settlement: "offered" as const, offer };
    expect(adminPlaceOrderPayloadSchema.safeParse(payload).success).toBe(true);
    expect(adminOrderEstimatePayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("🔴 refuse une commande offerte sans motif", () => {
    const refused = adminPlaceOrderPayloadSchema.safeParse({ ...base, settlement: "offered" });
    expect(refused.success).toBe(false);
    expect(refused.error?.issues.some((issue) => issue.path[0] === "offer")).toBe(true);
  });

  it("🔴 refuse un motif sur une commande qui n'est pas offerte", () => {
    expect(
      adminPlaceOrderPayloadSchema.safeParse({ ...base, settlement: "link", offer }).success,
    ).toBe(false);
    expect(
      adminOrderEstimatePayloadSchema.safeParse({ ...base, settlement: "account", offer }).success,
    ).toBe(false);
  });

  it("refuse un motif vide, une nature hors registre, un texte trop long", () => {
    const parse = (o: unknown) =>
      adminPlaceOrderPayloadSchema.safeParse({ ...base, settlement: "offered", offer: o }).success;
    expect(parse({ nature: "tasting", note: "   " })).toBe(false);
    expect(parse({ nature: "gift", note: "x" })).toBe(false);
    expect(parse({ nature: "tasting", note: "x".repeat(ORDER_OFFER_NOTE_MAX_LENGTH + 1) })).toBe(
      false,
    );
    expect(parse({ nature: "tasting", note: "x".repeat(ORDER_OFFER_NOTE_MAX_LENGTH) })).toBe(true);
  });

  it("le registre donne un libellé à chaque nature, dans l'ordre du schéma", () => {
    expect(ORDER_OFFER_NATURES.map((n) => n.key)).toEqual(orderOfferNatureSchema.options);
    expect(ORDER_OFFER_NATURES.every((n) => n.label.length > 0)).toBe(true);
    expect(orderOfferNatureLabel("event")).toBe("Événement");
  });
});
