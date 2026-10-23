/**
 * **Le dépôt et l'annulation d'un même lot, au même instant** — contre la
 * vraie base (revue qualité du prélèvement, 2026-10-23).
 *
 * Régression : ni le dépôt ni l'annulation ne prenaient le verrou du lot, et
 * le lot s'écrivait sur son `id` seul. Aucune contrainte ni déclencheur ne
 * refusait `deposited ↔ cancelled` (seul `rejected_by_bank` est tenu par
 * `collection_batch_transition`) : deux gestes simultanés lisaient tous deux
 * un lot `constituted`, le dernier écrit gagnait, et les commandes restaient
 * dans l'état de l'autre.
 */
import { CollectionBatchChangedConcurrentlyError } from "../src/b2b/accounting/domain/errors/collection-errors.js";
import { CollectionBatchRepository } from "../src/b2b/accounting/domain/ports/collection-batch.repository.js";
import { invoicingMomentOf } from "../src/b2b/accounting/domain/services/invoicing-closures.js";
import { StatementMonth } from "../src/b2b/accounting/domain/value-objects/statement-month.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { invoicedPayer, setUpEntity } from "./collection-returns-scene.js";
import { bootstrapE2e, daysAgo, type E2eContext } from "./e2e-harness.js";

const HOUR_MS = 60 * 60 * 1000;
const COLLECTION = "/admin/accounting/collection";
const CONFLICT = 409;
const NO_CONTENT = 204;

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};
const recordingMailer = {
  enabled: true,
  send: (): Promise<{ providerId: null }> => Promise.resolve({ providerId: null }),
};

const clock = new FixedClock(new Date());
let ctx: E2eContext;
let closesAt: Date;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: MAILER, value: recordingMailer },
      { token: Clock, value: clock },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const month = StatementMonth.containing(new Date(daysAgo(0))).previous();
  closesAt = month.cycle().closesAt;
  clock.set(new Date(invoicingMomentOf(closesAt).getTime() + 2 * 60 * 1000));
  await ctx.prisma.collectionFloor.create({ data: { id: true, floorAt: month.cycle().startsAt } });
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

/** Un lot constitué, avis partis, fichier téléchargé : prêt à déposer ou annuler. */
async function readyBatch(): Promise<string> {
  const entityId = await setUpEntity(staff);
  await invoicedPayer(ctx, staff, entityId, closesAt);
  clock.set(new Date(closesAt.getTime() + 2 * HOUR_MS));
  await staff().post(`${COLLECTION}/batches`).send({ legalEntityId: entityId }).expect(201);
  await ctx.drain();
  const { id } = await ctx.prisma.collectionBatch.findFirstOrThrow({
    where: { status: "constituted" },
  });
  await staff().get(`${COLLECTION}/batches/${id}/file.xml`).expect(200);
  return id;
}

async function orderStatesOf(batchId: string): Promise<readonly string[]> {
  const rows = await ctx.prisma.orderCollection.findMany({
    where: { OR: [{ batchId }, { batchId: null }] },
    select: { state: true },
  });
  return rows.map((row) => row.state);
}

describe("dépôt et annulation simultanés du même lot", () => {
  it("exactement un réussit, l'autre est refusé en 409, et lot comme commandes disent la même chose", async () => {
    const id = await readyBatch();

    const [deposit, cancel] = await Promise.all([
      staff().post(`${COLLECTION}/batches/${id}/deposit`),
      staff().post(`${COLLECTION}/batches/${id}/cancel`),
    ]);

    expect([deposit.status, cancel.status].sort()).toEqual([NO_CONTENT, CONFLICT]);
    const batch = await ctx.prisma.collectionBatch.findUniqueOrThrow({ where: { id } });
    const states = await orderStatesOf(id);
    expect(states.length).toBeGreaterThan(0);
    if (deposit.status === NO_CONTENT) {
      expect(batch.status).toBe("deposited");
      expect(batch.cancelledAt).toBeNull();
      expect(new Set(states)).toEqual(new Set(["collected"]));
    } else {
      expect(batch.status).toBe("cancelled");
      expect(batch.depositedAt).toBeNull();
      expect(new Set(states)).toEqual(new Set(["due"]));
    }
  });
});

describe("l'écriture conditionnelle du lot", () => {
  it("un lot chargé puis changé par un autre geste ne s'écrase pas : refus nommé, base intacte", async () => {
    const id = await readyBatch();
    const repository = ctx.app.get(CollectionBatchRepository);
    const stale = await repository.load(id);
    await staff().post(`${COLLECTION}/batches/${id}/cancel`).expect(NO_CONTENT);

    stale?.recordDownload(clock.now());
    const write = stale === null ? Promise.resolve() : repository.save(stale);

    await expect(write).rejects.toBeInstanceOf(CollectionBatchChangedConcurrentlyError);
    await expect(write).rejects.toThrow("a changé d'état pendant le geste");
    const batch = await ctx.prisma.collectionBatch.findUniqueOrThrow({ where: { id } });
    expect(batch.status).toBe("cancelled");
  });

  it("le fichier d'un lot annulé se retélécharge toujours", async () => {
    const id = await readyBatch();
    await staff().post(`${COLLECTION}/batches/${id}/cancel`).expect(NO_CONTENT);

    await staff().get(`${COLLECTION}/batches/${id}/file.xml`).expect(200);

    const batch = await ctx.prisma.collectionBatch.findUniqueOrThrow({ where: { id } });
    expect(batch.status).toBe("cancelled");
  });
});
