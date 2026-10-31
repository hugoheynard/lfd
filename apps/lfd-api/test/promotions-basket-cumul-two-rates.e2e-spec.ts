/**
 * E2E du **cumul au panier sur deux taux de TVA, de bout en bout** — plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 18 (lots M1–M7), doc d'état `documentation/pricing/promotions.md`.
 *
 * `promotions-basket-cumul.e2e-spec.ts` éprouve le cumul sur un seul taux
 * (5,5 %) : « une remise de document par promotion ET par taux » s'y lit
 * comme une par promotion. Ici, une commande PRO porte des croissants à
 * 5,5 % et des pains au chocolat passés à 20 %, et deux promotions panier
 * « Cumulable » (−10 % puis −5 %). Par les vrais gestes :
 *
 * 1. la passation fige deux `order_discounts`, chacune ventilée sur les
 *    deux taux, et leur somme est `discount_cents` ;
 * 2. le bon parti porte les mêmes parts (`delivery_note_discounts`) ;
 * 3. la facture du mois (lecteur `MonthlyInvoicingReader`, dossier, pièce)
 *    porte QUATRE remises de document — deux promotions × deux taux —,
 *    BT-97 = libellé figé, HT/TVA/TTC tenus au centime ;
 * 4. le XML émis passe le Schematron EN 16931 officiel sans aucune faute.
 *
 * ⚠️ Comme `invoice-weight-monthly.e2e-spec.ts`, la facture est émise par
 * les fonctions du domaine, pas par le passage de fin de mois : la journée
 * de production est dans l'avenir (`SERVICE_DAY` = J+7) et le passage exige
 * un mois clos. Le pain au chocolat est passé à 20 % en base, comme un push
 * du référentiel l'écrit (même geste que `loyalty-voucher-order.e2e-spec.ts`).
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
import { facturXArithmeticViolations } from "../src/b2b/accounting/domain/services/facturx-arithmetic.js";
import { renderFacturXml } from "../src/b2b/accounting/domain/services/facturx-xml.js";
import { simulateInvoiceDossier } from "../src/b2b/accounting/domain/services/invoice-dossier.js";
import { invoiceFromDossier } from "../src/b2b/accounting/domain/services/invoice-from-dossier.js";
import { PricingMaterialsCache } from "../src/b2b/pricing/infrastructure/pricing-materials.cache.js";
import type { E2eContext } from "./e2e-harness.js";
import { handOver, pickupSite } from "./order-factory.js";
import {
  bagLines,
  bootstrapProductionDay,
  closeOrder,
  markLine,
  sheetOf,
  STAFF,
} from "./production-day-fixture.js";
import { posePromotion, promotionTerms } from "./promotion-fixtures.js";
import { accountOrder, windowAroundServiceDay, type Drawn } from "./shortfall-decision-scene.js";

const PAIN_AU_CHOCOLAT = "VIE-002-1";
const LABEL_A = "Dix pour cent fidélité";
const LABEL_B = "Cinq pour cent du fournil";

let ctx: E2eContext;
let promotionA = "";
let promotionB = "";

beforeAll(async () => {
  compiledSchematron();
  ({ ctx } = await bootstrapProductionDay());
}, SCHEMATRON_COMPILE_TIMEOUT_MS);

afterAll(async () => {
  await ctx.close();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(STAFF);

beforeEach(async () => {
  await ctx.reset();
  await pickupSite(ctx.prisma);
  await painAuChocolatAtTwentyPercent();
  promotionA = await posePromotion(
    staff(),
    promotionTerms({
      internalName: "Cumul A",
      label: { fr: LABEL_A, en: null, it: null },
      effect: { kind: "percent_off", value: 1_000 },
      fulfillment: { kind: "pickup", pickupId: null },
      cumulative: true,
    }),
  );
  promotionB = await posePromotion(
    staff(),
    promotionTerms({
      internalName: "Cumul B",
      label: { fr: LABEL_B, en: null, it: null },
      effect: { kind: "percent_off", value: 500 },
      fulfillment: { kind: "pickup", pickupId: null },
      cumulative: true,
    }),
  );
  ctx.app.get(PricingMaterialsCache).invalidate();
});

/** Le pain au chocolat à 20 %, sur l'article ET sa trace, comme un push du référentiel. */
async function painAuChocolatAtTwentyPercent(): Promise<void> {
  const item = await ctx.prisma.catalogItem.findUniqueOrThrow({
    where: { sku: PAIN_AU_CHOCOLAT },
    select: { publicByContext: true },
  });
  const publicByContext = Object.fromEntries(
    Object.entries(item.publicByContext as Record<string, { htMillicents: number }>).map(
      ([key, entry]) => [key, { ...entry, vatRatePercent: 20 }],
    ),
  );
  await ctx.prisma.catalogItem.update({
    where: { sku: PAIN_AU_CHOCOLAT },
    data: { vatRatePercent: 20, publicByContext },
  });
  await ctx.prisma.catalogPriceHistory.updateMany({
    where: { productSku: "VIE-002" },
    data: { vatRatePercent: 20 },
  });
}

/** Les promotions dans l'ordre d'application : rang égal, identifiant croissant. */
function chained(): readonly string[] {
  return [promotionA, promotionB].sort();
}

function labelOf(promotionId: string): string {
  return promotionId === promotionA ? LABEL_A : LABEL_B;
}

/** 3 croissants et 2 pains au chocolat au compte, tout au sac, retirés : un bon complet. */
async function departedOrder(): Promise<Drawn> {
  const order = await accountOrder(ctx, 3, [{ sku: PAIN_AU_CHOCOLAT, quantity: 2 }]);
  expect(await markLine(ctx, PAIN_AU_CHOCOLAT)).toBe(204);
  await ctx.drain();
  const sheet = await sheetOf(ctx, order.orderNumber);
  expect(await bagLines(ctx, sheet, [{ sku: PAIN_AU_CHOCOLAT, quantity: 2 }])).toBe(204);
  expect(await closeOrder(ctx, order.id)).toBe(204);
  await ctx.drain();
  await handOver(ctx, order);
  return order;
}

/** Les parts par taux d'une remise, triées par taux. */
function sharesOf(value: unknown): readonly { rate: number; htCents: number }[] {
  return [...(value as { rate: number; htCents: number }[])]
    .map(({ rate, htCents }) => ({ rate, htCents }))
    .sort((a, b) => a.rate - b.rate);
}

/**
 * La facture du mois, émise comme l'émission la tire : lecteur de la facture
 * du mois, dossier, pièce. Les parties sont celles que la production fige
 * (vendeur au pays en code et à numéro de TVA, cf. `facturx-samples.ts`) —
 * celles abrégées de `issueInput` sont refusées par BR-09 / BR-S-02, à
 * raison, sur une pièce que l'émission ne produit pas.
 */
async function monthlyInvoiceOf(orderId: string) {
  const { from, to } = windowAroundServiceDay();
  const billable = (
    await ctx.app.get(MonthlyInvoicingReader, { strict: false }).uninvoicedOrders(from, to)
  ).find((one) => one.orderId === orderId);
  expect(billable).toBeDefined();
  const computed = simulateInvoiceDossier(billable === undefined ? [] : [billable.frozen]).invoice;
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
  return { computed, invoice: invoiceFromDossier({ ...issue, computed }) };
}

function allowancesOf(xml: string): readonly { reason: string; amount: string; rate: string }[] {
  return [
    ...xml.matchAll(
      /<ram:SpecifiedTradeAllowanceCharge>[\s\S]*?<ram:ActualAmount>([^<]*)<\/ram:ActualAmount><ram:Reason>([^<]*)<\/ram:Reason>[\s\S]*?<ram:RateApplicablePercent>([^<]*)<\/ram:RateApplicablePercent>/gu,
    ),
  ].map((match) => ({ amount: match[1] ?? "", reason: match[2] ?? "", rate: match[3] ?? "" }));
}

/*
 * Le calcul, à la main — croissant 2,00 € HT à 5,5 %, pain au chocolat
 * 2,20 € HT à 20 % (prix du semis) :
 *   3 × 200 = 600 c à 5,5 % ; 2 × 220 = 440 c à 20 % ; sous-total 1 040 c.
 *   A (−10 %, rang 1) : 10 % × 1 040 = 104 c → 60 c à 5,5 % (10 % × 600),
 *                       44 c à 20 % (10 % × 440).
 *   B (−5 %, rang 2)  : base 1 040 − 104 = 936 c ; 5 % × 936 = 46,8 → 47 c
 *                       → 27 c à 5,5 % (5 % × 540), 20 c à 20 % (5 % × 396 = 19,8).
 *   Remises : 104 + 47 = 151 c.
 *   Base 5,5 % : 600 − 60 − 27 = 513 c ; TVA 5,5 % × 513 = 28,2 → 28 c.
 *   Base 20 %  : 440 − 44 − 20 = 376 c ; TVA 20 % × 376 = 75,2 → 75 c.
 *   HT 513 + 376 = 889 c ; TVA 28 + 75 = 103 c ; TTC 889 + 103 = 992 c.
 */
const SUBTOTAL = 1_040;
const DISCOUNT = 151;
const TAXABLE = 889;
const VAT = 103;
const TOTAL = 992;
const SHARES_A = [
  { rate: 5.5, htCents: 60 },
  { rate: 20, htCents: 44 },
];
const SHARES_B = [
  { rate: 5.5, htCents: 27 },
  { rate: 20, htCents: 20 },
];

describe("le cumul au panier sur deux taux, de la passation au Schematron (M7)", () => {
  it("passation : deux remises, chacune ventilée sur les deux taux, somme = discount_cents", async () => {
    const order = await departedOrder();
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const discounts = await ctx.prisma.orderDiscount.findMany({
      where: { orderId: order.id, archivedAt: null },
      orderBy: { rank: "asc" },
    });

    // A posée avant B : son ULID est plus petit, elle s'applique la première.
    expect(chained()).toEqual([promotionA, promotionB]);
    expect(discounts.map((discount) => discount.promotionId)).toEqual(chained());
    expect(
      discounts.map((discount) => ({
        baseCents: discount.baseCents,
        amountCents: discount.amountCents,
        shares: sharesOf(discount.vatShares),
      })),
    ).toEqual([
      { baseCents: SUBTOTAL, amountCents: 104, shares: SHARES_A },
      { baseCents: SUBTOTAL - 104, amountCents: 47, shares: SHARES_B },
    ]);
    expect(discounts.reduce((sum, discount) => sum + discount.amountCents, 0)).toBe(
      row.discountCents,
    );
    expect(row.subtotalCents).toBe(SUBTOTAL);
    expect(row.discountCents).toBe(DISCOUNT);
    expect(row.vatCents).toBe(VAT);
    expect(row.totalCents).toBe(TOTAL);
  });

  it("le bon parti porte les mêmes parts par taux que la commande", async () => {
    const order = await departedOrder();
    const discounts = await ctx.prisma.orderDiscount.findMany({
      where: { orderId: order.id, archivedAt: null },
      orderBy: { rank: "asc" },
    });
    const parts = await ctx.prisma.deliveryNoteDiscount.findMany({
      where: { note: { orderId: order.id } },
    });

    expect(parts).toHaveLength(2);
    expect(
      [...parts]
        .map((part) => ({ amountCents: part.amountCents, shares: sharesOf(part.vatShares) }))
        .sort((a, b) => b.amountCents - a.amountCents),
    ).toEqual(
      discounts
        .map((discount) => ({
          amountCents: discount.amountCents,
          shares: sharesOf(discount.vatShares),
        }))
        .sort((a, b) => b.amountCents - a.amountCents),
    );
    expect(parts.reduce((sum, part) => sum + part.amountCents, 0)).toBe(DISCOUNT);
  });

  it("facture du mois : une remise par promotion ET par taux, BT-97 = libellé, Schematron sans faute", async () => {
    const order = await departedOrder();
    const { computed, invoice } = await monthlyInvoiceOf(order.id);

    expect(computed.companyDiscountCents).toBe(DISCOUNT);
    expect(
      computed.vat.categories.map((category) => ({
        rate: category.rate,
        taxableBaseCents: category.taxableBaseCents,
        vatCents: category.vatCents,
      })),
    ).toEqual([
      { rate: 5.5, taxableBaseCents: 513, vatCents: 28 },
      { rate: 20, taxableBaseCents: 376, vatCents: 75 },
    ]);
    expect(computed.vat).toMatchObject({
      goodsHtCents: SUBTOTAL,
      allowancesCents: DISCOUNT,
      taxableBaseCents: TAXABLE,
      vatCents: VAT,
      totalCents: TOTAL,
    });

    const xml = renderFacturXml(invoice);
    // Quatre BG-20 : 0,60 et 0,44 pour A, 0,27 et 0,20 pour B, motif = libellé figé.
    expect([...allowancesOf(xml)].sort((a, b) => a.amount.localeCompare(b.amount))).toEqual([
      { amount: "0.20", reason: labelOf(promotionB), rate: "20.00" },
      { amount: "0.27", reason: labelOf(promotionB), rate: "5.50" },
      { amount: "0.44", reason: labelOf(promotionA), rate: "20.00" },
      { amount: "0.60", reason: labelOf(promotionA), rate: "5.50" },
    ]);
    expect(xml).toContain("<ram:AllowanceTotalAmount>1.51</ram:AllowanceTotalAmount>");
    expect(xml).toContain("<ram:TaxBasisTotalAmount>8.89</ram:TaxBasisTotalAmount>");
    expect(xml).toContain('<ram:TaxTotalAmount currencyID="EUR">1.03</ram:TaxTotalAmount>');
    expect(xml).toContain("<ram:GrandTotalAmount>9.92</ram:GrandTotalAmount>");
    expect(facturXArithmeticViolations(xml)).toEqual([]);
    expect(schematronFailures(xml)).toEqual([]);
  });
});
