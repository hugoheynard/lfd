/**
 * E2E de **la facture et des remises de panier** — plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 18.4, Q-M2 et Q-M3, lot M5.
 *
 * Ce que seul le vrai Postgres prouve : la sélection de la facture relit
 * `order_discounts` (remises actives seulement), les parts des bons remis
 * (`delivery_note_discounts`), et retombe sur les colonnes pour une commande
 * non reprise — le repli unique. Puis le dossier et le XML Factur-X en sont
 * tirés comme à l'émission (`simulateInvoiceDossier`, `renderFacturXml`).
 *
 * La preuve centrale : avec UNE remise, la facture, sa ventilation et son XML
 * sont ceux d'hier, que la commande soit reprise ou non.
 *
 * ⚠️ La seconde remise est écrite par Prisma, dans la transaction qui garde
 * le contrôle des remises vrai (somme = `discount_cents`, déclencheur
 * différé) : ces cas-ci (un montant fixe de 10 c, une commande composée en
 * TTC) n'ont pas de chemin de passation. Depuis M7, deux remises se posent
 * aussi par le vrai chemin — promotions panier cumulables —, éprouvé de
 * bout en bout par `promotions-basket-cumul.e2e-spec.ts`.
 */
import { randomUUID } from "node:crypto";

import { ttcCentsFromHtMillicents } from "@lfd/money";

import { issueInput } from "../src/b2b/accounting/domain/entities/__tests__/invoice-fixtures.js";
import { Invoice } from "../src/b2b/accounting/domain/entities/invoice.js";
import { facturXArithmeticViolations } from "../src/b2b/accounting/domain/services/facturx-arithmetic.js";
import { renderFacturXml } from "../src/b2b/accounting/domain/services/facturx-xml.js";
import { BASKET_PROMOTION_PREFIX } from "../src/b2b/accounting/domain/services/invoice-discount-allowances.js";
import {
  COMPANY_DISCOUNT,
  simulateInvoiceDossier,
} from "../src/b2b/accounting/domain/services/invoice-dossier.js";
import type { FrozenInvoiceOrder } from "../src/b2b/accounting/domain/services/invoice-dossier.types.js";
import {
  BILLABLE_INVOICE_ORDER_SELECT,
  toBillableInvoiceOrder,
} from "../src/b2b/accounting/infrastructure/billable-invoice-order.mapper.js";
import type { E2eContext } from "./e2e-harness.js";
import { asPlacedBeforeM3 } from "./order-discount-fixtures.js";
import { handOver, pickupSite } from "./order-factory.js";
import { bootstrapProductionDay, closeOrder, STAFF } from "./production-day-fixture.js";
import { poseSiteDiscount } from "./promotion-fixtures.js";
import { accountOrder, decide, report, type Drawn } from "./shortfall-decision-scene.js";

const SECOND_PROMOTION = "promo_e2e_second";
const SECOND_LABEL = "Fidélité du fournil";
const SECOND_CENTS = 10;

let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const ten = { mode: "percent" as const, value: 1_000 };
  await poseSiteDiscount(ctx.asSub(STAFF), await pickupSite(ctx.prisma), { b2b: ten, b2c: ten });
});

/** 3 croissants au compte, tous au sac, puis remis : un bon complet. */
async function completeOrder(before?: (order: Drawn) => Promise<void>): Promise<Drawn> {
  const order = await accountOrder(ctx, 3);
  await before?.(order);
  expect(await closeOrder(ctx, order.id)).toBe(204);
  await ctx.drain();
  await handOver(ctx, order);
  return order;
}

/** 3 commandés, 1 au sac, le reste abandonné, puis le BL-1 remis : un départ incomplet. */
async function partialOrder(before?: (order: Drawn) => Promise<void>): Promise<Drawn> {
  const order = await accountOrder(ctx, 1);
  await before?.(order);
  expect(await report(ctx, order.id)).toBe(204);
  expect((await decide(ctx, order.id)).status).toBe(204);
  expect(await closeOrder(ctx, order.id)).toBe(204);
  await ctx.drain();
  await handOver(ctx, order);
  return order;
}

/**
 * Une seconde remise de panier, montant fixe, sur les mêmes lignes que la
 * première. `discount_cents` et le total suivent dans la même transaction :
 * le déclencheur différé juge la somme au COMMIT.
 */
async function addSecondDiscount(order: Drawn): Promise<void> {
  await ctx.prisma.$transaction(async (tx) => {
    const first = await tx.orderDiscount.findFirstOrThrow({
      where: { orderId: order.id, archivedAt: null },
      include: { coveredLines: true },
    });
    const row = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
    await tx.order.update({
      where: { id: order.id },
      data: {
        discountCents: row.discountCents + SECOND_CENTS,
        totalCents: row.totalCents - SECOND_CENTS,
      },
    });
    await tx.orderDiscount.create({
      data: {
        id: randomUUID(),
        orderId: order.id,
        origin: "computed",
        rank: 2,
        promotionId: SECOND_PROMOTION,
        adjustment: { mode: "amount", cents: SECOND_CENTS },
        label: { fr: SECOND_LABEL, en: "Bakery loyalty", it: "Fedeltà" },
        baseCents: first.baseCents - first.amountCents,
        amountCents: SECOND_CENTS,
        vatShares: [{ rate: 5.5, htCents: SECOND_CENTS }],
        coveredLines: {
          create: first.coveredLines.map((line) => ({ orderLineId: line.orderLineId })),
        },
      },
    });
  });
}

async function frozenOf(orderId: string): Promise<FrozenInvoiceOrder> {
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: BILLABLE_INVOICE_ORDER_SELECT,
  });
  return toBillableInvoiceOrder(row);
}

function xmlOf(order: FrozenInvoiceOrder): string {
  const { invoice } = simulateInvoiceDossier([order]);
  return renderFacturXml(
    Invoice.issue(
      issueInput({
        lines: invoice.lines.map((line) => ({
          sku: line.sku,
          label: line.label,
          unitCode: line.unitCode,
          quantityThousandths: line.quantityThousandths,
          unitPriceMillicents: line.unitPriceMillicents,
          vatRate: line.vatRate,
          amountCents: line.amountCents,
        })),
        vat: invoice.vat,
      }),
    ),
  );
}

function allowanceKeys(order: FrozenInvoiceOrder): readonly string[] {
  const { vat } = simulateInvoiceDossier([order]).invoice;
  return [
    ...new Set(
      vat.categories.flatMap((c) =>
        c.allowances.filter((p) => p.amountCents > 0).map((p) => p.key),
      ),
    ),
  ];
}

function reasonsOf(xml: string): readonly string[] {
  return [...xml.matchAll(/<ram:Reason>([^<]*)<\/ram:Reason>/gu)].map((match) => match[1] ?? "");
}

async function firstPromotionOf(orderId: string): Promise<string> {
  const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (row.discountPromotionId === null) {
    throw new TypeError("La remise du point de retrait devait porter sa promotion.");
  }
  return row.discountPromotionId;
}

describe("une seule remise : la facture d'hier, octet pour octet", () => {
  it.each([
    ["bon complet", completeOrder],
    ["bon partiel", partialOrder],
  ])("%s — reprise ou non, même dossier et même XML", async (_case, scene) => {
    const order = await scene();
    const reprise = await frozenOf(order.id);
    expect(reprise.basketDiscounts).toHaveLength(1);
    const before = { dossier: simulateInvoiceDossier([reprise]), xml: xmlOf(reprise) };

    await asPlacedBeforeM3(ctx.prisma, order.id);
    const notReprise = await frozenOf(order.id);
    expect(notReprise.basketDiscounts).toEqual([
      expect.objectContaining({ promotionId: await firstPromotionOf(order.id), parts: null }),
    ]);

    expect(simulateInvoiceDossier([notReprise])).toEqual(before.dossier);
    expect(xmlOf(notReprise)).toBe(before.xml);
    expect(allowanceKeys(reprise)).toEqual([COMPANY_DISCOUNT]);
    expect(reasonsOf(before.xml)).toEqual(["Remise client"]);
    expect(facturXArithmeticViolations(before.xml)).toEqual([]);
  });
});

describe("deux remises : une BG-20 par promotion, motif = libellé figé", () => {
  it.each([
    ["bon complet, line_ht", completeOrder],
    ["bon partiel, line_ht", partialOrder],
  ])("%s", async (_case, scene) => {
    const order = await scene(addSecondDiscount);
    const frozen = await frozenOf(order.id);
    const first = await firstPromotionOf(order.id);

    expect(frozen.basketDiscounts?.map((d) => d.promotionId)).toEqual([first, SECOND_PROMOTION]);
    expect(allowanceKeys(frozen)).toEqual([
      `${BASKET_PROMOTION_PREFIX}${first}`,
      `${BASKET_PROMOTION_PREFIX}${SECOND_PROMOTION}`,
    ]);
    const dossier = simulateInvoiceDossier([frozen]);
    expect(dossier.invoice.companyDiscountCents).toBe(frozen.discountCents);
    expect(dossier.threeGapInvariantHolds).toBe(true);

    const xml = xmlOf(frozen);
    expect(reasonsOf(xml)).toContain(SECOND_LABEL);
    expect(reasonsOf(xml)).not.toContain("Remise client");
    expect(xml).not.toContain(SECOND_PROMOTION);
    expect(facturXArithmeticViolations(xml)).toEqual([]);
  });

  /**
   * Le BL-1 partiel recompose chaque remise sur ce qui part, et le départ
   * écrit ses parts (lot M4) : la facture les lit, pas la commande.
   */
  it("bon partiel : les parts viennent des bons remis, pas de la commande", async () => {
    const order = await partialOrder(addSecondDiscount);
    const parts = await ctx.prisma.deliveryNoteDiscount.findMany({
      where: { note: { orderId: order.id } },
      orderBy: { amountCents: "asc" },
    });
    expect(parts).toHaveLength(2);
    const frozen = await frozenOf(order.id);
    const read = (frozen.basketDiscounts ?? []).map((d) =>
      (d.parts ?? []).reduce((sum, part) => sum + part.amountCents, 0),
    );
    expect([...read].sort((a, b) => a - b)).toEqual(parts.map((part) => part.amountCents));
    const ordered = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(frozen.discountCents).toBeLessThan(ordered.discountCents);
  });

  it("bon partiel composé en TTC (exact_ht) : mêmes clés, arithmétique tenue", async () => {
    const order = await partialOrder(async (placed) => {
      await markExact(placed.id);
      await addSecondDiscount(placed);
    });
    const frozen = await frozenOf(order.id);
    expect(frozen.basketDiscounts).toHaveLength(2);
    const xml = xmlOf(frozen);
    expect(reasonsOf(xml)).toContain(SECOND_LABEL);
    expect(facturXArithmeticViolations(xml)).toEqual([]);
    expect(simulateInvoiceDossier([frozen]).invoice.companyDiscountCents).toBe(
      frozen.discountCents,
    );
  });
});

/**
 * La commande composée en TTC — la méthode de `delivery-notes-discounts.e2e-spec.ts`
 * (écriture brute datée du 2026-10-31 : aucun chemin ne mène un particulier au
 * colisage décidé). Seuls la méthode et les TTC figés sont lus par le BL partiel.
 */
async function markExact(orderId: string): Promise<void> {
  const lines = await ctx.prisma.orderLine.findMany({ where: { orderId } });
  for (const line of lines) {
    const label = ttcCentsFromHtMillicents(line.unitPriceMillicents, line.vatRate.toNumber());
    await ctx.prisma.orderLine.update({
      where: { id: line.id },
      data: { unitPriceTtcCents: label, lineTotalTtcCents: label * line.quantity },
    });
  }
  const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  await ctx.prisma.order.update({
    where: { id: orderId },
    data: {
      vatMethod: "exact_ht",
      discountTtcCents: Math.round(row.discountCents * 1.055),
      voucherTtcCents: 0,
      deliveryFeeTtcCents: 0,
    },
  });
}
