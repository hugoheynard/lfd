/**
 * E2E des **lecteurs qui comptent des achats**, face à une commande offerte
 * (lot O4 de `documentation/commandes/passation/plan-commande-offerte.md`,
 * O-9). Une commande offerte est une vraie commande, réglée `not_required`
 * comme une commande au compte : sans la marque `offer_nature`, chaque
 * lecteur la compterait comme un achat. Chaque lecteur est éprouvé contre un
 * témoin payé, pour qu'un lecteur vide ne passe pas pour un lecteur juste.
 *
 * Les commandes passent par le vrai chemin, antidatées à hier matin.
 */
import { addDays, instantToLocal, localToInstant } from "@lfd/contracts";

import { revenueWhere } from "../src/lafoliecoffee/growth/infrastructure/revenue.where.js";
import { AudienceOrderReader } from "../src/lafoliecoffee/audiences/domain/ports/audience-order.reader.js";
import { CoPurchaseReader } from "../src/lafoliecoffee/recommendations/domain/ports/co-purchase.reader.js";
import { PurchaseHistoryReader } from "../src/lafoliecoffee/recommendations/domain/ports/purchase-history.reader.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { Clock } from "../src/platform/time/clock.js";
import { bootstrapE2e, E2E_STAFF_ID, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { stubAdminVerifier } from "./operations-at-commerce-scene.js";
import { pickupSite, placeOrderForCustomer, type PlacedTestOrder } from "./order-factory.js";

/** Deux articles par commande : de quoi faire une paire « acheté avec ». */
const LINES = [
  { sku: "PAI-001-1", quantity: 2 },
  { sku: "VIE-001-1", quantity: 3 },
] as const;
const TASTING = { nature: "tasting", note: "Dégustation d'un prospect" } as const;

let ctx: E2eContext;
let seq = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

function yesterday(): string {
  return addDays(instantToLocal(ctx.app.get(Clock).now()).day, -1);
}

function yesterdayMorning(): Date {
  const at = localToInstant(yesterday(), "08:30");
  if (at === null) {
    throw new Error("8 h 30 existe tous les jours à Paris");
  }
  return at;
}

/** Une société au compte et son détenteur. */
async function company(): Promise<{ readonly companyId: string; readonly buyerId: string }> {
  seq += 1;
  const buyer = await createUser(ctx.prisma, {
    auth0Sub: `auth0|offerte-${String(seq)}`,
    email: `offerte-${String(seq)}@example.test`,
  });
  const created = await createCompany(ctx.prisma, {});
  await ctx.prisma.company.update({
    where: { id: created.id },
    data: { grantedTerms: ["monthly"] },
  });
  await attachTo(ctx.prisma, buyer.id, created.id, CustomerRole.owner);
  return { companyId: created.id, buyerId: buyer.id };
}

/** Une commande saisie par l'équipe, retirée, passée hier matin : offerte, ou au compte. */
async function order(
  parties: { readonly companyId: string; readonly buyerId: string },
  offered: boolean,
): Promise<PlacedTestOrder> {
  return placeOrderForCustomer(ctx, {
    buyerUserId: parties.buyerId,
    companyId: parties.companyId,
    staffUserId: E2E_STAFF_ID,
    placedAt: yesterdayMorning(),
    window: { start: "07:00", end: "08:00" },
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    lines: LINES,
    ...(offered
      ? { settlement: "offered" as const, offer: TASTING }
      : { settlement: "account" as const }),
  });
}

describe("une commande offerte n'est pas un achat", () => {
  it("🔴 le chiffre d'affaires ne la compte pas, la commande au compte si", async () => {
    const offered = await order(await company(), true);
    const paid = await order(await company(), false);

    const counted = await ctx.prisma.order.findMany({
      where: revenueWhere(),
      select: { id: true },
    });

    expect(counted.map((row) => row.id)).toEqual([paid.id]);
    expect(counted.map((row) => row.id)).not.toContain(offered.id);
  });

  it("🔴 les audiences ne la comptent pas", async () => {
    await order(await company(), true);
    const alone = await ctx.app
      .get(AudienceOrderReader)
      .tally("clientele", yesterday(), yesterday());
    await order(await company(), false);
    const withPaid = await ctx.app
      .get(AudienceOrderReader)
      .tally("clientele", yesterday(), yesterday());

    expect(alone.reduce((sum, cell) => sum + cell.orders, 0)).toBe(0);
    expect(withPaid.reduce((sum, cell) => sum + cell.orders, 0)).toBe(1);
  });

  it("🔴 elle n'apprend pas les habituels de la société", async () => {
    const offeredTo = await company();
    await order(offeredTo, true);
    const paidBy = await company();
    await order(paidBy, false);
    const history = ctx.app.get(PurchaseHistoryReader);

    expect(await history.ofCompany({ companyId: offeredTo.companyId, since: yesterday() })).toEqual(
      [],
    );
    expect(
      (await history.ofCompany({ companyId: paidBy.companyId, since: yesterday() })).length,
    ).toBeGreaterThan(0);
  });

  it("🔴 elle ne fait pas de paire « acheté avec »", async () => {
    await order(await company(), true);
    const ask = {
      anchors: ["PAI-001-1"],
      audience: "pro" as const,
      since: yesterday(),
      minClients: 1,
      limit: 10,
    };
    const alone = await ctx.app.get(CoPurchaseReader).pairs(ask);
    await order(await company(), false);
    const withPaid = await ctx.app.get(CoPurchaseReader).pairs(ask);

    expect(alone).toEqual([]);
    expect(withPaid.length).toBeGreaterThan(0);
  });
});
