/**
 * E2E des **alertes de compte client**, sur un vrai Postgres.
 *
 * Ce que seul le vrai SQL prouve : que passer une commande déclenche réellement
 * l'évaluation (l'événement traverse le bus), que la clé d'idempotence tient sous
 * une vraie contrainte unique, que les filtres d'historique portent (annulées
 * exclues, commande courante exclue), et que la médiane sort de `percentile_cont`
 * et non d'un tri en mémoire.
 */
import { ALERT_KINDS, type AccountAlertView, type OrderPreflightView } from "@lfd/contracts";

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

/** Passe une commande retrait d'un SKU donné. */
async function orderSku(companyId: string, sku: string, quantity: number): Promise<void> {
  await ctx
    .asSub(CLIENT)
    .post("/orders")
    .send({ companyId, fulfillmentMethod: "pickup", note: "", lines: [{ sku, quantity }] })
    .expect(201);
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

/**
 * Attend qu'une condition devienne vraie.
 *
 * L'évaluation est déclenchée par `order.placed` sur le bus d'événements : le
 * handler n'est **pas attendu** par la requête HTTP, donc la commande répond
 * avant que l'alerte ne soit écrite. Sonder est la seule façon honnête de
 * tester ce chemin — et c'est aussi ce qui rappelle qu'un consommateur ne doit
 * jamais compter sur l'ordre.
 */
async function eventually<T>(read: () => Promise<T>, until: (value: T) => boolean): Promise<T> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const value = await read();
    if (until(value)) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("La condition attendue n'est jamais survenue.");
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

    // Un produit INÉDIT sur la deuxième commande : c'est le cas qui doit parler.
    await orderSku(companyId, "VIE-002", 2);

    const alerts = await eventually(
      () => alertsOf(companyId),
      (found) => found.length > 0,
    );
    expect(alerts[0]?.kind).toBe("product.first_order");
    expect(alerts[0]?.findings[0]?.sku).toBe("VIE-002");
  });

  it("ne signale pas un produit déjà commandé", async () => {
    const companyId = await seed();
    await order(companyId, 3);

    await order(companyId, 3);

    // Rien à attendre ici : on vérifie une ABSENCE, donc on laisse le temps au
    // handler de tourner avant de conclure.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await alertsOf(companyId)).toHaveLength(0);
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

describe("les réglages globaux", () => {
  /** La règle telle que le serveur la rend, avec sa version. */
  async function readRule(kind: string) {
    const rules = jsonBody<{ kind: string; updatedAt: string | null }[]>(
      await staff().get("/admin/alert-rules").expect(200),
    );
    return rules.find((rule) => rule.kind === kind);
  }

  const DRIFT_RULE = {
    enabled: true,
    params: {
      kind: "product.quantity_drift",
      riseTiers: [{ upToQuantity: null, thresholdPercent: 150 }],
      dropTiers: [{ upToQuantity: null, thresholdPercent: 40 }],
      direction: "both",
      baselineOrders: 6,
      minBaselineOrders: 3,
      windowDays: 365,
    },
    delivery: { staffInApp: true, staffEmail: false, customerVisible: false },
  };

  it("écrit quand la version annoncée est la bonne", async () => {
    await staff()
      .put("/admin/alert-rules")
      .send({ rule: DRIFT_RULE, expectedUpdatedAt: null })
      .expect(204);

    const written = await readRule("product.quantity_drift");
    expect(written?.updatedAt).not.toBeNull();
  });

  /**
   * Régression : sans version, deux commerciaux sur l'écran Réglages s'écrasaient
   * en silence — le second gagnait, et le premier n'apprenait jamais que son
   * changement avait disparu.
   */
  it("refuse une écriture fondée sur une version périmée", async () => {
    await staff()
      .put("/admin/alert-rules")
      .send({ rule: DRIFT_RULE, expectedUpdatedAt: null })
      .expect(204);

    // Le second croit encore que le type n'a jamais été réglé.
    await staff()
      .put("/admin/alert-rules")
      .send({ rule: DRIFT_RULE, expectedUpdatedAt: null })
      .expect(409);
  });

  it("accepte une seconde écriture qui annonce la version courante", async () => {
    await staff()
      .put("/admin/alert-rules")
      .send({ rule: DRIFT_RULE, expectedUpdatedAt: null })
      .expect(204);
    const current = await readRule("product.quantity_drift");

    await staff()
      .put("/admin/alert-rules")
      .send({ rule: DRIFT_RULE, expectedUpdatedAt: current?.updatedAt })
      .expect(204);
  });
});

describe("les dérogations d'un compte inconnu", () => {
  const OFF = { kind: "product.first_order", mode: "off" };

  /**
   * Régression : écrire sur un identifiant inconnu remontait une violation de
   * clé étrangère, donc un 500 — une erreur d'appelant ordinaire réveillait
   * l'astreinte.
   */
  it("répondent 404, pas 500", async () => {
    await staff().put("/admin/companies/inconnue/alert-rules").send(OFF).expect(404);
  });

  it("valent aussi pour l'effacement", async () => {
    await staff().delete("/admin/companies/inconnue/alert-rules/product.first_order").expect(404);
  });

  it("laissent passer un compte qui existe", async () => {
    const companyId = await seed();

    await staff().put(`/admin/companies/${companyId}/alert-rules`).send(OFF).expect(204);
    await staff()
      .delete(`/admin/companies/${companyId}/alert-rules/product.first_order`)
      .expect(204);
  });
});

describe("la cloche du back-office", () => {
  it("sonne quand une alerte se déclenche, et se marque lue", async () => {
    const companyId = await seed();
    await order(companyId, 3);
    // Deuxième commande, produit inédit : une alerte, donc une notification.
    await orderSku(companyId, "VIE-002", 2);

    const before = await eventually(
      async () =>
        jsonBody<{ unread: number; notifications: { id: string }[] }>(
          await staff().get("/admin/notifications").expect(200),
        ),
      (summary) => summary.unread > 0,
    );
    expect(before.unread).toBe(1);

    await staff().post(`/admin/notifications/${before.notifications[0]?.id}/read`).expect(204);

    const after = jsonBody<{ unread: number }>(
      await staff().get("/admin/notifications").expect(200),
    );
    expect(after.unread).toBe(0);
  });

  it("ne sonne pas deux fois pour le même fait", async () => {
    const companyId = await seed();
    await order(companyId, 3);
    await order(companyId, 3);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const summary = jsonBody<{ unread: number }>(
      await staff().get("/admin/notifications").expect(200),
    );

    // Le SKU a déjà été commandé : aucune alerte, donc aucune notification.
    expect(summary.unread).toBe(0);
  });
});

describe("le garde-fou du panier", () => {
  /** Coche « afficher au client » sur l'écart à la moyenne — il ne l'est pas par défaut. */
  async function showDriftToCustomer(): Promise<void> {
    const defaults = ALERT_KINDS["product.quantity_drift"].defaults;
    await staff()
      .put("/admin/alert-rules")
      .send({
        rule: { ...defaults, delivery: { ...defaults.delivery, customerVisible: true } },
        expectedUpdatedAt: null,
      })
      .expect(204);
  }

  /** Construit une habitude : trois commandes du même SKU, même quantité. */
  async function habit(companyId: string, quantity: number): Promise<void> {
    await order(companyId, quantity);
    await order(companyId, quantity);
    await order(companyId, quantity);
  }

  function preflight(body: unknown): ReturnType<ReturnType<E2eContext["asSub"]>["post"]> {
    return ctx.asSub(CLIENT).post("/orders/preflight").send(body);
  }

  it("prévient sous la ligne quand la quantité s'écarte de l'habitude", async () => {
    const companyId = await seed();
    await showDriftToCustomer();
    await habit(companyId, 4);

    const view = jsonBody<OrderPreflightView>(
      await preflight({ companyId, lines: [{ sku: SKU, quantity: 12 }] }).expect(200),
    );

    expect(view.warnings).toHaveLength(1);
    expect(view.warnings[0]?.sku).toBe(SKU);
    // La phrase est celle du client : sa référence, puis ce que ce panier porte.
    expect(view.warnings[0]?.message).toContain("Habituellement 4");
    expect(view.warnings[0]?.message).toContain("12");
    expect(view.warnings[0]?.message).not.toContain("%");
  });

  it("n'écrit rien au journal — c'est une lecture", async () => {
    const companyId = await seed();
    await showDriftToCustomer();
    await habit(companyId, 4);

    await preflight({ companyId, lines: [{ sku: SKU, quantity: 12 }] }).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Les alertes du journal ne viennent que des commandes passées, jamais du
    // contrôle : sinon ajuster une quantité dix fois écrirait dix alertes.
    const journal = await alertsOf(companyId);
    expect(journal.filter((alert) => alert.kind === "product.quantity_drift")).toHaveLength(0);
  });

  it("se tait quand la règle n'est pas cochée « client »", async () => {
    const companyId = await seed();
    await habit(companyId, 4);

    const view = jsonBody<OrderPreflightView>(
      await preflight({ companyId, lines: [{ sku: SKU, quantity: 12 }] }).expect(200),
    );

    expect(view.warnings).toHaveLength(0);
  });

  it("ne montre pas l'habitude d'un compte dont on n'est pas membre", async () => {
    const companyId = await seed();
    await showDriftToCustomer();
    await habit(companyId, 4);
    // Un autre client connecté, étranger à ce compte : il ne doit rien apprendre
    // des volumes d'achat de celui-là.
    await createUser(ctx.prisma, { auth0Sub: "auth0|autre" });

    const view = jsonBody<OrderPreflightView>(
      await ctx
        .asSub("auth0|autre")
        .post("/orders/preflight")
        .send({ companyId, lines: [{ sku: SKU, quantity: 12 }] })
        .expect(200),
    );

    expect(view.warnings).toHaveLength(0);
  });

  it("répond vide, sans erreur, pour une commande sans société", async () => {
    await showDriftToCustomer();

    const view = jsonBody<OrderPreflightView>(
      await preflight({ companyId: null, lines: [{ sku: SKU, quantity: 12 }] }).expect(200),
    );

    // Zéro friction : aucun compte, donc aucun historique. Ce n'est pas une
    // erreur — l'écran n'a rien à afficher, c'est tout.
    expect(view.warnings).toHaveLength(0);
  });
});
