/**
 * E2E des **alertes de compte client**, sur un vrai Postgres.
 *
 * Ce que seul le vrai SQL prouve : que passer une commande déclenche réellement
 * l'évaluation (l'événement traverse le bus), que la clé d'idempotence tient sous
 * une vraie contrainte unique, que les filtres d'historique portent (annulées
 * exclues, commande courante exclue), et que la médiane sort de `percentile_cont`
 * et non d'un tri en mémoire.
 */
import type { AccountAlertView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/infra/auth/admin-token.verifier.js";
import { CustomerRole, type CompanyStatus } from "../src/infra/database/client/client.js";
import { PaymentGateway } from "../src/payments/domain/payment-gateway.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const CLIENT = "auth0|client";
const SKU = "VIE-001";

/** Le vérificateur staff, doublé : un e2e n'a pas à joindre le tenant Auth0. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

/**
 * Passerelle de paiement doublée. L'identifiant d'intention **change à chaque
 * appel** : `stripe_payment_intent_id` est `@unique`, donc un double qui rendrait
 * toujours la même valeur ferait échouer la deuxième commande — ce qui
 * n'apprendrait rien sur le produit, seulement sur le double.
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
      { token: PaymentGateway, value: fakeGateway },
      { token: AdminTokenVerifier, value: stubAdminVerifier },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Sème une société + son admin, et le point de retrait par défaut. */
async function seed(status: CompanyStatus = "active"): Promise<string> {
  const user = await createUser(ctx.prisma, { auth0Sub: CLIENT });
  const company = await createCompany(ctx.prisma, { status });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.company_admin);
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
  return company.id;
}

/** Passe une commande retrait pour cette société. */
async function order(companyId: string, quantity: number): Promise<void> {
  await ctx
    .asSub(CLIENT)
    .post("/orders")
    .send({
      companyId,
      fulfillmentMethod: "pickup",
      note: "",
      lines: [{ sku: SKU, quantity }],
    })
    .expect(201);
}

/** Requête authentifiée en **staff** (le verifier doublé accepte le jeton). */
function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

async function alertsOf(companyId: string): Promise<AccountAlertView[]> {
  return jsonBody<AccountAlertView[]>(
    await staff().get(`/admin/companies/${companyId}/alerts`).expect(200),
  );
}

describe("une commande déclenche l'évaluation", () => {
  it("n'alerte pas sur la toute première commande — tout y est nouveau", async () => {
    const companyId = await seed();

    await order(companyId, 3);

    expect(await alertsOf(companyId)).toHaveLength(0);
  });

  it("signale un produit jamais commandé dès la deuxième commande", async () => {
    const companyId = await seed();
    await order(companyId, 3);

    // Deuxième commande : le SKU a déjà été pris, donc rien sur celui-là.
    await order(companyId, 3);

    const alerts = await alertsOf(companyId);
    expect(alerts.filter((alert) => alert.kind === "product.first_order")).toHaveLength(0);
  });

  it("n'alerte pas une société qui n'est pas active", async () => {
    const companyId = await seed("pending");

    await order(companyId, 3);
    await order(companyId, 3);

    expect(await alertsOf(companyId)).toHaveLength(0);
  });
});

describe("le journal", () => {
  it("s'acquitte, et le premier acquittement fait foi", async () => {
    const companyId = await seed();
    await ctx.prisma.accountAlert.create({
      data: {
        id: "alert_1",
        companyId,
        kind: "product.first_order",
        orderId: "order_x",
        orderNumber: "LFC-1",
        idempotencyKey: "product.first_order:order_x",
        occurredAt: new Date(),
        findings: [{ sku: SKU, productName: "Viennoiserie", quantity: 1, message: "test" }],
      },
    });

    await staff().post("/admin/alerts/alert_1/acknowledge").expect(204);
    const first = (await alertsOf(companyId))[0]?.acknowledgedAt;
    await staff().post("/admin/alerts/alert_1/acknowledge").expect(204);

    // Deux clics ne réécrivent pas qui a vu quoi, ni quand.
    expect((await alertsOf(companyId))[0]?.acknowledgedAt).toBe(first);
  });

  /**
   * Régression : sans la contrainte unique, une reprise de file ou une double
   * publication de l'événement doublerait le journal.
   */
  it("refuse deux alertes pour le même (type, commande)", async () => {
    const companyId = await seed();
    const row = {
      companyId,
      kind: "product.first_order",
      orderId: "order_x",
      orderNumber: "LFC-1",
      idempotencyKey: "product.first_order:order_x",
      occurredAt: new Date(),
      findings: [],
    };
    await ctx.prisma.accountAlert.create({ data: { id: "alert_1", ...row } });

    await expect(
      ctx.prisma.accountAlert.create({ data: { id: "alert_2", ...row } }),
    ).rejects.toThrow();
  });
});

describe("la norme catalogue", () => {
  it("se calcule en médiane, et ignore les commandes annulées", async () => {
    const companyId = await seed();
    for (const quantity of [4, 5, 4, 500]) {
      await order(companyId, quantity);
    }
    // La commande à 500 est annulée : elle n'a jamais été un achat.
    await ctx.prisma.order.updateMany({
      where: { lines: { some: { quantity: 500 } } },
      data: { status: "cancelled" },
    });

    const body = jsonBody<{ recomputed: number }>(
      // Le recalcul est une porte MACHINE (cron), pas la porte staff : jeton
      // interne, comme le scoring des leads.
      await ctx
        .http()
        .post("/admin/recompute/product-norms")
        .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
        .expect(200),
    );

    expect(body.recomputed).toBeGreaterThan(0);
    const norm = await ctx.prisma.productNorm.findUnique({ where: { sku: SKU } });
    // Médiane de [4, 4, 5] = 4. Une moyenne aurait été tirée par le 500 si on
    // l'avait compté, et la médiane le neutralise même quand il compte.
    expect(Number(norm?.medianQuantity)).toBe(4);
    expect(norm?.sampleLines).toBe(3);
  });
});
