/**
 * E2E des **paniers récurrents** — le bloc `recurring`, sur un vrai Postgres.
 *
 * Ce que seul le vrai SQL prouve, au-delà des tests de domaine : le mur (le
 * panier est à son acheteur), la reconstitution de l'agrégat depuis le schéma
 * `recurring`, la création à l'avance des échéances en lignes, les gestes sur
 * une échéance, la reprise qui annule les jours tombés pendant la pause, et
 * l'arrêt qui garde tout en base.
 */
import { PERSONAL_WORKSPACE, WORKSPACE_HEADER } from "@lfd/contracts";
import type { SubscriptionView } from "@lfd/contracts";

import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import {
  occurrenceStates,
  openBasket,
  publishSalesTerms,
  weeklyBasket,
} from "./recurring-scene.js";

const OWNER = "auth0|owner";
const STRANGER = "auth0|stranger";

let ctx: E2eContext;
let companyId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await publishSalesTerms(ctx);
  companyId = (await createCompany(ctx.prisma, { status: CompanyStatus.active })).id;
  const owner = await createUser(ctx.prisma, { auth0Sub: OWNER });
  await attachTo(ctx.prisma, owner.id, companyId, CustomerRole.owner);
  await createUser(ctx.prisma, { auth0Sub: STRANGER });
});

/** Le premier jour du panier : dans deux jours, puis chaque semaine. */
const FIRST = serviceDay(2);
const SECOND = serviceDay(9);

const open = (): Promise<string> => openBasket(ctx, OWNER, companyId);

async function occurrenceOn(basketId: string, day: string) {
  return ctx.prisma.occurrence.findUniqueOrThrow({
    where: { basketId_serviceDay: { basketId, serviceDay: new Date(`${day}T00:00:00.000Z`) } },
  });
}

describe("ouverture + lecture", () => {
  it("persiste le panier, ses lignes, les CGV pros et huit semaines d'échéances ; /mine le rend", async () => {
    const id = await open();

    const row = await ctx.prisma.basket.findUniqueOrThrow({
      where: { id },
      include: { lines: true },
    });
    expect(row).toMatchObject({
      companyId,
      status: "active",
      cadence: "weekly",
      fulfillmentMethod: "pickup",
      salesTermsKey: "salesTermsPro",
      salesTermsRevision: 1,
    });
    expect(row.lines).toEqual([expect.objectContaining({ sku: "VIE-001-1", quantity: 6 })]);
    const states = await occurrenceStates(ctx, id);
    expect(states).toHaveLength(8);
    expect(states[0]).toEqual([FIRST, "planned"]);
    expect(states.every(([, state]) => state === "planned")).toBe(true);

    const mine = jsonBody<readonly SubscriptionView[]>(
      await ctx.asSub(OWNER).get("/subscriptions/mine").expect(200),
    );
    expect(mine.map((view) => view.id)).toEqual([id]);
  });

  it("un panier perso s'ouvre aux CGV des particuliers, sans aucune échéance", async () => {
    const id = await openBasket(ctx, OWNER, PERSONAL_WORKSPACE);

    const row = await ctx.prisma.basket.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ companyId: null, salesTermsKey: "salesTerms" });
    expect(await occurrenceStates(ctx, id)).toEqual([]);
  });

  it("sans CGV publiées pour la clientèle, le panier ne s'ouvre pas (409) et rien n'est écrit", async () => {
    await ctx.reset();
    const company = (await createCompany(ctx.prisma, { status: CompanyStatus.active })).id;
    const owner = await createUser(ctx.prisma, { auth0Sub: OWNER });
    await attachTo(ctx.prisma, owner.id, company, CustomerRole.owner);

    const refused = await ctx
      .asSub(OWNER)
      .post("/subscriptions")
      .set(INTENT_KEY, freshIntent())
      .set(WORKSPACE_HEADER, company)
      .send(weeklyBasket());

    expect(refused.status).toBe(409);
    expect(JSON.stringify(refused.body)).toContain("conditions générales");
    expect(await ctx.prisma.basket.count()).toBe(0);
  });
});

describe("le mur (le panier est à son acheteur)", () => {
  it("un étranger ne voit pas le panier et reçoit 404 sur chaque geste", async () => {
    const id = await open();

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
      .put(`/subscriptions/${id}/occurrences/${FIRST}`)
      .send({ skipped: true })
      .expect(404);
    await ctx.asSub(STRANGER).delete(`/subscriptions/${id}`).expect(404);

    expect((await ctx.prisma.basket.findUniqueOrThrow({ where: { id } })).status).toBe("active");
    expect((await occurrenceOn(id, FIRST)).state).toBe("planned");
  });
});

describe("une échéance (sa ligne)", () => {
  it("se saute, puis se rétablit avec d'autres lignes — la même ligne, jamais une seconde", async () => {
    const id = await open();

    await ctx
      .asSub(OWNER)
      .put(`/subscriptions/${id}/occurrences/${SECOND}`)
      .send({ skipped: true })
      .expect(204);
    expect(await occurrenceOn(id, SECOND)).toMatchObject({ state: "skipped", lines: null });

    await ctx
      .asSub(OWNER)
      .put(`/subscriptions/${id}/occurrences/${SECOND}`)
      .send({ skipped: false, lines: [{ sku: "VIE-001-1", quantity: 5 }] })
      .expect(204);
    const row = await occurrenceOn(id, SECOND);
    expect(row.state).toBe("planned");
    expect(row.lines).toEqual([expect.objectContaining({ sku: "VIE-001-1", quantity: 5 })]);
    expect(await ctx.prisma.occurrence.count({ where: { basketId: id } })).toBe(8);
  });

  it("un jour sans échéance répond 404 qui le dit, et rien n'est écrit", async () => {
    const id = await open();

    const response = await ctx
      .asSub(OWNER)
      .put(`/subscriptions/${id}/occurrences/${serviceDay(3)}`)
      .send({ skipped: true });

    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).toContain("Aucune échéance prévue");
    expect(await ctx.prisma.occurrence.count({ where: { basketId: id, state: "skipped" } })).toBe(
      0,
    );
  });

  it("une échéance refusée se saute : sa cause s'efface avec elle", async () => {
    const id = await open();
    await ctx.prisma.occurrence.update({
      where: { id: (await occurrenceOn(id, FIRST)).id },
      data: {
        state: "refused",
        cause: "unavailable_sku",
        reason: "Article indisponible.",
        settledAt: new Date(),
      },
    });

    await ctx
      .asSub(OWNER)
      .put(`/subscriptions/${id}/occurrences/${FIRST}`)
      .send({ skipped: true })
      .expect(204);

    expect(await occurrenceOn(id, FIRST)).toMatchObject({
      state: "skipped",
      cause: null,
      reason: null,
      settledAt: null,
    });
  });
});

describe("pause et reprise", () => {
  it("met en pause, refuse une seconde pause (409), puis reprend", async () => {
    const id = await open();
    const status = (value: string) =>
      ctx.asSub(OWNER).patch(`/subscriptions/${id}/status`).send({ status: value });

    await status("paused").expect(204);
    expect((await ctx.prisma.basket.findUniqueOrThrow({ where: { id } })).status).toBe("paused");
    expect((await occurrenceOn(id, FIRST)).state).toBe("planned");
    await status("paused").expect(409);
    await status("active").expect(204);
    expect((await ctx.prisma.basket.findUniqueOrThrow({ where: { id } })).status).toBe("active");
  });

  /**
   * Les jours tombés pendant la pause ne sont ni dus ni manqués : la reprise
   * les annule, ceux qu'un refus avait marqués compris — sans quoi ils
   * tomberaient « manqués » et réalerteraient. Les deux lignes d'avant la
   * reprise sont posées à la main : la création à l'avance ne crée jamais un
   * jour passé, et c'est exactement l'état que laisserait une pause de deux
   * semaines.
   */
  it("la reprise annule les échéances prévues ET refusées d'avant son jour, et garde la cause", async () => {
    const id = await open();
    await ctx
      .asSub(OWNER)
      .patch(`/subscriptions/${id}/status`)
      .send({ status: "paused" })
      .expect(204);
    const now = new Date();
    await ctx.prisma.occurrence.createMany({
      data: [
        {
          id: "occ_passee_prevue",
          basketId: id,
          serviceDay: new Date(`${serviceDay(-12)}T00:00:00.000Z`),
          placeOn: new Date(`${serviceDay(-19)}T00:00:00.000Z`),
          state: "planned",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "occ_passee_refusee",
          basketId: id,
          serviceDay: new Date(`${serviceDay(-5)}T00:00:00.000Z`),
          placeOn: new Date(`${serviceDay(-12)}T00:00:00.000Z`),
          state: "refused",
          cause: "no_settlement",
          reason: "Aucun moyen de règlement.",
          settledAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await ctx
      .asSub(OWNER)
      .patch(`/subscriptions/${id}/status`)
      .send({ status: "active" })
      .expect(204);

    const passed = await ctx.prisma.occurrence.findMany({
      where: { id: { in: ["occ_passee_prevue", "occ_passee_refusee"] } },
      orderBy: { serviceDay: "asc" },
    });
    expect(passed.map((row) => row.state)).toEqual(["cancelled", "cancelled"]);
    expect(passed[1]).toMatchObject({
      cause: "no_settlement",
      reason: "Aucun moyen de règlement.",
    });
    expect((await occurrenceOn(id, FIRST)).state).toBe("planned");
  });
});

describe("arrêt", () => {
  it("arrête le panier sans l'effacer : lignes et échéances restent, annulées", async () => {
    const id = await open();
    await ctx
      .asSub(OWNER)
      .put(`/subscriptions/${id}/occurrences/${SECOND}`)
      .send({ skipped: true })
      .expect(204);

    await ctx.asSub(OWNER).delete(`/subscriptions/${id}`).expect(204);

    expect((await ctx.prisma.basket.findUniqueOrThrow({ where: { id } })).status).toBe("cancelled");
    expect(await ctx.prisma.basketLine.count({ where: { basketId: id } })).toBe(1);
    const states = await occurrenceStates(ctx, id);
    expect(states).toHaveLength(8);
    expect(states.every(([, state]) => state === "cancelled")).toBe(true);
  });

  it("un panier arrêté ne se liste plus et répond comme absent", async () => {
    const id = await open();
    await ctx.asSub(OWNER).delete(`/subscriptions/${id}`).expect(204);

    const mine = await ctx.asSub(OWNER).get("/subscriptions/mine").expect(200);
    expect(jsonBody<readonly { id: string }[]>(mine).map((row) => row.id)).not.toContain(id);
    await ctx.asSub(OWNER).delete(`/subscriptions/${id}`).expect(404);
    await ctx
      .asSub(OWNER)
      .patch(`/subscriptions/${id}/status`)
      .send({ status: "paused" })
      .expect(404);
  });
});

describe("le journal (subscription.created, par le fait durable)", () => {
  it("l'ouverture écrit recurring.basket_opened ; la croissance en tire subscription.created sur la personne", async () => {
    const id = await open();
    await ctx.drain();
    const owner = await ctx.prisma.user.findUniqueOrThrow({ where: { auth0Sub: OWNER } });

    expect(
      await ctx.prisma.outboxMessage.count({ where: { type: "recurring.basket_opened" } }),
    ).toBe(1);
    const events = await ctx.prisma.activityEvent.findMany({
      where: { type: "subscription.created" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      subjectType: "user",
      subjectId: owner.id,
      idempotencyKey: `subscription.created:${id}`,
    });
    expect(events[0]?.payload).toMatchObject({ subscriptionId: id, recurrence: "weekly" });
  });
});

describe("la vue du client (GET /subscriptions/mine)", () => {
  it("porte les CGV appliquées et les échéances, triées par jour, au gabarit", async () => {
    const id = await open();
    await ctx
      .asSub(OWNER)
      .put(`/subscriptions/${id}/occurrences/${SECOND}`)
      .send({ skipped: false, lines: [{ sku: "VIE-001-1", quantity: 2 }], note: "Moins" })
      .expect(204);

    const [view] = jsonBody<readonly SubscriptionView[]>(
      await ctx.asSub(OWNER).get("/subscriptions/mine").expect(200),
    );

    expect(view?.salesTerms).toEqual({ document: "salesTermsPro", revision: 1 });
    expect(view?.nextSalesTerms).toBeNull();
    expect(view?.occurrences).toHaveLength(8);
    const days = view?.occurrences.map((occurrence) => occurrence.serviceDay) ?? [];
    expect(days).toEqual([...days].sort());
    expect(view?.occurrences[0]).toEqual({
      serviceDay: FIRST,
      state: "planned",
      lines: [{ sku: "VIE-001-1", quantity: 6 }],
      overridden: false,
      note: "",
      orderId: null,
    });
    expect(view?.occurrences[1]).toMatchObject({
      serviceDay: SECOND,
      lines: [{ sku: "VIE-001-1", quantity: 2 }],
      overridden: true,
      note: "Moins",
    });
  });

  it("🔴 une échéance refusée ne montre au client que son état : ni cause, ni phrase", async () => {
    const id = await open();
    await ctx.prisma.occurrence.update({
      where: { id: (await occurrenceOn(id, FIRST)).id },
      data: {
        state: "refused",
        cause: "unavailable_sku",
        reason: "Article indisponible.",
        settledAt: new Date(),
      },
    });

    const response = await ctx.asSub(OWNER).get("/subscriptions/mine").expect(200);
    const [view] = jsonBody<readonly SubscriptionView[]>(response);

    expect(view?.occurrences[0]?.state).toBe("refused");
    expect(Object.keys(view?.occurrences[0] ?? {})).not.toContain("cause");
    expect(JSON.stringify(response.body)).not.toContain("unavailable_sku");
    expect(JSON.stringify(response.body)).not.toContain("Article indisponible.");
  });
});

describe("rétablir une échéance (DELETE /subscriptions/:id/occurrences/:date)", () => {
  it("une échéance sautée revient au gabarit, avec son fait ; le rejeu n'écrit rien", async () => {
    const id = await open();
    await ctx
      .asSub(OWNER)
      .put(`/subscriptions/${id}/occurrences/${SECOND}`)
      .send({ skipped: true, note: "Fermé" })
      .expect(204);
    const changed = { where: { type: "recurring.basket_occurrence_changed" } };
    const before = await ctx.prisma.outboxMessage.count(changed);

    await ctx.asSub(OWNER).delete(`/subscriptions/${id}/occurrences/${SECOND}`).expect(204);
    await ctx.asSub(OWNER).delete(`/subscriptions/${id}/occurrences/${SECOND}`).expect(204);

    expect(await occurrenceOn(id, SECOND)).toMatchObject({
      state: "planned",
      lines: null,
      note: "",
    });
    expect(await ctx.prisma.outboxMessage.count(changed)).toBe(before + 1);
  });

  it("un étranger reçoit 404 et l'échéance reste sautée", async () => {
    const id = await open();
    await ctx
      .asSub(OWNER)
      .put(`/subscriptions/${id}/occurrences/${SECOND}`)
      .send({ skipped: true })
      .expect(204);

    await ctx.asSub(STRANGER).delete(`/subscriptions/${id}/occurrences/${SECOND}`).expect(404);

    expect((await occurrenceOn(id, SECOND)).state).toBe("skipped");
  });
});

/**
 * Régression : une date d'échéance hors AAAA-MM-JJ sortait en 500
 * `internal.unexpected` — le `ZodError` d'un `.parse` écrit dans la route
 * n'était pas catégorisé.
 */
describe("un chemin mal formé", () => {
  it("🔴 une date d'échéance mal formée est refusée en 400 qui nomme le paramètre, rien n'est écrit", async () => {
    const id = await open();

    const response = await ctx
      .asSub(OWNER)
      .put(`/subscriptions/${id}/occurrences/demain`)
      .send({ skipped: true });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain("date");
    expect(await ctx.prisma.occurrence.count({ where: { basketId: id, state: "skipped" } })).toBe(
      0,
    );
  });
});
