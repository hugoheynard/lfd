/**
 * E2E de la **commande saisie par l'équipe** (`POST /admin/orders`).
 *
 * Ce que seul le vrai SQL prouve, et qu'un test de handler ne peut pas :
 * - le **mur porte sur l'acheteur**, un client qui n'est pas membre de la
 *   société visée est refusé — c'est le point le plus facile à casser, puisque
 *   l'acteur (le staff) n'est membre de rien par construction ;
 * - la commande atterrit avec les deux identités distinctes en colonnes, et
 *   remonte ensuite dans « Mes commandes » **du client**, pas de l'équipe ;
 * - le refus du **compte sans crédit** mord au niveau HTTP, en 409, et
 *   n'écrit rien.
 *
 * Deux frontières doublées : la signature du jeton **staff** (tenant Auth0
 * distant) et la passerelle Stripe. Le reste — guard, bus, domaine, SQL — est réel.
 */
import type { AdminPlacedOrderResponse, OrderView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

/**
 * Le jour de **service** d'une commande de test. Obligatoire depuis que
 * `orderContentShape` l'exige : sans lui, la commande n'entrerait dans aucune
 * journée de production.
 */
const SERVICE_DAY = "2026-09-01";

/** L'id du point semé par le test courant (cf. `orders.e2e-spec`). */
let pickupId = "pickup_absent";

const BUYER = "auth0|acheteur";
const OUTSIDER = "auth0|etranger";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

/** L'identifiant d'intention change à chaque appel : la colonne est `@unique`. */
let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({
      paymentIntentId: `pi_admin_${intentCounter}`,
      clientSecret: `pi_admin_${intentCounter}_secret`,
    });
  },
  retrieveIntent: (id: string) =>
    Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` }),
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

/**
 * Le point de retrait. Il rend son id : le contrat exige un point **explicite**,
 * une commande ne le déduit plus d'un défaut serveur.
 */
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
  pickupId = point.id;
  return point.id;
}

/** Une société avec un détenteur, et — au choix — un crédit accordé. */
async function seedCompany(onAccount: boolean): Promise<{
  readonly companyId: string;
  readonly buyerId: string;
}> {
  await seedPickup();
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  if (onAccount) {
    await ctx.prisma.company.update({
      where: { id: company.id },
      data: { grantedTerms: [DeferredTerm.monthly] },
    });
  }
  const buyer = await createUser(ctx.prisma, { auth0Sub: BUYER, email: "acheteur@test.fr" });
  await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
  return { companyId: company.id, buyerId: buyer.id };
}

function payload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    settlement: "link",
    // Une commande dit toujours QUAND et OÙ : ces deux champs ne sont plus des
    // défauts du schéma, ils font partie de ce qu'une commande valide porte.
    requestedDeliveryDate: SERVICE_DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    lines: [{ sku: "VIE-001", quantity: 12 }],
    ...over,
  };
}

describe("POST /admin/orders — le mur", () => {
  it("refuse un acheteur qui n'est pas membre de la société visée", async () => {
    // Le staff, lui, n'est membre de rien : si le mur portait sur l'acteur,
    // cette route serait morte. S'il ne portait sur personne, ce test passerait.
    const { companyId } = await seedCompany(false);
    const outsider = await createUser(ctx.prisma, {
      auth0Sub: OUTSIDER,
      email: "etranger@test.fr",
    });

    await staff()
      .post("/admin/orders")
      .send(payload({ companyId, buyerUserId: outsider.id }))
      .expect(404);

    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it("exige une société : le zéro friction est un parcours client", async () => {
    const { buyerId } = await seedCompany(false);

    await staff()
      .post("/admin/orders")
      .send(payload({ buyerUserId: buyerId }))
      .expect(400);
  });

  it("exige un règlement choisi — aucun défaut silencieux", async () => {
    const { companyId, buyerId } = await seedCompany(true);

    await staff()
      .post("/admin/orders")
      .send({ ...payload({ companyId, buyerUserId: buyerId }), settlement: undefined })
      .expect(400);
  });
});

describe("POST /admin/orders — la trace", () => {
  it("porte la commande au nom du client ET garde qui l'a saisie", async () => {
    const { companyId, buyerId } = await seedCompany(true);

    const placed = jsonBody<AdminPlacedOrderResponse>(
      await staff()
        .post("/admin/orders")
        .send(payload({ companyId, buyerUserId: buyerId, settlement: "account" }))
        .expect(201),
    );

    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: placed.id } });
    expect(row.placedByUserId).toBe(buyerId);
    // L'identifiant de la fiche d'annuaire de l'opérateur E2E, résolu par le
    // guard — pas le `sub` du jeton, et surtout pas une chaîne inventée.
    expect(row.placedByStaffId).not.toBeNull();
  });

  it("remonte dans « Mes commandes » DU CLIENT, marquée comme saisie par l'équipe", async () => {
    // C'est tout l'argument du modèle : la commande appartient au client.
    const { companyId, buyerId } = await seedCompany(true);
    await staff()
      .post("/admin/orders")
      .send(payload({ companyId, buyerUserId: buyerId, settlement: "account" }))
      .expect(201);

    const orders = jsonBody<readonly OrderView[]>(
      await ctx.asSub(BUYER).get(`/companies/${companyId}/orders`).expect(200),
    );

    expect(orders).toHaveLength(1);
    expect(orders[0]?.origin).toBe("back_office");
  });
});

describe("POST /admin/orders — le règlement", () => {
  it("au compte : rien à encaisser quand le crédit est accordé", async () => {
    const { companyId, buyerId } = await seedCompany(true);

    const placed = jsonBody<AdminPlacedOrderResponse>(
      await staff()
        .post("/admin/orders")
        .send(payload({ companyId, buyerUserId: buyerId, settlement: "account" }))
        .expect(201),
    );

    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: placed.id } });
    expect(row.paymentStatus).toBe("not_required");
    expect(row.stripePaymentIntentId).toBeNull();
    expect(placed.paymentUrl).toBeUndefined();
  });

  it("REFUSE le compte à une société sans crédit — et n'écrit rien", async () => {
    // Sans ce refus, un écran de back-office suffirait à accorder un délai de
    // paiement que personne n'a négocié.
    const { companyId, buyerId } = await seedCompany(false);

    await staff()
      .post("/admin/orders")
      .send(payload({ companyId, buyerUserId: buyerId, settlement: "account" }))
      .expect(409);

    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it("lien : la commande attend un règlement, que le client peut aller faire", async () => {
    const { companyId, buyerId } = await seedCompany(false);

    const placed = jsonBody<AdminPlacedOrderResponse>(
      await staff()
        .post("/admin/orders")
        .send(payload({ companyId, buyerUserId: buyerId, settlement: "link" }))
        .expect(201),
    );

    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: placed.id } });
    expect(row.paymentStatus).toBe("pending");

    // La boucle se referme : le client suit le lien et obtient de quoi payer.
    const intent = jsonBody<{ readonly amountCents: number }>(
      await ctx.asSub(BUYER).get(`/orders/${placed.id}/payment`).expect(200),
    );
    expect(intent.amountCents).toBe(placed.totalCents);
  });

  it("une commande portée au compte n'a rien à régler : 409, pas 404", async () => {
    // Un client qui suit un vieux lien doit apprendre que sa commande va bien.
    const { companyId, buyerId } = await seedCompany(true);
    const placed = jsonBody<AdminPlacedOrderResponse>(
      await staff()
        .post("/admin/orders")
        .send(payload({ companyId, buyerUserId: buyerId, settlement: "account" }))
        .expect(201),
    );

    await ctx.asSub(BUYER).get(`/orders/${placed.id}/payment`).expect(409);
  });
});

/**
 * **Le devis dit ce que la validation facturera.**
 *
 * Le panier du staff affichait le tarif du CATALOGUE pendant que `POST` facturait
 * le prix RÉSOLU : un commercial annonçait au téléphone un prix que la commande
 * contredisait ensuite. Éprouvé de bout en bout, et surtout **comparé à la
 * commande réelle** : c'est la seule assertion qui prouve que les deux chemins
 * n'ont pas divergé.
 */
describe("POST /admin/orders/quote — ce que ça coûtera", () => {
  it("rend le tarif du catalogue quand aucune règle ne joue", async () => {
    const { companyId } = await seedCompany(true);

    const quote = jsonBody<{
      lines: { sku: string; canonicalCents: number; unitPriceCents: number; steps: unknown[] }[];
      subtotalCents: number;
    }>(
      await staff()
        .post("/admin/orders/quote")
        .send({ companyId, lines: [{ sku: "VIE-001", quantity: 12 }] })
        .expect(200),
    );

    expect(quote.lines[0]?.canonicalCents).toBe(200);
    expect(quote.lines[0]?.unitPriceCents).toBe(200);
    expect(quote.lines[0]?.steps).toEqual([]);
    expect(quote.subtotalCents).toBe(2400);
  });

  it("applique la promotion en cours, et dit par quel étage elle passe", async () => {
    const { companyId } = await seedCompany(true);
    await staff()
      .post("/admin/pricing/rules")
      .send({
        stage: "promotion",
        scope: { type: "global", id: null },
        audience: { type: "all", id: null },
        minQuantity: null,
        effect: { nature: "alter", direction: "decrease", mode: "percent", value: 2_500 },
        label: "Promo devis",
        validFrom: new Date(Date.now() - 86_400_000).toISOString(),
        validTo: null,
      })
      .expect(201);

    const quote = jsonBody<{
      lines: { canonicalCents: number; unitPriceCents: number; steps: { stage: string }[] }[];
    }>(
      await staff()
        .post("/admin/orders/quote")
        .send({ companyId, lines: [{ sku: "VIE-001", quantity: 12 }] })
        .expect(200),
    );

    // 200 c − 25 % = 150 c. Le tarif d'entrée reste visible à côté.
    expect(quote.lines[0]?.canonicalCents).toBe(200);
    expect(quote.lines[0]?.unitPriceCents).toBe(150);
    expect(quote.lines[0]?.steps.map((step) => step.stage)).toEqual(["promotion"]);
  });

  /**
   * L'assertion qui compte : le devis et la commande passent par la MÊME
   * résolution. Si l'un des deux devait un jour recalculer à sa façon, c'est ici
   * que ça se verrait — et pas devant un client.
   */
  it("annonce exactement ce que la commande facture ensuite", async () => {
    const { companyId, buyerId } = await seedCompany(true);
    await staff()
      .post("/admin/pricing/rules")
      .send({
        stage: "promotion",
        scope: { type: "global", id: null },
        audience: { type: "all", id: null },
        minQuantity: null,
        effect: { nature: "alter", direction: "decrease", mode: "percent", value: 1_000 },
        label: "Promo comparaison",
        validFrom: new Date(Date.now() - 86_400_000).toISOString(),
        validTo: null,
      })
      .expect(201);

    const quote = jsonBody<{ lines: { unitPriceCents: number }[] }>(
      await staff()
        .post("/admin/orders/quote")
        .send({ companyId, lines: [{ sku: "VIE-001", quantity: 12 }] })
        .expect(200),
    );

    await staff()
      .post("/admin/orders")
      .send(payload({ companyId, buyerUserId: buyerId, settlement: "account" }))
      .expect(201);

    const line = await ctx.prisma.orderLine.findFirst({ where: { sku: "VIE-001" } });

    expect(quote.lines[0]?.unitPriceCents).toBe(line?.unitPriceCents);
  });
});
