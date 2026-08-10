import type { OrderStatus } from "@lfd/contracts";

import { handoverBlocker, issuesHandoverToken, type HandoverSubject } from "../handover.js";

function subject(overrides: Partial<HandoverSubject> = {}): HandoverSubject {
  return {
    status: "placed",
    fulfillmentMethod: "pickup",
    handedOverAt: null,
    ...overrides,
  };
}

describe("handoverBlocker", () => {
  it("laisse passer un retrait passé mais pas encore remis", () => {
    expect(handoverBlocker(subject())).toBeNull();
  });

  it("laisse passer même à l'état `placed`, avant toute transition d'atelier", () => {
    // La garantie qui compte : aucune transition automatique vers `confirmed`
    // n'existe aujourd'hui. Gater sur `confirmed` fermerait la porte à jamais.
    expect(handoverBlocker(subject({ status: "placed" }))).toBeNull();
  });

  it.each<OrderStatus>(["confirmed", "in_production", "fulfilled"])(
    "laisse passer à l'état %s",
    (status) => {
      expect(handoverBlocker(subject({ status }))).toBeNull();
    },
  );

  it("refuse une commande en livraison — il n'y a pas de comptoir", () => {
    expect(handoverBlocker(subject({ fulfillmentMethod: "delivery" }))).toBe(
      "Cette commande est en livraison — elle ne se remet pas au comptoir.",
    );
  });

  it("refuse une commande annulée", () => {
    expect(handoverBlocker(subject({ status: "cancelled" }))).toBe("Cette commande est annulée.");
  });

  it("refuse un brouillon", () => {
    expect(handoverBlocker(subject({ status: "draft" }))).toBe(
      "Cette commande n'est pas encore passée.",
    );
  });

  it("refuse une seconde remise", () => {
    const blocker = handoverBlocker(subject({ handedOverAt: new Date("2026-08-12T09:14:00Z") }));
    expect(blocker).toBe("Cette commande a déjà été remise.");
  });

  it("annonce le mode avant la remise déjà faite — la cause la plus profonde d'abord", () => {
    // Une livraison marquée remise n'est pas « déjà remise au comptoir » : c'est
    // une commande qui n'aurait jamais dû passer par là. Le message doit le dire.
    const blocker = handoverBlocker(
      subject({ fulfillmentMethod: "delivery", handedOverAt: new Date() }),
    );
    expect(blocker).toContain("livraison");
  });
});

describe("issuesHandoverToken", () => {
  it("n'émet un jeton que pour un retrait", () => {
    expect(issuesHandoverToken("pickup")).toBe(true);
    expect(issuesHandoverToken("delivery")).toBe(false);
  });
});
