/**
 * E2E de la **remise de retrait sur ses seules lignes éligibles** (plan
 * `documentation/livraisons/clientele/plan-remise-retrait-par-clientele-et-exclusions.md`,
 * lot A) — ce que seul le vrai chemin prouve : le rangement des SKU lu sur le
 * catalogue servi (V4), le même montant au devis et à la commande, et le
 * drapeau, le produit et la famille FIGÉS sur `order_lines` (R2).
 *
 * Réglages posés par les routes staff : ce sont elles que le back-office
 * appelle, et elles passent par `PickupDiscount`.
 */
import { randomUUID } from "node:crypto";

import type { CreatedPickupResponse, PlacedOrderResponse, ShopQuoteView } from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const ACTIVE = "auth0|exclusions-pro";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

/** Un pro au compte ne crée pas d'intention ; le double n'est là que par sûreté. */
const fakeGateway = {
  createIntent: () =>
    Promise.resolve({ paymentIntentId: "pi_exclusions", clientSecret: "pi_exclusions_secret" }),
  retrieveIntent: (id: string) =>
    Promise.resolve({
      paymentIntentId: id,
      clientSecret: `${id}_secret`,
      state: "awaiting_payment" as const,
    }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

interface Article {
  readonly sku: string;
  readonly productId: string;
  readonly categoryId: string;
}

/**
 * Deux articles vendables aux pros, de deux familles différentes : le
 * croissant de toutes les suites, et le premier article d'une autre famille
 * sans limite ni opération qui pourrait refuser la commande.
 */
async function twoFamilies(): Promise<readonly [Article, Article]> {
  const select = { productSku: true, productId: true, categoryId: true } as const;
  const sellable = {
    isDefault: true,
    withdrawnAt: null,
    operationOnly: false,
    proReviewPending: false,
    orderLimitTime: null,
    vatRatePercent: { not: null },
  } as const;
  const croissant = await ctx.prisma.catalogItem.findFirstOrThrow({
    where: { productSku: "VIE-001", isDefault: true },
    select,
  });
  const other = await ctx.prisma.catalogItem.findFirstOrThrow({
    where: { ...sellable, categoryId: { not: croissant.categoryId } },
    orderBy: { productSku: "asc" },
    select,
  });
  const article = (row: typeof croissant): Article => ({
    sku: row.productSku,
    productId: row.productId,
    categoryId: row.categoryId,
  });
  return [article(croissant), article(other)];
}

async function seedActivePro(): Promise<void> {
  const user = await createUser(ctx.prisma, { auth0Sub: ACTIVE });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
}

/** −10 % aux pros, la famille de `excluded` exclue. */
async function seedPoint(excluded: Article): Promise<string> {
  const response = await ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/pickup-addresses")
    .send({
      label: "Labo",
      ligne1: "5 rue du Four",
      ligne2: "",
      codePostal: "75002",
      ville: "Paris",
      pays: "France",
      discounts: {
        b2b: {
          adjustment: { mode: "percent", bp: 1_000 },
          scope: "all_except",
          categories: [{ categoryId: excluded.categoryId, eligible: false }],
          products: [],
        },
        b2c: null,
      },
    })
    .expect(201);
  return jsonBody<CreatedPickupResponse>(response).id;
}

function linesOf(articles: readonly Article[]): readonly { sku: string; quantity: number }[] {
  return articles.map((article) => ({ sku: article.sku, quantity: 10 }));
}

describe("la remise de retrait, une famille exclue", () => {
  it("au DEVIS et à la COMMANDE : le même montant, sur les seules lignes éligibles", async () => {
    await seedActivePro();
    const [croissant, other] = await twoFamilies();
    const point = await seedPoint(other);
    const lines = linesOf([croissant, other]);

    const quote = jsonBody<ShopQuoteView>(
      await ctx
        .asSub(ACTIVE)
        .post("/shop/quote/mine")
        .send({ lines, fulfillment: { method: "pickup", pickupAddressId: point } })
        .expect(200),
    );
    const eligible = quote.lines.find((line) => line.sku === croissant.sku)?.lineTotalCents ?? 0;
    expect(eligible).toBeGreaterThan(0);
    expect(quote.discountCents).toBe(Math.round(eligible / 10));

    const placed = jsonBody<PlacedOrderResponse>(
      await ctx
        .asSub(ACTIVE)
        .post("/orders")
        .send({
          idempotencyKey: randomUUID(),
          pickupAddressId: point,
          requestedDeliveryDate: serviceDay(),
          fulfillmentMethod: "pickup",
          requestedWindow: { start: "07:00", end: "08:00" },
          note: "",
          lines,
        })
        .expect(201),
    );

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: placed.id },
      select: {
        discountCents: true,
        totalCents: true,
        lines: {
          orderBy: { sku: "asc" },
          select: { sku: true, pickupDiscountEligible: true, productId: true, categoryId: true },
        },
      },
    });
    expect(order.discountCents).toBe(quote.discountCents);
    expect(order.totalCents).toBe(quote.totalCents);
    expect(order.lines).toEqual(
      [
        { ...croissant, eligible: true },
        { ...other, eligible: false },
      ]
        .sort((left, right) => left.sku.localeCompare(right.sku))
        .map(({ sku, productId, categoryId, eligible }) => ({
          sku,
          pickupDiscountEligible: eligible,
          productId,
          categoryId,
        })),
    );
  });
});
