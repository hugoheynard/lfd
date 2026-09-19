/**
 * E2E : **les paniers récurrents entrent au journal**, dans la transaction du
 * geste (plan `documentation/journalisation/plan-journal-d-activite.md`, lot 1,
 * tranche (c), 2026-09-19).
 *
 * Ce que seule cette suite prouve : le fait est écrit dans la VRAIE table, sur
 * le panier, sous le VRAI auteur (l'id `users` du client, jamais son `sub`) ;
 * aucune ligne du journal ne porte l'adresse de livraison ni la note ; et un
 * journal qui refuse d'écrire annule le geste. La panne est posée comme dans
 * `order-waivers-journal` : une contrainte SQL qui refuse précisément le fait
 * attendu.
 */
import type { CreatedSubscription } from "../src/b2b/subscriptions/domain/ports/subscription.repository.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";

const OWNER = "auth0|panier-journal";
const REFUSAL = "e2e_journal_paniers_en_panne";
const STREET = "9 rue de la Roquette";
const NOTE_PHONE = "06 12 34 56 78";

/** La fenêtre et l'échéance, calculées UNE fois : fixture et assertion visent les mêmes. */
const START = serviceDay(1);
const END = serviceDay(90);
const OCCURRENCE = serviceDay(8);

let ctx: E2eContext;
let ownerId: string;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await repairJournal();
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await repairJournal();
  ownerId = (await createUser(ctx.prisma, { auth0Sub: OWNER })).id;
});

/** Livraison hebdomadaire : une adresse et une note — deux choses que le journal ne doit pas garder. */
function weeklyDelivery(): Record<string, unknown> {
  return {
    fromOrderId: null,
    recurrence: "weekly",
    startDate: START,
    endDate: END,
    fulfillmentMethod: "delivery",
    deliveryAddress: {
      label: "Boutique",
      ligne1: STREET,
      ligne2: "",
      codePostal: "75011",
      ville: "Paris",
      pays: "France",
    },
    pickupAddressId: null,
    lines: [{ sku: "VIE-001", quantity: 3 }],
    note: `Sonner au ${NOTE_PHONE}`,
  };
}

async function createSubscription(): Promise<string> {
  const response = await ctx.asSub(OWNER).post("/subscriptions").send(weeklyDelivery()).expect(201);
  return jsonBody<CreatedSubscription>(response).id;
}

/** Le journal refuse d'écrire CE type de fait — une panne d'append, la vraie. */
async function breakJournal(type: string): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(
    `ALTER TABLE growth.activity_events
       ADD CONSTRAINT ${REFUSAL} CHECK (type <> '${type}') NOT VALID`,
  );
}

async function repairJournal(): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(
    `ALTER TABLE growth.activity_events DROP CONSTRAINT IF EXISTS ${REFUSAL}`,
  );
}

async function facts(type: string) {
  return ctx.prisma.activityEvent.findMany({
    where: { type },
    orderBy: { id: "asc" },
    select: { subjectType: true, subjectId: true, actorType: true, actorId: true, payload: true },
  });
}

/** Toutes les lignes du journal, en texte : ce qu'un lecteur du journal pourrait y trouver. */
async function journalText(): Promise<string> {
  const rows = await ctx.prisma.$queryRawUnsafe<{ line: string }[]>(
    `SELECT row_to_json(e)::text AS line FROM growth.activity_events e`,
  );
  return rows.map((row) => row.line).join("\n");
}

describe("les gestes du client sur son panier", () => {
  it("suspendre puis reprendre : un fait chacun, l'avant et l'après, sous l'id du client", async () => {
    const id = await createSubscription();

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

    const author = {
      subjectType: "subscription",
      subjectId: id,
      actorType: "customer",
      actorId: ownerId,
    };
    expect(await facts("subscription.status_changed")).toEqual([
      { ...author, payload: { before: "active", after: "paused" } },
      { ...author, payload: { before: "paused", after: "active" } },
    ]);
  });

  it("déroger à une échéance : la dérogation, et celle qu'elle remplace", async () => {
    const id = await createSubscription();
    const put = `/subscriptions/${id}/occurrences/${OCCURRENCE}`;

    await ctx.asSub(OWNER).put(put).send({ skipped: true }).expect(204);
    await ctx
      .asSub(OWNER)
      .put(put)
      .send({ skipped: false, lines: [{ sku: "VIE-001", quantity: 5 }], note: NOTE_PHONE })
      .expect(204);

    const written = await facts("subscription.occurrence_overridden");
    expect(written.map((fact) => fact.payload)).toEqual([
      { date: OCCURRENCE, before: null, after: { skipped: true, lines: [] } },
      {
        date: OCCURRENCE,
        before: { skipped: true, lines: [] },
        after: { skipped: false, lines: [{ sku: "VIE-001", quantity: 5 }] },
      },
    ]);
    expect(written[0]).toMatchObject({ subjectId: id, actorId: ownerId });
  });

  it("supprimer : la ligne disparaît, le fait garde ce que le panier décidait", async () => {
    const id = await createSubscription();

    await ctx.asSub(OWNER).delete(`/subscriptions/${id}`).expect(204);

    expect(await ctx.prisma.subscription.count({ where: { id } })).toBe(0);
    expect(await facts("subscription.deleted")).toEqual([
      {
        subjectType: "subscription",
        subjectId: id,
        actorType: "customer",
        actorId: ownerId,
        payload: {
          recurrence: "weekly",
          status: "active",
          startDate: START,
          endDate: END,
          fulfillmentMethod: "delivery",
          pickupAddressId: null,
          lines: [{ sku: "VIE-001", quantity: 3 }],
        },
      },
    ]);
  });

  it("aucune ligne du journal ne porte l'adresse de livraison, la note, ni le sub", async () => {
    const id = await createSubscription();
    await ctx
      .asSub(OWNER)
      .patch(`/subscriptions/${id}/status`)
      .send({ status: "paused" })
      .expect(204);
    await ctx
      .asSub(OWNER)
      .put(`/subscriptions/${id}/occurrences/${OCCURRENCE}`)
      .send({ skipped: false, lines: [{ sku: "VIE-001", quantity: 1 }], note: NOTE_PHONE })
      .expect(204);
    await ctx.asSub(OWNER).delete(`/subscriptions/${id}`).expect(204);
    await ctx.drain();

    const text = await journalText();
    expect(text).toContain("subscription.deleted");
    for (const secret of [STREET, NOTE_PHONE, OWNER]) {
      expect(text).not.toContain(secret);
    }
  });
});

describe("un journal en panne annule le geste", () => {
  it("la suspension n'a pas lieu", async () => {
    const id = await createSubscription();
    await breakJournal("subscription.status_changed");

    const response = await ctx
      .asSub(OWNER)
      .patch(`/subscriptions/${id}/status`)
      .send({ status: "paused" });

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect((await ctx.prisma.subscription.findUniqueOrThrow({ where: { id } })).status).toBe(
      "active",
    );
  });

  it("la dérogation n'est pas écrite", async () => {
    const id = await createSubscription();
    await breakJournal("subscription.occurrence_overridden");

    const response = await ctx
      .asSub(OWNER)
      .put(`/subscriptions/${id}/occurrences/${OCCURRENCE}`)
      .send({ skipped: true });

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await ctx.prisma.subscriptionOccurrence.count({ where: { subscriptionId: id } })).toBe(
      0,
    );
  });

  it("le panier n'est pas supprimé", async () => {
    const id = await createSubscription();
    await breakJournal("subscription.deleted");

    const response = await ctx.asSub(OWNER).delete(`/subscriptions/${id}`);

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await ctx.prisma.subscription.count({ where: { id } })).toBe(1);
  });
});
