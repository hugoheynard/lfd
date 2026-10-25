import {
  cancellationSubject,
  ScriptedDesk,
  ScriptedPackingDesk,
} from "../../commands/__tests__/cancellation-doubles.js";
import { OrderWorkshopWithdrawal } from "../order-workshop-withdrawal.js";

/**
 * Retirer une commande des ateliers (plan A1, § 2.1) : le fournil, puis le
 * colisage — et seulement si le fournil l'a retirée APRÈS l'inscription.
 */

const BEFORE_PACKING = { allowance: "before_packing" } as const;

describe("OrderWorkshopWithdrawal", () => {
  it("pas encore inscrite : le fournil seul, le colisage n'a rien à retirer", async () => {
    const trace: string[] = [];
    const packing = new ScriptedPackingDesk("withdrawn", trace);
    const workshops = new OrderWorkshopWithdrawal(new ScriptedDesk("withdrawn", trace), packing);

    const after = await workshops.withdraw(cancellationSubject(), BEFORE_PACKING, {
      kind: "staff",
      staffUserId: "fiche-marie",
    });

    expect(after).toBe(false);
    expect(trace).toEqual(["withdraw:2026-10-13:ord_1"]);
    expect(packing.calls).toEqual([]);
  });

  it("un invité annule : c'est lui, l'auteur recopié sur les contenants", async () => {
    const packing = new ScriptedPackingDesk();
    const workshops = new OrderWorkshopWithdrawal(
      new ScriptedDesk("withdrawn_after_inscription"),
      packing,
    );

    const after = await workshops.withdraw(cancellationSubject(), BEFORE_PACKING, {
      kind: "guest",
      userId: "usr_invite",
    });

    // Lot A1.3 : le fait `order.cancelled` dira `afterInscription`.
    expect(after).toBe(true);
    expect(packing.calls).toEqual([{ day: "2026-10-13", orderId: "ord_1", by: "usr_invite" }]);
  });

  it("sans jour de service : aucun atelier n'est appelé", async () => {
    const trace: string[] = [];
    const workshops = new OrderWorkshopWithdrawal(
      new ScriptedDesk("withdrawn", trace),
      new ScriptedPackingDesk("withdrawn", trace),
    );

    await workshops.withdraw(cancellationSubject({ serviceDay: null }), BEFORE_PACKING, {
      kind: "customer",
      userId: "usr_1",
    });

    expect(trace).toEqual([]);
  });
});
