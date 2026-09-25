/**
 * E2E du **Comptoir** (`/admin/counter/customers`) — plan
 * `documentation/order/plan-commande-au-comptoir.md`.
 *
 * 🔴 La preuve qui compte est le parcours ENTIER sous le rôle `comptoir`, qui
 * n'a pas `b2b_companies` : chacune des lectures de l'écran de commande répond
 * 200, puis le devis et la passation. La passation seule passait déjà sous
 * `b2b_orders:write` ; c'est le sélecteur et le détail qui prenaient 403. Un
 * test qui n'éprouverait que les deux routes neuves laisserait l'encapsulation
 * se casser sur n'importe quelle autre lecture de l'écran.
 *
 * Deux frontières doublées : la signature du jeton staff et la passerelle
 * Stripe. Le reste — guard, bus, domaine, SQL — est réel.
 */
import type { CounterCustomerCard, CounterCustomerView, StaffRole } from "@lfd/contracts";
import type request from "supertest";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const ROUTE = "/admin/counter/customers";
const BUYER = "auth0|acheteur-comptoir";
const BUYER_EMAIL = "acheteur@comptoir.fr";

/** Le jeton porteur EST le `sub` : chaque rôle a son agent. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({
      paymentIntentId: `pi_counter_${intentCounter}`,
      clientSecret: `pi_counter_${intentCounter}_secret`,
    });
  },
  retrieveIntent: (id: string) => Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_s` }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
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

/** Une fiche staff active du rôle donné ; rend son agent. */
async function staffAs(role: StaffRole): Promise<request.Agent> {
  const sub = `staff-counter-${role}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: role,
      email: `counter-${role}@lfc.test`,
      role,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}

async function seedPickup(): Promise<string> {
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
  return point.id;
}

/** Une société active au compte, son détenteur, et une adresse à son carnet. */
async function seedCustomer(): Promise<{ companyId: string; buyerId: string }> {
  const company = await createCompany(ctx.prisma, {
    status: CompanyStatus.active,
    enseigne: "Boulangerie du Col",
  });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const buyer = await createUser(ctx.prisma, { auth0Sub: BUYER, email: BUYER_EMAIL });
  await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
  // Par le chemin du client, pas par Prisma : l'adresse passe les règles du carnet.
  await ctx
    .asSub(BUYER)
    .post(`/companies/${company.id}/delivery-addresses`)
    .send({
      label: "Boutique",
      ligne1: "2 rue Neuve",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
      specs: {
        signatureRequired: false,
        note: "",
        slots: { mode: "everyday", slot: null },
        deliveryContact: null,
        gps: null,
      },
    })
    .expect(201);
  return { companyId: company.id, buyerId: buyer.id };
}

describe("le mur — `b2b_counter:read`", () => {
  it("refuse la carte et le détail à qui ne l'a pas (403)", async () => {
    const { companyId } = await seedCustomer();
    // `support` lit les commandes, pas le Comptoir.
    const agent = await staffAs("support");

    await agent.get(ROUTE).expect(403);
    await agent.get(`${ROUTE}/${companyId}`).expect(403);
  });

  it("n'ouvre pas la fiche client au vendeur de comptoir", async () => {
    const { companyId } = await seedCustomer();
    const agent = await staffAs("comptoir");

    await agent.get("/admin/companies").expect(403);
    await agent.get(`/admin/companies/${companyId}`).expect(403);
    await agent.get(`/admin/companies/${companyId}/members`).expect(403);
  });
});

describe("sous le rôle `comptoir`, l'écran de commande entier", () => {
  it("🔴 chaque lecture de l'écran répond 200, puis le devis et la passation", async () => {
    const pickupId = await seedPickup();
    const { companyId, buyerId } = await seedCustomer();
    const agent = await staffAs("comptoir");

    // Les lectures, dans l'ordre où l'écran les fait.
    const cards = jsonBody<CounterCustomerCard[]>(await agent.get(ROUTE).expect(200));
    expect(cards.map((card) => card.id)).toEqual([companyId]);
    const view = jsonBody<CounterCustomerView>(
      await agent.get(`${ROUTE}/${companyId}`).expect(200),
    );
    await agent.get(`/admin/orders?companyId=${companyId}&limit=5`).expect(200);
    await agent.get("/admin/catalog/sellable").expect(200);
    await agent.get(`/admin/catalog/companies/${companyId}`).expect(200);
    await agent.get(`/admin/order-drafts/${companyId}`).expect(200);
    await agent.get("/pickup-addresses").expect(200);
    await agent.get("/delivery-zones").expect(200);
    await agent.get("/delivery-availability").expect(200);

    await agent
      .post("/admin/orders/quote")
      .send({ companyId, lines: [{ sku: "VIE-001", quantity: 12 }] })
      .expect(200);
    await agent
      .post("/admin/orders")
      .send({
        companyId,
        buyerUserId: view.buyers[0]?.userId,
        settlement: view.settlesOnAccount ? "account" : "link",
        requestedDeliveryDate: serviceDay(),
        fulfillmentMethod: "pickup",
        pickupAddressId: pickupId,
        requestedWindow: { start: "07:00", end: "08:00" },
        lines: [{ sku: "VIE-001", quantity: 12 }],
      })
      .expect(201);

    expect(view.buyers.map((buyer) => buyer.userId)).toEqual([buyerId]);
    expect(await ctx.prisma.order.count({ where: { companyId } })).toBe(1);
  });
});

describe("ce que le Comptoir montre d'un client", () => {
  it("ne liste que les sociétés actives", async () => {
    const { companyId } = await seedCustomer();
    await createCompany(ctx.prisma, { status: CompanyStatus.pending });
    await createCompany(ctx.prisma, { status: CompanyStatus.suspended });
    const agent = await staffAs("comptoir");

    const cards = jsonBody<CounterCustomerCard[]>(await agent.get(ROUTE).expect(200));

    expect(cards.map((card) => card.id)).toEqual([companyId]);
  });

  it("rend une société suspendue introuvable (404), comme une absente", async () => {
    const suspended = await createCompany(ctx.prisma, { status: CompanyStatus.suspended });
    const agent = await staffAs("comptoir");

    await agent.get(`${ROUTE}/${suspended.id}`).expect(404);
    await agent.get(`${ROUTE}/societe-absente`).expect(404);
  });

  it("ne met dans la carte ni crédit, ni propriétaire, ni e-mail", async () => {
    await seedCustomer();
    const agent = await staffAs("comptoir");

    const [card] = jsonBody<Record<string, unknown>[]>(await agent.get(ROUTE).expect(200));

    expect(Object.keys(card ?? {}).sort()).toEqual([
      "id",
      "name",
      "reference",
      "siret",
      "tradeName",
    ]);
    expect(JSON.stringify(card)).not.toContain(BUYER_EMAIL);
  });

  it("dit « pas au compte » pour une société au crédit dont le prélèvement est bloqué", async () => {
    const { companyId } = await seedCustomer();
    const agent = await staffAs("comptoir");
    const admin = await staffAs("admin");
    await admin
      .post(`/admin/accounting/direct-debit-blocks/${companyId}`)
      .send({ reason: "Rejet SEPA" })
      .expect(204);

    const view = jsonBody<CounterCustomerView>(
      await agent.get(`${ROUTE}/${companyId}`).expect(200),
    );

    expect(view.settlesOnAccount).toBe(false);
    expect(Object.keys(view)).not.toContain("grantedTerms");
    expect(Object.keys(view)).not.toContain("directDebitBlocked");
  });

  it("sert le carnet et les acheteurs actifs d'un client au compte", async () => {
    const { companyId } = await seedCustomer();
    const agent = await staffAs("comptoir");

    const view = jsonBody<CounterCustomerView>(
      await agent.get(`${ROUTE}/${companyId}`).expect(200),
    );

    expect(view.settlesOnAccount).toBe(true);
    expect(view.status).toBe("active");
    expect(view.deliveryAddresses.map((address) => address.label)).toEqual(["Boutique"]);
    expect(view.buyers.map((buyer) => buyer.email)).toEqual([BUYER_EMAIL]);
  });
});
