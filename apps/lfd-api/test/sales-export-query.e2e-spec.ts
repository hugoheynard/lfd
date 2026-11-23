/**
 * E2E de **l'export des ventes composé** (lot E1 de
 * `documentation/commandes/export/plan-export-des-ventes.md`) :
 * `GetSalesExportQuery`, exécutée par le vrai `QueryBus` sur la base jetable,
 * compose les lectures publiées par leurs propriétaires.
 *
 * Ce que seul le vrai SQL prouve : sur un même jeu — au compte, carte payée,
 * carte en attente, annulée, offerte, caisse de la boutique —, le CA TTC, le CA
 * marchandises HT et le nombre de commandes du résumé sont ceux du lecteur de CA du cockpit
 * (`OrderMetricsReader`). Le cockpit range ses jours en UTC et l'export à
 * Paris : on compare les totaux de la période, pas jour à jour.
 */
import { addDays, instantToLocal } from "@lfd/contracts";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { OrderMetricsReader } from "../src/lafoliecoffee/growth/domain/ports/order-metrics.reader.js";
import { CancelOrderCommand } from "../src/lafoliecoffee/orders/cancellation/application/commands/cancel-order.command.js";
import { GetSalesExportQuery } from "../src/lafoliecoffee/reporting/application/queries/get-sales-export.query.js";
import type { SalesExportView } from "../src/lafoliecoffee/reporting/application/queries/sales-export.view.js";
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

const CENTS_PER_EURO = 100;

const cards = cardProvidersDouble("pi_export_query");
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
    auth0Sub: `auth0|export-query-${String(seq)}`,
    email: `export-query-${String(seq)}@example.test`,
  });
  return user.id;
}

/** Une commande saisie par l'équipe pour une société, passée hier : au compte, ou offerte. */
async function proOrder(offered: boolean): Promise<PlacedTestOrder> {
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
  return placeOrderForCustomer(ctx, {
    buyerUserId: buyerId,
    companyId: created.id,
    staffUserId: E2E_STAFF_ID,
    placedAt: new Date(placedDaysAgo(1)),
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

function exportOf(from: string, to: string): Promise<SalesExportView> {
  return ctx.app.get(QueryBus).execute(new GetSalesExportQuery(from, to));
}

function cents(euros: number): number {
  return Math.round(euros * CENTS_PER_EURO);
}

describe("GetSalesExportQuery — l'export composé, sur la vraie base", () => {
  it("🔴 dit le même CA TTC et le même nombre de commandes que le cockpit", async () => {
    const counted = await proOrder(false);
    const paid = await cardOrder(true);
    await cardOrder(false);
    const gone = await proOrder(false);
    await ctx.app
      .get(CommandBus)
      .execute(new CancelOrderCommand(gone.id, E2E_STAFF_ID, "Le client renonce."));
    await ctx.drain();
    await proOrder(true);
    await placedAtShopTill(ctx, await particular());

    const view = await exportOf(dayAgo(2), dayAgo(0));
    const cockpit = await ctx.app.get(OrderMetricsReader).load();

    const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);
    expect(view.orders).toHaveLength(6);
    expect(sum(view.summary.map((day) => day.orders))).toBe(sum([...cockpit.orders]));
    expect(sum(view.summary.map((day) => cents(day.revenueTtc)))).toBe(sum([...cockpit.caCents]));
    // Le « CA marchandises HT » : la même addition que `caGoodsCents`.
    expect(sum(view.summary.map((day) => cents(day.goodsHt)))).toBe(sum([...cockpit.caGoodsCents]));
    expect(sum(view.summary.map((day) => day.orders))).toBe(2);
    expect(
      view.orders
        .filter((order) => order.countsAsRevenue)
        .map((order) => order.orderNumber)
        .sort(),
    ).toEqual([counted.orderNumber, paid.orderNumber].sort());
  });

  it("sert un jour sans vente à zéro, et nomme la société d'une commande pro", async () => {
    const counted = await proOrder(false);

    const view = await exportOf(dayAgo(2), dayAgo(1));

    expect(view.summary.map((day) => day.day)).toEqual([dayAgo(2), dayAgo(1)]);
    expect(view.summary[0]).toMatchObject({ orders: 0, revenueTtc: 0, netRevenueTtc: 0 });
    expect(view.orders).toHaveLength(1);
    expect(view.orders[0]).toMatchObject({
      orderNumber: counted.orderNumber,
      companyName: "Le Chalet",
      nafCode: "55.10Z",
    });
    // Passée à 10 h de Paris : l'heure servie est celle de la boutique, à la minute.
    expect(view.orders[0]?.placedAt).toBe(
      `${dayAgo(1)}T10:00:00${view.orders[0]?.placedAt.slice(-6) ?? ""}`,
    );
    expect(view.orders[0]?.placedAt).toMatch(/\+0[12]:00$/u);
    expect(view.lines.map((line) => line.orderNumber)).toEqual([counted.orderNumber]);
  });
});
