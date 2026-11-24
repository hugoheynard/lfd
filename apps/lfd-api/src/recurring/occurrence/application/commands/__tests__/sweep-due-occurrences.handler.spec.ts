import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { day, openBasket } from "../../../../basket/domain/entities/__tests__/basket-fixtures.js";
import { BasketLine } from "../../../../basket/domain/value-objects/basket-line.js";
import type { OccurrencePlacementOutcome } from "../../../../channels/commerce/occurrence-placement.js";
import { Occurrence } from "../../../domain/entities/occurrence.js";
import { OccurrencePlanner } from "../../services/occurrence-planner.js";
import {
  FixedBehind,
  InMemoryBaskets,
  InMemoryOccurrences,
  RecordingDurable,
  ScriptedPlacement,
} from "../../__tests__/recurring-doubles.js";
import { SweepDueOccurrencesHandler } from "../sweep-due-occurrences.handler.js";

// 23 h 30 UTC le 8 novembre : déjà le 9 à Paris.
const NOW = new Date("2026-11-08T23:30:00.000Z");
const PLACED: OccurrencePlacementOutcome = {
  kind: "placed",
  orderId: "order_1",
  orderNumber: "C-1",
};

function build(outcome: () => OccurrencePlacementOutcome, behind: FixedBehind = new FixedBehind()) {
  const baskets = new InMemoryBaskets();
  const occurrences = new InMemoryOccurrences();
  const basket = openBasket({ startDate: day("2026-11-02") });
  occurrences.baskets.set(basket.id, basket);
  const placement = new ScriptedPlacement(outcome);
  const durable = new RecordingDurable();
  const handler = new SweepDueOccurrencesHandler(
    behind,
    baskets,
    occurrences,
    new OccurrencePlanner(occurrences, new FixedIdGenerator("occ")),
    placement,
    durable,
    new DirectUnitOfWork(),
    new FixedClock(NOW),
  );
  return { basket, occurrences, placement, durable, handler, baskets };
}

function planOn(occurrences: InMemoryOccurrences, serviceDay: string, id = serviceDay): Occurrence {
  const occurrence = Occurrence.plan({
    id,
    basketId: "basket_1",
    serviceDay: day(serviceDay),
    at: NOW,
  });
  void occurrences.insertMany([occurrence]);
  return occurrence;
}

describe("SweepDueOccurrencesHandler — les échéances dues", () => {
  it("passe celle dont le jour de passation est atteint (Paris), pas celle d'après", async () => {
    const { occurrences, placement, handler } = build(() => PLACED);
    planOn(occurrences, "2026-11-16");
    planOn(occurrences, "2026-11-23");

    const report = await handler.execute();

    expect(placement.requests.map((request) => request.serviceDay)).toEqual(["2026-11-16"]);
    expect(occurrences.stateOn("2026-11-16")).toBe("placed");
    expect(occurrences.stateOn("2026-11-23")).toBe("planned");
    expect(report).toMatchObject({ due: 1, placed: 1, refused: 0, missed: 0, failed: 0 });
  });

  it("une échéance passée écrit recurring.occurrence_placed, avec sa commande", async () => {
    const { occurrences, durable, handler } = build(() => PLACED);
    planOn(occurrences, "2026-11-16", "occ_16");

    await handler.execute();

    expect(durable.facts).toEqual([
      {
        type: "recurring.occurrence_placed",
        key: "recurring.occurrence_placed:occ_16",
        payload: {
          occurrenceId: "occ_16",
          basketId: "basket_1",
          buyerUserId: "user_1",
          companyId: "chalet",
          serviceDay: "2026-11-16",
          orderId: "order_1",
        },
      },
    ]);
  });

  it("demande la commande avec le créneau, les CGV du jour, la dérogation et son écart", async () => {
    const { occurrences, placement, handler } = build(() => PLACED);
    const occurrence = planOn(occurrences, "2026-11-16");
    occurrence.override([BasketLine.create("PAN-001", 6)], "Plus de pain", NOW);
    occurrences.overwrite(occurrence.snapshot);

    await handler.execute();

    expect(placement.requests[0]).toMatchObject({
      basketId: "basket_1",
      buyerUserId: "user_1",
      companyId: "chalet",
      lines: [{ sku: "PAN-001", quantity: 6 }],
      note: "Plus de pain",
      deltas: {
        added: [{ sku: "PAN-001", quantity: 2 }],
        removed: [{ sku: "CRO-002", quantity: 6 }],
      },
      salesTerms: { key: "salesTermsPro", revision: 3, fileId: "file_cgv_3" },
      routing: { window: { start: "08:00", end: "10:00" } },
    });
  });

  it("un refus s'inscrit et alerte une fois ; la même cause au passage suivant n'alerte plus", async () => {
    const refusal: OccurrencePlacementOutcome = {
      kind: "refused",
      cause: "plan_closed",
      reason: "Plan arrêté.",
      final: false,
    };
    const { occurrences, durable, handler } = build(() => refusal);
    planOn(occurrences, "2026-11-16");

    const first = await handler.execute();
    const second = await handler.execute();

    expect(occurrences.stateOn("2026-11-16")).toBe("refused");
    expect(first.alerts).toEqual([
      {
        subscriptionId: "basket_1",
        date: "2026-11-16",
        cause: "plan_closed",
        reason: "Plan arrêté.",
        missed: false,
      },
    ]);
    expect(second).toMatchObject({ refused: 1, alerts: [] });
    // Le fait suit l'alerte : une cause nouvelle seulement.
    expect(durable.facts.map((fact) => fact.key)).toEqual([
      "recurring.occurrence_refused:2026-11-16:plan_closed",
    ]);
  });

  it("un refus définitif rend l'échéance manquée, et elle n'est plus balayée", async () => {
    const { occurrences, placement, durable, handler } = build(() => ({
      kind: "refused",
      cause: "deadline_closed",
      reason: "Heure limite passée.",
      final: true,
    }));
    planOn(occurrences, "2026-11-16");

    const report = await handler.execute();
    await handler.execute();

    expect(report).toMatchObject({ missed: 1, refused: 0 });
    expect(durable.types).toEqual(["recurring.occurrence_missed"]);
    expect(occurrences.stateOn("2026-11-16")).toBe("missed");
    expect(placement.requests).toHaveLength(1);
  });

  it("une erreur technique est comptée, n'inscrit rien, et l'échéance reste due", async () => {
    const { occurrences, handler } = build(() => {
      throw new TypeError("connexion perdue");
    });
    planOn(occurrences, "2026-11-16");

    const report = await handler.execute();

    expect(report).toMatchObject({ failed: 1, placed: 0 });
    expect(occurrences.stateOn("2026-11-16")).toBe("planned");
  });

  it("n'écrase pas une échéance qu'un autre écrivain a quittée entre-temps", async () => {
    const { occurrences, durable, handler } = build(() => PLACED);
    const occurrence = planOn(occurrences, "2026-11-16");
    // Le client l'a sautée pendant que la passation tournait : simulé en
    // changeant l'état après la lecture des dues.
    const original = occurrences.due.bind(occurrences);
    occurrences.due = async (today, limit) => {
      const due = await original(today, limit);
      const skipped = Occurrence.reconstitute(occurrence.snapshot);
      skipped.skip("", NOW);
      occurrences.overwrite(skipped.snapshot);
      return due;
    };

    const report = await handler.execute();

    expect(report.placed).toBe(0);
    expect(occurrences.stateOn("2026-11-16")).toBe("skipped");
    expect(durable.facts).toEqual([]);
  });

  it("un panier en pause n'est pas balayé", async () => {
    const { basket, occurrences, placement, handler } = build(() => PLACED);
    basket.pause();
    planOn(occurrences, "2026-11-16");

    await handler.execute();

    expect(placement.requests).toHaveLength(0);
  });
});

describe("SweepDueOccurrencesHandler — la création à l'avance", () => {
  it("planifie les paniers en retard sur huit semaines, aujourd'hui compris, et les sauve", async () => {
    const late = openBasket({ id: "basket_2", startDate: day("2026-11-02") });
    const { occurrences, baskets, handler } = build(() => PLACED, new FixedBehind([late]));

    const report = await handler.execute();

    expect(report).toMatchObject({ planned: 1, created: 9 });
    expect(late.plannedUntil?.toString()).toBe("2027-01-04");
    expect(baskets.saved).toEqual(["basket_2"]);
    expect([...occurrences.rows.values()].every((row) => row.basketId === "basket_2")).toBe(true);
  });
});
