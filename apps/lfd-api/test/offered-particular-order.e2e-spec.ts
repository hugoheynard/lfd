/**
 * E2E de la **commande offerte à un particulier**
 * (`POST /admin/offered-orders/particular`) — lot O7a de
 * `documentation/commandes/passation/la-commande-offerte.md`, § 2.5.
 *
 * Ce qui ne se prouve qu'ici : le mur du particulier lu par le SQL
 * d'`account` (membre de société, fiche désactivée), la livraison fermée aux
 * particuliers par le vrai réglage, le droit d'offrir lu en base, le témoin
 * `order.offered` dans la vraie boîte d'envoi, la révision par l'équipe d'une
 * commande sans société, et ce que la liste et la fiche staff en disent. Les
 * jours sont relatifs (`serviceDay`). L'estimation (O7c) rend la valeur
 * offerte que la passation écrit, sans rien écrire.
 */
import type {
  AdminOrderEstimateView,
  AdminOrdersPage,
  AdminOrderView,
  CreatedPickupResponse,
  OfferedParticularPlacedOrderResponse,
} from "@lfd/contracts";

import { PricingMaterialsCache } from "../src/lafoliecoffee/pricing/infrastructure/pricing-materials.cache.js";
import { StaffAccessCache } from "../src/staff/permissions/staff-access-cache.port.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus, CustomerRole, UserStatus } from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const ROUTE = "/admin/offered-orders/particular";
const SERVICE_DAY = serviceDay();
const WINDOW = { start: "07:00", end: "08:00" };
const LINES = [
  { sku: "VIE-001-1", quantity: 8 },
  { sku: "PAI-001-1", quantity: 4 },
];
const OFFER = { nature: "event", note: "Dégustation pour un mariage", notifyCustomer: false };

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
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
  ctx.app.get(PricingMaterialsCache).invalidate();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

interface Scene {
  readonly site: string;
  readonly particularId: string;
  readonly memberId: string;
  readonly disabledId: string;
}

/** Un point de retrait, un particulier, un membre de société, une fiche désactivée. */
async function scene(): Promise<Scene> {
  const particular = await createUser(ctx.prisma, { auth0Sub: "auth0|o7a-particulier" });
  const disabled = await createUser(ctx.prisma, {
    auth0Sub: "auth0|o7a-desactive",
    status: UserStatus.disabled,
  });
  const member = await createUser(ctx.prisma, { auth0Sub: "auth0|o7a-pro" });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.owner);
  const site = jsonBody<CreatedPickupResponse>(
    await staff()
      .post("/admin/pickup-addresses")
      .set(INTENT_KEY, freshIntent())
      .send({
        label: "Le Labo",
        ligne1: "5 rue du Four",
        ligne2: "",
        codePostal: "75002",
        ville: "Paris",
        pays: "France",
        discounts: { b2b: null, b2c: null },
      })
      .expect(201),
  ).id;
  ctx.app.get(PricingMaterialsCache).invalidate();
  return {
    site,
    particularId: particular.id,
    memberId: member.id,
    disabledId: disabled.id,
  };
}

function basket(site: string, buyerUserId: string): Record<string, unknown> {
  return {
    buyerUserId,
    offer: OFFER,
    fulfillmentMethod: "pickup",
    pickupAddressId: site,
    requestedDeliveryDate: SERVICE_DAY,
    requestedWindow: WINDOW,
    note: "",
    lines: LINES,
    expectedTotalCents: 0,
  };
}

async function offer(
  site: string,
  buyerUserId: string,
): Promise<OfferedParticularPlacedOrderResponse> {
  return jsonBody<OfferedParticularPlacedOrderResponse>(
    await staff()
      .post(ROUTE)
      .set(INTENT_KEY, freshIntent())
      .send(basket(site, buyerUserId))
      .expect(201),
  );
}

describe("la commande offerte à un particulier", () => {
  it("🔴 admet un particulier : publique, sans société, offerte, rien à encaisser", async () => {
    const { site, particularId } = await scene();

    const placed = await offer(site, particularId);

    expect(placed.totalCents).toBe(0);
    expect(placed.offeredTotalCents).toBeGreaterThan(0);
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: placed.id } });
    expect(row).toMatchObject({
      companyId: null,
      clientele: "public",
      entryOrigin: "commercial",
      placedByUserId: particularId,
      paymentStatus: "not_required",
      settlementVenue: null,
      stripePaymentIntentId: null,
      totalCents: 0,
      offerNature: "event",
      offerNote: "Dégustation pour un mariage",
      offeredTotalCents: placed.offeredTotalCents,
      offerNotifiesCustomer: false,
    });
    expect(row.placedByStaffId).not.toBeNull();
  });

  it("🔴 le fait `order.offered` porte le particulier, sans le texte du motif", async () => {
    const { site, particularId } = await scene();

    const placed = await offer(site, particularId);

    const facts = await ctx.prisma.outboxMessage.findMany({ where: { type: "order.offered" } });
    expect(facts).toHaveLength(1);
    expect(facts[0]?.payload).toMatchObject({
      orderId: placed.id,
      placedByUserId: particularId,
      nature: "event",
      offeredTotalCents: placed.offeredTotalCents,
    });
    expect(JSON.stringify(facts[0]?.payload)).not.toContain("mariage");
  });

  it("la liste et la fiche staff la montrent offerte, avec son motif", async () => {
    const { site, particularId } = await scene();
    const placed = await offer(site, particularId);

    const detail = jsonBody<AdminOrderView>(
      await staff().get(`/admin/orders/${placed.id}`).expect(200),
    );
    const page = jsonBody<AdminOrdersPage>(await staff().get("/admin/orders").expect(200));

    expect(detail.settlement).toBe("offered");
    expect(detail.offer).toEqual(OFFER);
    expect(detail.clientele).toBe("public");
    expect(page.rows.find((row) => row.id === placed.id)?.settlement).toBe("offered");
  });

  it("🔴 l'équipe la modifie : elle reste offerte, sa valeur suit", async () => {
    const { site, particularId } = await scene();
    const placed = await offer(site, particularId);

    await staff()
      .post(`/admin/orders/${placed.id}/revisions`)
      .set(INTENT_KEY, freshIntent())
      .send({
        expectedRevision: 0,
        expectedTotalCents: 0,
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "pickup",
        pickupAddressId: site,
        requestedWindow: WINDOW,
        note: "",
        lines: [{ sku: "VIE-001-1", quantity: 24 }],
      })
      .expect(200);

    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: placed.id } });
    expect(row).toMatchObject({ revision: 1, totalCents: 0, offerNature: "event" });
    expect(row.offeredTotalCents).not.toBe(placed.offeredTotalCents);
    const revalued = await ctx.prisma.outboxMessage.findMany({
      where: { type: "order.offer_revalued" },
    });
    expect(revalued[0]?.payload).toMatchObject({
      placedByUserId: particularId,
      offeredTotalCents: row.offeredTotalCents,
    });
  });
});

describe("ce qu'elle refuse, sans rien écrire", () => {
  it("🔴 la fiche d'un membre de société", async () => {
    const { site, memberId } = await scene();

    const response = await staff()
      .post(ROUTE)
      .set(INTENT_KEY, freshIntent())
      .send(basket(site, memberId))
      .expect(409);

    expect(response.body).toMatchObject({ code: "orders.counter_particular.company_member" });
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it("🔴 une fiche désactivée", async () => {
    const { site, disabledId } = await scene();

    const response = await staff()
      .post(ROUTE)
      .set(INTENT_KEY, freshIntent())
      .send(basket(site, disabledId))
      .expect(409);

    expect(response.body).toMatchObject({ code: "orders.counter_particular.disabled" });
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it("🔴 une livraison quand elle est fermée aux particuliers", async () => {
    const { particularId } = await scene();
    await staff().patch("/admin/delivery-availability").send({ openToB2c: false }).expect(204);

    const response = await staff()
      .post(ROUTE)
      .set(INTENT_KEY, freshIntent())
      .send({
        ...basket("unused", particularId),
        fulfillmentMethod: "delivery",
        pickupAddressId: null,
        requestedWindow: { start: null, end: "10:00" },
        deliveryAddress: {
          label: "Maison",
          ligne1: "1 rue des Lilas",
          ligne2: "",
          codePostal: "75011",
          ville: "Paris",
          pays: "France",
        },
      })
      .expect(409);

    expect(response.body).toMatchObject({ code: "orders.delivery.closed_for_audience" });
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it("🔴 sans le droit « Offrir une commande » : 403", async () => {
    const { site, particularId } = await scene();
    // Un commercial passe des commandes ; offrir est un droit à part.
    await ctx.prisma.staffUser.update({
      where: { auth0Id: E2E_STAFF_SUB },
      data: { role: "commercial" },
    });
    // La résolution d'accès garde un cache court : le changement fait en base l'invalide.
    ctx.app.get(StaffAccessCache).forgetAll();

    const response = await staff()
      .post(ROUTE)
      .set(INTENT_KEY, freshIntent())
      .send(basket(site, particularId))
      .expect(403);

    expect(response.body).toMatchObject({ code: "orders.offer.forbidden" });
    expect(await ctx.prisma.order.count()).toBe(0);
  });
});

describe("l'estimation de la commande offerte (O7c)", () => {
  const ESTIMATE = `${ROUTE}/estimate`;

  function estimateBody(site: string, buyerUserId: string): Record<string, unknown> {
    const { expectedTotalCents: _seen, ...content } = basket(site, buyerUserId);
    return content;
  }

  it("🔴 avec le motif : zéro et la valeur que la passation écrit, sans rien écrire", async () => {
    const { site, particularId } = await scene();

    const view = jsonBody<AdminOrderEstimateView>(
      await staff().post(ESTIMATE).send(estimateBody(site, particularId)).expect(200),
    );

    expect(view.refusal).toBeNull();
    expect(view.amounts?.totalCents).toBe(0);
    expect(await ctx.prisma.order.count()).toBe(0);
    const placed = await offer(site, particularId);
    expect(view.amounts?.offeredTotalCents).toBe(placed.offeredTotalCents);
  });

  it("sans motif : la valeur pleine", async () => {
    const { site, particularId } = await scene();
    const { offer: _none, ...withoutOffer } = estimateBody(site, particularId);

    const view = jsonBody<AdminOrderEstimateView>(
      await staff().post(ESTIMATE).send(withoutOffer).expect(200),
    );

    expect(view.amounts?.totalCents).toBeGreaterThan(0);
    expect(view.amounts?.offeredTotalCents).toBeUndefined();
  });

  it("rend une livraison fermée aux particuliers en refus de devis", async () => {
    const { particularId } = await scene();
    await staff().patch("/admin/delivery-availability").send({ openToB2c: false }).expect(204);

    const view = jsonBody<AdminOrderEstimateView>(
      await staff()
        .post(ESTIMATE)
        .send({
          ...estimateBody("unused", particularId),
          fulfillmentMethod: "delivery",
          pickupAddressId: null,
          requestedWindow: { start: null, end: "10:00" },
          deliveryAddress: {
            label: "Maison",
            ligne1: "1 rue des Lilas",
            ligne2: "",
            codePostal: "75011",
            ville: "Paris",
            pays: "France",
          },
        })
        .expect(200),
    );

    expect(view.amounts).toBeNull();
    expect(view.refusal?.code).toBe("orders.delivery.closed_for_audience");
  });

  it("🔴 la fiche d'un membre de société reste une erreur", async () => {
    const { site, memberId } = await scene();

    const response = await staff().post(ESTIMATE).send(estimateBody(site, memberId)).expect(409);

    expect(response.body).toMatchObject({ code: "orders.counter_particular.company_member" });
  });
});
