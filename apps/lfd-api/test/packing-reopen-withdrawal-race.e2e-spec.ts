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
 *
 * Le geste au bac est le VRAI — ouvrir un sac (`POST …/containers`), le
 * premier de tout geste au bac : il prend le verrou de sa feuille, puis
 * attend d'écrire son contenant, la table des contenants étant tenue par la
 * suite. Le retrait se met en file derrière la feuille ; la table rendue, le
 * sac naît, et le retrait relit une feuille touchée.
 * Le retrait est appelé par son port : par la route, la réouverture prendrait
 * d'abord le verrou EXCLUSIF de la journée, que le geste tient en partagé, et
 * la course ne se jouerait jamais sur la feuille.
 */
import { addDays, localToInstant } from "@lfd/contracts";

import { PackingListWithdrawal } from "../src/packing/domain/ports/packing-list-withdrawal.js";
import { PackingShadowLedger } from "../src/packing/domain/ports/packing-shadow.ledger.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { gate, holdTableForReading, started, untilBlocked } from "./day-lock-race.js";
import type { E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import {
  bootstrapProductionDay,
  closePlan,
  CROISSANT,
  MEMBER,
  packingOrderPath,
  place,
  references,
  SERVICE_DAY,
  sheetOf,
  STAFF,
} from "./production-day-fixture.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";

const ORDER = "order_race";
const SKU = "SKU-CROISSANT";
const clock = new FixedClock(new Date());

let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay([{ token: Clock, value: clock }]));
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const eve = localToInstant(addDays(SERVICE_DAY, -1), "12:00");
  if (eve === null) {
    throw new TypeError(`heure locale inexistante : la veille de ${SERVICE_DAY} à 12:00`);
  }
  clock.set(eve);
});

/** Inscrit une feuille par l'écrivain réel du tirage. */
async function draw(rank: number): Promise<void> {
  await ctx.app.get(UnitOfWork).run(() =>
    ctx.app.get(PackingShadowLedger, { strict: false }).drawOrder({
      serviceDay: SERVICE_DAY,
      orderId: ORDER,
      rank,
      reference: `CMD-${String(rank)}`,
      customerLabel: "Client e2e",
      fulfillmentMethod: "pickup",
      dueAt: null,
      clientele: "pro",
      siteId: null,
      drawnAt: clock.now(),
      containerMode: "counted",
      lines: [{ sku: SKU, productName: "Croissant", quantity: 4, saleUnit: "piece" }],
    }),
  );
}

function withdraw(orderId: string): Promise<number> {
  return ctx.app
    .get(UnitOfWork)
    .run(() =>
      ctx.app
        .get(PackingListWithdrawal, { strict: false })
        .withdrawUntouched(SERVICE_DAY, [orderId]),
    );
}

async function sheets(orderId: string): Promise<readonly { rank: number; packed: number }[]> {
  const orders = await ctx.prisma.packingOrder.findMany({
    where: { serviceDay: SERVICE_DAY, orderId },
    select: { rank: true, lines: { select: { packedAt: true } } },
    orderBy: { rank: "asc" },
  });
  return orders.map((order) => ({
    rank: order.rank,
    packed: order.lines.filter((line) => line.packedAt !== null).length,
  }));
}

describe("rouvrir une journée pendant qu'on met au bac", () => {
  it("un sac ouvert pendant le retrait garde sa feuille", async () => {
    await createUser(ctx.prisma, { auth0Sub: MEMBER });
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 4 }]);
    await closePlan(ctx);
    await ctx.drain();
    const [reference] = await references(ctx);
    const sheet = await sheetOf(ctx, reference ?? "");
    const release = gate();
    const holder = await holdTableForReading(ctx, "packing_container", release.opened);

    // Le geste tient sa feuille et attend d'écrire son sac ; le retrait attend la feuille.
    const opened = started(
      ctx
        .asSub(STAFF)
        .post(`${packingOrderPath(sheet.orderId)}/containers`)
        .set(INTENT_KEY, freshIntent())
        .send({ nature: "bag" }),
    );
    await untilBlocked(ctx, 1, opened);
    const withdrawal = started(withdraw(sheet.orderId));
    await untilBlocked(ctx, 2, Promise.race([opened, withdrawal]));
    release.open();
    await holder.done;

    const [answer, withdrawn] = await Promise.all([opened, withdrawal]);
    expect([answer.status, withdrawn]).toEqual([201, 0]);
    expect(await sheets(sheet.orderId)).toEqual([{ rank: 1, packed: 0 }]);
    expect(await ctx.prisma.packingContainer.count({ where: { orderId: sheet.orderId } })).toBe(1);
  });

  it("le reliquat intouché se retire sans emporter la feuille touchée de la commande", async () => {
    await draw(1);
    await draw(2);
    await ctx.prisma.packingLine.update({
      where: {
        serviceDay_orderId_rank_sku: {
          serviceDay: SERVICE_DAY,
          orderId: ORDER,
          rank: 1,
          sku: SKU,
        },
      },
      data: { packedAt: clock.now(), packedBy: "staff-e2e", packedInitials: "E2" },
    });

    expect(await withdraw(ORDER)).toBe(1);
    expect(await sheets(ORDER)).toEqual([{ rank: 1, packed: 1 }]);
  });
});
