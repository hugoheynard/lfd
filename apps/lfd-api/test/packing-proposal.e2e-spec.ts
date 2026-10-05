/**
 * E2E de **la suite de K2b** — `documentation/colisage/colisage.md`
 * §7 : « Proposer » appliqué par le serveur d'un seul coup, bac par bac ; une
 * moitié de bac partagée depuis le poste ; le retrait partiel d'une
 * répartition.
 *
 * Ce qui ne se voit qu'ici : les bacs proposés naissent chez la livraison
 * (même code, même QR) dans la transaction du colisage, la grille des
 * contenances réelle coupe le contenu, et la règle d'adjacence de la livraison
 * dit quelles moitiés le poste peut partager.
 */
import { randomUUID } from "node:crypto";

import type {
  DeliveryBinFreeHalvesView,
  OpenedPackingContainer,
  PackingSheet as PackingSheetView,
} from "@lfd/contracts";

import { settleCardPayments } from "./card-payments.js";
import { LOADING, binTypeId } from "./delivery-loading-scene.js";
import { addVehicle, admin, assign, openRound } from "./delivery-rounds-scene.js";
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

async function placeDelivery(quantity: number): Promise<void> {
  await ctx
    .asSub(MEMBER)
    .post(`/orders`)
    .send({
      idempotencyKey: randomUUID(),
      companyId: null,
      requestedDeliveryDate: SERVICE_DAY,
      fulfillmentMethod: "delivery",
      requestedWindow: { start: null, end: "10:00" },
      deliveryAddress: SITE,
      note: "",
      lines: [{ sku: CROISSANT, quantity }],
    })
    .expect(201);
  await settleCardPayments(ctx, issued);
}

/** Des livraisons de la journée, arrêtée, et `baked` pièces sorties du four. */
async function day(quantities: readonly number[], baked: number): Promise<PackingSheetView[]> {
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
  });
  for (const quantity of quantities) {
    await placeDelivery(quantity);
  }
  await closePlan(ctx);
  await settle();
  expect(await recordBatch(ctx, BATCH, baked)).toBe(204);
  await settle();
  return [...(await packing(ctx)).sheets];
}

function base(orderId: string): string {
  return `/admin/packing/${SERVICE_DAY}/orders/${orderId}`;
}

async function sheetOf(orderId: string): Promise<PackingSheetView | undefined> {
  return (await packing(ctx)).sheets.find((sheet) => sheet.orderId === orderId);
}

function codeOf(response: { body: unknown }): unknown {
  return (response.body as { code?: unknown }).code;
}

/** La contenance d'un bac ENTIER de ce type, posée par la vraie route de la grille. */
async function capacity(typeId: string, units: number): Promise<void> {
  await admin(ctx)
    .put(`${LOADING}/contenances`)
    .send({ binTypeId: typeId, sku: CROISSANT, units })
    .expect(204);
}

describe("« Proposer », appliqué par le serveur d'un seul coup", () => {
  it("fait naître les bacs proposés chez la livraison, et les remplit bac par bac", async () => {
    const [sheet] = await day([25], 25);
    const typeId = await binTypeId(ctx);
    await capacity(typeId, 10);

    await staff()
      .post(`${base(sheet?.orderId ?? "")}/proposal/apply`)
      .expect(204);

    const after = await sheetOf(sheet?.orderId ?? "");
    // 25 croissants à 10 par bac : deux entiers, puis une moitié de 5.
    expect(after?.containerList?.map((container) => [container.binHalf, container.pieces])).toEqual(
      [
        [null, 10],
        [null, 10],
        ["left", 5],
      ],
    );
    expect(after?.canDeclareReady).toBe(true);
    expect(await ctx.prisma.deliveryBin.count({ where: { orderId: sheet?.orderId ?? "" } })).toBe(
      3,
    );
  });

  it("ne place que ce qui est sorti du four ; le reste reste à répartir", async () => {
    const [sheet] = await day([25], 12);
    await capacity(await binTypeId(ctx), 10);

    await staff()
      .post(`${base(sheet?.orderId ?? "")}/proposal/apply`)
      .expect(204);

    const after = await sheetOf(sheet?.orderId ?? "");
    expect(after?.containerList?.map((container) => container.pieces)).toEqual([10, 2, 0]);
    expect(after?.lines[0]).toMatchObject({ allocated: 12, unallocated: 13 });
  });

  it("refuse une seconde application, et une grille vide, sans rien écrire", async () => {
    const [sheet] = await day([25], 25);
    const typeId = await binTypeId(ctx);

    const empty = await staff().post(`${base(sheet?.orderId ?? "")}/proposal/apply`);
    expect(codeOf(empty)).toBe("packing.proposal.empty");
    expect(await ctx.prisma.deliveryBin.count()).toBe(0);

    await capacity(typeId, 30);
    await staff()
      .post(`${base(sheet?.orderId ?? "")}/proposal/apply`)
      .expect(204);
    const again = await staff().post(`${base(sheet?.orderId ?? "")}/proposal/apply`);
    expect(again.status).toBe(409);
    expect(codeOf(again)).toBe("packing.proposal.containers_exist");
    expect(await ctx.prisma.deliveryBin.count()).toBe(1);
  });
});

describe("partager une moitié de bac depuis le colisage", () => {
  it("liste la moitié libre de l'arrêt voisin, et y crée le contenant", async () => {
    const sheets = await day([4, 4], 8);
    const [first, second] = sheets;
    const typeId = await binTypeId(ctx);
    const roundId = await openRound(ctx, SERVICE_DAY, await addVehicle(ctx, "Kangoo"));
    await assign(ctx, SERVICE_DAY, roundId, first?.orderId ?? "");
    await assign(ctx, SERVICE_DAY, roundId, second?.orderId ?? "");
    await staff()
      .post(`${base(first?.orderId ?? "")}/containers`)
      .send({ nature: "bin", binTypeId: typeId, half: true, innerBags: 0 })
      .expect(201);

    const view = jsonBody<DeliveryBinFreeHalvesView>(
      await staff()
        .get(`${base(second?.orderId ?? "")}/shareable-halves`)
        .expect(200),
    );
    const [half] = view.halves;
    expect(half).toMatchObject({ orderId: first?.orderId, freeHalf: "right" });

    const opened = jsonBody<OpenedPackingContainer>(
      await staff()
        .post(`${base(second?.orderId ?? "")}/containers`)
        .send({ nature: "bin", partnerBinId: half?.binId ?? "", innerBags: 0 })
        .expect(201),
    );
    const container = (await sheetOf(second?.orderId ?? ""))?.containerList?.find(
      (candidate) => candidate.id === opened.containerId,
    );
    expect(container).toMatchObject({ nature: "bin", binHalf: "right" });
    expect(
      jsonBody<DeliveryBinFreeHalvesView>(
        await staff()
          .get(`${base(second?.orderId ?? "")}/shareable-halves`)
          .expect(200),
      ).halves,
    ).toEqual([]);
  });
});

describe("le retrait partiel d'une répartition", () => {
  it("ressort une partie d'un contenant : la ligne revient à répartir pour ce qui sort", async () => {
    const [sheet] = await day([20], 20);
    const orderId = sheet?.orderId ?? "";
    const binId = jsonBody<OpenedPackingContainer>(
      await staff()
        .post(`${base(orderId)}/containers`)
        .send({ nature: "bin", binTypeId: await binTypeId(ctx), half: false, innerBags: 0 })
        .expect(201),
    ).containerId;
    await staff()
      .post(`${base(orderId)}/containers/${binId}/lines/${CROISSANT}`)
      .send({ quantity: 20 })
      .expect(204);

    await staff()
      .post(`${base(orderId)}/containers/${binId}/lines/${CROISSANT}/withdrawal`)
      .send({ quantity: 6 })
      .expect(204);

    const after = await sheetOf(orderId);
    expect(after?.containerList?.[0]?.pieces).toBe(14);
    expect(after?.lines[0]).toMatchObject({ packed: false, allocated: 14, unallocated: 6 });
    expect(after?.canDeclareReady).toBe(false);
    const beyond = await staff()
      .post(`${base(orderId)}/containers/${binId}/lines/${CROISSANT}/withdrawal`)
      .send({ quantity: 15 });
    expect(codeOf(beyond)).toBe("packing.container.withdraw_beyond");
  });
});
