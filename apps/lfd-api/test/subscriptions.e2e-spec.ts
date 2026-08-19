/**
 * E2E des **paniers récurrents** — sur un vrai Postgres.
 *
 * Ce que seul le vrai SQL prouve, au-delà des tests de domaine : le mur
 * (`load` filtre sur `placedByUserId`), la **reconstitution** de l'agrégat depuis
 * les tables (`toDomain`) et sa **réécriture** (`save` transactionnel qui
 * réconcilie les dérogations), et la cascade de suppression.
 */
import type { SubscriptionView } from "@lfd/contracts";
import type { CreatedSubscription } from "../src/b2b/subscriptions/domain/ports/subscription.repository.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";

const OWNER = "auth0|owner";
const STRANGER = "auth0|stranger";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: OWNER });
  await createUser(ctx.prisma, { auth0Sub: STRANGER });
});

/** Gabarit retrait hebdomadaire, du 10 août au 10 décembre 2026. */
function weeklyPickup(): Record<string, unknown> {
  return {
    fromOrderId: null,
    recurrence: "weekly",
    startDate: "2026-08-10",
    endDate: "2026-12-10",
    fulfillmentMethod: "pickup",
    deliveryAddress: null,
    pickupAddressId: null,
    lines: [{ sku: "VIE-001", quantity: 3 }],
    note: "Le lundi",
  };
}

async function createSubscription(): Promise<string> {
  const response = await ctx.asSub(OWNER).post("/subscriptions").send(weeklyPickup()).expect(201);
  return jsonBody<CreatedSubscription>(response).id;
}

describe("création + lecture", () => {
  it("persiste le gabarit et ses lignes, actif, et le rend dans /mine", async () => {
    const id = await createSubscription();

    const row = await ctx.prisma.subscription.findUniqueOrThrow({
      where: { id },
      include: { lines: true },
    });
    expect(row.placedByUserId).not.toBe("");
    expect(row.status).toBe("active");
    expect(row.fulfillmentMethod).toBe("pickup");
    expect(row.lines).toEqual([expect.objectContaining({ sku: "VIE-001", quantity: 3 })]);

    const mine = jsonBody<readonly SubscriptionView[]>(
      await ctx.asSub(OWNER).get("/subscriptions/mine").expect(200),
    );
    expect(mine).toHaveLength(1);
    expect(mine[0]?.id).toBe(id);
  });
});

describe("le mur (load filtre le propriétaire)", () => {
  it("un étranger ne voit pas l'abonnement et reçoit 404 sur chaque mutation", async () => {
    const id = await createSubscription();

    expect(
      jsonBody<readonly SubscriptionView[]>(
        await ctx.asSub(STRANGER).get("/subscriptions/mine").expect(200),
      ),
    ).toHaveLength(0);

    await ctx
      .asSub(STRANGER)
      .patch(`/subscriptions/${id}/status`)
      .send({ status: "paused" })
      .expect(404);
    await ctx
      .asSub(STRANGER)
      .put(`/subscriptions/${id}/occurrences/2026-09-01`)
      .send({ skipped: true })
      .expect(404);
    await ctx.asSub(STRANGER).delete(`/subscriptions/${id}`).expect(404);

    // Rien n'a bougé côté propriétaire.
    const row = await ctx.prisma.subscription.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("active");
  });
});

describe("dérogations d'échéance (save réconcilie)", () => {
  it("écrit un saut, puis le remplace par des lignes pour la même date (pas de doublon)", async () => {
    const id = await createSubscription();

    await ctx
      .asSub(OWNER)
      .put(`/subscriptions/${id}/occurrences/2026-09-01`)
      .send({ skipped: true })
      .expect(204);
    let occ = await ctx.prisma.subscriptionOccurrence.findMany({ where: { subscriptionId: id } });
    expect(occ).toHaveLength(1);
    expect(occ[0]?.skipped).toBe(true);

    await ctx
      .asSub(OWNER)
      .put(`/subscriptions/${id}/occurrences/2026-09-01`)
      .send({ skipped: false, lines: [{ sku: "VIE-001", quantity: 5 }] })
      .expect(204);

    occ = await ctx.prisma.subscriptionOccurrence.findMany({ where: { subscriptionId: id } });
    expect(occ).toHaveLength(1);
    expect(occ[0]?.skipped).toBe(false);
    expect(occ[0]?.lines).toEqual([{ sku: "VIE-001", quantity: 5 }]);
  });

  it("refuse (409) une échéance hors de la fenêtre, rien n'est écrit", async () => {
    const id = await createSubscription();

    await ctx
      .asSub(OWNER)
      .put(`/subscriptions/${id}/occurrences/2026-12-11`)
      .send({ skipped: true })
      .expect(409);
    expect(await ctx.prisma.subscriptionOccurrence.count({ where: { subscriptionId: id } })).toBe(
      0,
    );
  });
});

describe("transitions d'état", () => {
  it("met en pause, refuse une seconde pause (409), puis reprend", async () => {
    const id = await createSubscription();

    await ctx
      .asSub(OWNER)
      .patch(`/subscriptions/${id}/status`)
      .send({ status: "paused" })
      .expect(204);
    expect((await ctx.prisma.subscription.findUniqueOrThrow({ where: { id } })).status).toBe(
      "paused",
    );

    await ctx
      .asSub(OWNER)
      .patch(`/subscriptions/${id}/status`)
      .send({ status: "paused" })
      .expect(409);

    await ctx
      .asSub(OWNER)
      .patch(`/subscriptions/${id}/status`)
      .send({ status: "active" })
      .expect(204);
    expect((await ctx.prisma.subscription.findUniqueOrThrow({ where: { id } })).status).toBe(
      "active",
    );
  });
});

describe("suppression", () => {
  it("supprime l'abonnement et ses dérogations en cascade", async () => {
    const id = await createSubscription();
    await ctx
      .asSub(OWNER)
      .put(`/subscriptions/${id}/occurrences/2026-09-01`)
      .send({ skipped: true })
      .expect(204);

    await ctx.asSub(OWNER).delete(`/subscriptions/${id}`).expect(204);

    expect(await ctx.prisma.subscription.count({ where: { id } })).toBe(0);
    expect(await ctx.prisma.subscriptionOccurrence.count({ where: { subscriptionId: id } })).toBe(
      0,
    );
  });
});

describe("émission du journal (subscription.created)", () => {
  it("journalise subscription.created sur la personne (câblage subscriptions→growth)", async () => {
    const id = await createSubscription();
    const owner = await ctx.prisma.user.findUniqueOrThrow({ where: { auth0Sub: OWNER } });

    for (let attempt = 0; attempt < 50; attempt += 1) {
      if ((await ctx.prisma.activityEvent.count({ where: { type: "subscription.created" } })) > 0) {
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }

    const [event] = await ctx.prisma.activityEvent.findMany({
      where: { type: "subscription.created" },
    });
    expect(event.subjectType).toBe("user");
    expect(event.subjectId).toBe(owner.id);
    expect(event.actorType).toBe("customer");
    expect(event.idempotencyKey).toBe(`subscription.created:${id}`);
    expect(event.payload).toMatchObject({ subscriptionId: id, recurrence: "weekly" });
  });
});
