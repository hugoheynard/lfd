/**
 * E2E du **chargement, véhicule par véhicule** — le parcours
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 4, v4).
 *
 * Ce que seul l'e2e prouve : l'index unique des codes, la ligne de chargement
 * qui appartient à l'ARRÊT (un arrêt retiré emporte ses chargements), le gel
 * posé en base par « Partir » et la feuille figée dans la même transaction,
 * l'acteur des faits.
 */
import type { DeliveryBinDetailView, DeliveryLoadingDayView } from "@lfd/contracts";

import {
  bootstrapE2e,
  E2E_STAFF_ID,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import {
  ADMIN_VERIFIER_OVERRIDE,
  admin,
  assign,
  forgetCustomer,
  ROUNDS,
  roundOf,
} from "./delivery-rounds-scene.js";
import {
  BINS,
  binTypeId,
  composedOrder,
  declareBins,
  depart,
  LOADING,
  loadBin,
  loadingOf,
  orderBins,
} from "./delivery-loading-scene.js";

const DAY = serviceDay();

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  forgetCustomer();
});

describe("déclarer, puis charger", () => {
  it("déclare des bacs à codes uniques ; lire et réimprimer n'écrivent rien", async () => {
    const { order } = await composedOrder(ctx, DAY, "Kangoo");

    const binIds = await declareBins(ctx, order.id, 3);
    const first = await orderBins(ctx, order.id);
    const again = await orderBins(ctx, order.id);

    expect(again).toEqual(first);
    expect(first.bins.map(({ index, total }) => `${String(index)}/${String(total)}`)).toEqual([
      "1/3",
      "2/3",
      "3/3",
    ]);
    expect(new Set(first.bins.map((bin) => bin.code)).size).toBe(3);
    expect(first.bins.every((bin) => /^[0-9A-HJKMNP-TV-Z]{6}$/u.test(bin.code))).toBe(true);
    expect(await ctx.prisma.deliveryBin.count()).toBe(binIds.length);
    const declared = await ctx.prisma.activityEvent.findMany({
      where: { type: "delivery_bin.declared" },
      select: { subjectId: true, actorId: true },
    });
    expect(declared).toEqual([{ subjectId: order.id, actorId: E2E_STAFF_ID }]);
  });

  it("charge par le QR puis par le code tapé : l'arrêt passe de partiel à chargé", async () => {
    const { roundId, order } = await composedOrder(ctx, DAY, "Kangoo");
    const [first, second] = await declareBins(ctx, order.id, 2);
    const { bins } = await orderBins(ctx, order.id);

    await loadBin(ctx, roundId, { binId: first ?? "" }).expect(204);
    expect((await loadingOf(ctx, roundId)).stops[0]?.state).toBe("partial");
    await loadBin(ctx, roundId, { code: (bins[1]?.code ?? "").toLowerCase() }).expect(204);

    const view = await loadingOf(ctx, roundId);
    expect(view.stops[0]?.state).toBe("loaded");
    const rows = await ctx.prisma.deliveryBinLoad.findMany({
      orderBy: { binId: "asc" },
      select: { binId: true, loadedVia: true, loadedBy: true, serviceDay: true },
    });
    expect(rows).toEqual(
      [
        { binId: first, loadedVia: "scan", loadedBy: E2E_STAFF_ID, serviceDay: DAY },
        { binId: second, loadedVia: "code", loadedBy: E2E_STAFF_ID, serviceDay: DAY },
      ].sort((a, b) => (a.binId ?? "").localeCompare(b.binId ?? "")),
    );
  });

  it("charger deux fois le même bac ne compte, n'écrit et ne trace qu'une fois", async () => {
    const { roundId, order } = await composedOrder(ctx, DAY, "Kangoo");
    const [binId] = await declareBins(ctx, order.id, 1);

    await loadBin(ctx, roundId, { binId: binId ?? "" }).expect(204);
    await loadBin(ctx, roundId, { binId: binId ?? "" }).expect(204);

    expect(await ctx.prisma.deliveryBinLoad.count()).toBe(1);
    expect(await ctx.prisma.activityEvent.count({ where: { type: "delivery_bin.loaded" } })).toBe(
      1,
    );
  });

  it("ouvrir le QR d'un bac montre sa tournée, et ne charge rien", async () => {
    const { roundId, order } = await composedOrder(ctx, DAY, "Kangoo blanc");
    const [binId] = await declareBins(ctx, order.id, 1);

    const detail = jsonBody<DeliveryBinDetailView>(
      await admin(ctx)
        .get(`${BINS}/${binId ?? ""}`)
        .expect(200),
    );

    expect(detail.round).toMatchObject({ roundId, vehicleName: "Kangoo blanc", day: DAY });
    expect(detail.loadedAt).toBeNull();
    expect(await ctx.prisma.deliveryBinLoad.count()).toBe(0);
  });

  it("les tournées du jour vues du dépôt comptent les arrêts chargés", async () => {
    const { roundId, order } = await composedOrder(ctx, DAY, "Kangoo");
    const [binId] = await declareBins(ctx, order.id, 1);
    await loadBin(ctx, roundId, { binId: binId ?? "" }).expect(204);

    const view = jsonBody<DeliveryLoadingDayView>(
      await admin(ctx).get(`${LOADING}/chargement?jour=${DAY}`).expect(200),
    );

    expect(view.rounds).toEqual([
      {
        roundId,
        vehicleName: "Kangoo",
        passage: 1,
        departedAt: null,
        stops: 1,
        loadedStops: 1,
        stopsWithBinToRedo: 0,
      },
    ]);
  });

  it("un arrêt retiré emporte ses chargements : la commande recomposée repart de zéro", async () => {
    const { roundId, stopId, order } = await composedOrder(ctx, DAY, "Kangoo");
    const [binId] = await declareBins(ctx, order.id, 1);
    await loadBin(ctx, roundId, { binId: binId ?? "" }).expect(204);
    const { version } = await roundOf(ctx, DAY, roundId);
    await admin(ctx)
      .post(`${ROUNDS}/${roundId}/arrets/${stopId}/retrait`)
      .send({ version })
      .expect(204);

    await assign(ctx, DAY, roundId, order.id);

    const view = await loadingOf(ctx, roundId);
    expect(view.stops).toHaveLength(1);
    expect(view.stops[0]?.state).toBe("partial");
    expect(view.stops[0]?.bins[0]?.loadedAt).toBeNull();
  });

  it("décharger efface le chargement ; le fait garde qui avait chargé", async () => {
    const { roundId, order } = await composedOrder(ctx, DAY, "Kangoo");
    const [binId] = await declareBins(ctx, order.id, 1);
    await loadBin(ctx, roundId, { binId: binId ?? "" }).expect(204);

    await admin(ctx)
      .post(`${LOADING}/chargement/${roundId}/bacs/${binId ?? ""}/dechargement`)
      .expect(204);

    const row = await ctx.prisma.deliveryBinLoad.findFirstOrThrow();
    expect(row).toMatchObject({ loadedAt: null, loadedBy: null, loadedVia: null });
    const unloaded = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "delivery_bin.unloaded" },
      select: { payload: true },
    });
    // `loadedBy` : la fiche de qui avait chargé, nommée ou nue selon l'annuaire.
    expect(JSON.stringify(unloaded.payload)).toContain(E2E_STAFF_ID);
  });
});

describe("partir (Q14, L4-C4)", () => {
  it("fige la feuille du livreur et gèle composition et chargement", async () => {
    const { roundId, stopId, order } = await composedOrder(ctx, DAY, "Kangoo");
    await ctx.prisma.order.update({ where: { id: order.id }, data: { note: "par la cour" } });
    const [binId] = await declareBins(ctx, order.id, 1);
    await loadBin(ctx, roundId, { binId: binId ?? "" }).expect(204);

    expect((await depart(ctx, roundId)).status).toBe(204);
    await ctx.prisma.order.update({ where: { id: order.id }, data: { note: "corrigée après" } });

    const frozen = await ctx.prisma.deliveryStopExecution.findUniqueOrThrow({ where: { stopId } });
    expect(frozen).toMatchObject({
      roundId,
      orderId: order.id,
      reference: order.reference,
      note: "par la cour",
      serviceDay: DAY,
    });
    const view = await loadingOf(ctx, roundId);
    expect(view.departedAt).not.toBeNull();
    expect((await roundOf(ctx, DAY, roundId)).departedAt).toBe(view.departedAt);

    await admin(ctx)
      .post(`${LOADING}/chargement/${roundId}/bacs/${binId ?? ""}/dechargement`)
      .expect(409);
    await admin(ctx)
      .post(`${BINS}/${binId ?? ""}/annulation`)
      .expect(409);
    await admin(ctx)
      .post(`${ROUNDS}/${roundId}/arrets/${stopId}/retrait`)
      .send({ version: view.version })
      .expect(409);
    await admin(ctx)
      .post(BINS)
      .send({
        orderId: order.id,
        binTypeId: await binTypeId(ctx),
        whole: 1,
        half: false,
        innerBags: 0,
      })
      .expect(409);
    expect((await depart(ctx, roundId)).status).toBe(409);

    const departed = await ctx.prisma.activityEvent.findMany({
      where: { type: "delivery_round.departed" },
      select: { subjectId: true, actorId: true },
    });
    expect(departed).toEqual([{ subjectId: roundId, actorId: E2E_STAFF_ID }]);
  });
});
