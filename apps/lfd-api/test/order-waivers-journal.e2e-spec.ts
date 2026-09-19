/**
 * E2E : **la surtaxe de retard et les dérogations d'heure limite entrent au
 * journal**, dans la transaction du geste (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1, tranche (a),
 * 2026-09-19).
 *
 * Ce que seule cette suite prouve : le fait est écrit dans la VRAIE table, sous
 * le VRAI auteur (la fiche staff résolue par le garde) — et un journal qui
 * refuse d'écrire annule le geste. La panne est posée comme dans
 * `pim-journal-atomicity` : une contrainte SQL qui refuse précisément le fait
 * attendu, plutôt qu'un double du port qui ferait échouer un faux journal.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const REFUSAL = "e2e_journal_argent_en_panne";
const LATE_FEE = "/admin/order-late-fee";
const WAIVERS = "/admin/order-cutoff-waivers";
const FIVE_EUROS = { fee: { mode: "amount", cents: 500 }, vatRatePercent: 20 };
const REASON = "Client bloqué en tournée";
/** La raison sociale de `createCompany`, sans enseigne : c'est donc elle qui nomme le client. */
const COMPANY_NAME = "Café de Test SAS";
/** Une journée à venir, calculée UNE fois : fixture et assertion visent la même. */
const DAY = serviceDay(3);

let ctx: E2eContext;
let companyId: string;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await repairJournal();
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await repairJournal();
  companyId = (await createCompany(ctx.prisma)).id;
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

async function grantWaiver(): Promise<string> {
  const response = await staff()
    .post(WAIVERS)
    .send({ companyId, fulfillmentDate: DAY, reason: REASON })
    .expect(201);
  return (response.body as { id: string }).id;
}

describe("la surtaxe de retard", () => {
  it("poser : un fait, l'avant et l'après en centimes, sous la fiche staff", async () => {
    await staff().put(LATE_FEE).send(FIVE_EUROS).expect(204);
    await staff()
      .put(LATE_FEE)
      .send({ fee: { mode: "amount", cents: 800 }, vatRatePercent: 20 })
      .expect(204);

    const written = await facts("order_late_fee.set");
    expect(written).toEqual([
      {
        subjectType: "order_late_fee",
        subjectId: "singleton",
        actorType: "staff",
        actorId: E2E_STAFF_ID,
        payload: { before: null, after: FIVE_EUROS },
      },
      {
        subjectType: "order_late_fee",
        subjectId: "singleton",
        actorType: "staff",
        actorId: E2E_STAFF_ID,
        payload: {
          before: FIVE_EUROS,
          after: { fee: { mode: "amount", cents: 800 }, vatRatePercent: 20 },
        },
      },
    ]);
  });

  it("retirer : un fait qui dit ce que la surtaxe valait", async () => {
    await staff().put(LATE_FEE).send(FIVE_EUROS).expect(204);

    await staff().delete(LATE_FEE).expect(204);

    const written = await facts("order_late_fee.cleared");
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ actorId: E2E_STAFF_ID, payload: { before: FIVE_EUROS } });
  });

  it("ANNULE la pose quand le journal refuse d'écrire", async () => {
    await breakJournal("order_late_fee.set");

    const response = await staff().put(LATE_FEE).send(FIVE_EUROS);

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await ctx.prisma.orderLateFee.count()).toBe(0);
  });

  it("ANNULE le retrait quand le journal refuse d'écrire", async () => {
    await staff().put(LATE_FEE).send(FIVE_EUROS).expect(204);
    await breakJournal("order_late_fee.cleared");

    const response = await staff().delete(LATE_FEE);

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await ctx.prisma.orderLateFee.count()).toBe(1);
  });
});

describe("les dérogations d'heure limite", () => {
  it("accorder : un fait sur la dérogation, pour qui, quel jour, pourquoi", async () => {
    const waiverId = await grantWaiver();

    expect(await facts("order_cutoff_waiver.granted")).toEqual([
      {
        subjectType: "order_cutoff_waiver",
        subjectId: waiverId,
        actorType: "staff",
        actorId: E2E_STAFF_ID,
        payload: {
          company: { id: companyId, name: COMPANY_NAME },
          fulfillmentDate: DAY,
          reason: REASON,
        },
      },
    ]);
  });

  it("retirer : un fait qui garde la décision, alors que la ligne disparaît", async () => {
    const waiverId = await grantWaiver();

    await staff().delete(`${WAIVERS}/${waiverId}`).expect(204);

    expect(await ctx.prisma.orderCutoffWaiver.count()).toBe(0);
    const written = await facts("order_cutoff_waiver.revoked");
    expect(written).toEqual([
      {
        subjectType: "order_cutoff_waiver",
        subjectId: waiverId,
        actorType: "staff",
        actorId: E2E_STAFF_ID,
        payload: {
          company: { id: companyId, name: COMPANY_NAME },
          fulfillmentDate: DAY,
          reason: REASON,
        },
      },
    ]);
  });

  it("fige le nom du client : renommé ensuite, la ligne de l'accord garde l'ancien (D5)", async () => {
    const waiverId = await grantWaiver();
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { enseigne: "Le Nouveau Nom" },
    });

    await staff().delete(`${WAIVERS}/${waiverId}`).expect(204);

    const [granted] = await facts("order_cutoff_waiver.granted");
    const [revoked] = await facts("order_cutoff_waiver.revoked");
    expect(granted?.payload).toMatchObject({ company: { id: companyId, name: COMPANY_NAME } });
    expect(revoked?.payload).toMatchObject({ company: { id: companyId, name: "Le Nouveau Nom" } });
  });

  it("ANNULE l'accord quand le journal refuse d'écrire", async () => {
    await breakJournal("order_cutoff_waiver.granted");

    const response = await staff()
      .post(WAIVERS)
      .send({ companyId, fulfillmentDate: DAY, reason: REASON });

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await ctx.prisma.orderCutoffWaiver.count()).toBe(0);
  });

  it("ANNULE le retrait quand le journal refuse d'écrire — la dérogation reste", async () => {
    const waiverId = await grantWaiver();
    await breakJournal("order_cutoff_waiver.revoked");

    const response = await staff().delete(`${WAIVERS}/${waiverId}`);

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await ctx.prisma.orderCutoffWaiver.count({ where: { id: waiverId } })).toBe(1);
  });

  it("un retrait refusé (déjà retirée) n'écrit aucun fait", async () => {
    const waiverId = await grantWaiver();
    await staff().delete(`${WAIVERS}/${waiverId}`).expect(204);

    await staff().delete(`${WAIVERS}/${waiverId}`).expect(404);

    expect(await facts("order_cutoff_waiver.revoked")).toHaveLength(1);
  });
});
