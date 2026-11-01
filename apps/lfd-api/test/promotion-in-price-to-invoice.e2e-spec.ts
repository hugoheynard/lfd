/**
 * E2E — **une promotion « dans le prix affiché », chiffrée sur la facture du
 * mois, sans prix moyen** (plan `documentation/promotions/plan-remise-par-ligne.md`,
 * § 18.6, points 2 et 3).
 *
 * Un pro commande au compte, en TROIS bons, 5 croissants chacun ; le
 * croissant vaut 0,93 € HT et une promotion « −12 % » dans le prix affiché
 * le porte à 0,8184 € (81 840 mc). Par les vrais gestes — passation,
 * colisage, retrait —, puis le lecteur de la facture du mois, le dossier et
 * la pièce (comme `promotions-basket-cumul-two-rates.e2e-spec.ts`) :
 *
 * 1. le prix figé est 81 840 mc, chaque bon vaut 5 × 0,8184 = 4,092 → 4,09 € ;
 * 2. la facture porte UNE LIGNE PAR BON à 0,8184 € (15 × 0,8184 = 12,276 →
 *    12,28 € ≠ 3 × 4,09 € : un regroupement aurait fait un prix moyen) ;
 * 3. chaque ligne porte la remise : prix brut 0,93 € (BT-148), rabais
 *    0,1116 € (BT-147), « Remise 12 % : <nom> » (BT-127), au XML et au PDF ;
 * 4. le total de la facture est celui des bons, au centime, et le XML passe
 *    le Schematron EN 16931 officiel.
 *
 * Les totaux se lisent comme dans `basket-discount-vat-split-to-invoice.e2e-spec.ts` :
 * HT + TVA = TTC par taux et au total, facture = Σ des bons.
 */
import {
  BUYER,
  issueInput,
  SELLER,
  SELLER_FACTS,
} from "../src/b2b/accounting/domain/entities/__tests__/invoice-fixtures.js";
import { MonthlyInvoicingReader } from "../src/b2b/accounting/domain/ports/monthly-invoicing.reader.js";
import {
  compiledSchematron,
  schematronFailures,
  SCHEMATRON_COMPILE_TIMEOUT_MS,
} from "../src/b2b/accounting/domain/services/__tests__/en16931-schematron.js";
import { TEST_FONTS } from "../src/b2b/accounting/domain/services/__tests__/invoice-fonts-fixture.js";
import { drawnUnicodeText } from "../src/b2b/accounting/domain/services/__tests__/pdf-objects.js";
import { facturXArithmeticViolations } from "../src/b2b/accounting/domain/services/facturx-arithmetic.js";
import { renderFacturXml } from "../src/b2b/accounting/domain/services/facturx-xml.js";
import { simulateInvoiceDossier } from "../src/b2b/accounting/domain/services/invoice-dossier.js";
import { invoiceFromDossier } from "../src/b2b/accounting/domain/services/invoice-from-dossier.js";
import { renderInvoicePdf } from "../src/b2b/accounting/domain/services/invoice-pdf.js";
import { PricingMaterialsCache } from "../src/b2b/pricing/infrastructure/pricing-materials.cache.js";
import { DeferredTerm } from "../src/platform/database/client/client.js";
import { E2E_STAFF_ID, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import {
  handOver,
  pickupSite,
  placeOrderForCustomer,
  type PlacedTestOrder,
} from "./order-factory.js";
import {
  bagLines,
  bootstrapProductionDay,
  closeOrder,
  closePlan,
  CROISSANT,
  markLine,
  MEMBER,
  SERVICE_DAY,
  sheetOf,
  STAFF,
} from "./production-day-fixture.js";
import { onlyVariant, posePromotion, promotionTerms } from "./promotion-fixtures.js";
import { windowAroundServiceDay } from "./shortfall-decision-scene.js";

const LABEL = "Croissants du printemps";
const GROSS = 93_000;
const NET = 81_840;
const PIECES = 5;
const BONS = 3;
/** 5 × 0,8184 = 4,092 → 4,09 €. */
const BON_LINE_CENTS = 409;

let ctx: E2eContext;

beforeAll(async () => {
  compiledSchematron();
  ({ ctx } = await bootstrapProductionDay());
}, SCHEMATRON_COMPILE_TIMEOUT_MS);

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await pickupSite(ctx.prisma);
  await ctx.prisma.catalogItem.update({
    where: { sku: CROISSANT },
    data: { priceMillicents: GROSS },
  });
  await posePromotion(
    ctx.asSub(STAFF),
    promotionTerms({
      internalName: "Moins douze sur le croissant",
      label: { fr: LABEL, en: null, it: null },
      effect: { kind: "percent_off", value: 1_200 },
      fulfillment: { kind: "displayed_price" },
      scope: onlyVariant(CROISSANT),
    }),
  );
  ctx.app.get(PricingMaterialsCache).invalidate();
});

/** Trois bons au compte d'une même société, colisés en entier et retirés. */
async function threeDepartedBons(): Promise<readonly PlacedTestOrder[]> {
  const company = await createCompany(ctx.prisma);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const buyer = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  await attachTo(ctx.prisma, buyer.id, company.id);
  const site = await pickupSite(ctx.prisma);
  const orders: PlacedTestOrder[] = [];
  for (let index = 0; index < BONS; index += 1) {
    orders.push(
      await placeOrderForCustomer(ctx, {
        buyerUserId: buyer.id,
        companyId: company.id,
        staffUserId: E2E_STAFF_ID,
        settlement: "account",
        forDay: SERVICE_DAY,
        fulfillment: { method: "pickup", pickupSiteId: site },
        lines: [{ sku: CROISSANT, quantity: PIECES }],
      }),
    );
  }
  await closePlan(ctx);
  await ctx.drain();
  expect(await markLine(ctx)).toBe(204);
  await ctx.drain();
  for (const order of orders) {
    const sheet = await sheetOf(ctx, order.orderNumber);
    expect(await bagLines(ctx, sheet, [{ sku: CROISSANT, quantity: PIECES }])).toBe(204);
    expect(await closeOrder(ctx, order.id)).toBe(204);
    await ctx.drain();
    await handOver(ctx, order);
  }
  return orders;
}

/** La facture du mois des bons, émise comme l'émission la tire (lecteur, dossier, pièce). */
async function monthlyInvoiceOf(orderIds: readonly string[]) {
  const { from, to } = windowAroundServiceDay();
  const billable = (
    await ctx.app.get(MonthlyInvoicingReader, { strict: false }).uninvoicedOrders(from, to)
  ).filter((one) => orderIds.includes(one.orderId));
  expect(billable).toHaveLength(orderIds.length);
  const dossier = simulateInvoiceDossier(billable.map((one) => one.frozen));
  const {
    lines: _lines,
    vat: _vat,
    ...issue
  } = issueInput({
    seller: {
      ...SELLER,
      vatNumber: SELLER_FACTS.vatNumber,
      addressLines: ["Route de la Balme", "73000 Chambéry", "FR"],
    },
    buyer: BUYER,
  });
  return { dossier, invoice: invoiceFromDossier({ ...issue, computed: dossier.invoice }) };
}

describe("une promotion dans le prix affiché, de la passation à la facture du mois (§ 18.6)", () => {
  it("chiffre la remise sur chaque ligne, une ligne par bon, et garde les totaux des bons", async () => {
    const orders = await threeDepartedBons();
    const rows = await ctx.prisma.order.findMany({
      where: { id: { in: orders.map((order) => order.id) } },
      include: { lines: true },
    });

    // 1. Le prix figé et la ligne de chaque bon.
    for (const row of rows) {
      expect(row.lines.map((l) => [l.unitPriceMillicents, l.quantity, l.lineTotalCents])).toEqual([
        [NET, PIECES, BON_LINE_CENTS],
      ]);
    }

    const { dossier, invoice } = await monthlyInvoiceOf(orders.map((order) => order.id));
    const state = invoice.toState();

    // 2. Pas de prix moyen : une ligne par bon, au prix payé.
    expect(state.lines).toHaveLength(BONS);
    for (const line of state.lines) {
      expect(line).toMatchObject({
        sku: CROISSANT,
        quantityThousandths: PIECES * 1_000,
        unitPriceMillicents: NET,
        amountCents: BON_LINE_CENTS,
        priceDiscount: { grossUnitPriceMillicents: GROSS, labels: [LABEL] },
      });
    }

    // 4. Les totaux : facture = Σ des bons ; HT + TVA = TTC par taux et au total.
    expect(state.vat.goodsHtCents).toBe(BONS * BON_LINE_CENTS);
    expect(dossier.ordersTotalCents).toBe(rows.reduce((sum, row) => sum + row.totalCents, 0));
    expect(dossier.differenceCents).toBe(dossier.invoice.totalCents - dossier.ordersTotalCents);
    for (const category of state.vat.categories) {
      expect(category.taxableBaseCents).toBe(category.goodsHtCents);
      expect(category.vatCents).toBe(Math.round((category.taxableBaseCents * category.rate) / 100));
    }
    expect(state.vat.taxableBaseCents + state.vat.vatCents).toBe(state.vat.totalCents);

    // 3. La remise, au XML et au PDF.
    const xml = renderFacturXml(invoice);
    expect(xml.match(/<ram:GrossPriceProductTradePrice><ram:ChargeAmount>0.93</gu)).toHaveLength(
      BONS,
    );
    expect(xml.match(/<ram:ActualAmount>0.1116<\/ram:ActualAmount>/gu)).toHaveLength(BONS);
    expect(xml.match(/<ram:NetPriceProductTradePrice><ram:ChargeAmount>0.8184</gu)).toHaveLength(
      BONS,
    );
    expect(xml).toContain(`<ram:Content>Remise 12 % : ${LABEL}</ram:Content>`);
    expect(xml).toContain(
      `<ram:LineTotalAmount>${String((BONS * BON_LINE_CENTS) / 100)}</ram:LineTotalAmount><ram:ChargeTotalAmount>`,
    );
    expect(facturXArithmeticViolations(xml)).toEqual([]);
    expect(schematronFailures(xml)).toEqual([]);
    const pdf = await renderInvoicePdf({ invoice, xml, fonts: TEST_FONTS, logo: null });
    const text = drawnUnicodeText(pdf);
    expect(text).toContain("0,8184");
    expect(text).toContain(`Remise 12 % : ${LABEL}`);
  });
});
