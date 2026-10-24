/**
 * E2E de la **fiche client commerciale** — vrai Postgres.
 *
 * Ce que seul le vrai SQL prouve : les agrégats sont demandés à la base, sur les
 * bons statuts et les bonnes fenêtres. Une commande annulée ne compte pas, un
 * brouillon non plus, et la fenêtre des 30 jours ne déborde pas sur la
 * précédente — trois erreurs qu'un test en mémoire ne verrait jamais.
 *
 * Les commandes sont passées au compte par le vrai chemin (`placeOrder`,
 * plan T), antidatées ; les montants attendus sont RELUS sur la commande
 * passée, jamais recopiés — le prix est celui du catalogue.
 */
import type { CustomerSheetView } from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";

import { CancelOrderCommand } from "../src/b2b/orders/application/commands/cancel-order.command.js";
import { CustomerRole } from "../src/platform/database/client/client.js";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_ID, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { pickupSite, placeOrder as placeTestOrder } from "./order-factory.js";

const OWNER = "auth0|owner";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

function staff(): ReturnType<E2eContext["http"]> {
  return ctx.http().set("Authorization", "Bearer staff-e2e");
}

/** Une société active au compte, son détenteur, et de quoi commander. */
async function seed(): Promise<{ companyId: string; userId: string }> {
  const owner = await createUser(ctx.prisma, { auth0Sub: OWNER });
  const company = await createCompany(ctx.prisma, { status: "active" });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: ["monthly"] },
  });
  await attachTo(ctx.prisma, owner.id, company.id, CustomerRole.owner);
  return { companyId: company.id, userId: owner.id };
}

/** Ce que devient la commande après sa passation. */
type Outcome = "placed" | "cancelled";

/**
 * Passe une commande `daysAgo` jours en arrière, de `units` croissants, et
 * rend le total TTC que la passation a facturé.
 */
async function placeOrder(
  seeded: { companyId: string; userId: string },
  daysAgo: number,
  units: number,
  outcome: Outcome = "placed",
): Promise<number> {
  const order = await placeTestOrder(ctx, {
    buyerUserId: seeded.userId,
    companyId: seeded.companyId,
    settlement: "account",
    placedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    lines: [{ sku: "VIE-001", quantity: units }],
  });
  if (outcome === "cancelled") {
    await ctx.app
      .get(CommandBus)
      .execute(new CancelOrderCommand(order.id, E2E_STAFF_ID, "Le client renonce."));
    await ctx.drain();
  }
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    select: { totalCents: true },
  });
  return row.totalCents;
}

/**
 * Une commande au statut `draft`, écrite en base. **Exception gardée du plan T
 * (2026-10-25)** : aucune route n'écrit plus ce statut — un brouillon de
 * l'équipe vit dans `order_drafts` depuis la saisie staff (vérifié le
 * 2026-10-25 : aucun écrivain de `status: draft` sous `src/b2b/orders`). Les
 * lecteurs l'écartent encore, et ce filtre-là ne s'éprouve qu'en le semant.
 * Numéro au format réel, hors de portée de la séquence de la suite.
 */
async function legacyDraft(seeded: { companyId: string; userId: string }): Promise<void> {
  await ctx.prisma.order.create({
    data: {
      orderNumber: "ORD-900001",
      companyId: seeded.companyId,
      placedByUserId: seeded.userId,
      status: "draft",
      subtotalCents: 99_000,
      totalCents: 99_000,
    },
  });
}

async function sheet(companyId: string): Promise<CustomerSheetView> {
  const response = await staff().get(`/admin/companies/${companyId}/customer-sheet`).expect(200);
  return jsonBody<CustomerSheetView>(response);
}

describe("la fiche client", () => {
  it("mure la route (401 sans jeton staff)", async () => {
    const { companyId } = await seed();
    await ctx.http().get(`/admin/companies/${companyId}/customer-sheet`).expect(401);
  });

  it("rend 404 sur une société inconnue", async () => {
    await staff().get("/admin/companies/cmp_inconnue/customer-sheet").expect(404);
  });

  it("porte l'identité et l'ancienneté du compte", async () => {
    const { companyId } = await seed();
    const view = await sheet(companyId);
    expect(view).toMatchObject({ companyId, status: "active" });
    expect(view.reference).toMatch(/^C-/u);
    expect(new Date(view.createdAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("somme le chiffre, compte les commandes et en tire le panier moyen", async () => {
    const seeded = await seed();
    const first = await placeOrder(seeded, 3, 10);
    const second = await placeOrder(seeded, 5, 20);

    const view = await sheet(seeded.companyId);
    expect(view.stats).toMatchObject({
      totalSpentCents: first + second,
      ordersCount: 2,
      averageTicketCents: Math.round((first + second) / 2),
    });
  });

  it("EXCLUT les annulées et les brouillons — ils n'ont jamais été de l'argent", async () => {
    const seeded = await seed();
    const kept = await placeOrder(seeded, 3, 10);
    await placeOrder(seeded, 3, 40, "cancelled");
    await legacyDraft(seeded);

    const view = await sheet(seeded.companyId);
    expect(view.stats).toMatchObject({ totalSpentCents: kept, ordersCount: 1 });
  });

  it("compare les 30 derniers jours aux 30 PRÉCÉDENTS, sans les mélanger", async () => {
    const seeded = await seed();
    const current = await placeOrder(seeded, 10, 12); // fenêtre courante
    const previous = await placeOrder(seeded, 40, 10); // fenêtre précédente
    await placeOrder(seeded, 90, 50); // hors des deux

    const view = await sheet(seeded.companyId);
    expect(view.stats.trend).toMatchObject({
      last30Cents: current,
      previous30Cents: previous,
      percent: Math.round(((current - previous) / previous) * 100),
      direction: "up",
    });
  });

  it("rend les commandes récentes, de la plus récente à la plus ancienne", async () => {
    const seeded = await seed();
    const older = await placeOrder(seeded, 10, 10);
    const newer = await placeOrder(seeded, 2, 20);

    const view = await sheet(seeded.companyId);
    expect(view.recentOrders.map((order) => order.totalCents)).toEqual([newer, older]);
    // Les annulées RESTENT listées : le commercial doit les voir pour en parler.
    expect(view.recentOrders).toHaveLength(2);
  });

  it("en rend CINQ au plus — la carte les affiche toutes", async () => {
    // La carte de la fiche n'a ni pagination ni défilement : ce que la route
    // rend est ce que le commercial lit. Sans ce plafond en base, ajouter une
    // commande allongeait un écran que personne n'avait décidé d'allonger.
    const seeded = await seed();
    const totals: number[] = [];
    for (let daysAgo = 1; daysAgo <= 7; daysAgo += 1) {
      totals.push(await placeOrder(seeded, daysAgo, daysAgo));
    }

    const view = await sheet(seeded.companyId);
    expect(view.recentOrders).toHaveLength(5);
    // Les CINQ plus récentes, pas les cinq premières venues.
    expect(view.recentOrders.map((order) => order.totalCents)).toEqual(totals.slice(0, 5));
  });

  it("remonte l'historique d'interaction depuis le JOURNAL, du plus récent au plus ancien", async () => {
    const { companyId } = await seed();
    const record = async (type: string, minutesAgo: number): Promise<void> => {
      await ctx.prisma.activityEvent.create({
        data: {
          id: `evt_${type}_${minutesAgo}`,
          type,
          occurredAt: new Date(Date.now() - minutesAgo * 60 * 1000),
          subjectType: "company",
          subjectId: companyId,
          actorType: "staff",
          traceId: "trace-e2e",
          idempotencyKey: `${type}:${minutesAgo}`,
          payload: {},
        },
      });
    };
    await record("company.declared", 120);
    await record("order.placed", 10);

    const view = await sheet(companyId);
    expect(view.timeline.map((entry) => entry.type)).toEqual(["order.placed", "company.declared"]);
    expect(view.timeline[0]?.actorType).toBe("staff");
  });

  it("n'emporte PAS le journal d'une autre société", async () => {
    const { companyId } = await seed();
    const other = await createCompany(ctx.prisma, { status: "active" });
    await ctx.prisma.activityEvent.create({
      data: {
        id: "evt_autre",
        type: "order.placed",
        occurredAt: new Date(),
        subjectType: "company",
        subjectId: other.id,
        actorType: "customer",
        traceId: "trace-e2e",
        idempotencyKey: "autre:1",
        payload: {},
      },
    });
    expect((await sheet(companyId)).timeline).toEqual([]);
  });

  it("ne compte aucun panier récurrent quand il n'y en a pas", async () => {
    const { companyId } = await seed();
    expect((await sheet(companyId)).stats.recurringBasketsCount).toBe(0);
  });
});

describe("l'état du compte", () => {
  async function change(companyId: string, action: string, reason = "motif"): Promise<number> {
    const response = await staff()
      .patch(`/admin/companies/${companyId}/status`)
      .send({ action, reason });
    return response.status;
  }

  it("suspend puis réactive un compte actif", async () => {
    const { companyId } = await seed();
    expect(await change(companyId, "suspend")).toBe(204);
    expect((await sheet(companyId)).status).toBe("suspended");

    expect(await change(companyId, "reactivate")).toBe(204);
    expect((await sheet(companyId)).status).toBe("active");
  });

  it("résilie, et REFUSE de résilier deux fois — l'état est terminal", async () => {
    const { companyId } = await seed();
    expect(await change(companyId, "terminate")).toBe(204);
    expect((await sheet(companyId)).status).toBe("terminated");
    expect(await change(companyId, "terminate")).toBe(409);
  });

  it("refuse de suspendre un compte jamais activé", async () => {
    const pending = await createCompany(ctx.prisma, { status: "pending" });
    expect(await change(pending.id, "suspend")).toBe(409);
  });

  it("exige un motif pour suspendre et pour résilier, jamais pour réactiver", async () => {
    const { companyId } = await seed();
    expect(await change(companyId, "suspend", "")).toBe(400);
    expect(await change(companyId, "suspend")).toBe(204);
    expect(await change(companyId, "reactivate", "")).toBe(204);
  });

  it("mure la route (401 sans jeton staff)", async () => {
    const { companyId } = await seed();
    await ctx
      .http()
      .patch(`/admin/companies/${companyId}/status`)
      .send({ action: "suspend", reason: "test" })
      .expect(401);
  });
});

/**
 * L'en-tête de la fiche porte le principal d'un sous-compte (T28) — et ce
 * qu'il est pour lui, déduit du suivi `billing` en cours (T29).
 */
describe("le principal d'un sous-compte, dans l'en-tête", () => {
  const DELIVERY = {
    label: "Chalet",
    ligne1: "12 route des Praz",
    ligne2: "",
    codePostal: "74400",
    ville: "Chamonix",
    pays: "France",
    isDefault: true,
    specs: {
      signatureRequired: false,
      note: "",
      slotList: { mode: "everyday", slots: [] },
      deliveryContact: null,
      gps: null,
    },
  };

  async function subAccountOf(parentId: string, follows: readonly string[]): Promise<string> {
    const response = await staff()
      .post(`/admin/companies/${parentId}/sub-accounts`)
      .send({ enseigne: "Chalet Edelweiss", deliveryAddress: DELIVERY, follows })
      .expect(201);
    return jsonBody<{ id: string }>(response).id;
  }

  it("un compte sans principal n'en porte pas", async () => {
    const { companyId } = await seed();
    expect((await sheet(companyId)).parent).toBeNull();
  });

  it("un sous-compte facturé au nom du principal est un SITE", async () => {
    const group = await createCompany(ctx.prisma, { enseigne: "Alpes Chalets", status: "active" });
    const chalet = await subAccountOf(group.id, ["billing"]);

    expect((await sheet(chalet)).parent).toEqual({
      id: group.id,
      enseigne: "Alpes Chalets",
      kind: "site",
    });
  });

  it("un sous-compte qui règle seul est une ENTITÉ", async () => {
    const group = await createCompany(ctx.prisma, { enseigne: "Club Med", status: "active" });
    const entity = await subAccountOf(group.id, []);

    expect((await sheet(entity)).parent).toEqual({
      id: group.id,
      enseigne: "Club Med",
      kind: "entity",
    });
  });
});
