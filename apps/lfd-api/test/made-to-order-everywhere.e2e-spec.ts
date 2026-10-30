import { randomUUID } from "node:crypto";

import type { ProductionPackingView } from "@lfd/contracts";
import { Buffer } from "node:buffer";

import { pdfPages } from "../src/platform/pdf/__tests__/pdf-text.js";
import { ExpectedProductionReader } from "../src/production/channels/commerce/expected-production.reader.js";
import { ServiceRange } from "../src/production/domain/value-objects/service-range.value-object.js";
import { settleCardPayments } from "./card-payments.js";
import { jsonBody, type E2eContext } from "./e2e-harness.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  closePlan,
} from "./production-day-fixture.js";

/**
 * E2E — **le marqueur « sur mesure » scellé, puis porté jusqu'au fournil**
 * (`documentation/catalogue/plan-sur-mesure-partout.md`, M1 à M4).
 *
 * Ce que seul le vrai Postgres prouve : la passation lit le marqueur du
 * catalogue et le fige sur `order_lines.made_to_order` ; retirer le marqueur
 * après coup ne réécrit pas la ligne ; l'arrêt du plan le recopie dans
 * `production_order_line.made_to_order` ; la fiche d'atelier et le compte à
 * produire impriment « SUR MESURE » ; le fait durable de la liste à coliser
 * le porte. Une ligne d'avant le lot (`NULL`) n'imprime rien.
 */

/** Un second article, jamais marqué. */
const PLAIN = "VIE-002-1";

let ctx: E2eContext;
let issued: string[];
/** La société au compte du commandeur : un particulier ne voit jamais le sur mesure (S3). */
let companyId: string;

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const user = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  const company = await createCompany(ctx.prisma);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: ["monthly"] },
  });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  companyId = company.id;
});

async function mark(sku: string, madeToOrder: boolean): Promise<void> {
  await ctx
    .asSub(STAFF)
    .put(`/admin/catalog/${sku}/made-to-order`)
    .send({ madeToOrder })
    .expect(204);
}

/** Une commande professionnelle de retrait pour la journée servie ; rend sa référence. */
async function place(): Promise<{ id: string; reference: string }> {
  const site =
    (await ctx.prisma.site.findFirst({ select: { id: true } })) ??
    (await ctx.prisma.site.create({
      data: {
        label: "Boutique",
        ligne1: "12 rue du Test",
        ligne2: "",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
        isDefault: true,
      },
      select: { id: true },
    }));
  const placed = jsonBody<{ id: string; orderNumber: string }>(
    await ctx
      .asSub(MEMBER)
      .post("/orders")
      .send({
        idempotencyKey: randomUUID(),
        salesTerms: null,
        companyId,
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "pickup",
        requestedWindow: { start: "07:00", end: "08:00" },
        pickupAddressId: site.id,
        note: "",
        lines: [
          { sku: CROISSANT, quantity: 2 },
          { sku: PLAIN, quantity: 4 },
        ],
      })
      .expect(201),
  );
  await settleCardPayments(ctx, issued);
  return { id: placed.id, reference: placed.orderNumber };
}

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await ctx.drain();
  }
}

async function sealed(orderId: string): Promise<Record<string, boolean | null>> {
  const lines = await ctx.prisma.orderLine.findMany({
    where: { orderId },
    select: { sku: true, madeToOrder: true },
  });
  return Object.fromEntries(lines.map((line) => [line.sku, line.madeToOrder]));
}

async function pdfText(route: string): Promise<string> {
  const response = await ctx
    .asSub(STAFF)
    .get(route)
    .buffer()
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        callback(null, Buffer.concat(chunks));
      });
    })
    .expect(200);
  return Buffer.isBuffer(response.body) ? pdfPages(response.body).join(" ") : "";
}

const sheetRoute = (reference: string): string =>
  `/admin/production/batch/${SERVICE_DAY}/sheets/${reference}.pdf`;
const COUNT_ROUTE = `/admin/production/batch/${SERVICE_DAY}/compte-a-produire.pdf`;

describe("la passation scelle le marqueur (M1)", () => {
  it("fige `true` sur l'article marqué et `false` sur l'autre", async () => {
    await mark(CROISSANT, true);

    const order = await place();

    expect(await sealed(order.id)).toEqual({ [CROISSANT]: true, [PLAIN]: false });
  });

  it("retirer le marqueur après la passation ne change pas la ligne", async () => {
    await mark(CROISSANT, true);
    const order = await place();

    await mark(CROISSANT, false);

    expect(await sealed(order.id)).toEqual({ [CROISSANT]: true, [PLAIN]: false });
  });
});

describe("le marqueur voyage jusqu'au fournil (M2–M4)", () => {
  it("l'attendu compte la part sur mesure, depuis la ligne et non le catalogue", async () => {
    await mark(CROISSANT, true);
    await place();
    await mark(CROISSANT, false);

    const [day] = await ctx.app
      .get(ExpectedProductionReader)
      .expectedBetween(ServiceRange.of(SERVICE_DAY, SERVICE_DAY));
    const croissant = day?.items.find((item) => item.sku === CROISSANT);

    expect(croissant?.madeToOrderQuantity).toBe(2);
    expect(day?.items.find((item) => item.sku === PLAIN)?.madeToOrderQuantity).toBe(0);
  });

  it("l'arrêt recopie le marqueur, les papiers le disent, le fait le porte", async () => {
    await mark(CROISSANT, true);
    const order = await place();
    // Retiré avant l'arrêt : la fiche dit ce que la commande a scellé.
    await mark(CROISSANT, false);
    await closePlan(ctx);
    await settle();

    const lines = await ctx.prisma.productionOrderLine.findMany({
      where: { order: { serviceDay: SERVICE_DAY } },
      select: { sku: true, madeToOrder: true },
      orderBy: { sku: "asc" },
    });
    expect(lines).toEqual([
      { sku: CROISSANT, madeToOrder: true },
      { sku: PLAIN, madeToOrder: false },
    ]);
    expect(await pdfText(sheetRoute(order.reference))).toContain("SUR MESURE");
    expect(await pdfText(COUNT_ROUTE)).toContain("SUR MESURE");

    const fact = await ctx.prisma.outboxMessage.findFirstOrThrow({
      where: { type: "production.packing_list_drawn" },
      select: { payload: true },
    });
    expect(JSON.stringify(fact.payload)).toContain('"madeToOrder":true');
  });

  it("une ligne d'avant le lot (`NULL`) traverse sans rien imprimer", async () => {
    await mark(CROISSANT, true);
    const order = await place();
    // Une ligne écrite avant la colonne : on ne savait pas.
    await ctx.prisma.orderLine.updateMany({
      where: { orderId: order.id },
      data: { madeToOrder: null },
    });
    await closePlan(ctx);
    await settle();

    const lines = await ctx.prisma.productionOrderLine.findMany({
      where: { order: { serviceDay: SERVICE_DAY } },
      select: { madeToOrder: true },
    });
    expect(lines.map((line) => line.madeToOrder)).toEqual([null, null]);
    expect(await pdfText(sheetRoute(order.reference))).not.toContain("SUR MESURE");
  });
});

describe("le colisage range le marqueur et le sert au poste (M4)", () => {
  async function boardLines(): Promise<Record<string, boolean | null | undefined>> {
    const view = jsonBody<ProductionPackingView>(
      await ctx.asSub(STAFF).get(`/admin/packing/${SERVICE_DAY}/board`).expect(200),
    );
    return Object.fromEntries(
      view.sheets.flatMap((sheet) => sheet.lines.map((line) => [line.sku, line.madeToOrder])),
    );
  }

  it("le fait de la liste à coliser porte le marqueur jusqu'à la feuille", async () => {
    await mark(CROISSANT, true);
    await place();
    await closePlan(ctx);
    await settle();

    const stored = await ctx.prisma.packingLine.findMany({
      where: { serviceDay: SERVICE_DAY },
      select: { sku: true, madeToOrder: true },
      orderBy: { sku: "asc" },
    });
    expect(stored).toEqual([
      { sku: CROISSANT, madeToOrder: true },
      { sku: PLAIN, madeToOrder: false },
    ]);
    expect(await boardLines()).toEqual({ [CROISSANT]: true, [PLAIN]: false });
  });

  it("une ligne d'avant le lot (`NULL`) se sert « on ne sait pas »", async () => {
    const order = await place();
    await ctx.prisma.orderLine.updateMany({
      where: { orderId: order.id },
      data: { madeToOrder: null },
    });
    await closePlan(ctx);
    await settle();

    expect(await boardLines()).toEqual({ [CROISSANT]: null, [PLAIN]: null });
  });
});
