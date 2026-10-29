/**
 * E2E — **où une référence de vente a déjà servi, lu par le commerce**
 * (`documentation/pricing/plan-changer-l-unite-de-vente.md`, § 8).
 *
 * Ce que seul ce niveau prouve : chacune des douze catégories se lit dans SA
 * table, sous le vrai schéma (colonnes `sku`, portées, grilles et paniers en
 * `jsonb`), et la référence se déduit par `shopSkuOf` — le défaut sous le SKU
 * de sa fiche, une autre déclinaison sous le sien.
 *
 * Les lignes sont semées par Prisma, même dette que `factories.ts` : aucun
 * chemin public ne pose une décision close ou un panier d'un tiers sans tout
 * le parcours de chacun, et ce qui est éprouvé ici est la LECTURE.
 */
import { SaleReferenceUsage } from "../src/pim/channels/b2b-platform/sale-reference-usage/sale-reference-usage.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { CompanyStatus } from "../src/platform/database/client/client.js";
import { bootstrapE2e, daysAgo, type E2eContext } from "./e2e-harness.js";
import { createCompany, createUser } from "./factories.js";
import { cardGatewayDouble, pickupSite, placeOrder } from "./order-factory.js";

const STAFF = { id: "fiche-e2e", name: "Équipe e2e", role: "admin" } as const;

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: PaymentGateway, value: cardGatewayDouble("pi_usage") }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Une déclinaison NON par défaut : sa référence de vente est son propre SKU. */
const own = (sku: string) => ({ sku, productSku: `FICHE-${sku}`, isDefault: false });

const at = () => new Date(daysAgo(10));

async function seedOrders(userId: string, companyId: string): Promise<void> {
  // La commande passe par le bus : le croissant du semis, sous le SKU de sa fiche.
  const pickupSiteId = await pickupSite(ctx.prisma);
  await placeOrder(ctx, {
    buyerUserId: userId,
    fulfillment: { method: "pickup", pickupSiteId },
  });
  await ctx.prisma.orderDraft.create({
    data: { companyId, payload: { lines: [{ sku: "U-DRAFT", quantity: 2 }] } },
  });
  await ctx.prisma.shopCart.create({
    data: { userId, payload: { lines: [{ sku: "U-CART", quantity: 1 }] } },
  });
  await ctx.prisma.subscription.create({
    data: {
      placedByUserId: userId,
      recurrence: "weekly",
      startDate: at(),
      fulfillmentMethod: "pickup",
      lines: { create: [{ sku: "U-SUB", quantity: 4 }] },
    },
  });
}

async function seedResupplies(): Promise<void> {
  await ctx.prisma.siteResupply.create({
    data: {
      id: "rs_1",
      siteId: "site_1",
      target: "tomorrow",
      serviceDay: at(),
      lines: { create: [{ sku: "U-RESUPPLY", label: "Pain", quantity: 3, position: 0 }] },
    },
  });
  await ctx.prisma.bakehouseResupplyDraft.create({
    data: {
      id: "rd_1",
      siteId: "site_1",
      target: "asap",
      lines: [{ sku: "U-RESUPPLY-DRAFT", quantity: 2 }],
      createdAt: at(),
      updatedAt: at(),
      createdByStaffId: STAFF.id,
      createdByName: STAFF.name,
      createdByRole: STAFF.role,
      updatedByStaffId: STAFF.id,
      updatedByName: STAFF.name,
      updatedByRole: STAFF.role,
    },
  });
}

async function seedBundleAndTemplate(): Promise<void> {
  await ctx.prisma.bundle.create({
    data: {
      id: "bdl_1",
      key: "petit-dej",
      name: "Petit-déjeuner",
      audience: "public",
      status: "draft",
      createdAt: at(),
      writtenAt: at(),
      groups: {
        create: [
          {
            key: "boisson-chaude",
            label: "Boisson chaude",
            position: 0,
            choices: { create: [{ sku: "U-BUNDLE", position: 0 }] },
          },
        ],
      },
    },
  });
  await ctx.prisma.priceTemplate.create({
    data: {
      id: "tpl_1",
      kind: "mercuriale",
      label: "Hôtels",
      lines: [{ sku: "U-TEMPLATE", tiers: [{ minQuantity: 1, unitPriceCents: 120 }] }],
      createdBy: STAFF.id,
      // Archivé : il a servi quand même.
      archivedAt: at(),
    },
  });
}

async function seedDecisions(companyId: string): Promise<void> {
  const window = { validFrom: at(), createdBy: STAFF.id };
  await ctx.prisma.priceRule.create({
    data: {
      ...window,
      stage: "promotion",
      nature: "alter",
      scopeType: "product",
      scopeId: "U-RULE",
      audienceType: "all",
      direction: "decrease",
      mode: "percent",
      value: 1_000,
      label: "Promo close",
      // Close : elle a fait des prix dans l'unité d'alors.
      archivedAt: at(),
      archivedBy: STAFF.id,
      archiveReason: "fin",
    },
  });
  await ctx.prisma.priceFloor.create({
    data: { ...window, scopeType: "variant", scopeId: "U-FLOOR", mode: "percent", value: 5_000 },
  });
  await ctx.prisma.volumeLadder.create({
    data: {
      ...window,
      id: "vl_1",
      scopeType: "product",
      scopeId: "U-LADDER",
      audienceType: "all",
      unit: "percent",
      tiers: [{ minQuantity: 10, value: 500 }],
      label: "Volume",
    },
  });
  await ctx.prisma.companyMercuriale.create({
    data: {
      ...window,
      id: "mc_1",
      companyId,
      label: "Négocié",
      lines: [{ sku: "U-MERC", tiers: [{ minQuantity: 1, unitPriceMillicents: 100_000 }] }],
    },
  });
  await ctx.prisma.volumeCommitment.create({
    data: {
      ...window,
      id: "vc_1",
      companyId,
      scopeType: "product",
      scopeId: "U-COMMIT",
      promisedQuantity: 100,
      validTo: new Date(daysAgo(-30)),
    },
  });
}

describe("SaleReferenceUsage — l'implémentation du commerce", () => {
  it("lit chaque catégorie d'usage dans sa table, et rend une liste vide pour une référence libre", async () => {
    const user = await createUser(ctx.prisma, { auth0Sub: "auth0|usage" });
    const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
    await seedOrders(user.id, company.id);
    await seedResupplies();
    await seedBundleAndTemplate();
    await seedDecisions(company.id);

    const uses = await ctx.app.get(SaleReferenceUsage).usesOf([
      // Le défaut se vend sous le SKU de sa FICHE : c'est lui que la commande porte.
      { sku: "VIE-001-1", productSku: "VIE-001", isDefault: true },
      own("U-DRAFT"),
      own("U-CART"),
      own("U-SUB"),
      own("U-RESUPPLY"),
      own("U-RESUPPLY-DRAFT"),
      own("U-BUNDLE"),
      own("U-TEMPLATE"),
      own("U-RULE"),
      own("U-FLOOR"),
      own("U-LADDER"),
      own("U-MERC"),
      own("U-COMMIT"),
      own("U-FREE"),
      // Une autre déclinaison de la fiche commandée : son SKU à elle n'a pas servi.
      { sku: "VIE-001-2", productSku: "VIE-001", isDefault: false },
    ]);

    expect(Object.fromEntries(uses)).toEqual({
      "VIE-001-1": ["order"],
      "U-DRAFT": ["order_draft"],
      "U-CART": ["shop_cart"],
      "U-SUB": ["subscription"],
      "U-RESUPPLY": ["resupply"],
      "U-RESUPPLY-DRAFT": ["resupply"],
      "U-BUNDLE": ["bundle"],
      "U-TEMPLATE": ["price_template"],
      "U-RULE": ["price_rule"],
      "U-FLOOR": ["price_floor"],
      "U-LADDER": ["volume_ladder"],
      "U-MERC": ["mercuriale"],
      "U-COMMIT": ["volume_commitment"],
      "U-FREE": [],
      "VIE-001-2": [],
    });
  });
});
