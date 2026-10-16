import { PICKUP_CLOSED_FOR_AUDIENCE } from "@lfd/contracts";

import {
  PickupClosedForAudienceError,
  PickupNotConfiguredError,
  PickupNotOfferedToAudienceError,
} from "../order-errors.js";

/**
 * Les refus d'un retrait par clientèle, lus par un client ou par l'équipe sans
 * le code sous les yeux : ils nomment le cas réel et le geste de sortie
 * (2026-10-16 — plus de site par défaut, rien ne garantit qu'il en reste un).
 */
describe("les refus du retrait par clientèle", () => {
  it("renvoie vers un autre point quand il en existe un", () => {
    const error = new PickupClosedForAudienceError("Labo", "b2b");

    expect(error.code).toBe(PICKUP_CLOSED_FOR_AUDIENCE);
    expect(error.message).toBe(
      "Le retrait à « Labo » n'est pas ouvert aux professionnels. Choisissez un autre point de retrait, ou la livraison.",
    );
  });

  it("dit que le retrait n'est pas proposé quand aucun autre site ne l'est", () => {
    const error = new PickupClosedForAudienceError("Labo", "b2c", false);

    expect(error.code).toBe(PICKUP_CLOSED_FOR_AUDIENCE);
    expect(error.message).toContain("Le retrait n'est pas proposé aux particuliers");
    expect(error.message).toContain("« Labo »");
    expect(error.message).not.toContain("un autre point");
    expect(error.message).toContain("Réglages › Sites");
  });

  it("nomme la clientèle sans point choisi, sous le code « non configuré »", () => {
    const error = new PickupNotOfferedToAudienceError("b2b");

    expect(error).toBeInstanceOf(PickupNotConfiguredError);
    expect(error.code).toBe("orders.pickup.not_configured");
    expect(error.message).toMatch(
      /^Le retrait n'est pas proposé aux professionnels : aucun site ne leur est ouvert\. Choisissez la livraison/u,
    );
  });
});
