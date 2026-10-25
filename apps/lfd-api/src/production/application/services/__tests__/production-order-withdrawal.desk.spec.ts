import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { RecordingDayLock } from "../../__tests__/batch-doubles.js";
import {
  FixedInscriptions,
  InMemoryWithdrawalLedger,
  InMemoryWithdrawals,
} from "../../__tests__/withdrawal-doubles.js";
import { ProductionOrderWithdrawalDesk } from "../production-order-withdrawal.desk.js";

/**
 * Le guichet du retrait (doc `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.4) :
 * verrou de la journée, PUIS inscription, PUIS écriture — l'ordre qui ferme la
 * course avec la clôture et le retirage.
 */

/** Recopié dans la ligne, jamais comparé à l'horloge — exception étroite du §5. */
const NOW = new Date("2026-10-12T15:00:00.000Z");
const DAY = ServiceDay.of("2026-10-13");

function subject(inscribed: ReadonlyMap<string, string> = new Map()) {
  const trace: string[] = [];
  const withdrawals = new InMemoryWithdrawals();
  const desk = new ProductionOrderWithdrawalDesk(
    new RecordingDayLock(trace),
    new FixedInscriptions(inscribed, trace),
    new InMemoryWithdrawalLedger(withdrawals, trace),
    new FixedClock(NOW),
    new DirectUnitOfWork(),
  );
  return { desk, trace, withdrawals };
}

describe("ProductionOrderWithdrawalDesk", () => {
  it("verrouille la journée, PUIS lit l'inscription, PUIS écrit le retrait", async () => {
    const { desk, trace, withdrawals } = subject();

    const outcome = await desk.withdraw(DAY, "ord_1", "before_inscription");

    expect(outcome).toBe("withdrawn");
    expect(trace).toEqual([`lock:${DAY.value}`, "inscription:ord_1", "record:ord_1"]);
    expect(withdrawals.rows.get("ord_1")).toEqual({
      day: DAY.value,
      at: NOW,
      afterInscription: false,
    });
  });

  it("une commande déjà inscrite par le fournil : « inscribed », et rien n'est écrit", async () => {
    const { desk, trace, withdrawals } = subject(new Map([["ord_1", DAY.value]]));

    const outcome = await desk.withdraw(DAY, "ord_1", "before_inscription");

    expect(outcome).toBe("inscribed");
    expect(trace).not.toContain("record:ord_1");
    expect(withdrawals.rows.size).toBe(0);
  });

  it("un second retrait n'est pas une erreur, et ne fait qu'une ligne", async () => {
    const { desk, withdrawals } = subject();

    await desk.withdraw(DAY, "ord_1", "before_inscription");
    const again = await desk.withdraw(DAY, "ord_1", "before_inscription");

    expect(again).toBe("withdrawn");
    expect(withdrawals.rows.size).toBe(1);
  });

  describe("plan A1 — l'autorisation va jusqu'au colisage (`before_packing`)", () => {
    it("une commande inscrite est retirée APRÈS l'inscription, sous le verrou de la journée", async () => {
      const { desk, trace, withdrawals } = subject(new Map([["ord_1", DAY.value]]));

      const outcome = await desk.withdraw(DAY, "ord_1", "before_packing");

      expect(outcome).toBe("withdrawn_after_inscription");
      expect(trace).toEqual([`lock:${DAY.value}`, "inscription:ord_1", "record:ord_1"]);
      expect(withdrawals.rows.get("ord_1")).toEqual({
        day: DAY.value,
        at: NOW,
        afterInscription: true,
      });
    });

    it("une commande pas encore inscrite : le retrait d'avant, sans `after_inscription`", async () => {
      const { desk, withdrawals } = subject();

      const outcome = await desk.withdraw(DAY, "ord_1", "before_packing");

      expect(outcome).toBe("withdrawn");
      expect(withdrawals.rows.get("ord_1")?.afterInscription).toBe(false);
    });
  });
});
