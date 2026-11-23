/**
 * E2E des **lectures publiées pour l'export des ventes** (lot E0 de
 * `documentation/commandes/export/plan-export-des-ventes.md`, § 4) : les
 * commandes d'une période (`orders`), le nom des familles (`catalog`),
 * l'identité de vente des sociétés (`account`), et l'argent rendu par carte
 * (`payment`, par son canal).
 *
 * Ce que seul le vrai SQL prouve : la période se lit sur le jour de
 * passation à Paris, toutes les commandes passées sont rendues, et
 * `countsAsRevenue` dit la même chose que `revenueWhere` — le `where` du
 * cockpit — sur les mêmes commandes. Les commandes passent par le vrai
 * chemin, antidatées d'un jour relatif (`placedDaysAgo`).
 */
import { addDays, instantToLocal } from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";

import { CompanySalesIdentityReader } from "../src/lafoliecoffee/account/domain/ports/company-sales-identity.reader.js";
import { CategoryNamesReader } from "../src/lafoliecoffee/catalog/domain/ports/category-names.reader.js";
import { revenueWhere } from "../src/lafoliecoffee/growth/infrastructure/revenue.where.js";
import { CancelOrderCommand } from "../src/lafoliecoffee/orders/cancellation/application/commands/cancel-order.command.js";
import { SalesExportReader } from "../src/lafoliecoffee/orders/domain/ports/sales-export.reader.js";
import { CardProviders } from "../src/payment/card/domain/ports/card-providers.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { Clock } from "../src/platform/time/clock.js";
import { cardProvidersDouble } from "./card-payments.js";
import { bootstrapE2e, E2E_STAFF_ID, placedDaysAgo, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { stubAdminVerifier } from "./operations-at-commerce-scene.js";
import {
  payByCard,
  pickupSite,
  placeOrder,
  placeOrderForCustomer,
  type PlacedTestOrder,
} from "./order-factory.js";
import { placedAtShopTill } from "./sales-export-scene.js";

const cards = cardProvidersDouble("pi_export");
let ctx: E2eContext;
let seq = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: CardProviders, value: cards },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Le jour de Paris d'il y a `days` jours. */
function dayAgo(days: number): string {
  return addDays(instantToLocal(ctx.app.get(Clock).now()).day, -days);
}

async function particular(): Promise<string> {
  seq += 1;
  const user = await createUser(ctx.prisma, {
    auth0Sub: `auth0|export-${String(seq)}`,
    email: `export-${String(seq)}@example.test`,
  });
  return user.id;
}

/** Une société au compte, son enseigne et son NAF, et son détenteur. */
async function company(): Promise<{ readonly companyId: string; readonly buyerId: string }> {
  const buyerId = await particular();
  const created = await createCompany(ctx.prisma, {
    raisonSociale: "SAS Altitude",
    enseigne: "Le Chalet",
    nafCode: "55.10Z",
  });
  await ctx.prisma.company.update({
    where: { id: created.id },
    data: { grantedTerms: ["monthly"] },
  });
  await attachTo(ctx.prisma, buyerId, created.id, CustomerRole.owner);
  return { companyId: created.id, buyerId };
}

/** Une commande saisie par l'équipe pour une société : au compte, ou offerte. */
async function proOrder(offered: boolean, daysAgo = 1): Promise<PlacedTestOrder> {
  const parties = await company();
  return placeOrderForCustomer(ctx, {
    buyerUserId: parties.buyerId,
    companyId: parties.companyId,
    staffUserId: E2E_STAFF_ID,
    placedAt: new Date(placedDaysAgo(daysAgo)),
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    ...(offered
      ? {
          settlement: "offered" as const,
          offer: { nature: "tasting", note: "Dégustation", notifyCustomer: false },
        }
      : { settlement: "account" as const }),
  });
}

/** Une commande d'un particulier par carte, passée hier : réglée ou non. */
async function cardOrder(paid: boolean): Promise<PlacedTestOrder> {
  const placed = await placeOrder(ctx, {
    buyerUserId: await particular(),
    settlement: "card",
    placedAt: new Date(placedDaysAgo(1)),
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
  });
  if (paid) {
    await payByCard(ctx, placed);
  }
  return placed;
}

async function cancelled(): Promise<PlacedTestOrder> {
  const placed = await proOrder(false);
  await ctx.app
    .get(CommandBus)
    .execute(new CancelOrderCommand(placed.id, E2E_STAFF_ID, "Le client renonce."));
  await ctx.drain();
  return placed;
}

describe("SalesExportReader — les commandes passées d'une période", () => {
  it("🔴 countsAsRevenue exclut l'annulée, la carte en attente, la caisse de la boutique et l'offerte", async () => {
    const counted = await proOrder(false);
    const paid = await cardOrder(true);
    const pending = await cardOrder(false);
    const gone = await cancelled();
    const offered = await proOrder(true);
    const shopTill = await placedAtShopTill(ctx, await particular());

    const orders = await ctx.app.get(SalesExportReader).placedBetween(dayAgo(1), dayAgo(0));
    const verdict = new Map(orders.map((order) => [order.orderNumber, order.countsAsRevenue]));

    expect(Object.fromEntries(verdict)).toEqual({
      [counted.orderNumber]: true,
      [paid.orderNumber]: true,
      [pending.orderNumber]: false,
      [gone.orderNumber]: false,
      [offered.orderNumber]: false,
      [shopTill]: false,
    });
    // Le même CA que le `where` du cockpit, sur les mêmes commandes.
    const cockpit = await ctx.prisma.order.findMany({
      where: revenueWhere(),
      select: { orderNumber: true },
    });
    expect(cockpit.map((row) => row.orderNumber).sort()).toEqual(
      orders
        .filter((order) => order.countsAsRevenue)
        .map((order) => order.orderNumber)
        .sort(),
    );
  });

  it("borne la période sur le jour de passation, et sert lignes et montants tels qu'en base", async () => {
    const inside = await proOrder(false, 1);
    const before = await proOrder(false, 3);

    const orders = await ctx.app.get(SalesExportReader).placedBetween(dayAgo(2), dayAgo(1));

    expect(orders.map((order) => order.orderNumber)).toEqual([inside.orderNumber]);
    expect(orders.map((order) => order.orderNumber)).not.toContain(before.orderNumber);
    const stored = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: inside.id },
      select: { totalCents: true, vatCents: true, companyId: true },
    });
    const [order] = orders;
    expect(order).toMatchObject({
      status: "placed",
      clientele: "pro",
      companyId: stored.companyId,
      amounts: { totalCents: stored.totalCents, vatCents: stored.vatCents },
    });
    expect(order?.lines.map((line) => line.sku)).toEqual(["VIE-001-1"]);
    expect(order?.lines[0]?.discountIds).toEqual([]);
  });
});

describe("les lectures par lot des voisins", () => {
  it("CompanySalesIdentityReader nomme la société par son enseigne, avec son NAF", async () => {
    const placed = await proOrder(false);
    const [order] = await ctx.app.get(SalesExportReader).placedBetween(dayAgo(1), dayAgo(1));
    const companyId = order?.companyId ?? "";

    const identities = await ctx.app
      .get(CompanySalesIdentityReader)
      .identitiesOf([companyId, companyId, "inconnue"]);

    expect(order?.orderNumber).toBe(placed.orderNumber);
    expect(identities).toEqual([{ companyId, name: "Le Chalet", nafCode: "55.10Z" }]);
  });

  it("CategoryNamesReader rend le nom des familles connues, et ignore les autres", async () => {
    const family = await ctx.prisma.catalogCategory.findFirstOrThrow({
      select: { id: true, name: true },
    });

    const names = await ctx.app.get(CategoryNamesReader).namesOf([family.id, "inconnue"]);

    expect(names).toEqual([{ id: family.id, name: family.name }]);
    expect(await ctx.app.get(CategoryNamesReader).namesOf([])).toEqual([]);
  });
});
