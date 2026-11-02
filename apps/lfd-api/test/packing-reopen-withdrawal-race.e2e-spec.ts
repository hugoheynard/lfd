/**
 * **Le retrait d'une liste défaite contre un geste au bac** — deux
 * transactions sur le vrai Postgres.
 *
 * Régression (audit du réassort, 2026-11-02) : la réouverture lisait les
 * feuilles intouchées puis effaçait par `orderId` seul, sans verrou. Une ligne
 * mise au bac entre la lecture et l'effacement disparaissait avec sa feuille,
 * et le reliquat (rang 2) d'une commande emportait la feuille de rang 1, qu'on
 * avait touchée. Désormais : `FOR UPDATE` sur les feuilles — le verrou de
 * chaque geste au bac —, le filtre relu sous verrou, l'effacement par paires.
 */
import { PackingListWithdrawal } from "../src/packing/domain/ports/packing-list-withdrawal.js";
import { PackingShadowLedger } from "../src/packing/domain/ports/packing-shadow.ledger.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { bootstrapE2e, serviceDay, type E2eContext } from "./e2e-harness.js";

const DAY = serviceDay();
const ORDER = "order_race";
const SKU = "SKU-CROISSANT";
/** Assez pour mettre le retrait en file sur une machine lente. */
const HOLD_TIMEOUT_MS = 20_000;
const POLL_MS = 25;

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Inscrit une feuille par l'écrivain réel du tirage. */
async function draw(rank: number): Promise<void> {
  await ctx.app.get(UnitOfWork).run(() =>
    ctx.app.get(PackingShadowLedger, { strict: false }).drawOrder({
      serviceDay: DAY,
      orderId: ORDER,
      rank,
      reference: `CMD-${String(rank)}`,
      customerLabel: "Client e2e",
      fulfillmentMethod: "pickup",
      dueAt: null,
      clientele: "pro",
      siteId: null,
      drawnAt: new Date(),
      containerMode: "counted",
      lines: [{ sku: SKU, productName: "Croissant", quantity: 4, saleUnit: "piece" }],
    }),
  );
}

function withdraw(): Promise<number> {
  return ctx.app
    .get(UnitOfWork)
    .run(() =>
      ctx.app.get(PackingListWithdrawal, { strict: false }).withdrawUntouched(DAY, [ORDER]),
    );
}

/** Les demandes de verrou de ligne encore en attente (le retrait, en file). */
async function untilRowWaiter(): Promise<void> {
  for (;;) {
    const rows = await ctx.prisma.$queryRaw<{ readonly waiting: bigint }[]>`
      SELECT count(*) AS waiting FROM pg_locks WHERE NOT granted`;
    if (Number(rows[0]?.waiting ?? 0n) > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

async function sheets(): Promise<readonly { rank: number; packed: number }[]> {
  const orders = await ctx.prisma.packingOrder.findMany({
    where: { serviceDay: DAY, orderId: ORDER },
    select: { rank: true, lines: { select: { packedAt: true } } },
    orderBy: { rank: "asc" },
  });
  return orders.map((order) => ({
    rank: order.rank,
    packed: order.lines.filter((line) => line.packedAt !== null).length,
  }));
}

describe("rouvrir une journée pendant qu'on met au bac", () => {
  it("une ligne mise au bac pendant le retrait garde sa feuille", async () => {
    await draw(1);
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held: () => void = () => undefined;
    const lockHeld = new Promise<void>((resolve) => {
      held = resolve;
    });
    // Le geste au bac : le verrou de la feuille, puis l'écriture de la ligne.
    const gesture = ctx.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT "order_id" FROM "packing"."packing_order"
           WHERE "service_day" = ${DAY} AND "order_id" = ${ORDER} AND "rank" = 1
             FOR UPDATE`;
        held();
        await released;
        await tx.packingLine.update({
          where: {
            serviceDay_orderId_rank_sku: { serviceDay: DAY, orderId: ORDER, rank: 1, sku: SKU },
          },
          data: { packedAt: new Date(), packedBy: "staff-e2e", packedInitials: "E2" },
        });
      },
      { timeout: HOLD_TIMEOUT_MS },
    );
    await lockHeld;

    const withdrawal = withdraw();
    await untilRowWaiter();
    release();
    await gesture;

    expect(await withdrawal).toBe(0);
    expect(await sheets()).toEqual([{ rank: 1, packed: 1 }]);
  });

  it("le reliquat intouché se retire sans emporter la feuille touchée de la commande", async () => {
    await draw(1);
    await draw(2);
    await ctx.prisma.packingLine.update({
      where: {
        serviceDay_orderId_rank_sku: { serviceDay: DAY, orderId: ORDER, rank: 1, sku: SKU },
      },
      data: { packedAt: new Date(), packedBy: "staff-e2e", packedInitials: "E2" },
    });

    expect(await withdraw()).toBe(1);
    expect(await sheets()).toEqual([{ rank: 1, packed: 1 }]);
  });
});
