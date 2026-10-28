/**
 * E2E — **« Proposer » une commande au poids** (P6 de
 * `documentation/pricing/vente-au-poids.md`, reliquat de la proposition
 * de bacs).
 *
 * Ce que seul le vrai chemin prouve : la proposition de la livraison
 * (`pack-group.ts`) et sa répartition au colisage (`proposal-distribution.ts`)
 * ne coupent jamais un lot au poids, sur la vraie grille des contenances, et
 * l'application ne tombe plus en 400 (`packing.container.weight_lot_split`).
 * Sortie de `packing-proposal.e2e-spec.ts` pour la taille du fichier.
 */
import { randomUUID } from "node:crypto";

import type { DeliveryPackingProposalView, PackingSheet as PackingSheetView } from "@lfd/contracts";
import { htMillicentsOf } from "@lfd/pim-contracts";

import { settleCardPayments } from "./card-payments.js";
import { LOADING, binTypeId } from "./delivery-loading-scene.js";
import { admin } from "./delivery-rounds-scene.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  closePlan,
  packing,
  recordBatch,
} from "./production-day-fixture.js";

const SITE = {
  label: "Maison",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

/** Des ULID de forme valide, tirés « par l'écran ». */
const BATCH = "01K6A0000000000000000000P1";

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

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await ctx.drain();
  }
}

function staff() {
  return ctx.asSub(STAFF);
}

function base(orderId: string): string {
  return `/admin/packing/${SERVICE_DAY}/orders/${orderId}`;
}

async function sheetOf(orderId: string): Promise<PackingSheetView | undefined> {
  return (await packing(ctx)).sheets.find((sheet) => sheet.orderId === orderId);
}

/** La contenance d'un bac ENTIER de ce type, posée par la vraie route de la grille. */
async function capacity(typeId: string, units: number): Promise<void> {
  await admin(ctx)
    .put(`${LOADING}/capacities`)
    .send({ binTypeId: typeId, sku: CROISSANT, units })
    .expect(204);
}

/**
 * Régression (P6 de `pricing/vente-au-poids.md`) : la proposition coupait
 * un lot au poids entre deux bacs, et « Proposer » tombait en 400
 * (`packing.container.weight_lot_split`) sur la seconde part.
 */
describe("« Proposer » une commande mêlée, pièces et poids", () => {
  /** Le pain au chocolat du semis devient un article au poids, par 50 g. */
  const WEIGHED = "VIE-002";
  const WEIGHED_BATCH = "01K6A0000000000000000000P2";

  async function mixedDelivery(croissants: number, grams: number): Promise<string> {
    const htMillicents = htMillicentsOf(4_220, 5.5);
    if (htMillicents === null) {
      throw new Error("Étiquette sans hors taxe.");
    }
    await ctx.prisma.catalogItem.update({
      where: { sku: `${WEIGHED}-1` },
      data: {
        saleUnit: "weight",
        weightStepGrams: 50,
        weightMinGrams: null,
        publicTtcCents: 4_220,
        publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents } },
      },
    });
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
        lines: [
          { sku: CROISSANT, quantity: croissants },
          { sku: WEIGHED, quantity: grams, saleUnit: "weight" },
        ],
      })
      .expect(201);
    await settleCardPayments(ctx, issued);
    await closePlan(ctx);
    await settle();
    expect(await recordBatch(ctx, BATCH, croissants)).toBe(204);
    expect(await recordBatch(ctx, WEIGHED_BATCH, grams, WEIGHED)).toBe(204);
    await settle();
    const typeId = await binTypeId(ctx);
    await capacity(typeId, 30);
    await admin(ctx)
      .put(`${LOADING}/capacities`)
      .send({ binTypeId: typeId, sku: WEIGHED, units: 2000 })
      .expect(204);
    const [sheet] = (await packing(ctx)).sheets;
    return sheet?.orderId ?? "";
  }

  function contentsOf(sheet: PackingSheetView | undefined) {
    return sheet?.containerList?.map((container) =>
      container.lines.map((line) => [line.sku, line.quantity]),
    );
  }

  it("24 croissants et 1,25 kg : le lot va ENTIER dans le second bac, sans refus", async () => {
    const orderId = await mixedDelivery(24, 1250);

    await staff()
      .post(`${base(orderId)}/proposal/apply`)
      .expect(204);

    const after = await sheetOf(orderId);
    expect(contentsOf(after)).toEqual([[[CROISSANT, 24]], [[WEIGHED, 1250]]]);
    expect(after?.canDeclareReady).toBe(true);
    expect(await ctx.prisma.deliveryBin.count({ where: { orderId } })).toBe(2);
  });

  it("un lot exactement à la capacité d'un bac y tient, entier", async () => {
    const orderId = await mixedDelivery(30, 2000);

    await staff()
      .post(`${base(orderId)}/proposal/apply`)
      .expect(204);

    expect(contentsOf(await sheetOf(orderId))).toEqual([[[CROISSANT, 30]], [[WEIGHED, 2000]]]);
  });

  it("un lot plus lourd qu'un bac n'est pas coupé : il reste à répartir, sans refus", async () => {
    const orderId = await mixedDelivery(6, 3000);

    await staff()
      .post(`${base(orderId)}/proposal/apply`)
      .expect(204);

    const proposal = jsonBody<DeliveryPackingProposalView>(
      await staff()
        .get(`${base(orderId)}/proposal`)
        .expect(200),
    );
    expect(proposal.unplaced).toMatchObject([{ sku: WEIGHED, reason: "weight_lot_over_bin" }]);

    const after = await sheetOf(orderId);
    const holding = (after?.containerList ?? []).filter((container) =>
      container.lines.some((line) => line.sku === WEIGHED),
    );
    expect(holding).toEqual([]);
    expect(after?.lines.find((line) => line.sku === WEIGHED)).toMatchObject({
      allocated: 0,
      unallocated: 3000,
    });
  });
});
