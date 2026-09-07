import { handoverBlocker, type HandoverCandidate } from "../handover.js";

/**
 * La règle de remise, éprouvée là où elle vit maintenant.
 *
 * 🔴 Ces cas viennent de `b2b/orders/domain/services/__tests__/handover.spec.ts`
 * et ont suivi la règle au fournil le 2026-09-07. Deux d'entre eux ont disparu
 * au passage, et c'est délibéré : ils portaient sur `fulfillmentMethod`, que la
 * règle ne reçoit plus. Un test qui prouve qu'un champ absent ne pèse pas
 * prouve seulement qu'on a oublié de le retirer.
 */

function candidate(overrides: Partial<HandoverCandidate> = {}): HandoverCandidate {
  return { status: "ready", handedOverAt: null, ...overrides };
}

describe("handoverBlocker", () => {
  it("laisse passer une commande prête", () => {
    expect(handoverBlocker(candidate())).toBeNull();
  });

  it("laisse passer une commande encore `placed`", () => {
    // Le cœur de la règle : refuser ici renverrait un client physiquement
    // présent, colis prêt, parce qu'un écran d'atelier n'a pas été cliqué.
    expect(handoverBlocker(candidate({ status: "placed" }))).toBeNull();
  });

  it("laisse passer tous les états d'avancement, sans en énumérer aucun", () => {
    for (const status of ["placed", "confirmed", "ready"] as const) {
      expect(handoverBlocker(candidate({ status }))).toBeNull();
    }
  });

  it("refuse une commande annulée, et le DIT", () => {
    expect(handoverBlocker(candidate({ status: "cancelled" }))).toBe("Cette commande est annulée.");
  });

  it("refuse une commande en brouillon", () => {
    expect(handoverBlocker(candidate({ status: "draft" }))).toBe(
      "Cette commande n'est pas encore passée.",
    );
  });

  it("refuse une commande DÉJÀ remise", () => {
    // L'instant vient de la table du fournil : c'est lui qui détient ce fait
    // depuis qu'il le constate.
    const blocker = handoverBlocker(candidate({ handedOverAt: new Date() }));
    expect(blocker).toBe("Cette commande a déjà été remise.");
  });

  it("refuse l'annulation AVANT de constater la remise déjà faite", () => {
    // Deux empêchements à la fois : c'est l'annulation qu'on nomme, parce que
    // c'est celle qui explique la situation à la personne en face.
    const blocker = handoverBlocker(candidate({ status: "cancelled", handedOverAt: new Date() }));
    expect(blocker).toBe("Cette commande est annulée.");
  });
});
