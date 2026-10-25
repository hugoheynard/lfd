/**
 * E2E de **ce que les vues disent de la modification** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, §6, M3) : la
 * modificabilité et la révision sur `GET /orders/:id` (client) et
 * `GET /admin/orders/:id` (équipe), l'identifiant du point de retrait, et
 * l'historique `GET /admin/orders/:id/revisions`.
 *
 * Ce que seul le vrai SQL prouve : que la vue dit la MÊME règle que le geste
 * (heure limite pour le client seulement, inscription au fournil pour tous,
 * carte refusée), que le point relu est celui figé à la passation, et que la
 * composition remplacée se relit telle qu'elle a été écrite.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`) et Stripe.
 */
import {
  PERSONAL_WORKSPACE,
  WORKSPACE_HEADER,
  type AdminOrderView,
  type AdminPlacedOrderResponse,
  type CustomerOrderDetailView,
  type OrderRevisionEntryView,
  type RoleGrant,
} from "@lfd/contracts";
import { randomUUID } from "node:crypto";
import type request from "supertest";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const DAY = serviceDay(7);
const BUYER = "auth0|acheteur-vues-revision";

let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({
      paymentIntentId: `pi_vues_${String(intentCounter)}`,
      clientSecret: `pi_vues_${String(intentCounter)}_secret`,
    });
  },
  retrieveIntent: (id: string) =>
    Promise.resolve({
      paymentIntentId: id,
      clientSecret: `${id}_secret`,
      state: "awaiting_payment",
    }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, { token: PaymentGateway, value: fakeGateway }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);
const buyer = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(BUYER);

interface Scene {
  readonly orderId: string;
  readonly pickupId: string;
}

/** La commande voulue : un retrait au Labo, `DAY`, 10 croissants par défaut. */
function content(pickupId: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requestedDeliveryDate: DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku: "VIE-001", quantity: 10 }],
    ...over,
  };
}

/** Un point de retrait, une société au compte, son acheteur, et sa commande saisie par l'équipe. */
async function scene(): Promise<Scene> {
  const point = await ctx.prisma.site.create({
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
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const user = await createUser(ctx.prisma, {
    auth0Sub: BUYER,
    email: "acheteur-vues@test.fr",
    firstName: "Léa",
    lastName: "Martin",
  });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  const placed = jsonBody<AdminPlacedOrderResponse>(
    await staff()
      .post("/admin/orders")
      .send({
        companyId: company.id,
        buyerUserId: user.id,
        settlement: "account",
        ...content(point.id),
      })
      .expect(201),
  );
  return { orderId: placed.id, pickupId: point.id };
}

async function customerView(orderId: string): Promise<CustomerOrderDetailView> {
  return jsonBody<CustomerOrderDetailView>(await buyer().get(`/orders/${orderId}`).expect(200));
}

async function adminView(orderId: string): Promise<AdminOrderView> {
  return jsonBody<AdminOrderView>(await staff().get(`/admin/orders/${orderId}`).expect(200));
}

describe("GET /orders/:id et /admin/orders/:id — la modification dite par la vue", () => {
  it("une commande au compte, avant toute limite : modifiable des deux côtés, révision 0, point relu", async () => {
    const { orderId, pickupId } = await scene();

    const mine = await customerView(orderId);
    const theirs = await adminView(orderId);

    expect(mine).toMatchObject({
      revisability: { revisable: true, until: null },
      revision: 0,
      pickupAddressId: pickupId,
    });
    expect(theirs).toMatchObject({
      revisability: { revisable: true },
      revision: 0,
      pickupAddressId: pickupId,
    });
  });

  it("la révision monte avec la modification", async () => {
    const { orderId, pickupId } = await scene();
    await buyer()
      .post(`/orders/${orderId}/revisions`)
      .send({ expectedRevision: 0, ...content(pickupId, { note: "Porte de derrière" }) })
      .expect(200);

    expect((await customerView(orderId)).revision).toBe(1);
    expect((await adminView(orderId)).revision).toBe(1);
  });

  it("après l'heure limite : trop tard pour le client, avec l'échéance ; l'équipe peut encore", async () => {
    const { orderId } = await scene();
    // La limite du jour de service est tombée l'avant-veille à minuit.
    await ctx.prisma.orderCutoff.create({
      data: { pickupAddressId: null, weekday: null, daysBefore: 8, time: "00:00", graceMinutes: 0 },
    });

    const mine = await customerView(orderId);

    expect(mine.revisability).toMatchObject({ revisable: false, code: "too_late" });
    expect(mine.revisability.until).not.toBeNull();
    expect((await adminView(orderId)).revisability).toEqual({ revisable: true });
  });

  // A2 (2026-10-25) : après l'arrêt, l'équipe garde les QUANTITÉS d'une commande au compte.
  it("inscrite au fournil : fermée au client ; l'équipe peut, en quantités seulement", async () => {
    const { orderId } = await scene();
    await staff().post(`/admin/production/batch/${DAY}/close`).expect(201);
    await ctx.drain();

    expect((await customerView(orderId)).revisability).toMatchObject({
      revisable: false,
      code: "in_preparation",
    });
    const theirs = await adminView(orderId);
    expect(theirs.revisability).toMatchObject({ revisable: true });
    expect(JSON.stringify(theirs.revisability)).toContain("seules les quantités");
  });

  it("réglée par carte : le client lit `card_settled`, l'équipe la raison", async () => {
    const { pickupId } = await scene();
    const placed = jsonBody<{ id: string }>(
      await buyer()
        .post("/orders")
        .set(WORKSPACE_HEADER, PERSONAL_WORKSPACE)
        .send({ idempotencyKey: randomUUID(), settlement: "card", ...content(pickupId) })
        .expect(201),
    );

    expect((await customerView(placed.id)).revisability).toMatchObject({
      revisable: false,
      code: "card_settled",
    });
    expect(JSON.stringify((await adminView(placed.id)).revisability)).toContain(
      "Commande réglée par carte",
    );
  });
});

describe("GET /admin/orders/:id/revisions — les versions précédentes", () => {
  it("rend chaque modification, la plus récente en tête, avec la composition remplacée", async () => {
    const { orderId, pickupId } = await scene();
    const before = await adminView(orderId);
    await buyer()
      .post(`/orders/${orderId}/revisions`)
      .send({
        expectedRevision: 0,
        ...content(pickupId, { lines: [{ sku: "VIE-001", quantity: 20 }] }),
      })
      .expect(200);
    await staff()
      .post(`/admin/orders/${orderId}/revisions`)
      .send({
        expectedRevision: 1,
        ...content(pickupId, { lines: [{ sku: "VIE-001", quantity: 20 }], note: "Équipe" }),
      })
      .expect(200);

    const entries = jsonBody<OrderRevisionEntryView[]>(
      await staff().get(`/admin/orders/${orderId}/revisions`).expect(200),
    );

    expect(entries.map((entry) => [entry.replacedRevision, entry.author.kind])).toEqual([
      [1, "staff"],
      [0, "customer"],
    ]);
    const first = entries[1];
    expect(first).toMatchObject({
      author: { kind: "customer", name: "Léa Martin" },
      changes: ["lines"],
      totalBeforeCents: before.totalCents,
    });
    expect(first?.replaced).toMatchObject({
      requestedDeliveryDate: DAY,
      fulfillmentMethod: "pickup",
      pickupAddress: { label: "Labo", ligne1: "1 rue du Four" },
      window: { start: "07:00", end: "08:00" },
      totalCents: before.totalCents,
      lines: [{ sku: "VIE-001", quantity: 10, unitPriceMillicents: 200_000 }],
    });
  });

  it("une commande jamais modifiée : une liste vide ; inconnue : 404", async () => {
    const { orderId } = await scene();

    await expect(
      staff()
        .get(`/admin/orders/${orderId}/revisions`)
        .expect(200)
        .then((response) => jsonBody<OrderRevisionEntryView[]>(response)),
    ).resolves.toEqual([]);
    await staff().get("/admin/orders/absente/revisions").expect(404);
  });

  /** Un rôle créé à l'écran, qui ne tient que ces droits, et une personne qui le porte. */
  async function holderOf(key: string, grants: readonly RoleGrant[]): Promise<request.Agent> {
    await staff().post("/admin/staff-roles").send({ key, label: key, grants }).expect(201);
    const sub = `staff-${key}`;
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: key,
        email: `${key}@lfc.test`,
        role: null,
        roleKey: key,
        status: "active",
        auth0Id: sub,
      },
    });
    return ctx.asSub(sub);
  }

  it("reste fermée en 403 à qui ne lit pas les commandes", async () => {
    const { orderId } = await scene();
    const agent = await holderOf("retrait-seul", [
      { resource: "handover_counter", action: "read" },
    ]);

    await agent.get(`/admin/orders/${orderId}/revisions`).expect(403);
  });
});
