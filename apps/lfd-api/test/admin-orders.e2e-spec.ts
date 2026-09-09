import { randomUUID } from "node:crypto";
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
import type {
  AdminOrderRow,
  CustomerOrderView,
  OrderView,
  PlacedOrderResponse,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

/**
 * Le jour de **service** d'une commande de test. Obligatoire depuis que
 * `orderContentShape` l'exige : une commande sans jour de retrait/livraison
 * n'entrerait dans aucune journée de production.
 *
 * **Relatif**, et plus une date en dur : depuis que l'heure limite est opposée à
 * la passation (2026-09-04), un jour de service est comparé à l'horloge.
 */
const SERVICE_DAY = serviceDay();

/** L'id du point semé par le test courant (cf. `orders.e2e-spec`). */
let pickupId = "pickup_absent";

/**
 * L'acheminement minimal d'une commande valide : un jour de service et un point
 * de retrait explicite. Les payloads s'appuyaient sur les défauts du schéma —
 * ils n'en ont plus.
 */
const pickupContent = (): Record<string, unknown> => ({
  idempotencyKey: randomUUID(),
  fulfillmentMethod: "pickup",
  pickupAddressId: pickupId,
  requestedDeliveryDate: SERVICE_DAY,
});

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

/**
 * Le point de retrait — sans lui, tout `pickup` part en 409. Il rend son id :
 * le contrat exige un point **explicite**, une commande ne le déduit plus.
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
    .send({ ...pickupContent(), companyId: company.id, lines: [{ sku: "VIE-001", quantity: 2 }] })
    .expect(201);
  await ctx
    .asSub(SOLO)
    .post("/orders")
    .send({ ...pickupContent(), lines: [{ sku: "VIE-002", quantity: 3 }] })
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
        .send({
          ...pickupContent(),
          companyId: company.id,
          lines: [{ sku: "VIE-001", quantity: 2 }],
        })
        .expect(201),
    );

    const order = jsonBody<OrderView>(await staff().get(`/admin/orders/${placed.id}`).expect(200));

    expect(order.orderNumber).toBe(placed.orderNumber);
  });

  it("rend 404 sur une commande inexistante", async () => {
    await staff().get("/admin/orders/ord_inconnue").expect(404);
  });

  /**
   * 🔴 **Régression R27 (2026-09-09) : la trace du prix partait au CLIENT.**
   *
   * `GET /orders/:id` servait `OrderView` sans rétrécissement, donc
   * `floorDecision` — le plancher, c'est-à-dire la marge — et l'identifiant de
   * chaque règle, alors que `POST /orders/quote` était rétrécie exactement pour
   * ça depuis le matin même.
   *
   * Ce cas tient les DEUX moitiés sur la MÊME commande, et c'est le seul niveau
   * qui le peut : le comptoir garde tout (l'écran d'explication de la trace se
   * bâtira dessus), le client n'a que ce qui explique sa facture. Deux tests
   * séparés laisseraient passer un rétrécissement qui aurait aussi appauvri le
   * staff.
   */
  it("sert la trace entière au comptoir, et amputée au client", async () => {
    await seedPickup();
    const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
    const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
    await attachTo(ctx.prisma, member.id, company.id, CustomerRole.owner);
    const placed = jsonBody<PlacedOrderResponse>(
      await ctx
        .asSub(MEMBER)
        .post("/orders")
        .send({
          ...pickupContent(),
          companyId: company.id,
          lines: [{ sku: "VIE-001", quantity: 2 }],
        })
        .expect(201),
    );

    const staffLine = jsonBody<OrderView>(
      await staff().get(`/admin/orders/${placed.id}`).expect(200),
    ).lines[0];
    const clientLine = jsonBody<CustomerOrderView>(
      await ctx.asSub(MEMBER).get(`/orders/${placed.id}`).expect(200),
    ).lines[0];

    // Le comptoir : tout ce dont un écran d'explication aura besoin — y compris
    // `rejected`, les règles regardées et non appliquées (R25).
    expect(Object.keys(staffLine?.pricing ?? {}).sort()).toEqual([
      "basePriceMillicents",
      "clampedToZero",
      "commitment",
      "floorDecision",
      "floored",
      "rejected",
      "steps",
    ]);
    // Le client : de quoi comprendre sa facture, et rien sur la façon dont on la
    // borne. Un jeu de clés exact, jamais une liste d'absences — un champ ajouté
    // demain à la vue staff passerait entre les mailles de la seconde.
    expect(Object.keys(clientLine?.pricing ?? {}).sort()).toEqual([
      "basePriceMillicents",
      "floored",
      "steps",
    ]);
    // Et le prix, lui, est le même des deux côtés : rétrécir n'a pas changé la
    // facture.
    expect(clientLine?.unitPriceMillicents).toBe(staffLine?.unitPriceMillicents);
  });
});
