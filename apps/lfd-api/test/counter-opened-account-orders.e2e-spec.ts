/**
 * E2E de la **commande au compte d'un compte ouvert au comptoir** (plan
 * `documentation/comptes-client/plan-comptes-du-comptoir.md`, § 3.2, § 3.6).
 *
 * Ce que seul le vrai serveur prouve : ouvert par sa route, le compte se lit
 * au comptoir, s'y commande au compte par la vraie passation de l'équipe, au
 * prix pro d'un compte actif ; la boutique le refuse au compte ; et la
 * clôture du mois n'émet rien pour lui tout en émettant pour les autres.
 */
import {
  instantToLocal,
  type AdminPlacedOrderResponse,
  type CounterCustomerView,
} from "@lfd/contracts";

import { jsonBody } from "./e2e-harness.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { TermsNotGrantedError } from "../src/lafoliecoffee/orders/domain/errors/order-errors.js";
import {
  clock,
  closesAt,
  ctx,
  DAY_MS,
  invoicedPayer,
  setUpEntity,
  staff,
  useCollectionReturnScene,
} from "./collection-returns-scene.js";
import { attachTo, createCompany, createUser, handOver } from "./factories.js";
import { pickupSite } from "./order-factory.js";
import { placeServedOrder } from "./served-order.js";

const OPEN_ROUTE = "/admin/counter/accounts";
const OPEN_PAYLOAD = {
  enseigne: "Kiosque du Quai",
  contact: {
    firstName: "Camille",
    lastName: "Rousseau",
    email: "camille@kiosque.test",
    phone: "06 12 34 56 78",
  },
  identitySeen: true,
};

useCollectionReturnScene();

describe("lire au comptoir un compte qui vient d'y être ouvert — GET /admin/counter/customers/:id", () => {
  it("le sert, au compte, au lieu d'un 404", async () => {
    await setUpEntity(staff);
    const { id } = jsonBody<{ id: string }>(
      await staff().post(OPEN_ROUTE).set(INTENT_KEY, freshIntent()).send(OPEN_PAYLOAD).expect(201),
    );

    const view = jsonBody<CounterCustomerView>(
      await staff().get(`/admin/counter/customers/${id}`).expect(200),
    );

    expect(view).toMatchObject({ id, status: "counter_opened", settlesOnAccount: true });
  });
});

/**
 * **La commande au compte, passée au comptoir** (§ 3.2) : la vraie route
 * d'ouverture, puis la vraie passation de l'équipe, saisie au comptoir.
 *
 * L'acheteur est celui de la vraie ouverture (§ 3.1) : une fiche invité que
 * la passation de l'équipe admet sans rattachement.
 */
async function openedCounterAccount(): Promise<{ id: string; buyer: string }> {
  const { id } = jsonBody<{ id: string }>(
    await staff().post(OPEN_ROUTE).set(INTENT_KEY, freshIntent()).send(OPEN_PAYLOAD).expect(201),
  );
  // L'acheteur est celui de la vraie ouverture : une fiche invité, sans rattachement.
  const opening = await ctx.prisma.counterOpeningAttestation.findUniqueOrThrow({
    where: { companyId: id },
  });
  return { id, buyer: opening.buyerUserId ?? "" };
}

/** La saisie du comptoir, au compte, servie à `servedAt` et passée trois jours avant. */
async function placeAtCounter(
  account: { readonly id: string; readonly buyer: string },
  servedAt: Date,
  status: number,
): Promise<string | null> {
  const now = clock.now();
  clock.set(new Date(servedAt.getTime() - 3 * DAY_MS));
  try {
    const response = await staff()
      .post("/admin/orders")
      .set(INTENT_KEY, freshIntent())
      .send({
        companyId: account.id,
        buyerUserId: account.buyer,
        settlement: "account",
        entryOrigin: "counter",
        requestedDeliveryDate: instantToLocal(servedAt).day,
        fulfillmentMethod: "pickup",
        pickupAddressId: await pickupSite(ctx.prisma),
        requestedWindow: { start: "07:00", end: "08:00" },
        note: "",
        lines: [{ sku: "VIE-001-1", quantity: 50 }],
      })
      .expect(status);
    return status === 201 ? jsonBody<AdminPlacedOrderResponse>(response).id : null;
  } finally {
    clock.set(now);
  }
}

/** Le prix unitaire figé sur la seule ligne de la commande. */
async function frozenUnitPrice(orderId: string): Promise<number> {
  const line = await ctx.prisma.orderLine.findFirstOrThrow({
    where: { orderId },
    select: { unitPriceMillicents: true },
  });
  return line.unitPriceMillicents;
}

describe("la commande au compte d'un compte ouvert au comptoir", () => {
  it("est acceptée au comptoir, au prix pro d'un compte actif", async () => {
    await setUpEntity(staff);
    const servedAt = new Date(closesAt.getTime() + 3 * DAY_MS);
    const counter = await openedCounterAccount();
    const active = await createCompany(ctx.prisma, { enseigne: "Café actif" });
    const activeBuyer = await createUser(ctx.prisma, { auth0Sub: "active-k3", email: "a@k3.test" });
    await attachTo(ctx.prisma, activeBuyer.id, active.id, CustomerRole.owner);
    await ctx.prisma.company.update({
      where: { id: active.id },
      data: { grantedTerms: ["monthly"] },
    });

    const counterOrder = await placeAtCounter(counter, servedAt, 201);
    const activeOrder = await placeAtCounter(
      { id: active.id, buyer: activeBuyer.id },
      servedAt,
      201,
    );

    expect(counterOrder).not.toBeNull();
    expect(await frozenUnitPrice(counterOrder ?? "")).toBe(
      await frozenUnitPrice(activeOrder ?? ""),
    );
  });

  it("la même personne, depuis la boutique, est refusée au compte", async () => {
    const counter = await openedCounterAccount();
    // Rattachée ici : sans rattachement, la boutique la refuserait avant le
    // crédit, et c'est le refus du crédit que ce cas éprouve.
    await attachTo(ctx.prisma, counter.buyer, counter.id, CustomerRole.owner);
    const servedAt = new Date(closesAt.getTime() + 3 * DAY_MS);

    await expect(
      placeServedOrder(ctx, { buyerUserId: counter.buyer, companyId: counter.id, servedAt }),
    ).rejects.toBeInstanceOf(TermsNotGrantedError);
    expect(await ctx.prisma.order.count({ where: { companyId: counter.id } })).toBe(0);
  });

  it("la clôture du mois n'émet rien pour lui, et émet pour les autres", async () => {
    const entityId = await setUpEntity(staff);
    const payer = await invoicedPayer(ctx, staff, entityId, closesAt);
    const counter = await openedCounterAccount();
    const servedAt = new Date(closesAt.getTime() - 2 * DAY_MS);
    const orderId = await placeAtCounter(counter, servedAt, 201);
    const placed = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId ?? "" },
      select: { id: true, orderNumber: true },
    });
    await handOver(ctx.prisma, { ...placed, createdAt: servedAt });

    await staff()
      .post("/admin/accounting/monthly-invoices")
      .send({ legalEntityId: entityId, periodClosesAt: closesAt.toISOString() })
      .expect(200);

    expect(await ctx.prisma.invoice.count({ where: { payerCompanyId: payer } })).toBe(1);
    expect(await ctx.prisma.invoice.count({ where: { payerCompanyId: counter.id } })).toBe(0);
    expect(
      await ctx.prisma.invoiceMonthlyOutcome.count({ where: { payerCompanyId: counter.id } }),
    ).toBe(0);
  });
});
