import { OrderAbandonNotAuthorError } from "../../errors/order-abandon-errors.js";
import { abandonStanding, ensureOrderAuthor } from "../order-abandon.js";

describe("abandonStanding — l'abandon lu sur l'état de la commande", () => {
  it("abandonne une commande passée dont le règlement attend", () => {
    expect(abandonStanding("placed", "pending")).toBe("abandon");
  });

  it("abandonne aussi une commande pro dont la carte a été refusée : son intention vit encore", () => {
    expect(abandonStanding("placed", "failed")).toBe("abandon");
  });

  it("répond « déjà abandonnée » au second clic, quel que soit le règlement", () => {
    expect(abandonStanding("cancelled", "failed")).toBe("already_abandoned");
    expect(abandonStanding("cancelled", "pending")).toBe("already_abandoned");
  });

  it("refuse une commande encaissée, ou remboursée", () => {
    expect(abandonStanding("placed", "paid")).toBe("already_paid");
    expect(abandonStanding("confirmed", "refunded")).toBe("already_paid");
  });

  it("refuse une commande portée au compte : il n'y a pas de carte à abandonner", () => {
    expect(abandonStanding("placed", "not_required")).toBe("nothing_to_settle");
  });

  it("refuse une commande déjà entrée en production", () => {
    expect(abandonStanding("confirmed", "pending")).toBe("already_in_production");
    expect(abandonStanding("ready", "failed")).toBe("already_in_production");
  });
});

describe("ensureOrderAuthor — seul l'auteur abandonne (Q2)", () => {
  it("laisse passer l'auteur", () => {
    expect(() => ensureOrderAuthor({ placedByUserId: "u1" }, "u1", "order_1")).not.toThrow();
  });

  it("refuse un autre membre, en le disant (403) plutôt qu'en cachant la commande", () => {
    expect(() => ensureOrderAuthor({ placedByUserId: "u1" }, "u2", "order_1")).toThrow(
      OrderAbandonNotAuthorError,
    );
  });
});
