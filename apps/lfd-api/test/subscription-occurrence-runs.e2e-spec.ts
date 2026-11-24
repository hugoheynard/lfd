/**
 * Le registre des échéances des paniers récurrents (plan du planificateur,
 * lot R2) contre le vrai Postgres : l'unicité par (panier, jour), la clôture
 * d'une échéance générée ou manquée, le refus qui se réécrit, et la borne
 * basse que pose une reprise.
 */
import type { CreatedSubscription } from "../src/lafoliecoffee/subscriptions/domain/ports/subscription.repository.js";
import { OccurrenceRunLedger } from "../src/lafoliecoffee/subscriptions/domain/ports/occurrence-run.ledger.js";
import { IsoDate } from "../src/lafoliecoffee/subscriptions/domain/value-objects/iso-date.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const OWNER = "auth0|owner";
const DAY = IsoDate.fromString("2026-08-17");
const AT = new Date("2026-08-10T06:00:00.000Z");

let ctx: E2eContext;
let ledger: OccurrenceRunLedger;

beforeAll(async () => {
  ctx = await bootstrapE2e();
  ledger = ctx.app.get(OccurrenceRunLedger);
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: OWNER });
});

async function createSubscription(): Promise<string> {
  const response = await ctx
    .asSub(OWNER)
    .post("/subscriptions")
    .set(INTENT_KEY, freshIntent())
    .send({
      fromOrderId: null,
      recurrence: "weekly",
      startDate: "2026-08-10",
      endDate: "2026-12-10",
      fulfillmentMethod: "pickup",
      deliveryAddress: null,
      pickupAddressId: null,
      requestedWindow: { start: "08:00", end: "10:00" },
      lines: [{ sku: "VIE-001-1", quantity: 3 }],
      note: "",
    })
    .expect(201);
  return jsonBody<CreatedSubscription>(response).id;
}

const refused = (reason = "Le client a quitté la société.") =>
  ({ kind: "refused", cause: "buyer_left", reason }) as const;

async function rows(subscriptionId: string) {
  return ctx.prisma.subscriptionOccurrenceRun.findMany({
    where: { subscriptionId },
    select: { outcome: true, orderId: true, cause: true, reason: true },
  });
}

describe("le registre des échéances", () => {
  it("une échéance générée est close : une seconde inscription ne la réécrit pas", async () => {
    const id = await createSubscription();
    const entry = { subscriptionId: id, date: DAY, at: AT };

    expect(
      await ledger.record({ ...entry, outcome: { kind: "generated", orderId: "ord_1" } }),
    ).toEqual({ written: true, newCause: false });
    expect(
      await ledger.record({ ...entry, outcome: { kind: "generated", orderId: "ord_2" } }),
    ).toEqual({ written: false, newCause: false });
    expect(await ledger.record({ ...entry, outcome: refused() })).toEqual({
      written: false,
      newCause: false,
    });
    expect(await rows(id)).toEqual([
      { outcome: "generated", orderId: "ord_1", cause: null, reason: null },
    ]);
  });

  it("deux balayages concurrents n'inscrivent qu'une seule commande", async () => {
    const id = await createSubscription();
    const results = await Promise.all(
      ["ord_a", "ord_b"].map((orderId) =>
        ledger.record({
          subscriptionId: id,
          date: DAY,
          at: AT,
          outcome: { kind: "generated", orderId },
        }),
      ),
    );
    expect(results.filter((result) => result.written)).toHaveLength(1);
    expect(await rows(id)).toHaveLength(1);
  });

  it("un refus se réécrit, et l'alerte ne repart qu'à une cause nouvelle", async () => {
    const id = await createSubscription();
    const entry = { subscriptionId: id, date: DAY, at: AT };

    expect(await ledger.record({ ...entry, outcome: refused() })).toEqual({
      written: true,
      newCause: true,
    });
    expect(
      await ledger.record({ ...entry, outcome: refused("Même cause, autre phrase.") }),
    ).toEqual({
      written: true,
      newCause: false,
    });
    expect(
      await ledger.record({
        ...entry,
        outcome: { kind: "refused", cause: "reserved_elsewhere", reason: "Plus réservé." },
      }),
    ).toEqual({ written: true, newCause: true });
    // La cause corrigée, l'échéance repart : elle se génère sur la même ligne.
    expect(
      await ledger.record({ ...entry, outcome: { kind: "generated", orderId: "ord_1" } }),
    ).toEqual({ written: true, newCause: false });
    expect(await rows(id)).toEqual([
      { outcome: "generated", orderId: "ord_1", cause: null, reason: null },
    ]);
  });

  it("une échéance manquée est close", async () => {
    const id = await createSubscription();
    const entry = { subscriptionId: id, date: DAY, at: AT };
    await ledger.record({ ...entry, outcome: refused() });
    await ledger.record({
      ...entry,
      outcome: { kind: "missed_deadline", cause: "buyer_left", reason: "Heure limite passée." },
    });

    expect(
      await ledger.record({ ...entry, outcome: { kind: "generated", orderId: "ord_1" } }),
    ).toEqual({ written: false, newCause: false });
    expect(await rows(id)).toEqual([
      {
        outcome: "missed_deadline",
        orderId: null,
        cause: "buyer_left",
        reason: "Heure limite passée.",
      },
    ]);
  });

  it("relit les échéances d'un panier entre deux jours, bornes comprises", async () => {
    const id = await createSubscription();
    for (const [day, orderId] of [
      ["2026-08-10", "ord_0"],
      ["2026-08-17", "ord_1"],
      ["2026-08-24", "ord_2"],
    ] as const) {
      await ledger.record({
        subscriptionId: id,
        date: IsoDate.fromString(day),
        at: AT,
        outcome: { kind: "generated", orderId },
      });
    }

    const runs = await ledger.runsBetween(
      id,
      IsoDate.fromString("2026-08-17"),
      IsoDate.fromString("2026-08-24"),
    );
    expect(runs.map((run) => [run.date.toString(), run.outcome, run.cause])).toEqual([
      ["2026-08-17", "generated", null],
      ["2026-08-24", "generated", null],
    ]);
  });

  it("la base refuse une commande générée sans commande", async () => {
    const id = await createSubscription();
    await expect(
      ctx.prisma.$executeRaw`
        INSERT INTO "public"."subscription_occurrence_runs"
          ("id", "subscription_id", "occurrence_date", "outcome", "recorded_at")
        VALUES ('run_bad', ${id}, DATE '2026-08-17', 'generated', now())`,
    ).rejects.toThrow(/subscription_occurrence_runs_outcome_shape/u);
  });
});

describe("la borne basse du planificateur", () => {
  it("un panier neuf n'est pas armé ; la reprise pose la borne", async () => {
    const id = await createSubscription();
    expect(
      (await ctx.prisma.subscription.findUniqueOrThrow({ where: { id } })).armedFrom,
    ).toBeNull();

    await ctx
      .asSub(OWNER)
      .patch(`/subscriptions/${id}/status`)
      .send({ status: "paused" })
      .expect(204);
    await ctx
      .asSub(OWNER)
      .patch(`/subscriptions/${id}/status`)
      .send({ status: "active" })
      .expect(204);

    expect(
      (await ctx.prisma.subscription.findUniqueOrThrow({ where: { id } })).armedFrom,
    ).not.toBeNull();
  });
});
