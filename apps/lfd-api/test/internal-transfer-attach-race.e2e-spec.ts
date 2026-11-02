/**
 * **Deux réassorts du même point rangés en même temps** — deux transactions
 * sur le vrai Postgres, ordonnées par le verrou des transferts du jour.
 *
 * Régression (audit du réassort, 2026-11-02) : l'arrêt du plan et un
 * lancement « au plus tôt » — ou deux lancements — lisaient chacun « aucun
 * transfert prévu » pour le point, et en ouvraient chacun un. La version de
 * l'agrégat n'y voyait rien (deux créations), l'unicité des éléments non plus
 * (deux réassorts distincts) : deux transferts prévus pour un seul point.
 *
 * Le verrou est tenu par une troisième transaction, le temps de mettre les
 * deux rangements en file : Postgres accorde un verrou consultatif dans
 * l'ordre d'attente, donc le second voit le transfert que le premier a ouvert.
 *
 * ⚠️ La copie figée du fournil (`FrozenResuppliesReader`) est doublée : c'est
 * la porte d'un AUTRE bloc, et la course éprouvée est toute dans le SQL de la
 * livraison.
 */
import { TransferAttachment } from "../src/delivery/application/transfer-attachment.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import {
  type FrozenResupply,
  FrozenResuppliesReader,
} from "../src/production/channels/delivery/index.js";
import { bootstrapE2e, serviceDay, type E2eContext } from "./e2e-harness.js";

const DAY = serviceDay();
/** La clé du verrou — celle de `PrismaInternalTransferDayLock`. */
const TRANSFER_DAY_LOCK_KEY = `delivery_internal_transfer_day:${DAY}`;
const HOLD_TIMEOUT_MS = 20_000;
const POLL_MS = 25;

function frozen(resupplyId: string): FrozenResupply {
  return {
    resupplyId,
    serviceDay: DAY,
    siteId: "site_vv",
    siteLabel: "Val Village",
    name: null,
    servedByTransfer: true,
    lines: [],
    launchedAt: null,
  };
}

class TwoFrozenResupplies extends FrozenResuppliesReader {
  frozenOf(day: string, ids: readonly string[]): Promise<readonly FrozenResupply[]> {
    return Promise.resolve(
      [frozen("r_soir"), frozen("r_tot")].filter(
        (resupply) => resupply.serviceDay === day && ids.includes(resupply.resupplyId),
      ),
    );
  }
}

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: FrozenResuppliesReader, value: new TwoFrozenResupplies() }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

async function advisoryWaiters(): Promise<number> {
  const rows = await ctx.prisma.$queryRaw<{ readonly waiting: bigint }[]>`
    SELECT count(*) AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`;
  return Number(rows[0]?.waiting ?? 0n);
}

async function untilWaiters(count: number): Promise<void> {
  while ((await advisoryWaiters()) < count) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

function attach(resupplyId: string): Promise<number> {
  return ctx.app
    .get(UnitOfWork)
    .run(() =>
      ctx.app.get(TransferAttachment, { strict: false }).attachResupplies(DAY, [resupplyId]),
    );
}

describe("ranger deux réassorts d'un même point en même temps", () => {
  it("un seul transfert prévu les porte tous les deux", async () => {
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held: () => void = () => undefined;
    const lockHeld = new Promise<void>((resolve) => {
      held = resolve;
    });
    const holder = ctx.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${TRANSFER_DAY_LOCK_KEY}, 0))`;
        held();
        await released;
      },
      { timeout: HOLD_TIMEOUT_MS },
    );
    await lockHeld;

    const evening = attach("r_soir");
    const asap = attach("r_tot");
    await untilWaiters(2);
    release();
    await holder;

    expect([await evening, await asap]).toEqual([1, 1]);
    const transfers = await ctx.prisma.deliveryInternalTransfer.findMany({
      where: { serviceDay: DAY, siteId: "site_vv" },
      select: { items: { select: { resupplyId: true }, orderBy: { resupplyId: "asc" } } },
    });
    expect(transfers).toEqual([{ items: [{ resupplyId: "r_soir" }, { resupplyId: "r_tot" }] }]);
  });
});
