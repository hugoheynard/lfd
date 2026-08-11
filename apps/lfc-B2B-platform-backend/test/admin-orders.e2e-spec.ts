/**
 * E2E de la **lecture staff des commandes** (`GET /admin/orders`, `/:id`).
 *
 * Ce que seul le vrai SQL prouve : qu'un commercial voit les commandes **des
 * deux natures** — celles d'une entreprise et celles « zéro friction » qui n'en
 * ont pas — alors qu'il n'est ni le client ni membre d'aucune société ; que le
 * **nom du client** est bien résolu par jointure (raison sociale, ou personne) ;
 * et que les filtres et le plafond mordent sur la requête, pas après coup.
 *
 * Deux frontières doublées : la signature du jeton **staff** (tenant Auth0
 * distant) et la passerelle Stripe. Le reste — guard, bus, domaine, SQL — est réel.
 */
import type { AdminOrderRow, OrderView, PlacedOrderResponse } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/infra/auth/admin-token.verifier.js";
import { CompanyStatus, CustomerRole } from "../src/infra/database/client/client.js";
import { PaymentGateway } from "../src/payments/domain/payment-gateway.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const MEMBER = "auth0|member";
const SOLO = "auth0|solo";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

/**
 * Passerelle de paiement doublée. L'identifiant d'intention **change à chaque
 * appel** : la colonne `stripe_payment_intent_id` est `@unique`, donc un double
 * qui rendrait toujours la même valeur ferait échouer la deuxième commande — ce
 * qui n'apprendrait rien sur le produit, seulement sur le double.
 */
let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({
      paymentIntentId: `pi_e2e_${intentCounter}`,
      clientSecret: `pi_e2e_${intentCounter}_secret`,
    });
  },
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

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

/** Le point de retrait par défaut — sans lui, tout `pickup` part en 409. */
async function seedPickup(): Promise<void> {
  await ctx.prisma.pickupAddress.create({
    data: {
      label: "Labo",
      ligne1: "1 rue du Four",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
  });
}

/** Une commande d'entreprise + une commande personnelle, par deux clients distincts. */
async function seedTwoOrders(): Promise<{ companyId: string }> {
  await seedPickup();
  const company = await createCompany(ctx.prisma, {
    raisonSociale: "Café des Halles SAS",
    status: CompanyStatus.active,
  });
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.owner);
  await createUser(ctx.prisma, {
    auth0Sub: SOLO,
    email: "solo@exemple.fr",
    firstName: "Léa",
    lastName: "Martin",
  });

  await ctx
    .asSub(MEMBER)
    .post("/orders")
    .send({ companyId: company.id, lines: [{ sku: "VIE-001", quantity: 2 }] })
    .expect(201);
  await ctx
    .asSub(SOLO)
    .post("/orders")
    .send({ lines: [{ sku: "VIE-002", quantity: 3 }] })
    .expect(201);

  return { companyId: company.id };
}

describe("GET /admin/orders", () => {
  it("rend les commandes des DEUX natures — le staff n'est membre de rien", async () => {
    await seedTwoOrders();

    const rows = jsonBody<readonly AdminOrderRow[]>(await staff().get("/admin/orders").expect(200));

    expect(rows).toHaveLength(2);
  });

  it("nomme le client : raison sociale, ou la personne quand il n'y a pas d'entreprise", async () => {
    await seedTwoOrders();

    const rows = jsonBody<readonly AdminOrderRow[]>(await staff().get("/admin/orders").expect(200));

    expect([...rows].map((row) => row.customerLabel).sort()).toEqual([
      "Café des Halles SAS",
      "Léa Martin",
    ]);
  });

  it("filtre sur une entreprise, laissant les commandes personnelles dehors", async () => {
    const { companyId } = await seedTwoOrders();

    const rows = jsonBody<readonly AdminOrderRow[]>(
      await staff().get(`/admin/orders?companyId=${companyId}`).expect(200),
    );

    expect(rows.map((row) => row.companyId)).toEqual([companyId]);
  });

  it("filtre sur un état d'avancement", async () => {
    await seedTwoOrders();

    const placed = jsonBody<readonly AdminOrderRow[]>(
      await staff().get("/admin/orders?status=placed").expect(200),
    );
    const fulfilled = jsonBody<readonly AdminOrderRow[]>(
      await staff().get("/admin/orders?status=fulfilled").expect(200),
    );

    expect([placed.length, fulfilled.length]).toEqual([2, 0]);
  });

  it("respecte le plafond demandé", async () => {
    await seedTwoOrders();

    const rows = jsonBody<readonly AdminOrderRow[]>(
      await staff().get("/admin/orders?limit=1").expect(200),
    );

    expect(rows).toHaveLength(1);
  });

  it("refuse un plafond hors bornes plutôt que de le corriger en silence", async () => {
    await staff().get("/admin/orders?limit=5000").expect(400);
  });

  // La porte staff (401 sans jeton valide) est couverte par le test unitaire du
  // guard ; ici le bypass de dev est actif, donc l'endpoint ne peut pas la jouer.
});

describe("GET /admin/orders/:id", () => {
  it("ouvre une commande d'entreprise sans en être membre", async () => {
    await seedPickup();
    const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
    const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
    await attachTo(ctx.prisma, member.id, company.id, CustomerRole.owner);
    const placed = jsonBody<PlacedOrderResponse>(
      await ctx
        .asSub(MEMBER)
        .post("/orders")
        .send({ companyId: company.id, lines: [{ sku: "VIE-001", quantity: 2 }] })
        .expect(201),
    );

    const order = jsonBody<OrderView>(await staff().get(`/admin/orders/${placed.id}`).expect(200));

    expect(order.orderNumber).toBe(placed.orderNumber);
  });

  it("rend 404 sur une commande inexistante", async () => {
    await staff().get("/admin/orders/ord_inconnue").expect(404);
  });
});
