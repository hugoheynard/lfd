/**
 * E2E du **transfert de réassort seul**, vu de la livraison et du comptoir
 * (R3c, R3e de `documentation/reassort-boutiques/plan-reapprovisionnement.md`,
 * « Ce qui reste » du README du réassort — 2026-10-22).
 *
 * Ce qui ne s'éprouve qu'ici : le compte des réassorts d'un arrêt de
 * transfert lu en SQL (éléments portés, par genre), la file du comptoir qui
 * rend un transfert qu'aucune commande ne désigne, et sa réception par le
 * transfert lui-même jusqu'au réassort « arrivé » par la vraie boîte d'envoi.
 *
 * L'horloge est gelée la VEILLE de la journée servie (dans une semaine).
 */
import type { DeliveryRoundsDayView, HandoverQueueView } from "@lfd/contracts";
import { addDays, localToInstant } from "@lfd/contracts";

import { RoadTravelTimeReader } from "../src/delivery/channels/commerce/index.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { addVehicle, ROUNDS } from "./delivery-rounds-scene.js";
import { MEASURED, seedDeparture } from "./delivery-routing-scene.js";
import { FixedRoad, seedVillage } from "./internal-transfer-scene.js";
import {
  bootstrapProductionDay,
  closePlan,
  CROISSANT,
  SERVICE_DAY,
  STAFF,
} from "./production-day-fixture.js";
import { counterSent } from "./site-resupply-scene.js";

const EVE = addDays(SERVICE_DAY, -1);
const clock = new FixedClock(new Date());
let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay([
    { token: Clock, value: clock },
    { token: RoadTravelTimeReader, value: new FixedRoad() },
  ]));
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const eve = localToInstant(EVE, "12:00");
  if (eve === null) {
    throw new TypeError(`heure locale inexistante : ${EVE} 12:00`);
  }
  clock.set(eve);
});

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await ctx.drain();
  }
}

/** Deux réassorts du Village, aucune commande : un transfert de réassort seul. */
async function resupplyOnlyTransfer(): Promise<{
  readonly village: string;
  readonly transferId: string;
  readonly resupplyIds: readonly string[];
}> {
  await seedDeparture(ctx);
  await addVehicle(ctx, "Kangoo", MEASURED);
  const village = await seedVillage(ctx);
  const resupplyIds = [
    await counterSent(ctx.asSub(STAFF), village, "tomorrow", [{ sku: CROISSANT, quantity: 6 }]),
  ];
  await closePlan(ctx);
  await settle();
  const transfer = await ctx.prisma.deliveryInternalTransfer.findFirstOrThrow({
    select: { id: true },
  });
  return { village, transferId: transfer.id, resupplyIds };
}

function receiveTransfer(transferId: string, reason: string | null) {
  return ctx
    .asSub(STAFF)
    .post(`/admin/handover/transfers/${transferId}/reception`)
    .send({ reason });
}

describe("un transfert de réassort seul (R3c, R3e)", () => {
  /** Régression : l'arrêt d'un transfert de réassort seul se lisait « 0 commande ». */
  it("le tableau des tournées compte ses réassorts à part de ses commandes", async () => {
    const { transferId } = await resupplyOnlyTransfer();

    const view = jsonBody<DeliveryRoundsDayView>(
      await ctx.asSub(STAFF).get(`${ROUNDS}?day=${SERVICE_DAY}`).expect(200),
    );

    expect(view.rounds.flatMap((round) => round.transferStops ?? [])).toEqual([
      expect.objectContaining({ transferId, orderCount: 0, resupplyCount: 1 }),
    ]);
  });

  /** Régression : sans commande, aucun geste du comptoir ne pouvait le réceptionner. */
  it("la file du comptoir le rend, et il se réceptionne par lui-même jusqu'au réassort arrivé", async () => {
    const { village, transferId, resupplyIds } = await resupplyOnlyTransfer();

    const queue = jsonBody<HandoverQueueView>(
      await ctx.asSub(STAFF).get(`/admin/handover/file?jour=${SERVICE_DAY}`).expect(200),
    );
    expect(queue.resupplyTransfers).toEqual([
      expect.objectContaining({
        transferId,
        siteId: village,
        state: "planned",
        resupplyCount: 1,
      }),
    ]);

    // Jamais parti : réception manuelle, le motif est exigé.
    await receiveTransfer(transferId, null).expect(400);
    await receiveTransfer(transferId, "Monté par le fournil").expect(204);
    await settle();

    const transfer = await ctx.prisma.deliveryInternalTransfer.findUniqueOrThrow({
      where: { id: transferId },
      select: { receivedAt: true },
    });
    expect(transfer.receivedAt).not.toBeNull();
    const arrived = await ctx.prisma.siteResupply.findMany({
      where: { id: { in: [...resupplyIds] } },
      select: { arrivedAt: true },
    });
    expect(arrived.map((row) => row.arrivedAt)).toEqual([expect.any(Date)]);
    await receiveTransfer(transferId, "encore").expect(409);
  });

  it("un transfert inconnu : 404", async () => {
    await receiveTransfer("tr_inconnu", null).expect(404);
  });
});
