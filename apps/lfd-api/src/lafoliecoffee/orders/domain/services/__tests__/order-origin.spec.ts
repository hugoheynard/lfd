import { orderEntryOriginOf, orderOriginOf } from "../order-origin.js";

describe("orderOriginOf — par quelle porte la commande est entrée", () => {
  it("aucune marque ⇒ le client a commandé lui-même", () => {
    expect(orderOriginOf({ placedByStaffId: null, fromSubscriptionId: null })).toBe("self_service");
  });

  it("un abonnement ⇒ panier récurrent", () => {
    expect(orderOriginOf({ placedByStaffId: null, fromSubscriptionId: "sub_1" })).toBe("recurring");
  });

  it("un membre de l'équipe ⇒ saisie au back-office", () => {
    expect(orderOriginOf({ placedByStaffId: "staff_1", fromSubscriptionId: null })).toBe(
      "back_office",
    );
  });

  it("les deux ⇒ la saisie humaine l'emporte, et c'est un choix", () => {
    // Le cas n'existe pas encore (le planificateur ne passe pas par le
    // back-office). Le test grave l'arbitrage pour qu'il ne soit pas rendu par
    // l'ordre des `if` le jour où il se présentera.
    expect(orderOriginOf({ placedByStaffId: "staff_1", fromSubscriptionId: "sub_1" })).toBe(
      "back_office",
    );
  });
});

describe("orderEntryOriginOf — d'où vient une saisie, pour le back-office", () => {
  it("l'origine gardée l'emporte", () => {
    expect(orderEntryOriginOf({ entryOrigin: "counter", entryShortcut: null })).toBe("counter");
    expect(orderEntryOriginOf({ entryOrigin: "commercial", entryShortcut: null })).toBe(
      "commercial",
    );
  });

  it("un « Retrait immédiat » sans origine se lit au comptoir", () => {
    expect(orderEntryOriginOf({ entryOrigin: null, entryShortcut: "immediate_pickup" })).toBe(
      "counter",
    );
  });

  it("sans marque, on ne sait pas : rien n'est inventé", () => {
    expect(orderEntryOriginOf({ entryOrigin: null, entryShortcut: null })).toBeNull();
  });
});
