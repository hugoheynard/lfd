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

  it("laisse passer une LIVRAISON — le coursier scanne le code du destinataire", () => {
    // 🔴 Ce cas affirmait le contraire jusqu'au 2026-09-07 : « refuse une
    // commande en livraison — il n'y a pas de comptoir ». C'était cohérent tant
    // qu'une livraison n'avait aucun chemin vers `fulfilled` — elle restait
    // `placed` pour toujours, livrée ou non. La symétrie est désormais exacte :
    // le destinataire montre le code de son courriel, le coursier scanne.
    expect(handoverBlocker(subject({ fulfillmentMethod: "delivery" }))).toBeNull();
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

  it("refuse une seconde remise, en LIVRAISON comme en retrait", () => {
    // L'ancien cas attendait ici un message sur le mode d'acheminement — « une
    // commande qui n'aurait jamais dû passer par là ». Elle a désormais le droit
    // d'y passer ; ce qui reste refusé est de la remettre deux fois.
    const blocker = handoverBlocker(
      subject({ fulfillmentMethod: "delivery", handedOverAt: new Date() }),
    );
    expect(blocker).toBe("Cette commande a déjà été remise.");
  });
});

describe("issuesHandoverToken", () => {
  it("émet un jeton pour TOUTE commande, quel que soit l'acheminement", () => {
    // La fonction a perdu son paramètre le 2026-09-07 : elle ne dépend plus de
    // l'acheminement, et le lui passer laisserait croire qu'il pèse. Elle reste
    // parce qu'elle NOMME la décision — un `secrets.next()` posé sans elle
    // serait un choix qu'aucun lecteur ne pourrait retrouver.
    expect(issuesHandoverToken()).toBe(true);
  });
});
