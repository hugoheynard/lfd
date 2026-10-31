/**
 * E2E du **cumul au panier, de bout en bout** — plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 16.1 et § 18.6, lot M7. Sur le vrai Postgres, par les vrais gestes :
 *
 * 1. deux promotions panier « Cumulable » se posent (le refus « une
 *    promotion panier par commande » ne s'applique plus entre elles) ;
 * 2. le devis annonce deux remises, et la passation fige les mêmes, au
 *    centime, dans `order_discounts` — colonnes uniques à `NULL`, libellé
 *    générique (arbitrage n° 1, § 18.8) ; le déclencheur différé tient ;
 * 3. la révision réécrit l'ensemble (archive puis insère) et refuse un point
 *    qui changerait l'ensemble, en nommant la remise perdue ;
 * 4. le bon partiel recompose chaque remise sur ce qui part ;
 * 5. la facture Factur-X porte deux BG-20, une par promotion, motif = libellé
 *    figé, arithmétique tenue.
 *
 * Le catalogue de test n'a qu'un taux (5,5 %) : « une BG-20 par promotion et
 * par taux » s'y lit comme deux BG-20.
 */
import type { MyShopQuoteView } from "@lfd/contracts";
import { QueryBus } from "@nestjs/cqrs";

import { QuoteMyShopCartQuery } from "../src/b2b/orders/application/queries/quote-my-shop-cart.handler.js";
import { issueInput } from "../src/b2b/accounting/domain/entities/__tests__/invoice-fixtures.js";
import { Invoice } from "../src/b2b/accounting/domain/entities/invoice.js";
import { facturXArithmeticViolations } from "../src/b2b/accounting/domain/services/facturx-arithmetic.js";
import { renderFacturXml } from "../src/b2b/accounting/domain/services/facturx-xml.js";
import { BASKET_PROMOTION_PREFIX } from "../src/b2b/accounting/domain/services/invoice-discount-allowances.js";
import { simulateInvoiceDossier } from "../src/b2b/accounting/domain/services/invoice-dossier.js";
import type { FrozenInvoiceOrder } from "../src/b2b/accounting/domain/services/invoice-dossier.types.js";
import {
  BILLABLE_INVOICE_ORDER_SELECT,
  toBillableInvoiceOrder,
} from "../src/b2b/accounting/infrastructure/billable-invoice-order.mapper.js";
import { PricingMaterialsCache } from "../src/b2b/pricing/infrastructure/pricing-materials.cache.js";
import { jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { handOver, pickupSite } from "./order-factory.js";
import { bootstrapProductionDay, closeOrder, CROISSANT, STAFF } from "./production-day-fixture.js";
import { posePromotion, promotionTerms } from "./promotion-fixtures.js";
import { accountOrder, decide, report, type Drawn } from "./shortfall-decision-scene.js";

const LABEL_A = "Dix pour cent fidélité";
const LABEL_B = "Cinq pour cent du fournil";
const GENERIC = { fr: "Remises", en: "Discounts", it: "Sconti" };

let ctx: E2eContext;
let promotionA = "";
let promotionB = "";

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(STAFF);

/** Deux promotions panier cumulables, au retrait, pour tout le monde : −10 % puis −5 %. */
beforeEach(async () => {
  await ctx.reset();
  await pickupSite(ctx.prisma);
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

/** Les promotions dans l'ordre d'application : rang égal, identifiant croissant. */
function chained(): readonly string[] {
  return [promotionA, promotionB].sort();
}

function activeDiscounts(orderId: string) {
  return ctx.prisma.orderDiscount.findMany({
    where: { orderId, archivedAt: null },
    orderBy: { rank: "asc" },
    include: { coveredLines: true },
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

function reasonsOf(xml: string): readonly string[] {
  return [...xml.matchAll(/<ram:Reason>([^<]*)<\/ram:Reason>/gu)].map((match) => match[1] ?? "");
}

function allowanceKeys(order: FrozenInvoiceOrder): readonly string[] {
  const { vat } = simulateInvoiceDossier([order]).invoice;
  return [
    ...new Set(
      vat.categories.flatMap((category) =>
        category.allowances.filter((part) => part.amountCents > 0).map((part) => part.key),
      ),
    ),
  ];
}

describe("le cumul au panier, de bout en bout (M7)", () => {
  it("la pose admet deux promotions panier cumulables", async () => {
    const stored = await ctx.prisma.promotion.findMany({
      select: { cumulative: true, applicationPoint: true },
    });
    expect(stored).toEqual([
      { cumulative: true, applicationPoint: "basket" },
      { cumulative: true, applicationPoint: "basket" },
    ]);
  });

  it("refuse à la pose une sixième cumulable de panier, en le nommant (2026-10-31)", async () => {
    for (const name of ["Cumul C", "Cumul D", "Cumul E"]) {
      await posePromotion(
        staff(),
        promotionTerms({
          internalName: name,
          effect: { kind: "percent_off", value: 100 },
          fulfillment: { kind: "pickup", pickupId: null },
          cumulative: true,
        }),
      );
    }

    const refused = await staff()
      .post("/admin/promotions")
      .send(
        promotionTerms({
          internalName: "Cumul F",
          fulfillment: { kind: "pickup", pickupId: null },
          cumulative: true,
        }),
      )
      .expect(409);

    expect(jsonBody<{ code: string }>(refused).code).toBe("promotions.too_many_cumulative_basket");
    expect(await ctx.prisma.promotion.count()).toBe(5);
  });

  it("devis = commande au centime, une remise par promotion, colonnes uniques à NULL", async () => {
    const order = await accountOrder(ctx, 3);
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const quote = await ctx.app.get(QueryBus).execute<QuoteMyShopCartQuery, MyShopQuoteView>(
      new QuoteMyShopCartQuery(
        {
          lines: [{ sku: CROISSANT, quantity: 3 }],
          fulfillment: { method: "pickup", pickupAddressId: await pickupSite(ctx.prisma) },
        },
        row.companyId,
        row.placedByUserId,
      ),
    );

    const discounts = await activeDiscounts(order.id);
    expect(discounts.map((discount) => discount.promotionId)).toEqual(chained());
    expect(quote.discounts?.map((discount) => discount.amountCents)).toEqual(
      discounts.map((discount) => discount.amountCents),
    );
    expect({ discount: quote.discountCents, total: quote.totalCents }).toEqual({
      discount: row.discountCents,
      total: row.totalCents,
    });
    expect(discounts.reduce((sum, discount) => sum + discount.amountCents, 0)).toBe(
      row.discountCents,
    );
    expect(row).toMatchObject({
      discountAdjustment: null,
      discountPromotionId: null,
      discountLabel: GENERIC,
    });
    // Chaque remise couvre la ligne de croissants : le drapeau d'hier est leur OU.
    expect(discounts.every((discount) => discount.coveredLines.length === 1)).toBe(true);
  });

  it("la révision réécrit l'ensemble, et refuse un point qui changerait l'ensemble", async () => {
    const order = await accountOrder(ctx, 3);
    const other = jsonBody<{ id: string }>(
      await staff()
        .post("/admin/pickup-addresses")
        .send({
          label: "La Boutique",
          ligne1: "1 place du Marché",
          ligne2: "",
          codePostal: "73150",
          ville: "Val d'Isère",
          pays: "France",
          discounts: { b2b: null, b2c: null },
        })
        .expect(201),
    ).id;
    await posePromotion(
      staff(),
      promotionTerms({
        internalName: "Cumul du point",
        effect: { kind: "percent_off", value: 200 },
        fulfillment: { kind: "pickup_point", pickupId: other },
        cumulative: true,
      }),
    );
    ctx.app.get(PricingMaterialsCache).invalidate();
    const content = (pickupAddressId: string, quantity: number) => ({
      expectedRevision: 0,
      requestedDeliveryDate: serviceDay(),
      fulfillmentMethod: "pickup",
      pickupAddressId,
      requestedWindow: { start: "07:00", end: "08:00" },
      note: "",
      lines: [{ sku: CROISSANT, quantity }],
    });

    const refused = await staff()
      .post(`/admin/orders/${order.id}/revisions`)
      .send(content(other, 3))
      .expect(409);
    // Plus spécifique (un point nommé), la promotion du point s'applique en
    // premier : le rang 1 changerait, et le refus nomme celle qu'il perdrait.
    const body = jsonBody<{ code: string; message: string }>(refused);
    expect(body.code).toBe("orders.revise.fulfillment_alters_promotion");
    expect(body.message).toContain("remplacerait");
    expect((await activeDiscounts(order.id)).map((discount) => discount.promotionId)).toEqual(
      chained(),
    );

    await staff()
      .post(`/admin/orders/${order.id}/revisions`)
      .send(content(await pickupSite(ctx.prisma), 5))
      .expect(200);
    const active = await activeDiscounts(order.id);
    expect(active.map((discount) => discount.promotionId)).toEqual(chained());
    const archived = await ctx.prisma.orderDiscount.count({
      where: { orderId: order.id, archivedAt: { not: null } },
    });
    expect(archived).toBe(2);
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(active.reduce((sum, discount) => sum + discount.amountCents, 0)).toBe(row.discountCents);
  });

  it("bon partiel et facture : chaque remise recomposée, deux BG-20, arithmétique tenue", async () => {
    const order: Drawn = await accountOrder(ctx, 1);
    expect(await report(ctx, order.id)).toBe(204);
    expect((await decide(ctx, order.id)).status).toBe(204);
    expect(await closeOrder(ctx, order.id)).toBe(204);
    await ctx.drain();
    await handOver(ctx, order);

    const parts = await ctx.prisma.deliveryNoteDiscount.findMany({
      where: { note: { orderId: order.id } },
    });
    expect(parts).toHaveLength(2);
    const frozen = await frozenOf(order.id);
    expect(frozen.basketDiscounts?.map((discount) => discount.promotionId)).toEqual(chained());
    expect(allowanceKeys(frozen)).toEqual(chained().map((id) => `${BASKET_PROMOTION_PREFIX}${id}`));
    const dossier = simulateInvoiceDossier([frozen]);
    expect(dossier.invoice.companyDiscountCents).toBe(frozen.discountCents);
    expect(dossier.threeGapInvariantHolds).toBe(true);

    const xml = xmlOf(frozen);
    expect([...reasonsOf(xml)].sort()).toEqual([LABEL_A, LABEL_B].sort());
    expect(facturXArithmeticViolations(xml)).toEqual([]);
  });

  it("une seule cumulable : la remise d'hier, colonnes uniques écrites", async () => {
    await staff()
      .post(`/admin/promotions/${promotionB}/archive`)
      .send({ reason: "Fin du cumul" })
      .expect(204);
    ctx.app.get(PricingMaterialsCache).invalidate();
    const order = await accountOrder(ctx, 3);
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });

    expect(row.discountPromotionId).toBe(promotionA);
    expect(row.discountAdjustment).toEqual({ mode: "percent", bp: 1_000 });
    expect(await activeDiscounts(order.id)).toHaveLength(1);
  });
});
