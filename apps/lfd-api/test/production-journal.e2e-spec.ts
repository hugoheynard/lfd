import { randomUUID } from "node:crypto";
/**
 * E2E : **la journée de production entre au journal** — sa clôture, son
 * retirage et le réglage des contenants, dans la transaction du geste (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1, tranche (d),
 * 2026-09-19).
 *
 * Ce que seule cette suite prouve, contre du vrai SQL :
 *
 * - le fait est écrit dans la VRAIE table, sous la fiche staff résolue par le
 *   garde — jamais le `sub` ;
 * - la transaction couvre les deux schémas : un journal (`growth`) qui refuse
 *   d'écrire annule la journée (`production`) ;
 * - l'événement du canal part toujours APRÈS : le commerce confirme ses
 *   commandes à la clôture, et une clôture annulée ne lui annonce rien.
 *
 * La panne est posée comme dans `order-waivers-journal` : une contrainte SQL
 * qui refuse précisément le fait attendu, plutôt qu'un double du port.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { settleCardPayments } from "./card-payments.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { createUser } from "./factories.js";

const MEMBER = "auth0|member-production-journal";
const REFUSAL = "e2e_journal_production_en_panne";
/** Une journée à venir, calculée UNE fois : fixture et assertion visent la même. */
const DAY = serviceDay();
const CROISSANT = "VIE-001";

const SITE = {
  label: "Boutique",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let intentCount = 0;
const issuedIntents: string[] = [];
const fakeGateway = {
  createIntent: () => {
    intentCount += 1;
    const id = `pi_e2e_journal_${String(intentCount)}`;
    issuedIntents.push(id);
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await repairJournal();
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await repairJournal();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

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

/** Passe — et règle — une commande de retrait pour la journée servie. */
async function place(quantity: number): Promise<void> {
  const point = await ctx.prisma.pickupAddress.findFirst({ select: { id: true } });
  const id =
    point?.id ?? (await ctx.prisma.pickupAddress.create({ data: { ...SITE, isDefault: true } })).id;
  await ctx
    .asSub(MEMBER)
    .post(`/orders`)
    .send({
      idempotencyKey: randomUUID(),
      companyId: null,
      requestedDeliveryDate: DAY,
      fulfillmentMethod: "pickup",
      pickupAddressId: id,
      note: "",
      lines: [{ sku: CROISSANT, quantity }],
    })
    .expect(201);
  await settleCardPayments(ctx, issuedIntents);
}

const close = () => staff().post(`/admin/production/batch/${DAY}/close`);
const retake = () => staff().post(`/admin/production/worksheet/${DAY}/retake`);

async function confirmedOrders(): Promise<number> {
  await ctx.drain();
  return ctx.prisma.order.count({ where: { status: "confirmed" } });
}

describe("clore une journée", () => {
  it("un fait sur la journée, sous la fiche staff, et le commerce confirme", async () => {
    await place(12);
    await place(6);

    await close().expect(201);

    expect(await facts("production_day.closed")).toEqual([
      {
        subjectType: "production_day",
        subjectId: DAY,
        actorType: "staff",
        actorId: E2E_STAFF_ID,
        payload: { serviceDay: DAY, absorbed: 2 },
      },
    ]);
    // L'événement du canal est toujours parti, après la transaction.
    expect(await confirmedOrders()).toBe(2);
  });

  it("la réannonce n'écrit AUCUN fait — rien n'a changé", async () => {
    await place(12);
    await close().expect(201);

    const again = await close().expect(201);

    expect((again.body as { alreadyClosed: boolean }).alreadyClosed).toBe(true);
    expect(await facts("production_day.closed")).toHaveLength(1);
    expect(await confirmedOrders()).toBe(1);
  });

  it("ANNULE la clôture quand le journal refuse d'écrire — et n'annonce rien", async () => {
    await place(12);
    await breakJournal("production_day.closed");

    const response = await close();

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await ctx.prisma.productionDay.count({ where: { closedAt: { not: null } } })).toBe(0);
    expect(await confirmedOrders()).toBe(0);
  });
});

describe("reprendre le tirage", () => {
  it("un fait quand le retirage absorbe, aucun quand il n'absorbe rien", async () => {
    await place(12);
    await close().expect(201);
    await place(6);

    await retake().expect(201);
    await retake().expect(201);

    expect(await facts("production_day.retaken")).toEqual([
      {
        subjectType: "production_day",
        subjectId: DAY,
        actorType: "staff",
        actorId: E2E_STAFF_ID,
        payload: { serviceDay: DAY, absorbed: 1 },
      },
    ]);
  });

  it("ANNULE le retirage quand le journal refuse d'écrire", async () => {
    await place(12);
    await close().expect(201);
    await place(6);
    await breakJournal("production_day.retaken");

    const response = await retake();

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await ctx.prisma.productionOrder.count()).toBe(1);
    expect(await ctx.prisma.productionDay.count({ where: { retakenAt: { not: null } } })).toBe(0);
  });
});

describe("le contenant d'un article", () => {
  const CONTAINER = `/admin/production/containers/${CROISSANT}`;
  const PLAQUE = { unitsPerContainer: 10, singular: "plaque", plural: "plaques" };
  const GRANDE_PLAQUE = { unitsPerContainer: 12, singular: "plaque", plural: "plaques" };

  it("poser, remplacer : un fait chacun, l'avant et l'après, sous la fiche staff", async () => {
    await staff().put(CONTAINER).send(PLAQUE).expect(204);
    await staff().put(CONTAINER).send(GRANDE_PLAQUE).expect(204);
    // Reposé à l'identique : rien de ce que la fiche annonce n'a bougé.
    await staff().put(CONTAINER).send(GRANDE_PLAQUE).expect(204);

    const fact = { subjectType: "production_container", subjectId: CROISSANT };
    expect(await facts("production_container.set")).toEqual([
      {
        ...fact,
        actorType: "staff",
        actorId: E2E_STAFF_ID,
        payload: { before: null, after: PLAQUE },
      },
      {
        ...fact,
        actorType: "staff",
        actorId: E2E_STAFF_ID,
        payload: { before: PLAQUE, after: GRANDE_PLAQUE },
      },
    ]);
  });

  it("retirer : un fait qui garde ce que le réglage valait ; un second retrait n'en écrit pas", async () => {
    await staff().put(CONTAINER).send(PLAQUE).expect(204);

    await staff().delete(CONTAINER).expect(204);
    await staff().delete(CONTAINER).expect(204);

    const written = await facts("production_container.removed");
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ actorId: E2E_STAFF_ID, payload: { before: PLAQUE } });
  });

  it("ANNULE la pose quand le journal refuse d'écrire", async () => {
    await breakJournal("production_container.set");

    const response = await staff().put(CONTAINER).send(PLAQUE);

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await ctx.prisma.productionContainer.count()).toBe(0);
  });

  it("ANNULE le retrait quand le journal refuse d'écrire — le réglage reste", async () => {
    await staff().put(CONTAINER).send(PLAQUE).expect(204);
    await breakJournal("production_container.removed");

    const response = await staff().delete(CONTAINER);

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await ctx.prisma.productionContainer.count()).toBe(1);
  });
});
