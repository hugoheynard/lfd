import { OrdersClosedForAudienceError } from "../../../domain/errors/orders-closed-for-audience.error.js";
import { intakeAt } from "../../commands/__tests__/intake-doubles.js";

/** Le réglage « Ouverture de la boutique » appliqué à la clientèle de qui commande (2026-10-09). */
describe("OrderIntake.ensureOpenFor", () => {
  it("laisse passer tout le monde tant que personne n'a rien fermé", async () => {
    await expect(intakeAt().ensureOpenFor("c1")).resolves.toBeUndefined();
    await expect(intakeAt().ensureOpenFor(null)).resolves.toBeUndefined();
  });

  it("refuse une société active quand la boutique est fermée aux pros, en le nommant", async () => {
    const intake = intakeAt({ ordersOpenToB2b: false, ordersOpenToB2c: true }, "active");

    await expect(intake.ensureOpenFor("c1")).rejects.toThrow(
      "La boutique ne prend pas de commandes des pros pour le moment",
    );
    await expect(intake.ensureOpenFor(null)).resolves.toBeUndefined();
  });

  /** `audienceOf` : une société en attente de validation commande en particulier. */
  it("traite une société non validée en particulier", async () => {
    const intake = intakeAt({ ordersOpenToB2b: false, ordersOpenToB2c: true }, "pending");

    await expect(intake.ensureOpenFor("c1")).resolves.toBeUndefined();
  });

  it("refuse un particulier quand la boutique leur est fermée", async () => {
    const intake = intakeAt({ ordersOpenToB2b: true, ordersOpenToB2c: false });

    await expect(intake.ensureOpenFor(null)).rejects.toBeInstanceOf(OrdersClosedForAudienceError);
    await expect(intake.ensureOpenFor("c1")).resolves.toBeUndefined();
  });
});
