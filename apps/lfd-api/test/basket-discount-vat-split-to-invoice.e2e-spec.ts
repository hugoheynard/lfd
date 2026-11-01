/**
 * E2E de **la remise de panier en pourcentage, ventilée par taux de TVA, du
 * devis à la facture** (plan des promotions, § 2.11).
 *
 * Une promotion « −20 % au panier » (retrait et livraison, sans condition) est
 * posée par la route admin. Un pro règle par carte une commande de deux taux
 * (7 croissants à 0,59 € à 5,5 %, 5 pains au chocolat à 0,93 € à 20 %) dont
 * l'arrondi tombe sur un reste : 20 % de 413 c = 82,6 c, 20 % de 465 c = 93 c,
 * 20 % de 878 c = 175,6 → 176 c. Les parts planchées donnent 82 + 93 =
 * 175 ; le centime restant va au plus fort reste (le 5,5 %, .6).
 *
 * Ce que le fichier tient : la remise est UNE somme du devis à la facture, ses
 * parts par taux sont proportionnelles à l'assiette (±1 c, reste au plus fort
 * reste), aucune base imposable n'est négative, HT + TVA = TTC par taux et au
 * total, et la facture égale ce que le client a payé.
 *
 * La facture est celle de la carte (`card-invoices.e2e-spec.ts`) : retrait,
 * encaissement, relais durable — jamais écrite par Prisma.
 */
import { CommandBus } from "@nestjs/cqrs";

import { z } from "zod";

import type { ShopQuoteView } from "@lfd/contracts";

import { ConfirmOrderPaymentCommand } from "../src/b2b/orders/application/commands/confirm-order-payment.command.js";
import { MarkOrderFulfilledCommand } from "../src/b2b/orders/application/commands/mark-order-fulfilled.command.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { PricingMaterialsCache } from "../src/b2b/pricing/infrastructure/pricing-materials.cache.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { OutboxRelay } from "../src/platform/outbox/outbox-relay.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { addBillingAddress, attachTo, createCompany, createUser } from "./factories.js";
import { cardGatewayDouble, pickupSite, placeOrder } from "./order-factory.js";
import { posePromotion, promotionTerms } from "./promotion-fixtures.js";

const ENTITIES = "/admin/accounting/legal-entities";
const STAFF = "staff-e2e";
const OWNER = "split-owner";
const CROISSANT = "VIE-001-1";
const PAIN_AU_CHOCOLAT = "VIE-002-1";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      {
        token: AdminTokenVerifier,
        value: { verify: () => Promise.resolve({ subject: STAFF, scopes: [] }) },
      },
      { token: PaymentGateway, value: cardGatewayDouble("pi_split") },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(STAFF);

async function settle(): Promise<void> {
  const relay = ctx.app.get(OutboxRelay);
  for (let round = 0; round < 4; round += 1) {
    await relay.sweep();
    await ctx.drain();
  }
}

async function entity(): Promise<void> {
  const id = jsonBody<{ id: string }>(
    await staff()
      .post(ENTITIES)
      .send({
        name: "La Folie Douce",
        legalForm: "SAS",
        siren: "552100554",
        rcs: "Chambéry B 552 100 554",
        shareCapitalCents: 1_000_000,
        vatNumber: "FR89552100554",
        address: {
          line1: "12 rue du Fournil",
          line2: "",
          postalCode: "73000",
          city: "Chambéry",
          countryCode: "FR",
        },
      })
      .expect(201),
  ).id;
  await staff()
    .put(`${ENTITIES}/${id}/creditor-identifier`)
    .send({ ics: "FR72ZZZ123456" })
    .expect(204);
  await staff()
    .put(`${ENTITIES}/${id}/creditor-account`)
    .send({
      iban: "FR1420041010050500013M02606",
      bic: "BNPAFRPP",
      holder: "La Folie Douce",
      line1: "12 rue du Fournil",
      line2: "",
      postalCode: "73000",
      city: "Chambéry",
      countryCode: "FR",
    })
    .expect(204);
  await staff()
    .put(`${ENTITIES}/${id}/invoice-payment-terms`)
    .send({
      latePenaltyRateBasisPoints: 1_415,
      recoveryIndemnityCents: 4_000,
      earlyPaymentDiscount: "néant",
    })
    .expect(204);
  await staff().put(`${ENTITIES}/${id}/invoice-prefix`).send({ prefix: "LFD" }).expect(204);
}

/** Prix pro choisis pour que l'arrondi tombe sur un reste ; le pain au chocolat passé à 20 %. */
async function setPricesAndRates(): Promise<void> {
  await ctx.prisma.catalogItem.update({
    where: { sku: CROISSANT },
    data: { priceMillicents: 59_000 },
  });
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
    data: { priceMillicents: 93_000, vatRatePercent: 20, publicByContext },
  });
  await ctx.prisma.catalogPriceHistory.updateMany({
    where: { productSku: "VIE-002" },
    data: { vatRatePercent: 20 },
  });
  ctx.app.get(PricingMaterialsCache).invalidate();
}

beforeEach(async () => {
  await ctx.reset();
  await setPricesAndRates();
});

const LINES = [
  { sku: CROISSANT, quantity: 7 },
  { sku: PAIN_AU_CHOCOLAT, quantity: 5 },
];
const DISCOUNT_BP = 2_000;
const BP = 10_000;

const breakdownSchema = z.object({
  categories: z.array(
    z.object({
      rate: z.number(),
      goodsHtCents: z.number(),
      taxableBaseCents: z.number(),
      vatCents: z.number(),
      allowances: z.array(z.object({ key: z.string(), amountCents: z.number() })),
    }),
  ),
  goodsHtCents: z.number(),
  allowancesCents: z.number(),
  taxableBaseCents: z.number(),
  vatCents: z.number(),
  totalCents: z.number(),
});

/** La remise attendue par taux : plancher de l'assiette × 20 %, puis le reste au plus fort reste. */
function expectedShares(goods: readonly number[], total: number): readonly number[] {
  const floors = goods.map((cents) => Math.floor((cents * DISCOUNT_BP) / BP));
  const remainders = goods.map((cents, index) => ({ index, rest: (cents * DISCOUNT_BP) % BP }));
  remainders.sort((a, b) => b.rest - a.rest || a.index - b.index);
  const left = total - floors.reduce((sum, cents) => sum + cents, 0);
  const shares = [...floors];
  for (const { index } of remainders.slice(0, left)) {
    shares[index] = (shares[index] ?? 0) + 1;
  }
  return shares;
}

it("−20 % au panier : la remise se ventile juste par taux, du devis à la facture", async () => {
  await entity();
  const site = await pickupSite(ctx.prisma);
  await posePromotion(
    staff(),
    promotionTerms({
      internalName: "Moins vingt au panier",
      label: { fr: "Moins vingt pour cent", en: null, it: null },
      effect: { kind: "percent_off", value: DISCOUNT_BP },
      fulfillment: { kind: "basket", pickup: "all", delivery: "all" },
    }),
  );
  ctx.app.get(PricingMaterialsCache).invalidate();
  const company = await createCompany(ctx.prisma, { raisonSociale: "Boulangerie split" });
  await addBillingAddress(ctx.prisma, company.id);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { vatNumber: "FR40303265045" },
  });
  const owner = await createUser(ctx.prisma, { auth0Sub: OWNER });
  await attachTo(ctx.prisma, owner.id, company.id, CustomerRole.owner);

  const quote = jsonBody<ShopQuoteView>(
    await ctx
      .asSub(OWNER)
      .post("/shop/quote/mine")
      .send({ lines: LINES, fulfillment: { method: "pickup", pickupAddressId: site } })
      .expect(200),
  );
  const order = await placeOrder(ctx, {
    buyerUserId: owner.id,
    companyId: company.id,
    settlement: "card",
    placedAt: new Date(daysAgo(1)),
    lines: LINES,
    fulfillment: { method: "pickup", pickupSiteId: site },
  });
  const bus = ctx.app.get(CommandBus);
  await bus.execute(
    new MarkOrderFulfilledCommand(order.orderNumber, STAFF, new Date(daysAgo(0)), "manual"),
  );
  await settle();
  await bus.execute(new ConfirmOrderPaymentCommand(order.paymentIntentId ?? "", "succeeded"));
  await settle();

  const placed = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  const parts = await ctx.prisma.orderDiscount.findMany({
    where: { orderId: order.id, archivedAt: null },
  });
  const [invoice, ...others] = await ctx.prisma.invoice.findMany({
    where: { orders: { some: { orderId: order.id } } },
  });
  expect(others).toEqual([]);
  if (invoice === undefined) {
    throw new TypeError("La carte payée et retirée devait produire une facture.");
  }
  const vat = breakdownSchema.parse(invoice.vatBreakdown);

  // Le repère : sans remise jouée, toutes les égalités ci-dessous tiendraient sur zéro.
  expect(quote.subtotalHtCents).toBe(878);
  expect(quote.discountCents).toBe(176);

  // Une seule remise, la même du devis à la facture, au centime.
  const invoiced = vat.categories.reduce(
    (sum, category) =>
      sum +
      category.allowances
        .filter((allowance) => allowance.key !== "loyalty_voucher")
        .reduce((inner, allowance) => inner + allowance.amountCents, 0),
    0,
  );
  expect(placed.discountCents).toBe(quote.discountCents);
  expect(parts.reduce((sum, part) => sum + part.amountCents, 0)).toBe(quote.discountCents);
  expect(invoiced).toBe(quote.discountCents);
  expect(vat.allowancesCents).toBe(quote.discountCents);

  // Les parts par taux : proportionnelles à l'assiette, reste au plus fort reste.
  const rates = [...vat.categories].sort((a, b) => a.rate - b.rate);
  expect(rates.map((category) => category.rate)).toEqual([5.5, 20]);
  const goods = rates.map((category) => category.goodsHtCents);
  const shares = rates.map(
    (category) => category.allowances.find((a) => a.key !== "loyalty_voucher")?.amountCents ?? 0,
  );
  expect(goods).toEqual([413, 465]);
  expect(shares).toEqual(expectedShares(goods, quote.discountCents));
  goods.forEach((cents, index) => {
    expect(Math.abs((shares[index] ?? 0) - (cents * DISCOUNT_BP) / BP)).toBeLessThan(1);
  });
  expect(
    z
      .array(z.object({ rate: z.number(), htCents: z.number() }))
      .parse(parts[0]?.vatShares)
      .sort((a, b) => a.rate - b.rate)
      .map((share) => share.htCents),
  ).toEqual(shares);

  // Aucune base négative ; HT + TVA = TTC par taux et au total.
  for (const category of rates) {
    expect(category.taxableBaseCents).toBeGreaterThanOrEqual(0);
    const allowed = category.allowances.reduce((sum, a) => sum + a.amountCents, 0);
    expect(category.taxableBaseCents).toBe(category.goodsHtCents - allowed);
    expect(category.vatCents).toBe(Math.round((category.taxableBaseCents * category.rate) / 100));
  }
  const ttcByRate = rates.map((category) => category.taxableBaseCents + category.vatCents);
  expect(invoice.totalHtCents + invoice.totalVatCents).toBe(invoice.totalTtcCents);
  expect(ttcByRate.reduce((sum, cents) => sum + cents, 0)).toBe(invoice.totalTtcCents);
  expect(rates.reduce((sum, c) => sum + c.taxableBaseCents, 0)).toBe(invoice.totalHtCents);
  expect(rates.reduce((sum, c) => sum + c.vatCents, 0)).toBe(invoice.totalVatCents);

  // Le total facturé est le total payé, et celui que le devis annonçait.
  expect(invoice.totalTtcCents).toBe(placed.totalCents);
  expect(invoice.totalTtcCents).toBe(quote.totalCents);
  expect(placed.paymentStatus).toBe("paid");
  expect(invoice.prepaidCents).toBe(placed.totalCents);
  expect(vat.totalCents).toBe(invoice.totalTtcCents);
});
