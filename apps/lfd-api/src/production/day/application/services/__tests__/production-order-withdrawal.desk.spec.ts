import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { RecordingDayLock } from "../../__tests__/batch-doubles.js";
import { RecordingDurable } from "../../__tests__/handoff-doubles.js";
import { closedDay } from "../../__tests__/closed-day-doubles.js";
import type { DeskActor } from "../../../../channels/commerce/desk-actor.js";
import { FixedInscriptions } from "../../../../channels/commerce/__tests__/order-inscription-doubles.js";
import {
  InMemoryWithdrawalLedger,
  InMemoryWithdrawals,
  InMemoryWithdrawalsAfterInscription,
} from "../../__tests__/withdrawal-doubles.js";
import {
  PlanVersionStore,
  StoredDays,
  VersionLedgerDown,
  planVersionRecorder,
} from "./plan-version-doubles.js";
import { ProductionOrderWithdrawalDesk } from "../production-order-withdrawal.desk.js";

/**
 * Le guichet du retrait (doc `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.4) :
 * verrou de la journée, PUIS inscription, PUIS écriture — l'ordre qui ferme la
 * course avec la clôture et le retirage.
 */

/** Recopié dans la ligne, jamais comparé à l'horloge — exception étroite du §5. */
const NOW = new Date("2026-10-12T15:00:00.000Z");
const DAY = ServiceDay.of("2026-10-13");
const CUSTOMER: DeskActor = { kind: "customer" };

function subject(
  inscribed: ReadonlyMap<string, string> = new Map(),
  plan: ProductionDay = closedDay(DAY, NOW, []),
) {
  const trace: string[] = [];
  const withdrawals = new InMemoryWithdrawals();
  const events = new RecordingPublisher();
  const durable = new RecordingDurable();
  const days = new StoredDays(plan);
  const versions = new PlanVersionStore();
  const desk = new ProductionOrderWithdrawalDesk(
    new RecordingDayLock(trace),
    new FixedInscriptions(inscribed, trace),
    new InMemoryWithdrawalLedger(withdrawals, trace),
    new FixedClock(NOW),
    new DirectUnitOfWork(),
    days,
    events,
    durable,
    planVersionRecorder(days, versions, new InMemoryWithdrawalsAfterInscription(withdrawals)),
  );
  return { desk, trace, withdrawals, events, durable, days, versions };
}

describe("ProductionOrderWithdrawalDesk", () => {
  it("verrouille la journée, PUIS lit l'inscription, PUIS écrit le retrait", async () => {
    const { desk, trace, withdrawals } = subject();

    const outcome = await desk.withdraw(DAY, "ord_1", "before_inscription", CUSTOMER);

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

    const outcome = await desk.withdraw(DAY, "ord_1", "before_inscription", CUSTOMER);

    expect(outcome).toBe("inscribed");
    expect(trace).not.toContain("record:ord_1");
    expect(withdrawals.rows.size).toBe(0);
  });

  it("un second retrait n'est pas une erreur, et ne fait qu'une ligne", async () => {
    const { desk, withdrawals } = subject();

    await desk.withdraw(DAY, "ord_1", "before_inscription", CUSTOMER);
    const again = await desk.withdraw(DAY, "ord_1", "before_inscription", CUSTOMER);

    expect(again).toBe("withdrawn");
    expect(withdrawals.rows.size).toBe(1);
  });

  describe("plan A1 — l'autorisation va jusqu'au colisage (`before_packing`)", () => {
    it("une commande inscrite est retirée APRÈS l'inscription, sous le verrou de la journée", async () => {
      const { desk, trace, withdrawals } = subject(new Map([["ord_1", DAY.value]]));

      const outcome = await desk.withdraw(DAY, "ord_1", "before_packing", CUSTOMER);

      expect(outcome).toBe("withdrawn_after_inscription");
      expect(trace).toEqual([`lock:${DAY.value}`, "inscription:ord_1", "record:ord_1"]);
      expect(withdrawals.rows.get("ord_1")).toEqual({
        day: DAY.value,
        at: NOW,
        afterInscription: true,
      });
    });

    it("une commande pas encore inscrite : le retrait d'avant, sans `after_inscription`", async () => {
      const { desk, withdrawals, events, durable } = subject();

      const outcome = await desk.withdraw(DAY, "ord_1", "before_packing", CUSTOMER);

      expect(outcome).toBe("withdrawn");
      expect(withdrawals.rows.get("ord_1")?.afterInscription).toBe(false);
      expect(events.traced).toEqual([]);
      expect(durable.facts).toEqual([]);
    });

    it("retirée après l'inscription : production.order_withdrawn_after_close, durable et journalisé", async () => {
      const { desk, events, durable } = subject(new Map([["ord_1", DAY.value]]));

      await desk.withdraw(DAY, "ord_1", "before_packing", CUSTOMER);

      expect(durable.facts).toEqual([
        {
          type: "production.order_withdrawn_after_close",
          key: `production.order_withdrawn_after_close:${DAY.value}:ord_1`,
          payload: {
            serviceDay: DAY.value,
            orderId: "ord_1",
            rank: 1,
            withdrawnAt: NOW.toISOString(),
          },
        },
      ]);
      expect(events.traced.map((event) => event.journalFact())).toEqual([
        {
          type: "production_day.order_withdrawn",
          subjectType: "production_day",
          subjectId: DAY.value,
          payload: {
            subjectLabel: DAY.value,
            serviceDay: DAY.value,
            orderId: "ord_1",
            orderNumber: "ORD-0001",
          },
        },
      ]);
    });

    it("une commande à deux envois au plan : un fait par envoi, le reliquat sous sa clé (L3b)", async () => {
      const closed = closedDay(DAY, NOW, []).toSnapshot();
      const first = closed.orders.find((order) => order.orderId === "ord_1");
      if (first === undefined) {
        throw new TypeError("la journée de test doit porter ord_1");
      }
      const plan = ProductionDay.fromSnapshot({
        ...closed,
        orders: [...closed.orders, { ...first, rank: 2 }],
      });
      const { desk, durable } = subject(new Map([["ord_1", DAY.value]]), plan);

      await desk.withdraw(DAY, "ord_1", "before_packing", CUSTOMER);

      expect(durable.facts.map((fact) => [fact.key, fact.payload["rank"]])).toEqual([
        [`production.order_withdrawn_after_close:${DAY.value}:ord_1`, 1],
        [`production.order_withdrawn_after_close:${DAY.value}:ord_1:r2`, 2],
      ]);
    });

    it("refusée (`inscribed`) : aucun fait", async () => {
      const { desk, events, durable } = subject(new Map([["ord_1", DAY.value]]));

      await desk.withdraw(DAY, "ord_1", "before_inscription", CUSTOMER);

      expect(events.traced).toEqual([]);
      expect(durable.facts).toEqual([]);
    });
  });

  describe("la version du plan (plan-historique-des-tirages, H1)", () => {
    it("retirée après l'inscription : la journée garde une version `order_withdrawn`, signée de la seule nature du client", async () => {
      const { desk, days, versions } = subject(new Map([["ord_1", DAY.value]]));

      await desk.withdraw(DAY, "ord_1", "before_packing", CUSTOMER);

      expect(versions.appended.map((version) => version.cause)).toEqual(["order_withdrawn"]);
      const [version] = versions.appended;
      expect(version?.toRecord().recordedBy).toEqual({ kind: "customer" });
      expect(version?.content.withdrawn).toEqual([
        { orderId: "ord_1", rank: 1, at: NOW.toISOString(), by: { kind: "customer" } },
      ]);
      expect(days.current.planVersion).toBe(1);
    });

    it("un retrait avant l'inscription ne touche pas le plan : aucune version, la journée n'est pas sauvée", async () => {
      const { desk, days, versions } = subject();

      await desk.withdraw(DAY, "ord_1", "before_packing", CUSTOMER);

      expect(versions.appended).toEqual([]);
      expect(days.saves).toBe(0);
    });

    /** § 2 bis point 1 : si la version échoue, le geste échoue. */
    it("l'ajout de la version échoue : le retrait échoue, et aucun fait ne part", async () => {
      const { desk, versions, durable } = subject(new Map([["ord_1", DAY.value]]));
      versions.failing = true;

      await expect(desk.withdraw(DAY, "ord_1", "before_packing", CUSTOMER)).rejects.toThrow(
        VersionLedgerDown,
      );
      expect(durable.facts).toEqual([]);
    });
  });
});
