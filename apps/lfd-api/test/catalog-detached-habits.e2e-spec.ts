/**
 * E2E — **les habitudes d'une déclinaison détachée tiennent sur une ligne**
 * (`documentation/catalogue/plan-pro-voit-les-declinaisons.md`, L7d-bis).
 *
 * Ce que seul ce niveau prouve : qu'après un détachement par le référentiel,
 * relayé au commerce, une société qui a commandé sous l'ancienne référence
 * puis sous la nouvelle ne voit, au back-office, qu'UNE ligne d'habitude —
 * sous la nouvelle, compteurs additionnés — et que rien n'a été réécrit dans
 * ses commandes.
 */
import type { CustomerSkuStat } from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import { anActiveFiche, relayAll, SILENT_TRIGGER } from "./catalog-facts-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { cardGatewayDouble, pickupSite, placeOrder } from "./order-factory.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const PRODUCTS = "/pim/catalogue/products";
const PRO_PRICE_HT = "10";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: OutboxRelayTrigger, value: SILENT_TRIGGER },
      { token: PaymentGateway, value: cardGatewayDouble("pi_habits") },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["http"]> => ctx.asSub(E2E_STAFF_SUB);

interface Detail {
  readonly variants: readonly { readonly id: string; readonly sku: string }[];
}

async function detailOf(productId: string): Promise<Detail> {
  return jsonBody<Detail>(await staff().get(`${PRODUCTS}/${productId}`).expect(200));
}

async function priced(productId: string, variantId: string): Promise<void> {
  await staff()
    .put(`${PRODUCTS}/${productId}/variants/${variantId}/pricing`)
    .send({ priceCents: 450, weightGrams: null, proPriceHt: PRO_PRICE_HT })
    .expect(200);
}

async function approveAll(): Promise<void> {
  const skus = (
    await ctx.prisma.catalogItem.findMany({ where: { withdrawnAt: null }, select: { sku: true } })
  ).map((row) => row.sku);
  await staff()
    .post("/admin/catalog/review/approve")
    .send({ skus, audiences: ["pro", "public"] })
    .expect(204);
}

/** Une société au compte, et la personne qui commande pour elle. */
async function aBuyingCompany(): Promise<{ companyId: string; userId: string }> {
  const company = await createCompany(ctx.prisma);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: ["monthly"] },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: "auth0|habits-buyer" });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  return { companyId: company.id, userId: user.id };
}

describe("L7d-bis — les habitudes regroupent une déclinaison détachée", () => {
  it("une commande sous chaque référence : une seule ligne, sous la nouvelle", async () => {
    const fiche = await anActiveFiche(staff, "Ancolie", "both");
    const partId = jsonBody<{ id: string }>(
      await staff()
        .post(`${PRODUCTS}/${fiche.id}/variants`)
        .send({ name: { fr: "Ancolie part" } })
        .expect(201),
    ).id;
    await priced(fiche.id, partId);
    const partSku = (await detailOf(fiche.id)).variants.find((v) => v.id === partId)?.sku ?? "";
    await relayAll(ctx);
    await approveAll();

    const { companyId, userId } = await aBuyingCompany();
    const pickupSiteId = await pickupSite(ctx.prisma);
    const order = (sku: string) =>
      placeOrder(ctx, {
        buyerUserId: userId,
        companyId,
        settlement: "account",
        fulfillment: { method: "pickup", pickupSiteId },
        lines: [{ sku, quantity: 2 }],
      });
    await order(partSku);

    const bornId = jsonBody<{ id: string }>(
      await staff().post(`${PRODUCTS}/${fiche.id}/variants/${partId}/detach`).expect(201),
    ).id;
    const [born] = (await detailOf(bornId)).variants;
    await priced(bornId, born?.id ?? "");
    await staff().put(`${PRODUCTS}/${bornId}/publish`).send({}).expect(200);
    await relayAll(ctx);
    await approveAll();
    const bornSku = (
      await ctx.prisma.catalogItem.findFirstOrThrow({
        where: { productId: bornId, isDefault: true },
        select: { sku: true },
      })
    ).sku;
    await order(bornSku);

    const habits = jsonBody<CustomerSkuStat[]>(
      await staff().get(`/admin/catalog/companies/${companyId}`).expect(200),
    );

    expect(habits).toEqual([
      expect.objectContaining({
        sku: bornSku,
        orderCount: 2,
        totalQuantity: 4,
        stillAvailable: true,
      }),
    ]);
    // Lecture seule : les lignes gardent la référence sous laquelle elles ont été vendues.
    const lines = await ctx.prisma.orderLine.findMany({ select: { sku: true } });
    expect(lines.map((line) => line.sku).sort()).toEqual([bornSku, partSku].sort());
  });
});
