/**
 * E2E des **commandes** — checkout **zéro friction**, sur un vrai Postgres.
 *
 * Ce que seul le vrai SQL prouve : le mur (membre) quand une entreprise est
 * visée, la commande **sans entreprise** (mur = client connecté, `company_id`
 * NULL), la **résolution serveur des prix** (le client n'envoie que sku+qté), le
 * frais de zone **coursier** re-résolu serveur, et la lecture (liste entreprise +
 * `/orders/mine`).
 *
 * Seule frontière doublée côté sortie : la passerelle de paiement (Stripe) — un
 * e2e n'a pas à joindre Stripe. Le double renvoie une intention fixe, ce qui suffit
 * à prouver que le chemin carte marque `pending` et relie l'intention.
 */
import type { CompanyStatus } from "../src/platform/database/client/client.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import type { BillingAddressPayload, OrderView, PlacedOrderResponse } from "@lfd/contracts";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const ADMIN = "auth0|admin";
const MEMBER = "auth0|member";
const STRANGER = "auth0|stranger";

/** Passerelle de paiement doublée : intention fixe, aucun appel réseau. */
const fakeGateway = {
  createIntent: () => Promise.resolve({ paymentIntentId: "pi_e2e", clientSecret: "pi_e2e_secret" }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: PaymentGateway, value: fakeGateway }] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  pickupId = NO_PICKUP;
});

/**
 * Le jour de **service** d'une commande de test. Obligatoire depuis que
 * `orderContentShape` l'exige : une commande sans jour de retrait/livraison
 * n'entrerait dans aucune journée de production.
 */
const SERVICE_DAY = "2026-09-01";

/** Aucun point semé : un retrait qui le désigne doit échouer, pas réussir par hasard. */
const NO_PICKUP = "pickup_absent";

/**
 * L'id du point semé par le test courant. Le contrat exige désormais un point
 * **explicite** en retrait ; le mémoriser ici évite de le faire circuler dans
 * chaque appel, et le remettre à zéro à chaque test empêche qu'un test qui
 * oublie de semer passe grâce au point du précédent.
 */
let pickupId = NO_PICKUP;

const LABO: BillingAddressPayload = {
  label: "Labo",
  ligne1: "5 rue du Four",
  ligne2: "",
  codePostal: "75002",
  ville: "Paris",
  pays: "France",
};

const COURIER_ADDR: BillingAddressPayload = {
  label: "",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

/** Sème une entreprise (statut choisi) + un admin + un membre + un étranger. */
async function seedCompany(status: CompanyStatus): Promise<string> {
  const admin = await createUser(ctx.prisma, { auth0Sub: ADMIN });
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  await createUser(ctx.prisma, { auth0Sub: STRANGER });
  const company = await createCompany(ctx.prisma, { status });
  await attachTo(ctx.prisma, admin.id, company.id, CustomerRole.owner);
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.orders);
  return company.id;
}

/** Sème le point de retrait par défaut (table globale). */
async function seedPickup(): Promise<string> {
  const point = await ctx.prisma.pickupAddress.create({
    data: { ...LABO, isDefault: true },
    select: { id: true },
  });
  pickupId = point.id;
  return point.id;
}

/** Sème une zone de livraison à frais fixe (20 €). */
async function seedZone(): Promise<string> {
  const zone = await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
    select: { id: true },
  });
  return zone.id;
}

/**
 * Une commande retrait, pour l'entreprise `companyId` (ou personnelle si `null`).
 *
 * Le point est **explicite** : le contrat n'accepte plus qu'un retrait sans
 * point, et un test qui laisserait le serveur choisir n'exercerait pas ce que
 * l'écran envoie.
 */
function pickupOrder(companyId: string | null): Record<string, unknown> {
  return {
    companyId,
    pickupAddressId: pickupId,
    requestedDeliveryDate: SERVICE_DAY,
    fulfillmentMethod: "pickup",
    note: "Livrer avant 8h",
    lines: [{ sku: "VIE-001", quantity: 3 }],
  };
}

describe("le mur des commandes", () => {
  it("un non-membre reçoit 404 (lecture entreprise et passation pour cette entreprise)", async () => {
    const companyId = await seedCompany("active");
    await seedPickup();
    await ctx.asSub(STRANGER).get(`/companies/${companyId}/orders`).expect(404);
    await ctx.asSub(STRANGER).post(`/orders`).send(pickupOrder(companyId)).expect(404);
    expect(await ctx.prisma.order.count()).toBe(0);
  });
});

describe("zéro friction — commande sans entreprise", () => {
  it("un client sans entreprise commande, paie par carte, et la retrouve dans /orders/mine", async () => {
    await createUser(ctx.prisma, { auth0Sub: MEMBER });
    await seedPickup();

    const response = await ctx.asSub(MEMBER).post(`/orders`).send(pickupOrder(null)).expect(201);
    const placed = jsonBody<PlacedOrderResponse>(response);
    // 600 HT + TVA 5,5 % (33) = 633 TTC : c'est le TTC qu'on encaisse par carte.
    expect(placed.payment?.amountCents).toBe(633);

    const stored = await ctx.prisma.order.findUniqueOrThrow({ where: { id: placed.id } });
    expect(stored.companyId).toBeNull();
    expect(stored.paymentStatus).toBe("pending");
    expect(stored.stripePaymentIntentId).toBe("pi_e2e");

    const mine = jsonBody<readonly OrderView[]>(
      await ctx.asSub(MEMBER).get(`/orders/mine`).expect(200),
    );
    expect(mine).toHaveLength(1);
    expect(mine[0]?.orderNumber).toBe(placed.orderNumber);
  });

  it("provisionne (JIT) un sub jamais vu et le laisse commander tout de suite", async () => {
    // Aucun `users` semé pour ce sub : la 1re requête authentifiée doit le créer
    // (compte actif, sans société) — c'est le socle du zéro friction.
    const WALKIN = "auth0|walkin";
    await seedPickup();

    await ctx.asSub(WALKIN).post(`/orders`).send(pickupOrder(null)).expect(201);

    const provisioned = await ctx.prisma.user.findUniqueOrThrow({ where: { auth0Sub: WALKIN } });
    expect(provisioned.status).toBe("active");
    expect(provisioned.email).toBe("");
    expect(await ctx.prisma.order.count({ where: { placedByUserId: provisioned.id } })).toBe(1);

    // Le provisioning JIT émet user.registered (câblage resolver→growth). L'acteur
    // est `system` : la personne est provisionnée AVANT que le guard ne résolve son
    // principal (l'identité n'est pas encore établie au premier contact).
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if ((await ctx.prisma.activityEvent.count({ where: { type: "user.registered" } })) > 0) {
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }
    const [registered] = await ctx.prisma.activityEvent.findMany({
      where: { type: "user.registered" },
    });
    expect(registered!.subjectId).toBe(provisioned.id);
    expect(registered!.actorType).toBe("system");
    expect(registered!.idempotencyKey).toBe(`user.registered:${provisioned.id}`);
  });
});

describe("plus de gate d'activation", () => {
  it("une entreprise pending accepte la commande d'un membre (réglée par carte)", async () => {
    const companyId = await seedCompany("pending");
    await seedPickup();

    await ctx.asSub(MEMBER).post(`/orders`).send(pickupOrder(companyId)).expect(201);
    expect(await ctx.prisma.order.count({ where: { companyId } })).toBe(1);
  });
});

describe("checkout → Order", () => {
  it("résout les prix au serveur et persiste la commande + ses lignes", async () => {
    const companyId = await seedCompany("active");
    await seedPickup();

    const response = await ctx
      .asSub(MEMBER)
      .post(`/orders`)
      .send(pickupOrder(companyId))
      .expect(201);
    const placed = jsonBody<PlacedOrderResponse>(response);
    expect(placed.orderNumber).toMatch(/^ORD-/u);

    const list = jsonBody<readonly OrderView[]>(
      await ctx.asSub(MEMBER).get(`/companies/${companyId}/orders`).expect(200),
    );
    expect(list).toHaveLength(1);
    const stored = list[0];
    expect(stored?.note).toBe("Livrer avant 8h");
    // Croissant = 200c au catalogue serveur × 3.
    expect(stored?.lines).toEqual([
      {
        sku: "VIE-001",
        productName: "Croissant",
        unitPriceCents: 200,
        vatRate: 5.5,
        quantity: 3,
        lineTotalCents: 600,
        // Vue de commande : la trace remonte sous sa forme de contrat. Aucune
        // règle en base ici — elle dit donc qu'aucun étage n'a joué.
        pricing: {
          basePriceCents: 200,
          steps: [],
          floored: false,
          floorDecision: null,
          commitment: null,
        },
      },
    ]);
    // Alimentaire → 5,5 % : 600 HT + round(600 × 5,5 %) = 600 + 33 = 633 TTC.
    expect(stored?.subtotalCents).toBe(600);
    expect(stored?.vatCents).toBe(33);
    expect(stored?.totalCents).toBe(633);
  });

  it("refuse un SKU inconnu (400), rien n'est écrit", async () => {
    const companyId = await seedCompany("active");
    await seedPickup();
    await ctx
      .asSub(MEMBER)
      .post(`/orders`)
      .send({ ...pickupOrder(companyId), lines: [{ sku: "NOPE-999", quantity: 1 }] })
      .expect(400);
    expect(await ctx.prisma.order.count({ where: { companyId } })).toBe(0);
  });

  it("en COURSIER, fige l'adresse livrée et déduit le frais de son code postal", async () => {
    await createUser(ctx.prisma, { auth0Sub: MEMBER });
    const zoneId = await seedZone();

    // Aucune zone n'est envoyée : le serveur la déduit du code postal livré.
    const response = await ctx
      .asSub(MEMBER)
      .post(`/orders`)
      .send({
        companyId: null,
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "delivery",
        deliveryAddress: COURIER_ADDR,
        note: "",
        lines: [{ sku: "VIE-001", quantity: 2 }],
      })
      .expect(201);

    const stored = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: jsonBody<PlacedOrderResponse>(response).id },
    });
    expect(stored.fulfillmentMethod).toBe("delivery");
    expect(stored.deliveryZoneId).toBe(zoneId);
    expect(stored.deliveryAddressSnapshot).toEqual(COURIER_ADDR);
    expect(stored.pickupAddress).toBeNull();
    // 2 × 200 = 400 HT ; frais 20 € = 2000 HT. TVA = 5,5 % × 400 (22) + 20 % × 2000
    // (400) = 422. Total TTC = 400 + 2000 + 422 = 2822.
    expect(stored.subtotalCents).toBe(400);
    expect(stored.deliveryFeeCents).toBe(2000);
    expect(stored.vatCents).toBe(422);
    expect(stored.totalCents).toBe(2822);
  });

  it("REFUSE le coursier vers un code postal qu'aucune zone ne dessert", async () => {
    // Le maillage ne couvre que 73150. Livrer ailleurs à frais nul serait une
    // tournée dont personne ne connaît le coût.
    await createUser(ctx.prisma, { auth0Sub: MEMBER });
    await seedZone();

    await ctx
      .asSub(MEMBER)
      .post(`/orders`)
      .send({
        companyId: null,
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "delivery",
        deliveryAddress: { ...COURIER_ADDR, codePostal: "75002", ville: "Paris" },
        note: "",
        lines: [{ sku: "VIE-001", quantity: 2 }],
      })
      .expect(409);

    expect(await ctx.prisma.order.count()).toBe(0);
  });
});

describe("retrait", () => {
  it("passe une commande en RETRAIT : adresse labo figée, sans zone ni adresse de livraison", async () => {
    const companyId = await seedCompany("active");
    await seedPickup();

    const response = await ctx
      .asSub(MEMBER)
      .post(`/orders`)
      .send({
        companyId,
        pickupAddressId: pickupId,
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "pickup",
        note: "",
        lines: [{ sku: "VIE-001", quantity: 2 }],
      })
      .expect(201);

    const stored = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: jsonBody<PlacedOrderResponse>(response).id },
    });
    expect(stored.fulfillmentMethod).toBe("pickup");
    expect(stored.deliveryZoneId).toBeNull();
    expect(stored.deliveryAddressSnapshot).toBeNull();
    expect(stored.pickupAddress).toEqual(LABO);
  });

  it("refuse le retrait si aucun point de retrait n'est configuré (409)", async () => {
    const companyId = await seedCompany("active");
    // Aucun point de retrait semé → résolution nulle → refus.
    await ctx
      .asSub(MEMBER)
      .post(`/orders`)
      .send({
        companyId,
        pickupAddressId: pickupId,
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "pickup",
        note: "",
        lines: [{ sku: "VIE-001", quantity: 1 }],
      })
      .expect(409);
    expect(await ctx.prisma.order.count({ where: { companyId } })).toBe(0);
  });
});

/** Attend l'écriture ÉVENTUELLE du journal (l'@EventsHandler n'est pas attendu par la requête). */
async function waitForActivity(type: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if ((await ctx.prisma.activityEvent.count({ where: { type } })) > 0) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
}

describe("émission du journal (order.placed)", () => {
  it("journalise order.placed sur le client, acteur customer, à la passation", async () => {
    const user = await createUser(ctx.prisma, { auth0Sub: MEMBER });
    await seedPickup();

    const response = await ctx.asSub(MEMBER).post(`/orders`).send(pickupOrder(null)).expect(201);
    const placed = jsonBody<PlacedOrderResponse>(response);

    await waitForActivity("order.placed");
    const events = await ctx.prisma.activityEvent.findMany({ where: { type: "order.placed" } });
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event!.subjectType).toBe("user");
    expect(event!.subjectId).toBe(user.id);
    expect(event!.actorType).toBe("customer"); // le middleware d'ingress a résolu le principal
    expect(event!.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(event!.idempotencyKey).toBe(`order.placed:${placed.id}`);
    expect(event!.payload).toMatchObject({
      orderId: placed.id,
      orderNumber: placed.orderNumber,
      companyId: null,
      totalCents: 633,
    });
  });
});

describe("un SKU n'apparaît qu'une fois par commande", () => {
  /**
   * Régression : rien n'interdisait deux lignes du même produit dans une
   * commande. « La quantité commandée d'un produit » n'avait alors pas de
   * définition unique, et toute moyenne par SKU dépendait de la façon dont le
   * panier avait été saisi. `place-order` fusionne, et l'index unique
   * `(order_id, sku)` rend la règle structurelle — c'est le vrai SQL qui le
   * prouve, pas le handler.
   */
  it("fusionne deux lignes du même SKU en une seule, quantités sommées", async () => {
    const companyId = await seedCompany("active");
    await seedPickup();

    const response = await ctx
      .asSub(ADMIN)
      .post("/orders")
      .send({
        ...pickupOrder(companyId),
        lines: [
          { sku: "VIE-001", quantity: 2 },
          { sku: "VIE-001", quantity: 5 },
        ],
      })
      .expect(201);

    const placed = jsonBody<PlacedOrderResponse>(response);
    const lines = await ctx.prisma.orderLine.findMany({ where: { orderId: placed.id } });

    expect(lines).toHaveLength(1);
    expect(lines[0]?.quantity).toBe(7);
  });

  it("la base refuse le doublon, même écrit par un chemin qui contournerait le handler", async () => {
    const companyId = await seedCompany("active");
    await seedPickup();
    const placed = jsonBody<PlacedOrderResponse>(
      await ctx.asSub(ADMIN).post("/orders").send(pickupOrder(companyId)).expect(201),
    );
    const existing = await ctx.prisma.orderLine.findFirstOrThrow({ where: { orderId: placed.id } });

    // L'invariant est dans le schéma, pas seulement dans le code applicatif :
    // un import, un seed ou un futur handler ne peuvent pas le contourner.
    await expect(
      ctx.prisma.orderLine.create({
        data: {
          orderId: placed.id,
          sku: existing.sku,
          productNameSnapshot: existing.productNameSnapshot,
          unitPriceCents: existing.unitPriceCents,
          quantity: 1,
          lineTotalCents: existing.unitPriceCents,
        },
      }),
    ).rejects.toThrow();
  });
});

/**
 * **Le devis client** — ce que le panier annoncera avant de commander.
 *
 * Le front client porte sa propre copie du catalogue : il affichait donc le
 * tarif de cette copie pendant que le serveur facturait le prix résolu. Le
 * client voyait un montant et en payait un autre.
 *
 * Le cas qui compte le plus n'est pas le prix : c'est le **mur**. Un devis rend
 * un prix NÉGOCIÉ ; s'il acceptait n'importe quel `companyId`, on sonderait la
 * mercuriale d'un concurrent en devinant son identifiant.
 */
describe("POST /orders/quote", () => {
  it("refuse d'estimer pour une société dont on n'est pas membre", async () => {
    const companyId = await seedCompany("active");

    await ctx
      .asSub(STRANGER)
      .post("/orders/quote")
      .send({ companyId, lines: [{ sku: "VIE-001", quantity: 6 }] })
      .expect(404);
  });

  it("estime pour sa propre société", async () => {
    const companyId = await seedCompany("active");

    const body = jsonBody<{
      lines: { sku: string; unitPriceCents: number }[];
      subtotalCents: number;
    }>(
      await ctx
        .asSub(MEMBER)
        .post("/orders/quote")
        .send({ companyId, lines: [{ sku: "VIE-001", quantity: 6 }] })
        .expect(200),
    );

    expect(body.lines[0]?.sku).toBe("VIE-001");
    expect(body.subtotalCents).toBe(body.lines[0]!.unitPriceCents * 6);
  });

  /** Le parcours zéro friction : sans société, seules les règles ouvertes à tous jouent. */
  it("estime sans société, pour un client de passage", async () => {
    const WALKIN = "auth0|walkin-quote";
    const body = jsonBody<{ lines: { unitPriceCents: number }[] }>(
      await ctx
        .asSub(WALKIN)
        .post("/orders/quote")
        .send({ companyId: null, lines: [{ sku: "VIE-001", quantity: 2 }] })
        .expect(200),
    );

    expect(body.lines[0]?.unitPriceCents).toBe(200);
  });
});
