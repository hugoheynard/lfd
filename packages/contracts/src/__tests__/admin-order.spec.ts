import { describe, expect, it } from "@jest/globals";

import { adminPlaceOrderPayloadSchema, hasWindowWhenPickedUp } from "../admin-order.js";

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

  it("🔴 refuse un retrait sans tranche, et nomme le GESTE", () => {
    // Le message est lu par du personnel qui n'a pas le code sous les yeux : il
    // dit quoi faire, pas quel champ manque (CLAUDE.md §0).
    const refused = adminPlaceOrderPayloadSchema.safeParse(base);

    expect(refused.success).toBe(false);
    expect(refused.error?.issues[0]?.message).toContain("créneau de retrait");
    expect(refused.error?.issues[0]?.path).toEqual(["requestedWindow"]);
  });
});
