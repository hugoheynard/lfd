import { OrderOpeningExemption } from "../../../../order-opening/domain/order-opening-exemption.js";
import { OrdersClosedForAudienceError } from "../../../domain/errors/orders-closed-for-audience.error.js";
import { intakeAt } from "../../commands/__tests__/intake-doubles.js";

const STAMP = { at: new Date(0), author: { staffUserId: "s1", name: "Colette", role: "admin" } };
const BUYER = { userId: "u1" };
const GUEST = { email: "camille@visiteur.fr" };

/** Le réglage « Ouverture de la boutique » appliqué à la clientèle de qui commande (2026-10-09). */
describe("OrderIntake.ensureOpenFor", () => {
  it("laisse passer tout le monde tant que personne n'a rien fermé", async () => {
    await expect(intakeAt().ensureOpenFor("c1", BUYER)).resolves.toBeUndefined();
    await expect(intakeAt().ensureOpenFor(null, GUEST)).resolves.toBeUndefined();
  });

  it("refuse une société active quand la boutique est fermée aux pros, en le nommant", async () => {
    const intake = intakeAt({ ordersOpenToB2b: false, ordersOpenToB2c: true }, "active");

    await expect(intake.ensureOpenFor("c1", BUYER)).rejects.toThrow(
      "La boutique ne prend pas de commandes des pros pour le moment",
    );
    await expect(intake.ensureOpenFor(null, BUYER)).resolves.toBeUndefined();
  });

  /** `audienceOf` : une société en attente de validation commande en particulier. */
  it("traite une société non validée en particulier", async () => {
    const intake = intakeAt({ ordersOpenToB2b: false, ordersOpenToB2c: true }, "pending");

    await expect(intake.ensureOpenFor("c1", BUYER)).resolves.toBeUndefined();
  });

  it("refuse un particulier quand la boutique leur est fermée", async () => {
    const intake = intakeAt({ ordersOpenToB2b: true, ordersOpenToB2c: false });

    await expect(intake.ensureOpenFor(null, GUEST)).rejects.toBeInstanceOf(
      OrdersClosedForAudienceError,
    );
    await expect(intake.ensureOpenFor("c1", BUYER)).resolves.toBeUndefined();
  });
});

/** Les exemptions à la fermeture (décision de Hugo du 2026-10-26). */
describe("OrderIntake.ensureOpenFor — exemptions", () => {
  const closedToAll = { ordersOpenToB2b: false, ordersOpenToB2c: false };

  it("laisse passer la société exemptée, et elle seule", async () => {
    const exempt = OrderOpeningExemption.grantToCompany({
      id: "x1",
      companyId: "c1",
      company: { name: "Chez Paul", status: "active" },
      active: [],
      stamp: STAMP,
    });
    const intake = intakeAt(closedToAll, "active", [exempt]);

    await expect(intake.ensureOpenFor("c1", BUYER)).resolves.toBeUndefined();
    await expect(intake.ensureOpenFor("c2", BUYER)).rejects.toBeInstanceOf(
      OrdersClosedForAudienceError,
    );
  });

  it("lit l'adresse de la personne connectée et la compare sans la casse", async () => {
    const exempt = OrderOpeningExemption.grantToEmail({
      id: "x1",
      email: "jean@folie.fr",
      active: [],
      stamp: STAMP,
    });
    const intake = intakeAt(closedToAll, "active", [exempt], { u1: "Jean@Folie.FR" });

    await expect(intake.ensureOpenFor(null, BUYER)).resolves.toBeUndefined();
    await expect(intake.ensureOpenFor(null, { userId: "inconnu" })).rejects.toBeInstanceOf(
      OrdersClosedForAudienceError,
    );
  });

  it("laisse passer la commande sans compte dont l'adresse est exemptée", async () => {
    const exempt = OrderOpeningExemption.grantToEmail({
      id: "x1",
      email: GUEST.email,
      active: [],
      stamp: STAMP,
    });
    const intake = intakeAt(closedToAll, "active", [exempt]);

    await expect(intake.ensureOpenFor(null, GUEST)).resolves.toBeUndefined();
  });
});
