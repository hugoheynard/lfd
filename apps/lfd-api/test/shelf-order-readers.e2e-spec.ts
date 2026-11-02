/**
 * E2E de **la marque d'une commande sur stock, sans effet** (lot L1 —
 * `documentation/limites-de-commande/plan-jour-meme-sur-stock.md`, §9.3, §14).
 *
 * Ce que seul le vrai SQL prouve : qu'une commande prise sur la vitrine
 * (`supply = shelf`) du Village, servi par transfert, est ABSENTE de chaque
 * lecteur de production et de transport — compte à produire (et donc
 * l'alerte de rattrapage, qui le lit), dossier du jour, échéances du four,
 * arrivée et contenu du transfert, prévisionnel, état du jour, retirage —,
 * PRÉSENTE dans la file du comptoir, et prête en retrait à la Supervision. Une
 * commande fabriquée pour elle, témoin, est présente partout où elle doit
 * l'être : une absence ne prouve rien sans elle.
 *
 * Aucune passation n'écrit `shelf` avant le lot L4 : les deux commandes sont
 * composées par l'agrégat (`Order.draft`, qui juge l'invariant) et écrites par
 * le vrai dépôt (`OrderRepository.place`) — jamais par un INSERT.
 */
import type { DaySupervisionView } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";

import { Order, type DraftOrderInput } from "../src/b2b/orders/domain/entities/order.js";
import { DayOrdersSource } from "../src/b2b/orders/domain/ports/day-orders.source.js";
import { DeadlineOrdersReader } from "../src/b2b/orders/domain/ports/deadline-orders.reader.js";
import { OrderReader } from "../src/b2b/orders/domain/ports/order.reader.js";
import { OrderRepository } from "../src/b2b/orders/domain/ports/order.repository.js";
import { SiteArrivalOrdersReader } from "../src/b2b/orders/domain/ports/site-arrival-orders.reader.js";
import type { OrderSupplyDecision } from "../src/b2b/orders/domain/value-objects/order-supply.js";
import {
  TransferOrderContentsReader,
  TransferOrdersReader,
} from "../src/delivery/channels/commerce/index.js";
import { HandoverQueueReader } from "../src/handover/channels/commerce/index.js";
import {
  ExpectedProductionReader,
  PendingCommerceOrdersReader,
  ServiceDay,
} from "../src/production/channels/commerce/index.js";
import { ServiceRange } from "../src/production/domain/value-objects/service-range.value-object.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { seedVillage, VILLAGE_BREAD } from "./internal-transfer-scene.js";

/** Aujourd'hui, à Paris : la seule journée qu'une commande sur stock peut viser. */
const TODAY = serviceDay(0);

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

interface Scene {
  readonly shelf: { readonly id: string; readonly orderNumber: string };
  readonly planned: { readonly id: string; readonly orderNumber: string };
}

/** Un retrait au compte d'un pro, au Village, aujourd'hui — composé par l'agrégat. */
function draftAt(
  siteId: string,
  companyId: string,
  userId: string,
  quantity: number,
): DraftOrderInput {
  return {
    companyId,
    billedCompanyId: companyId,
    principal: null,
    placedByUserId: userId,
    placedByStaffId: E2E_STAFF_ID,
    buyerKind: "registered",
    fulfillment: {
      method: "pickup",
      deliveryZoneId: null,
      deliveryAddress: null,
      deliveryAddressId: null,
      pickupAddress: {
        label: "Val Village",
        ligne1: "Route du Village",
        ligne2: "",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
        siteId,
      },
    },
    agreed: {
      window: { value: { start: "08:00", end: "09:00" }, source: "override" },
      contact: { value: null, source: "default" },
      signatureRequired: { value: false, source: "default" },
    },
    requestedDeliveryDate: new Date(`${TODAY}T00:00:00.000Z`),
    note: "",
    catalogVersionId: null,
    lines: [
      {
        sku: VILLAGE_BREAD.sku,
        productName: VILLAGE_BREAD.name,
        unitPriceMillicents: millicentsFromCents(120),
        vatRate: 5.5,
        saleUnit: "piece",
        quantity,
      },
    ],
    discountCents: 0,
    discountAdjustment: null,
    deliveryFeeCents: 0,
    deliveryFeeAdjustment: null,
    lateFeeCents: 0,
    lateFeeAdjustment: null,
    deliveryVatMode: "standard",
    voucher: null,
    salesTerms: { document: "salesTermsPro", revision: null, fileId: null },
    locale: null,
  };
}

async function place(input: DraftOrderInput, supply: OrderSupplyDecision) {
  const order = Order.draft(input, supply);
  order.deferPayment();
  return ctx.app.get(OrderRepository).place(order);
}

/** Le Village, une commande sur stock (2 baguettes) et une fabriquée pour elle (3). */
async function scene(): Promise<Scene> {
  const siteId = await seedVillage(ctx);
  const user = await createUser(ctx.prisma, { auth0Sub: "auth0|client", email: "c@vv.fr" });
  const company = await createCompany(ctx.prisma, { enseigne: "Chalet du Village" });
  await attachTo(ctx.prisma, user.id, company.id);
  const shelf = await place(draftAt(siteId, company.id, user.id, 2), {
    supply: "shelf",
    today: TODAY,
    entryShortcut: "immediate_pickup",
  });
  const planned = await place(draftAt(siteId, company.id, user.id, 3), { supply: "planned" });
  return { shelf, planned };
}

describe("une commande sur stock, absente de la production et du transport (lot L1)", () => {
  it("porte sa marque en base, le témoin la sienne", async () => {
    const { shelf, planned } = await scene();

    const rows = await ctx.prisma.order.findMany({
      where: { id: { in: [shelf.id, planned.id] } },
      select: { id: true, supply: true, entryShortcut: true },
    });
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: shelf.id, supply: "shelf", entryShortcut: "immediate_pickup" },
        { id: planned.id, supply: "planned", entryShortcut: null },
      ]),
    );
  });

  it("n'entre ni au compte à produire, ni à l'état du jour, ni au prévisionnel", async () => {
    const { planned } = await scene();
    const day = ServiceDay.of(TODAY);

    const producible = await ctx.app.get(DayOrdersSource).producibleFor(day);
    expect(producible.map((sourced) => sourced.order.orderId)).toEqual([planned.id]);

    const pending = await ctx.app.get(PendingCommerceOrdersReader).pendingFor(day, new Date());
    expect(pending).toBe(1);

    const expected = await ctx.app
      .get(ExpectedProductionReader)
      .expectedBetween(ServiceRange.of(TODAY, TODAY));
    expect(expected).toEqual([
      expect.objectContaining({
        day: TODAY,
        items: [expect.objectContaining({ sku: VILLAGE_BREAD.sku, quantity: 3 })],
      }),
    ]);
  });

  it("un retirage ne l'absorbe pas", async () => {
    const { shelf, planned } = await scene();

    const absorbed = await ctx.app
      .get(OrderRepository)
      .absorbIntoPlan(TODAY, [shelf.id, planned.id], new Date());

    expect(absorbed).toBe(1);
    const rows = await ctx.prisma.order.findMany({
      where: { id: { in: [shelf.id, planned.id] } },
      select: { id: true, status: true },
    });
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: shelf.id, status: "placed" },
        { id: planned.id, status: "confirmed" },
      ]),
    );
  });

  it("n'a ni bon au dossier du jour, ni échéance du four", async () => {
    const { planned } = await scene();

    const sheets = await ctx.app.get(OrderReader).listForProduction(TODAY);
    expect(sheets.map((sheet) => sheet.orderId)).toEqual([planned.id]);

    const deadlines = await ctx.app.get(DeadlineOrdersReader).forDay(TODAY);
    expect(deadlines).toHaveLength(1);
    expect(deadlines[0]?.lines).toEqual([expect.objectContaining({ quantity: 3 })]);
  });

  it("n'avance ni ne charge le transfert du Village", async () => {
    const { shelf, planned } = await scene();

    const arrivals = await ctx.app.get(SiteArrivalOrdersReader).forDay(TODAY);
    expect(arrivals).toHaveLength(1);

    const transferred = await ctx.app
      .get(TransferOrdersReader)
      .transferOrdersAmong([shelf.id, planned.id]);
    expect(transferred.map((ref) => ref.orderId)).toEqual([planned.id]);

    const contents = await ctx.app
      .get(TransferOrderContentsReader)
      .contentsOf([shelf.id, planned.id]);
    expect([...contents.keys()]).toEqual([planned.id]);
  });
});

describe("une commande sur stock, vue au comptoir et à la Supervision (lot L1)", () => {
  it("attend dans la file du comptoir, comme le témoin", async () => {
    const { shelf, planned } = await scene();

    const queue = await ctx.app.get(HandoverQueueReader).expectedOn(TODAY);

    expect(queue.map((entry) => entry.orderId).sort()).toEqual([shelf.id, planned.id].sort());
  });

  it("se supervise prête en retrait, jamais en attente ni en préparation", async () => {
    await scene();

    const view = jsonBody<DaySupervisionView>(
      await ctx.asSub(E2E_STAFF_SUB).get(`/admin/supervision/day?date=${TODAY}`).expect(200),
    );

    expect(view.flow.find((line) => line.fulfillmentMethod === "pickup")).toMatchObject({
      placed: 1,
      inProduction: 0,
      ready: 1,
    });
  });
});
