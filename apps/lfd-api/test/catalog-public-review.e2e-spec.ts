/**
 * E2E — **la validation avant la boutique publique, le masquage par audience
 * et la vue « Catalogue publié »** (lot 3 de
 * `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`).
 *
 * Ce que seul ce niveau prouve : que le drapeau naît à la création de la ligne
 * dans le vrai `upsert` du récepteur et nulle part ailleurs, que la boutique
 * publique et la commande pro lisent la même règle (`servedTo`), et que la vue
 * rend les fiches que `catalog_items` ne porte pas.
 */
import { randomUUID } from "node:crypto";

import type { PublishedCatalogView } from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { AppConfig } from "../src/platform/config/app-config.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import {
  aDraftFiche,
  anActiveFiche,
  OpenCatalogFactsConfig,
  relayAll,
  SILENT_TRIGGER,
  type Fiche,
} from "./catalog-facts-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/** Passerelle de paiement doublée : intention fixe, aucun appel réseau. */
const fakeGateway = {
  createIntent: () => Promise.resolve({ paymentIntentId: "pi_e2e", clientSecret: "pi_e2e_secret" }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

const PRODUCTS = "/pim/catalogue/products";
const BUYER_SUB = "auth0|acheteur_validation";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: AppConfig, value: new OpenCatalogFactsConfig() },
      { token: OutboxRelayTrigger, value: SILENT_TRIGGER },
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

const staff = (): ReturnType<E2eContext["http"]> => ctx.asSub(E2E_STAFF_SUB);

/** L'attente d'un article, par audience. */
function pendingOf(sku: string): Promise<{ pro: boolean; public: boolean } | undefined> {
  return ctx.prisma.catalogItem
    .findUnique({ where: { sku }, select: { publicReviewPending: true, proReviewPending: true } })
    .then((row) =>
      row === null ? undefined : { pro: row.proReviewPending, public: row.publicReviewPending },
    );
}

const NONE = { pro: false, public: false };
const BOTH = ["pro", "public"] as const;

async function publicShopSkus(): Promise<string[]> {
  const shop = jsonBody<{ items: { sku: string }[] }>(
    await ctx.http().get("/shop/catalogue").expect(200),
  );
  return shop.items.map((entry) => entry.sku);
}

function approve(skus: readonly string[], audiences: readonly ("pro" | "public")[] = BOTH) {
  return staff().post("/admin/catalog/review/approve").send({ skus, audiences });
}

async function setAudience(fiche: Fiche, audience: "pro" | "public" | "both"): Promise<void> {
  await staff().put(`${PRODUCTS}/${fiche.id}/audience`).send({ audience }).expect(200);
}

/** Un client pro et son point de retrait, pour prouver ce que les pros voient. */
async function aBuyer(): Promise<{ companyId: string; pickupId: string }> {
  const company = await createCompany(ctx.prisma);
  const buyer = await createUser(ctx.prisma, { auth0Sub: BUYER_SUB });
  await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
  const pickup = await ctx.prisma.site.create({
    data: {
      label: "Labo",
      ligne1: "La Daille",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  return { companyId: company.id, pickupId: pickup.id };
}

function proOrder(buyer: { companyId: string; pickupId: string }, productSku: string) {
  return ctx
    .asSub(BUYER_SUB)
    .post("/orders")
    .send({
      idempotencyKey: randomUUID(),
      companyId: buyer.companyId,
      requestedDeliveryDate: serviceDay(),
      note: "",
      fulfillmentMethod: "pickup",
      requestedWindow: { start: "07:00", end: "08:00" },
      pickupAddressId: buyer.pickupId,
      lines: [{ sku: productSku, quantity: 1 }],
    });
}

describe("la validation avant la boutique publique", () => {
  it("un article neuf attend les deux audiences : ni vitrine publique, ni commande pro", async () => {
    const fiche = await anActiveFiche(staff, "Croissant");
    await relayAll(ctx);

    expect(await pendingOf(fiche.variantSku)).toEqual({ pro: true, public: true });
    expect(await publicShopSkus()).not.toContain(fiche.sku);
    const refusal = await proOrder(await aBuyer(), fiche.sku).expect(400);
    expect(jsonBody<{ code: string }>(refusal).code).toBe("orders.sku.unknown");
  });

  it("valider pour les pros ouvre la commande, sans ouvrir la vitrine publique", async () => {
    const fiche = await anActiveFiche(staff, "Pain aux raisins");
    await relayAll(ctx);

    await approve([fiche.variantSku], ["pro"]).expect(204);

    expect(await pendingOf(fiche.variantSku)).toEqual({ pro: false, public: true });
    await proOrder(await aBuyer(), fiche.sku).expect(201);
    expect(await publicShopSkus()).not.toContain(fiche.sku);
  });

  it("valider pour le public le rend public, et le journal le dit par audience", async () => {
    const fiche = await anActiveFiche(staff, "Brioche");
    await relayAll(ctx);

    await approve([fiche.variantSku]).expect(204);

    expect(await pendingOf(fiche.variantSku)).toEqual(NONE);
    expect(await publicShopSkus()).toContain(fiche.sku);
    const journal = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: fiche.variantSku, type: { endsWith: "_review_approved" } },
      orderBy: { type: "asc" },
      select: { type: true },
    });
    expect(journal.map((row) => row.type)).toEqual([
      "catalog_item.pro_review_approved",
      "catalog_item.public_review_approved",
    ]);
  });

  it("une modification ultérieure ne remet pas en attente", async () => {
    const fiche = await anActiveFiche(staff, "Chausson");
    await relayAll(ctx);
    await approve([fiche.variantSku]).expect(204);

    await staff()
      .put(`${PRODUCTS}/${fiche.id}/identity`)
      .send({ name: { fr: "Chausson aux pommes" }, kind: "daily", categoryId: fiche.categoryId })
      .expect(200);
    await relayAll(ctx);

    expect(await pendingOf(fiche.variantSku)).toEqual(NONE);
    expect(await publicShopSkus()).toContain(fiche.sku);
  });

  it("un SKU déjà connu, réémis, n'est pas remis en attente", async () => {
    const fiche = await anActiveFiche(staff, "Palmier");
    await relayAll(ctx);
    await approve([fiche.variantSku]).expect(204);

    await staff().post("/pim/channels/b2b/reemit").send({}).expect(201);
    await relayAll(ctx);

    expect(await pendingOf(fiche.variantSku)).toEqual(NONE);
  });

  it("un article né pour les pros n'attend rien quand son audience s'élargit", async () => {
    const active = await anActiveFiche(staff, "Financier", "pro");
    await relayAll(ctx);
    expect(await pendingOf(active.variantSku)).toEqual({ pro: true, public: false });
    await approve([active.variantSku], ["pro"]).expect(204);

    await setAudience(active, "both");
    await relayAll(ctx);

    expect(await pendingOf(active.variantSku)).toEqual(NONE);
    expect(await publicShopSkus()).toContain(active.sku);
  });

  it("refuse tout le lot si un SKU n'est plus en vente, en le nommant", async () => {
    const fiche = await anActiveFiche(staff, "Madeleine");
    await relayAll(ctx);

    const refusal = await approve([fiche.variantSku, "INCONNU-1"]).expect(404);

    expect(JSON.stringify(refusal.body)).toContain("INCONNU-1");
    expect(await pendingOf(fiche.variantSku)).toEqual({ pro: true, public: true });
  });
});

describe("la route unique du masquage", () => {
  it("refuse de masquer pour une audience que l'article n'a pas", async () => {
    const fiche = await anActiveFiche(staff, "Éclair");
    await setAudience(fiche, "pro");
    await relayAll(ctx);

    const refusal = await staff()
      .put(`/admin/catalog/${fiche.variantSku}/masking`)
      .send({ audience: "public", hidden: true })
      .expect(409);

    expect(jsonBody<{ code: string }>(refusal).code).toBe("catalog.item.masking_outside_audience");
    await staff()
      .put(`/admin/catalog/${fiche.variantSku}/masking`)
      .send({ audience: "pro", hidden: true })
      .expect(204);
  });
});

describe("la vue « Catalogue publié »", () => {
  it("montre une fiche désactivée avec ses déclinaisons complètes, et une audience propre", async () => {
    const fiche = await anActiveFiche(staff, "Far breton", "both");
    await relayAll(ctx);
    await staff().put(`${PRODUCTS}/${fiche.id}/unpublish`).send({}).expect(200);
    await relayAll(ctx);

    const view = jsonBody<PublishedCatalogView>(
      await staff().get("/admin/catalog/published").expect(200),
    );

    const entry = view.entries.find((candidate) => candidate.productId === fiche.id);
    expect(entry).toMatchObject({ status: "inactive", audienceInherited: false });
    expect(entry?.variants).toHaveLength(1);
    expect(entry?.variants[0]).toMatchObject({
      sku: fiche.variantSku,
      onSale: false,
      gaps: [],
      pro: { state: "inactif" },
      public: { state: "inactif" },
    });
    expect(entry?.variants[0]?.pro.htMillicents).toBeGreaterThan(0);
    expect(view.pendingReview).toEqual([]);
  });

  it("rend une fiche inactive, une incomplète, et la liste à valider", async () => {
    const draft = await aDraftFiche(staff, "Cannelé");
    const active = await anActiveFiche(staff, "Kouign-amann");
    await relayAll(ctx);

    const view = jsonBody<PublishedCatalogView>(
      await staff().get("/admin/catalog/published").expect(200),
    );

    const inactive = view.entries.find((entry) => entry.productId === draft.id);
    expect(inactive).toMatchObject({
      status: "inactive",
      audience: "both",
      audienceInherited: true,
    });
    expect(inactive?.variants).toHaveLength(1);
    expect(inactive?.variants[0]).toMatchObject({
      sku: draft.variantSku,
      onSale: false,
      pro: { state: "inactif", htMillicents: null },
      public: { state: "inactif", ttcCents: null },
    });
    expect(inactive?.variants[0]?.gaps).toContain("price");
    const sold = view.entries.find((entry) => entry.productId === active.id);
    expect(sold?.variants[0]).toMatchObject({
      sku: active.variantSku,
      pro: { state: "en_attente_validation" },
      public: { state: "en_attente_validation" },
      reviewPending: { pro: true, public: true },
    });
    expect(sold?.variants[0]?.pro.htMillicents).toBeGreaterThan(0);
    expect(view.pendingReview.map((pending) => [pending.sku, pending.audiences])).toEqual([
      [active.variantSku, ["pro", "public"]],
    ]);
    const shelf = view.shelves.find((entry) => entry.categoryId === active.categoryId);
    expect(shelf?.public.en_attente_validation).toBe(1);
    expect(shelf?.pro.en_attente_validation).toBe(1);
  });
});
