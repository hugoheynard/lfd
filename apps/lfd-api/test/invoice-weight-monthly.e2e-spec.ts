/**
 * E2E — **la facture du mois d'un BL au poids partiel**
 * (`documentation/pricing/vente-au-poids.md`, § 3 bis, P7).
 *
 * Ce que seul le vrai SQL prouve : par les vrais gestes — 1 250 g commandés au
 * compte, 1 000 g mis au sac, le manque signalé, le reste abandonné, le
 * retrait au comptoir —, le BL du rang 1 porte `delivery_note_line.sale_unit =
 * weight` et les grammes PARTIS ; le lecteur de la facture du mois
 * (`MonthlyInvoicingReader`, `billable-invoice-order.mapper.ts`) les relit
 * avec leur unité ; la facture que l'émission en tire porte 1 000 millièmes de
 * KGM, jamais 1 250 ni 1 000 000, et son XML et son PDF le disent.
 *
 * ⚠️ La facture est émise ici par les fonctions du domaine
 * (`simulateInvoiceDossier`, `invoiceFromDossier`), pas par le passage de fin
 * de mois : la journée de production est dans l'avenir (`SERVICE_DAY` =
 * J+7) et le passage exige un mois clos. Numérotation et écriture de la
 * pièce sont éprouvées ailleurs (`monthly-invoices.e2e-spec.ts`) et ne
 * dépendent pas de l'unité.
 */
import { htMillicentsOf } from "@lfd/pim-contracts";

import { issueInput } from "../src/b2b/accounting/domain/entities/__tests__/invoice-fixtures.js";
import { MonthlyInvoicingReader } from "../src/b2b/accounting/domain/ports/monthly-invoicing.reader.js";
import { TEST_FONTS } from "../src/b2b/accounting/domain/services/__tests__/invoice-fonts-fixture.js";
import { drawnUnicodeText } from "../src/b2b/accounting/domain/services/__tests__/pdf-objects.js";
import { renderFacturXml } from "../src/b2b/accounting/domain/services/facturx-xml.js";
import { simulateInvoiceDossier } from "../src/b2b/accounting/domain/services/invoice-dossier.js";
import { invoiceFromDossier } from "../src/b2b/accounting/domain/services/invoice-from-dossier.js";
import { renderInvoicePdf } from "../src/b2b/accounting/domain/services/invoice-pdf.js";
import type { E2eContext } from "./e2e-harness.js";
import type { OrderLineSeed } from "./order-factory.js";
import {
  bagLines,
  bootstrapProductionDay,
  closeOrder,
  recordBatch,
  sheetOf,
  STAFF,
} from "./production-day-fixture.js";
import {
  accountOrder,
  decide,
  report,
  windowAroundServiceDay,
} from "./shortfall-decision-scene.js";

/** Le pain au chocolat du semis, vendu au poids, par 50 g. */
const WEIGHED = "VIE-002";
const ORDERED_GRAMS = 1_250;
const PACKED_GRAMS = 1_000;
const PUBLIC_LABEL_PER_KG_CENTS = 4_220;

let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const htMillicents = htMillicentsOf(PUBLIC_LABEL_PER_KG_CENTS, 5.5);
  if (htMillicents === null) {
    throw new Error("Étiquette sans hors taxe.");
  }
  await ctx.prisma.catalogItem.update({
    where: { sku: `${WEIGHED}-1` },
    data: {
      saleUnit: "weight",
      weightStepGrams: 50,
      weightMinGrams: null,
      publicTtcCents: PUBLIC_LABEL_PER_KG_CENTS,
      publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents } },
    },
  });
});

/** Trois croissants au sac, 1 000 g des 1 250 g au sac, le reste abandonné, retiré au comptoir. */
async function partialWeighedOrder(): Promise<{ id: string; orderNumber: string }> {
  const weighed: OrderLineSeed = { sku: WEIGHED, quantity: ORDERED_GRAMS, saleUnit: "weight" };
  const order = await accountOrder(ctx, 3, [weighed]);
  expect(await recordBatch(ctx, "01K6A0000000000000000000P7", ORDERED_GRAMS, WEIGHED)).toBe(204);
  await ctx.drain();
  const sheet = await sheetOf(ctx, order.orderNumber);
  expect(await bagLines(ctx, sheet, [{ sku: WEIGHED, quantity: PACKED_GRAMS }])).toBe(204);
  expect(await report(ctx, order.id)).toBe(204);
  expect((await decide(ctx, order.id)).status).toBe(204);
  expect(await closeOrder(ctx, order.id)).toBe(204);
  await ctx.drain();
  await ctx.asSub(STAFF).post(`/admin/handover/manual/${order.orderNumber}`).send({}).expect(201);
  await ctx.drain();
  return order;
}

describe("la facture du mois d'un BL au poids partiel (P7)", () => {
  it("relit les grammes partis avec leur unité, et facture 1,000 kg en KGM", async () => {
    const order = await partialWeighedOrder();

    const noteLine = await ctx.prisma.deliveryNoteLine.findFirstOrThrow({
      where: { note: { orderId: order.id }, sku: WEIGHED },
    });
    expect(noteLine).toMatchObject({ saleUnit: "weight", quantity: PACKED_GRAMS });

    const { from, to } = windowAroundServiceDay();
    const billable = (
      await ctx.app.get(MonthlyInvoicingReader, { strict: false }).uninvoicedOrders(from, to)
    ).find((one) => one.orderId === order.id);
    expect(billable?.frozen.lines.map((l) => [l.sku, l.quantity, l.saleUnit])).toEqual([
      ["VIE-001", 3, "piece"],
      [WEIGHED, PACKED_GRAMS, "weight"],
    ]);

    const computed = simulateInvoiceDossier(
      billable === undefined ? [] : [billable.frozen],
    ).invoice;
    const { lines: _lines, vat: _vat, ...issue } = issueInput();
    const invoice = invoiceFromDossier({ ...issue, computed });
    const lines = invoice.toState().lines;
    expect(lines.map((l) => [l.sku, l.unitCode, l.quantityThousandths])).toEqual([
      ["VIE-001", "H87", 3_000],
      [WEIGHED, "KGM", PACKED_GRAMS],
    ]);
    expect(lines[1]?.amountCents).toBe(noteLine.lineTotalCents);

    const xml = renderFacturXml(invoice);
    expect(xml).toContain('<ram:BilledQuantity unitCode="KGM">1</ram:BilledQuantity>');
    expect(xml).not.toContain("BasisQuantity");
    const pdf = await renderInvoicePdf({ invoice, xml, fonts: TEST_FONTS, logo: null });
    expect(drawnUnicodeText(pdf)).toContain("1,000 kg");
  });
});
