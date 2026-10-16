/**
 * E2E — **les faits du catalogue**, du référentiel à la plateforme, en
 * processus (lot 2a de `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`).
 *
 * Ce que seul ce niveau prouve : l'écriture conditionnée sur `applied_seq`
 * contre le vrai SQL, la clé étrangère d'une fiche arrivée avant sa famille,
 * et qu'aucune décision locale ne se perd — le piège que H10 nomme. Le relais
 * est coupé : chaque livraison part d'un balayage explicite, ou d'un appel
 * direct quand l'ordre est le sujet.
 */
import { randomUUID } from "node:crypto";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { AppConfig } from "../src/platform/config/app-config.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import { B2bCatalogDriver } from "../src/pim/channels/b2b-platform/products/driver.js";
import { CATALOG_SNAPSHOT_VERSION } from "@lfd/catalog-sync";
import {
  aDraftFiche,
  anActiveFiche,
  deliverDirectly,
  OpenCatalogFactsConfig,
  productFactsOf,
  relayAll,
  SILENT_TRIGGER,
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
/** Une décision de prix pro posée sur la plateforme, en millicentimes HT. */
const DECIDED_PRICE = 150_000;
const TEN_FACTS = 10;

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

function entryOf(productId: string) {
  return ctx.prisma.catalogEntry.findUnique({ where: { productId } });
}

function itemOf(sku: string) {
  return ctx.prisma.catalogItem.findUnique({ where: { sku }, include: { override: true } });
}

describe("une fiche créée au référentiel apparaît sur la plateforme", () => {
  it("inactive, avec ce qui lui manque, et sans article en vente", async () => {
    const fiche = await aDraftFiche(staff, "Croissant");

    await relayAll(ctx);

    const entry = await entryOf(fiche.id);
    expect(entry).toMatchObject({ productSku: fiche.sku, status: "inactive", audience: "both" });
    // Tout ce qui manque, nommé : rien n'est réglé sur une fiche neuve.
    expect(entry?.gaps).toEqual({
      // Lot 2b : un taux pour CHAQUE contexte en service, sur place compris.
      [fiche.variantSku]: [
        "price",
        "allergens",
        // Lot S : une base sans règles vaut « prix saisi » — il manque le prix
        // pro de la déclinaison, plus un rapport (`pro_price_rule`, d'avant).
        "pro_price",
        "vat:b2b",
        "vat:takeaway",
        "vat:eatIn",
      ],
    });
    // La famille est arrivée avec elle — et sous son propre fait.
    const family = await ctx.prisma.catalogCategory.findUnique({ where: { id: fiche.categoryId } });
    expect(family?.appliedSeq).not.toBeNull();
    expect(await ctx.prisma.catalogItem.count({ where: { productId: fiche.id } })).toBe(0);
  });

  it("activée, ses déclinaisons complètes passent en vente, audience comprise", async () => {
    const fiche = await anActiveFiche(staff, "Pain au chocolat");

    await relayAll(ctx);

    expect(await entryOf(fiche.id)).toMatchObject({ status: "active", gaps: {} });
    const item = await itemOf(fiche.variantSku);
    expect(item).toMatchObject({ withdrawnAt: null, audience: "both", productId: fiche.id });
    expect(item?.priceMillicents).toBeGreaterThan(0);
    // Le prix est tracé comme toute écriture de prix du miroir.
    expect(await ctx.prisma.catalogPriceHistory.count({ where: { sku: fiche.variantSku } })).toBe(
      1,
    );
  });
});

describe("l'ordre et la répétition", () => {
  /** Deux faits appliqués à l'envers : le plus ancien n'écrit rien. */
  it("un fait plus ancien que la ligne n'écrit rien", async () => {
    const fiche = await aDraftFiche(staff, "Brioche");
    await staff()
      .put(`${PRODUCTS}/${fiche.id}/identity`)
      .send({ name: { fr: "Brioche tressée" }, kind: "daily", categoryId: fiche.categoryId })
      .expect(200);
    const facts = await productFactsOf(ctx, fiche.id);
    const oldest = facts.at(0);
    const newest = facts.at(-1);
    expect(facts.length).toBeGreaterThanOrEqual(2);

    await deliverDirectly(ctx, newest?.payload ?? {});
    await deliverDirectly(ctx, oldest?.payload ?? {});

    expect(await entryOf(fiche.id)).toMatchObject({
      name: "Brioche tressée",
      appliedSeq: BigInt(newest?.seq ?? 0),
    });
  });

  it("le même fait livré deux fois n'écrit qu'une fois", async () => {
    const fiche = await anActiveFiche(staff, "Chausson");
    const [last] = (await productFactsOf(ctx, fiche.id)).slice(-1);

    await deliverDirectly(ctx, last?.payload ?? {});
    const traced = await ctx.prisma.catalogPriceHistory.count({ where: { sku: fiche.variantSku } });
    const before = await entryOf(fiche.id);
    await deliverDirectly(ctx, last?.payload ?? {});

    expect(await entryOf(fiche.id)).toEqual(before);
    expect(await ctx.prisma.catalogPriceHistory.count({ where: { sku: fiche.variantSku } })).toBe(
      traced,
    );
  });

  /** Correction `vitruve` : deux abonnés sans ordre entre eux, et `category_id` est une clé étrangère. */
  it("une fiche reçue avant sa famille la crée, et le fait famille la met à jour ensuite", async () => {
    const fiche = await anActiveFiche(staff, "Palmier");
    const [last] = (await productFactsOf(ctx, fiche.id)).slice(-1);

    await deliverDirectly(ctx, last?.payload ?? {});

    const brought = await ctx.prisma.catalogCategory.findUnique({
      where: { id: fiche.categoryId },
    });
    expect(brought).toMatchObject({ name: "Famille Palmier", appliedSeq: null });
    expect((await itemOf(fiche.variantSku))?.withdrawnAt).toBeNull();

    await relayAll(ctx);

    const family = await ctx.prisma.catalogCategory.findUnique({ where: { id: fiche.categoryId } });
    expect(family?.appliedSeq).not.toBeNull();
  });
});

describe("aucune décision locale ne se perd (H10)", () => {
  async function decidedFiche(name: string) {
    const fiche = await anActiveFiche(staff, name);
    await relayAll(ctx);
    // Un prix décidé AVANT le lot D (2026-10-15) : plus aucun geste ne le
    // pose, la ligne est semée telle que la base la porte encore. Elle n'est
    // plus lue — elle doit seulement ne jamais disparaître.
    await ctx.prisma.catalogItemOverride.create({
      data: { sku: fiche.variantSku, priceMillicents: DECIDED_PRICE },
    });
    return fiche;
  }

  it("un ancien prix décidé survit à dix faits sur la même fiche", async () => {
    const fiche = await decidedFiche("Kouign-amann");

    for (let rank = 1; rank <= TEN_FACTS; rank += 1) {
      await staff()
        .put(`${PRODUCTS}/${fiche.id}/identity`)
        .send({
          name: { fr: `Kouign-amann ${String(rank)}` },
          kind: "daily",
          categoryId: fiche.categoryId,
        })
        .expect(200);
      await relayAll(ctx);
    }

    const item = await itemOf(fiche.variantSku);
    expect(item?.override?.priceMillicents).toBe(DECIDED_PRICE);
    expect((await entryOf(fiche.id))?.name).toBe(`Kouign-amann ${String(TEN_FACTS)}`);
  });

  it("une fiche désactivée retire ses déclinaisons, garde ses décisions, et les retrouve", async () => {
    const fiche = await decidedFiche("Financier");

    await staff().put(`${PRODUCTS}/${fiche.id}/unpublish`).send({}).expect(200);
    await relayAll(ctx);

    const withdrawn = await itemOf(fiche.variantSku);
    expect(withdrawn?.withdrawnAt).not.toBeNull();
    expect(withdrawn?.override?.priceMillicents).toBe(DECIDED_PRICE);
    expect((await entryOf(fiche.id))?.status).toBe("inactive");

    await staff().put(`${PRODUCTS}/${fiche.id}/publish`).send({}).expect(200);
    await relayAll(ctx);

    const back = await itemOf(fiche.variantSku);
    expect(back?.withdrawnAt).toBeNull();
    expect(back?.override?.priceMillicents).toBe(DECIDED_PRICE);
  });
});

describe("l'audience décide à qui l'article se vend (servedTo)", () => {
  async function aBuyer() {
    const company = await createCompany(ctx.prisma);
    const buyer = await createUser(ctx.prisma, { auth0Sub: "auth0|acheteur_faits" });
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

  function order(buyer: { companyId: string; pickupId: string }, productSku: string) {
    return ctx
      .asSub("auth0|acheteur_faits")
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

  /**
   * Chemin tracé le 2026-10-15 : `POST /orders` → `OrderLinePricing` →
   * `ProductCatalogReader.resolveMany` → `CatalogReader.listDefaultsByProductSkus`
   * → `servedTo`. Le témoin (audience `both`) passe ; le même article rendu
   * `public` est refusé à la commande pro, et reste en vitrine publique.
   */
  it("refuse une commande pro sur un article réservé au public", async () => {
    const fiche = await anActiveFiche(staff, "Éclair");
    await relayAll(ctx);
    // Lot 3 : l'article neuf attend sa validation, pros comme public.
    await staff()
      .post("/admin/catalog/review/approve")
      .send({ skus: [fiche.variantSku], audiences: ["pro", "public"] })
      .expect(204);
    const buyer = await aBuyer();
    await order(buyer, fiche.sku).expect(201);

    await staff().put(`${PRODUCTS}/${fiche.id}/audience`).send({ audience: "public" }).expect(200);
    await relayAll(ctx);

    expect((await itemOf(fiche.variantSku))?.audience).toBe("public");
    const refusal = await order(buyer, fiche.sku).expect(400);
    expect(jsonBody<{ code: string }>(refusal).code).toBe("orders.sku.unknown");
    const shop = jsonBody<{ items: { sku: string }[] }>(
      await ctx.http().get("/shop/catalogue").expect(200),
    );
    expect(shop.items.map((entry) => entry.sku)).toContain(fiche.sku);
  });
});

/**
 * Correction `vitruve` « un seul écrivain à la fois » : faits ouverts, le push
 * ne touche plus fiches ni familles. Il retirerait sinon tout ce qui manque à
 * son instantané — les fiches inactives que les faits posent, sans numéro.
 */
describe("faits ouverts, le push n'écrit plus les articles", () => {
  it("un instantané vide ne retire rien de ce que les faits ont posé", async () => {
    const fiche = await anActiveFiche(staff, "Madeleine");
    await relayAll(ctx);

    const report = await ctx.app.get(B2bCatalogDriver).send(
      {
        version: CATALOG_SNAPSHOT_VERSION,
        generatedAt: new Date(Date.UTC(2030, 0, 1)).toISOString(),
        categories: [],
        products: [],
        orderTimeLimits: [],
        operations: [],
      },
      { revisionId: "rev_e2e", fingerprint: "empreinte-e2e" },
    );

    expect(report.removedSkus).toEqual([]);
    expect((await itemOf(fiche.variantSku))?.withdrawnAt).toBeNull();
  });
});

/** 2a6 : le filet. Un fait perdu laisse une fiche en retard ; réémettre la répare. */
describe("réémettre", () => {
  it("« tout » rend à la plateforme une fiche qu'elle avait perdue, famille d'abord", async () => {
    const fiche = await aDraftFiche(staff, "Cannelé");
    await relayAll(ctx);
    // La perte simulée : la ligne disparaît côté plateforme, le référentiel n'a pas bougé.
    await ctx.prisma.catalogEntry.delete({ where: { productId: fiche.id } });

    const report = await staff().post("/pim/channels/b2b/reemit").send({}).expect(201);
    await relayAll(ctx);

    expect(jsonBody<{ products: number; failedProducts: string[] }>(report)).toMatchObject({
      products: 1,
      failedProducts: [],
    });
    expect((await entryOf(fiche.id))?.status).toBe("inactive");
  });

  it("une fiche, et une seule", async () => {
    const fiche = await aDraftFiche(staff, "Far breton");
    await relayAll(ctx);
    const before = (await entryOf(fiche.id))?.appliedSeq ?? 0n;

    await staff().post("/pim/channels/b2b/reemit").send({ productId: fiche.id }).expect(201);
    await relayAll(ctx);

    expect((await entryOf(fiche.id))?.appliedSeq).toBeGreaterThan(before);
  });
});
