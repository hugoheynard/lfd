import { randomUUID } from "node:crypto";
/**
 * E2E du **blocage du prélèvement** (`/admin/accounting/direct-debit-blocks`).
 *
 * Ce que seul le vrai SQL prouve :
 * - un client bloqué qui envoie `settlement: "account"` est refusé en 409 et
 *   rien n'est écrit — par le chemin CLIENT (`POST /orders`) ET par le chemin
 *   BACK-OFFICE (`POST /admin/orders`), exigence de Hugo du 2026-09-25 ;
 * - bloquer / débloquer / lister traversent la contrainte `CHECK` et le
 *   journal, dans la même transaction ;
 * - retirer tout crédit (`grantTerms([])`) lève le blocage ;
 * - bloquer / débloquer exigent `b2b_deferred_payment_block:write`, que
 *   `b2b_accounting:write` ne donne pas (Hugo, 2026-09-25).
 *
 * Plan : `documentation/comptabilite/plan-blocage-prelevement-et-liens-de-paiement.md` §1.
 * Deux frontières doublées : la signature du jeton staff et la passerelle Stripe.
 */
import type { AccountView, DirectDebitBlockView, StaffRole } from "@lfd/contracts";
import type request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const BUYER = "auth0|acheteur-bloque";
const ROUTE = "/admin/accounting/direct-debit-blocks";
const REASON = "Rejet SEPA du prélèvement d'août";

/** Le jeton porteur EST le `sub` : chaque suite de rôle a son agent. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({
      paymentIntentId: `pi_block_${intentCounter}`,
      clientSecret: `pi_block_${intentCounter}_secret`,
    });
  },
  retrieveIntent: (id: string) => Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_s` }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
};

let ctx: E2eContext;
let pickupId = "pickup_absent";

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

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub(E2E_STAFF_SUB);
}

/** Une société active, son acheteur, et — au choix — le mensuel accordé. */
async function seedCompany(onAccount: boolean): Promise<{ companyId: string; buyerId: string }> {
  const point = await ctx.prisma.pickupAddress.create({
    data: {
      label: "Labo",
      ligne1: "1 rue du Four",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  pickupId = point.id;
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  if (onAccount) {
    await ctx.prisma.company.update({
      where: { id: company.id },
      data: { grantedTerms: [DeferredTerm.monthly] },
    });
  }
  const buyer = await createUser(ctx.prisma, { auth0Sub: BUYER, email: "acheteur@bloque.fr" });
  await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
  return { companyId: company.id, buyerId: buyer.id };
}

function clientOrder(companyId: string): Record<string, unknown> {
  return {
    companyId,
    idempotencyKey: randomUUID(),
    pickupAddressId: pickupId,
    fulfillmentMethod: "pickup",
    requestedDeliveryDate: serviceDay(),
    note: "",
    settlement: "account",
    lines: [{ sku: "VIE-001", quantity: 3 }],
  };
}

function staffOrder(companyId: string, buyerUserId: string): Record<string, unknown> {
  return {
    companyId,
    buyerUserId,
    settlement: "account",
    requestedDeliveryDate: serviceDay(),
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    lines: [{ sku: "VIE-001", quantity: 12 }],
  };
}

async function block(companyId: string): Promise<void> {
  await staff().post(`${ROUTE}/${companyId}`).send({ reason: REASON }).expect(204);
}

describe("le blocage refuse « au compte » côté serveur", () => {
  it("chemin CLIENT : 409 qui dit « suspendu », et rien n'est écrit", async () => {
    const { companyId } = await seedCompany(true);
    await block(companyId);

    const response = await ctx
      .asSub(BUYER)
      .post("/orders")
      .send(clientOrder(companyId))
      .expect(409);

    expect(response.body).toMatchObject({ code: "order.terms_not_granted" });
    expect(JSON.stringify(response.body)).toContain("suspendu");
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it("chemin BACK-OFFICE : 409 qui dit « suspendu », et rien n'est écrit", async () => {
    const { companyId, buyerId } = await seedCompany(true);
    await block(companyId);

    const response = await staff()
      .post("/admin/orders")
      .send(staffOrder(companyId, buyerId))
      .expect(409);

    expect(response.body).toMatchObject({ code: "orders.settlement.account_not_granted" });
    expect(JSON.stringify(response.body)).toContain("suspendu");
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it("débloqué, « au compte » repasse — le crédit n'a pas bougé", async () => {
    const { companyId } = await seedCompany(true);
    await block(companyId);

    await staff().delete(`${ROUTE}/${companyId}`).expect(204);

    await ctx.asSub(BUYER).post("/orders").send(clientOrder(companyId)).expect(201);
    const row = await ctx.prisma.order.findFirstOrThrow({ select: { paymentStatus: true } });
    expect(row.paymentStatus).toBe("not_required");
  });

  it("« Mon compte » expose le blocage sans vider le crédit", async () => {
    const { companyId } = await seedCompany(true);
    await block(companyId);

    const me = jsonBody<AccountView>(await ctx.asSub(BUYER).get("/me").expect(200));

    const company = me.companies.find((candidate) => candidate.id === companyId);
    expect(company).toMatchObject({ directDebitBlocked: true, grantedTerms: ["monthly"] });
  });
});

describe("bloquer, lister, débloquer", () => {
  it("bloque : la société porte l'instant, l'auteur et la raison, et le journal le dit", async () => {
    const { companyId } = await seedCompany(true);

    await block(companyId);

    const row = await ctx.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: {
        directDebitBlockedAt: true,
        directDebitBlockedBy: true,
        directDebitBlockReason: true,
      },
    });
    expect(row.directDebitBlockedAt).not.toBeNull();
    expect(row.directDebitBlockedBy).toBe(E2E_STAFF_ID);
    expect(row.directDebitBlockReason).toBe(REASON);
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "company.direct_debit_blocked" },
      select: { subjectId: true, actorId: true, payload: true },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ subjectId: companyId, actorId: E2E_STAFF_ID });
    expect(facts[0]?.payload).toMatchObject({ reason: REASON });
  });

  it("liste les sociétés au crédit, bloquées ou non — pas les autres", async () => {
    const { companyId } = await seedCompany(true);
    const other = await createCompany(ctx.prisma, { status: CompanyStatus.active });
    await ctx.prisma.company.update({
      where: { id: other.id },
      data: { grantedTerms: [DeferredTerm.monthly] },
    });
    const withoutCredit = await createCompany(ctx.prisma, { status: CompanyStatus.active });
    await block(companyId);

    const list = jsonBody<DirectDebitBlockView[]>(await staff().get(ROUTE).expect(200));

    const ids = list.map((entry) => entry.companyId);
    expect(ids).toEqual(expect.arrayContaining([companyId, other.id]));
    expect(ids).not.toContain(withoutCredit.id);
    const blocked = list.find((entry) => entry.companyId === companyId);
    expect(blocked?.block).toMatchObject({ reason: REASON });
    expect(blocked?.block?.blockedBy).not.toBeNull();
    expect(list.find((entry) => entry.companyId === other.id)?.block).toBeNull();
  });

  it("débloque : les trois colonnes reviennent à NULL, et le journal le dit", async () => {
    const { companyId } = await seedCompany(true);
    await block(companyId);

    await staff().delete(`${ROUTE}/${companyId}`).expect(204);

    const row = await ctx.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: {
        directDebitBlockedAt: true,
        directDebitBlockedBy: true,
        directDebitBlockReason: true,
      },
    });
    expect(row).toEqual({
      directDebitBlockedAt: null,
      directDebitBlockedBy: null,
      directDebitBlockReason: null,
    });
    expect(
      await ctx.prisma.activityEvent.count({ where: { type: "company.direct_debit_unblocked" } }),
    ).toBe(1);
  });

  it("refuse : sans crédit (409), deux fois (409), débloquer à vide (409), raison vide (400)", async () => {
    const { companyId } = await seedCompany(true);
    const withoutCredit = await createCompany(ctx.prisma, { status: CompanyStatus.active });

    await staff().post(`${ROUTE}/${withoutCredit.id}`).send({ reason: REASON }).expect(409);
    await staff().delete(`${ROUTE}/${companyId}`).expect(409);
    await staff().post(`${ROUTE}/${companyId}`).send({ reason: "   " }).expect(400);
    await block(companyId);
    await staff().post(`${ROUTE}/${companyId}`).send({ reason: "Autre" }).expect(409);
    await staff().post(`${ROUTE}/unknown-company`).send({ reason: REASON }).expect(404);
  });

  it("retirer tout crédit lève le blocage — pas de blocage fantôme", async () => {
    const { companyId } = await seedCompany(true);
    await block(companyId);

    await staff()
      .patch(`/admin/companies/${companyId}/granted-terms`)
      .send({ grantedTerms: [] })
      .expect(204);

    const row = await ctx.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { directDebitBlockedAt: true, directDebitBlockReason: true },
    });
    expect(row).toEqual({ directDebitBlockedAt: null, directDebitBlockReason: null });
  });
});

describe("la contrainte en base", () => {
  it("refuse un blocage à moitié écrit", async () => {
    const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });

    await expect(
      ctx.prisma.company.update({
        where: { id: company.id },
        data: { directDebitBlockedAt: new Date("2026-09-25T09:00:00.000Z") },
      }),
    ).rejects.toThrow(/companies_direct_debit_block_complete/u);
  });
});

/** Une fiche staff active du rôle donné, éventuellement dérogée ; rend son agent. */
async function staffAs(
  role: StaffRole,
  allow: readonly { readonly resource: "b2b_accounting"; readonly action: "read" | "write" }[] = [],
): Promise<request.Agent> {
  const sub = `staff-block-${role}`;
  const user = await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: role,
      email: `block-${role}@lfc.test`,
      role,
      status: "active",
      auth0Id: sub,
    },
  });
  for (const grant of allow) {
    await ctx.prisma.staffPermissionOverride.create({
      data: { staffUserId: user.id, ...grant, effect: "allow" },
    });
  }
  return ctx.asSub(sub);
}

describe("le droit du geste — `b2b_deferred_payment_block`, pas `b2b_accounting`", () => {
  it("`b2b_accounting:write` sans le droit du blocage : lit la liste, mais bloquer et débloquer sont refusés (403)", async () => {
    const { companyId } = await seedCompany(true);
    const agent = await staffAs("commercial", [
      { resource: "b2b_accounting", action: "read" },
      { resource: "b2b_accounting", action: "write" },
    ]);

    await agent.get(ROUTE).expect(200);
    await agent.post(`${ROUTE}/${companyId}`).send({ reason: REASON }).expect(403);
    await block(companyId);
    await agent.delete(`${ROUTE}/${companyId}`).expect(403);

    const row = await ctx.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { directDebitBlockReason: true },
    });
    expect(row.directDebitBlockReason).toBe(REASON);
  });

  it("la comptabilité bloque et débloque", async () => {
    const { companyId } = await seedCompany(true);
    const agent = await staffAs("comptabilite");

    await agent.post(`${ROUTE}/${companyId}`).send({ reason: REASON }).expect(204);
    await agent.delete(`${ROUTE}/${companyId}`).expect(204);
  });

  it("l'administrateur bloque et débloque", async () => {
    const { companyId } = await seedCompany(true);
    const agent = await staffAs("admin");

    await agent.post(`${ROUTE}/${companyId}`).send({ reason: REASON }).expect(204);
    await agent.delete(`${ROUTE}/${companyId}`).expect(204);
  });
});
