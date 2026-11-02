/**
 * **La livraison tient le plan contre la réouverture** — un vrai chargement de
 * bac, deux transactions sur le vrai Postgres, ordonnées par le verrou de la
 * journée.
 *
 * Régression (audit du réassort, 2026-11-02) : charger un bac ne prenait
 * aucun verrou commun avec la réouverture. Validé pendant qu'elle tenait le
 * sien, il restait invisible à sa lecture (« une tournée est-elle chargée ? »),
 * et le plan était effacé sous une tournée chargée. Désormais le chargement et
 * le départ tiennent le verrou en mode partagé et refusent un plan ROUVERT
 * (`ArrestedPlanHold`) ; une journée jamais arrêtée se charge comme avant —
 * toutes les autres suites de la livraison le prouvent.
 *
 * Le bac est posé par `BinDesk` sans contenant au colisage : le colisage n'a
 * pas commencé, la réouverture n'a que la livraison à regarder.
 * Mécanique : `day-lock-race.ts`.
 */
import { randomUUID } from "node:crypto";

import { settleCardPayments } from "./card-payments.js";
import { gate, holdDayLock, untilWaiters } from "./day-lock-race.js";
import { declareBins, loadBin } from "./delivery-loading-scene.js";
import { addVehicle, assign, openRound } from "./delivery-rounds-scene.js";
import { type E2eContext, jsonBody } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import {
  bootstrapProductionDay,
  closePlan,
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
} from "./production-day-fixture.js";

const SITE = {
  label: "Maison",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

/** Une livraison payée, la journée arrêtée, une tournée qui la porte, un bac posé. */
async function readyToLoad(): Promise<{ readonly roundId: string; readonly binId: string }> {
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
  });
  await ctx
    .asSub(MEMBER)
    .post(`/orders`)
    .send({
      idempotencyKey: randomUUID(),
      salesTerms: null,
      companyId: null,
      requestedDeliveryDate: SERVICE_DAY,
      fulfillmentMethod: "delivery",
      requestedWindow: { start: null, end: "10:00" },
      deliveryAddress: SITE,
      note: "",
      lines: [{ sku: CROISSANT, quantity: 4 }],
    })
    .expect(201);
  await settleCardPayments(ctx, issued);
  await closePlan(ctx);
  for (let round = 0; round < 4; round += 1) {
    await ctx.drain();
  }
  const order = await ctx.prisma.packingOrder.findFirstOrThrow({
    where: { serviceDay: SERVICE_DAY },
    select: { orderId: true },
  });
  const roundId = await openRound(ctx, SERVICE_DAY, await addVehicle(ctx, "Kangoo"));
  await assign(ctx, SERVICE_DAY, roundId, order.orderId);
  const [binId] = await declareBins(ctx, order.orderId, 1);
  return { roundId, binId: binId ?? "" };
}

function reopen() {
  return ctx
    .asSub(STAFF)
    .post(`/admin/production/batch/${SERVICE_DAY}/reopen`)
    .then((response) => response);
}

function load(roundId: string, binId: string) {
  return loadBin(ctx, roundId, { binId }).then((response) => response);
}

async function loadedBins(): Promise<number> {
  return ctx.prisma.deliveryBinLoad.count({
    where: { serviceDay: SERVICE_DAY, loadedAt: { not: null } },
  });
}

describe("la livraison tient le plan contre la réouverture", () => {
  it("🔴 un bac chargé derrière la réouverture est refusé : le plan a été rouvert", async () => {
    const { roundId, binId } = await readyToLoad();
    const release = gate();
    const holder = await holdDayLock(ctx, SERVICE_DAY, release.opened);

    const reopening = reopen();
    await untilWaiters(ctx, 1);
    const loading = load(roundId, binId);
    await untilWaiters(ctx, 2);
    release.open();
    await holder.done;

    expect((await reopening).status).toBe(201);
    const refused = await loading;
    expect(refused.status).toBe(409);
    const body = jsonBody<{ code: string; message: string }>(refused);
    expect(body.code).toBe("delivery.plan_reopened");
    expect(body.message).toContain("Réarrêtez la journée");
    expect(await loadedBins()).toBe(0);
  });

  it("un chargement qui tient le plan fait attendre la réouverture, qui le voit et refuse", async () => {
    const { roundId, binId } = await readyToLoad();
    const release = gate();
    const holder = await holdDayLock(ctx, SERVICE_DAY, release.opened);

    const loading = load(roundId, binId);
    await untilWaiters(ctx, 1);
    const reopening = reopen();
    await untilWaiters(ctx, 2);
    release.open();
    await holder.done;

    expect((await loading).status).toBe(204);
    const refused = await reopening;
    expect(refused.status).toBe(409);
    expect(jsonBody<{ message: string }>(refused).message).toContain("chargée ou partie");
    expect(await loadedBins()).toBe(1);
  });
});
