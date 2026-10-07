/**
 * E2E de **la colonne Contenants** — plan
 * `documentation/colisage/colisage.md`, K2b (§5 corrigé par
 * §5.1).
 *
 * Le colisage tient le contenu, la livraison garde le bac. Ce qui ne se voit
 * qu'ici : un bac né au poste est celui que la livraison imprime et charge ;
 * ses refus (type archivé, bac chargé, tournée partie) remontent à l'écran ;
 * la déclaration de la livraison refuse une commande `listed` ; et le bac et son
 * contenant s'écrivent ensemble, ou pas du tout.
 */
import { randomUUID } from "node:crypto";

import type {
  DeliveryBinDetailView,
  OpenedPackingContainer,
  PackingSheet as PackingSheetView,
  ProductionPackingView,
} from "@lfd/contracts";

import { PackingSheet } from "../src/packing/domain/entities/packing-sheet.js";
import { PackingSheetRepository } from "../src/packing/domain/ports/packing-sheet.repository.js";
import { PrismaPackingSheetRepository } from "../src/packing/infrastructure/prisma-packing-sheet.repository.js";
import { PrismaService } from "../src/platform/database/prisma.service.js";
import { TechnicalError } from "../src/platform/shared/errors/app-error.js";
import { settleCardPayments } from "./card-payments.js";
import { BINS, LOADING, binTypeId, depart, loadBin } from "./delivery-loading-scene.js";
import { addVehicle, assign, openRound } from "./delivery-rounds-scene.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { openPublicDelivery } from "./public-delivery-scene.js";
import { createUser } from "./factories.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  closePlan,
  packing,
  place,
  recordBatch,
} from "./production-day-fixture.js";

/** Une panne posée par le test, entre l'écriture du bac et celle du contenant. */
class InjectedFailure extends TechnicalError {
  constructor() {
    super("e2e.injected_failure", "Panne injectée par le test.");
  }
}

/**
 * Le dépôt réel des bacs du colisage, qui peut tomber en panne à l'écriture
 * — branché après le démarrage, sur le `PrismaService` de l'app.
 */
class BreakableSheets extends PackingSheetRepository {
  inner: PrismaPackingSheetRepository | null = null;
  failNextSave = false;

  lock(serviceDay: string, orderId: string): Promise<PackingSheet | null> {
    return this.real().lock(serviceDay, orderId);
  }

  save(sheet: PackingSheet): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      return Promise.reject(new InjectedFailure());
    }
    return this.real().save(sheet);
  }

  private real(): PrismaPackingSheetRepository {
    if (this.inner === null) {
      throw new InjectedFailure();
    }
    return this.inner;
  }
}

const SITE = {
  label: "Maison",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

/** Des ULID de forme valide, tirés « par l'écran ». */
const BATCH = "01K6A0000000000000000000K2";

const sheets = new BreakableSheets();
let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay([
    { token: PackingSheetRepository, value: sheets },
  ]));
  sheets.inner = new PrismaPackingSheetRepository(ctx.app.get(PrismaService));
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  sheets.failNextSave = false;
  await ctx.reset();
  await openPublicDelivery(ctx);
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

/** Une commande en livraison, payée, pour la journée servie. */
async function placeDelivery(quantity: number): Promise<void> {
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
  });
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

/** La journée : une livraison de 20, un retrait de 4, arrêtée, et 24 pièces sorties du four. */
async function day(): Promise<{
  readonly delivery: PackingSheetView;
  readonly pickup: PackingSheetView;
}> {
  await placeDelivery(20);
  await place(ctx, issued, [{ sku: CROISSANT, quantity: 4 }]);
  await closePlan(ctx);
  await settle();
  expect(await recordBatch(ctx, BATCH, 24)).toBe(204);
  await settle();
  const view = await packing(ctx);
  const delivery = view.sheets.find((sheet) => sheet.fulfillmentMethod === "delivery");
  const pickup = view.sheets.find((sheet) => sheet.fulfillmentMethod === "pickup");
  if (delivery === undefined || pickup === undefined) {
    throw new Error("La journée devait porter une livraison et un retrait.");
  }
  return { delivery, pickup };
}

function base(orderId: string): string {
  return `/admin/packing/${SERVICE_DAY}/orders/${orderId}`;
}

async function openBin(orderId: string, typeId: string): Promise<string> {
  const response = await staff()
    .post(`${base(orderId)}/containers`)
    .send({ nature: "bin", binTypeId: typeId, half: false, innerBags: 0 })
    .expect(201);
  return jsonBody<OpenedPackingContainer>(response).containerId;
}

async function sheetOf(orderId: string): Promise<PackingSheetView | undefined> {
  return (await packing(ctx)).sheets.find((sheet) => sheet.orderId === orderId);
}

function codeOf(response: { body: unknown }): unknown {
  return (response.body as { code?: unknown }).code;
}

describe("la colonne Contenants — le colisage tient le contenu, la livraison garde le bac", () => {
  it("un bac créé au poste EST le bac de la livraison : même id, même code", async () => {
    const { delivery } = await day();
    expect(delivery.containerMode).toBe("listed");

    await openBin(delivery.orderId, await binTypeId(ctx));

    const [container] = (await sheetOf(delivery.orderId))?.containerList ?? [];
    expect(container).toMatchObject({ nature: "bin", binHalf: null, pieces: 0 });
    const detail = jsonBody<DeliveryBinDetailView>(
      await staff()
        .get(`${BINS}/${container?.binId ?? ""}`)
        .expect(200),
    );
    expect(detail.bin.code).toBe(container?.binCode);
    expect(detail.bin.orderId).toBe(delivery.orderId);
    expect((await sheetOf(delivery.orderId))?.containers).toBe(1);
  });

  it("remonte le refus de la livraison — un type archivé — sans rien écrire", async () => {
    const { delivery } = await day();
    // Un type reste en service : le catalogue ne se vide pas.
    await binTypeId(ctx);
    const typeId = await binTypeId(ctx, "Bac retiré e2e");
    await staff().post(`${LOADING}/bacs/${typeId}/archiver`).expect(204);

    const refused = await staff()
      .post(`${base(delivery.orderId)}/containers`)
      .send({ nature: "bin", binTypeId: typeId, half: false, innerBags: 0 });

    expect(refused.status).toBe(409);
    expect(await ctx.prisma.deliveryBin.count()).toBe(0);
    expect(await ctx.prisma.packingContainer.count()).toBe(0);
  });

  it("la déclaration de la livraison refuse une commande `listed`, en nommant le colisage", async () => {
    const { delivery } = await day();

    const declared = await staff()
      .post(BINS)
      .send({
        orderId: delivery.orderId,
        binTypeId: await binTypeId(ctx),
        whole: 1,
        half: false,
        innerBags: 0,
      });
    expect(declared.status).toBe(409);
    expect(codeOf(declared)).toBe("delivery.bins_managed_at_packing");
  });

  it("coupe une ligne entre deux bacs, et la commande se ferme quand tout est réparti", async () => {
    const { delivery } = await day();
    const typeId = await binTypeId(ctx);
    const first = await openBin(delivery.orderId, typeId);
    const second = await openBin(delivery.orderId, typeId);

    await staff()
      .post(`${base(delivery.orderId)}/containers/${first}/lines/${CROISSANT}`)
      .send({ quantity: 10 })
      .expect(204);
    const early = await staff().post(`${base(delivery.orderId)}/close`);
    expect(codeOf(early)).toBe("packing.containers.unallocated");
    await staff()
      .post(`${base(delivery.orderId)}/containers/${second}/lines/${CROISSANT}`)
      .send({ quantity: 10 })
      .expect(204);

    const sheet = await sheetOf(delivery.orderId);
    expect(sheet?.containerList?.map((container) => container.pieces)).toEqual([10, 10]);
    expect(sheet?.lines[0]).toMatchObject({ packed: true, allocated: 20, unallocated: 0 });
    expect(sheet?.canDeclareReady).toBe(true);
    await staff()
      .post(`${base(delivery.orderId)}/close`)
      .expect(204);
  });

  it("déplace 18 croissants d'un bac à l'autre en un geste : la réserve et le poste n'en bougent pas", async () => {
    const { delivery } = await day();
    const typeId = await binTypeId(ctx);
    const first = await openBin(delivery.orderId, typeId);
    const second = await openBin(delivery.orderId, typeId);
    const lines = `${base(delivery.orderId)}/containers/${first}/lines/${CROISSANT}`;
    await staff().post(lines).send({ quantity: 18 }).expect(204);
    const counters = (view: ProductionPackingView) => ({
      resources: view.resources,
      orderCount: view.orderCount,
      todoCount: view.todoCount,
      readyCount: view.readyCount,
    });
    const before = await packing(ctx);
    const stock = () =>
      ctx.prisma.packingStock.findUniqueOrThrow({
        where: { serviceDay_sku: { serviceDay: SERVICE_DAY, sku: CROISSANT } },
      });
    expect((await stock()).packed).toBe(18);

    await staff()
      .post(`${lines}/transfer`)
      .send({ toContainerId: second, quantity: 18 })
      .expect(204);

    const sheet = await sheetOf(delivery.orderId);
    expect(sheet?.containerList?.map((container) => container.pieces)).toEqual([0, 18]);
    expect(sheet?.lines[0]).toMatchObject({ allocated: 18, unallocated: 2 });
    expect((await stock()).packed).toBe(18);
    expect(counters(await packing(ctx))).toEqual(counters(before));

    const beyond = await staff()
      .post(`${lines}/transfer`)
      .send({ toContainerId: second, quantity: 1 });
    expect(beyond.status).toBe(409);
    expect(codeOf(beyond)).toBe("packing.container.withdraw_beyond");
    const same = await staff()
      .post(`${base(delivery.orderId)}/containers/${second}/lines/${CROISSANT}/transfer`)
      .send({ toContainerId: second, quantity: 1 });
    expect(codeOf(same)).toBe("packing.container.move_to_same");
    expect((await sheetOf(delivery.orderId))?.containerList?.map((c) => c.pieces)).toEqual([0, 18]);
  });

  it("un retrait se colise en sacs ; un bac lui est refusé par la livraison", async () => {
    const { pickup, delivery } = await day();

    // Et l'inverse : une livraison part en bacs, jamais en sac.
    const deliveryBag = await staff()
      .post(`${base(delivery.orderId)}/containers`)
      .send({ nature: "bag" });
    expect(codeOf(deliveryBag)).toBe("packing.container.bag_on_delivery");

    const bin = await staff()
      .post(`${base(pickup.orderId)}/containers`)
      .send({ nature: "bin", binTypeId: await binTypeId(ctx), half: false, innerBags: 0 });
    expect(codeOf(bin)).toBe("delivery.bins_not_declarable");

    const bag = jsonBody<OpenedPackingContainer>(
      await staff()
        .post(`${base(pickup.orderId)}/containers`)
        .send({ nature: "bag" })
        .expect(201),
    );
    await staff()
      .post(`${base(pickup.orderId)}/containers/${bag.containerId}/lines/${CROISSANT}`)
      .send({ quantity: 4 })
      .expect(204);

    const sheet = await sheetOf(pickup.orderId);
    expect(sheet?.containerList).toEqual([
      expect.objectContaining({ nature: "bag", label: "Sac 1", binId: null, pieces: 4 }),
    ]);
  });

  it("annuler un bac chargé est refusé par la livraison ; une tournée partie ne reçoit plus de bac", async () => {
    const { delivery } = await day();
    const typeId = await binTypeId(ctx);
    const roundId = await openRound(ctx, SERVICE_DAY, await addVehicle(ctx, "Kangoo"));
    await assign(ctx, SERVICE_DAY, roundId, delivery.orderId);
    const containerId = await openBin(delivery.orderId, typeId);
    const binId = (await sheetOf(delivery.orderId))?.containerList?.[0]?.binId ?? "";
    await loadBin(ctx, roundId, { binId }).expect(204);

    const voided = await staff().post(`${base(delivery.orderId)}/containers/${containerId}/void`);
    expect(voided.status).toBe(409);
    expect((await sheetOf(delivery.orderId))?.containers).toBe(1);

    expect((await depart(ctx, roundId)).status).toBe(204);
    const late = await staff()
      .post(`${base(delivery.orderId)}/containers`)
      .send({ nature: "bin", binTypeId: typeId, half: false, innerBags: 0 });
    expect(late.status).toBe(409);
  });

  it("atomicité : une panne entre le bac et le contenant n'écrit RIEN", async () => {
    const { delivery } = await day();
    const typeId = await binTypeId(ctx);
    sheets.failNextSave = true;

    const failed = await staff()
      .post(`${base(delivery.orderId)}/containers`)
      .send({ nature: "bin", binTypeId: typeId, half: false, innerBags: 0 });

    expect(failed.status).toBe(500);
    expect(await ctx.prisma.deliveryBin.count()).toBe(0);
    expect(await ctx.prisma.packingContainer.count()).toBe(0);
  });
});
