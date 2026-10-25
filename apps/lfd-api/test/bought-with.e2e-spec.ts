/**
 * E2E de **« souvent pris avec »** (lot R2 de
 * `documentation/recommandation-produit/plan-recommandation-de-produits.md`).
 *
 * Ce qu'aucun test unitaire ne prouve : la requête des paires elle-même —
 * le client distinct (société pour un pro, personne sinon), le seuil de
 * cinq appliqué EN BASE, les exclusions (annulée, abonnement), la clientèle
 * séparée, la fenêtre de 90 jours — puis la place du calculé derrière celle
 * du staff, sur la vraie route de la boutique.
 */
import {
  type CartSuggestionView,
  type CartSuggestionsPayload,
  type ShopCatalogueView,
  type StaffSuggestionRulePayload,
} from "@lfd/contracts";
import request from "supertest";

import { CommandBus } from "@nestjs/cqrs";

import { CancelOrderCommand } from "../src/b2b/orders/application/commands/cancel-order.command.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { cardGatewayDouble, payByCard, pickupSite, placeOrder } from "./order-factory.js";
import {
  bootstrapE2e,
  placedDaysAgo,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { stubAdminVerifier } from "./operations-at-commerce-scene.js";

let ctx: E2eContext;
let seq = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: cardGatewayDouble("pi_pris_avec") },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

interface SeedOrder {
  readonly userId: string;
  readonly skus: readonly string[];
  readonly companyId?: string;
  readonly cancelled?: boolean;
  readonly fromSubscription?: boolean;
  /** Il y a combien de jours elle a été passée ; hier par défaut. */
  readonly daysAgo?: number;
}

/**
 * Une commande passée par le vrai chemin (plan T), un exemplaire par article,
 * puis réglée — ou annulée par l'équipe.
 */
async function seedOrder(order: SeedOrder): Promise<void> {
  seq += 1;
  if (order.companyId !== undefined) {
    await attachTo(ctx.prisma, order.userId, order.companyId, CustomerRole.owner);
  }
  const placed = await placeOrder(ctx, {
    buyerUserId: order.userId,
    companyId: order.companyId ?? null,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    placedAt: new Date(placedDaysAgo(order.daysAgo ?? 1)),
    forDay: serviceDay(1 - (order.daysAgo ?? 1)),
    lines: order.skus.map((sku) => ({ sku, quantity: 1 })),
  });
  if (order.cancelled === true) {
    await ctx.app
      .get(CommandBus)
      .execute(new CancelOrderCommand(placed.id, E2E_STAFF_ID, "Le client renonce."));
    await ctx.drain();
  } else {
    await payByCard(ctx, placed);
  }
  if (order.fromSubscription === true) {
    // Écriture brute GARDÉE (plan T, 2026-10-24) : une commande de panier
    // récurrent naît de la génération des abonnements, qu'aucune entrée de
    // test ne déclenche pour un seul jour. La commande est vraie ; seule sa
    // provenance est posée après coup, et c'est elle que la requête exclut.
    await ctx.prisma.order.update({
      where: { id: placed.id },
      data: { fromSubscriptionId: `sub-${String(seq)}` },
    });
  }
}

async function person(): Promise<string> {
  seq += 1;
  const user = await createUser(ctx.prisma, {
    auth0Sub: `auth0|bought-with-${String(seq)}`,
    email: `bought-with-${String(seq)}@example.test`,
  });
  return user.id;
}

/** `count` particuliers distincts, une commande chacun, des mêmes articles. */
async function people(count: number, skus: readonly string[]): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await seedOrder({ userId: await person(), skus });
  }
}

/** Sans jeton, comme la boutique d'un visiteur : lecteur particulier. */
async function suggestions(skus: readonly string[]): Promise<readonly CartSuggestionView[]> {
  const payload: CartSuggestionsPayload = { skus: [...skus], target: null };
  const response = await request(ctx.app.getHttpServer())
    .post("/shop/suggestions/cart")
    .send(payload)
    .expect(200);
  return jsonBody<CartSuggestionView[]>(response);
}

const shownOf = async (skus: readonly string[]) =>
  (await suggestions(skus)).map(({ sku, reason }) => [sku, reason.source]);

describe("souvent pris avec (R2)", () => {
  it("cinq clients distincts qui prennent croissant et baguette : la baguette est proposée avec le croissant", async () => {
    await people(5, ["VIE-001", "PAI-001"]);

    const shelf = jsonBody<ShopCatalogueView>(
      await request(ctx.app.getHttpServer()).get("/shop/catalogue").expect(200),
    );
    const name = (sku: string) => shelf.items.find((item) => item.sku === sku)?.name;

    expect(await suggestions(["VIE-001"])).toEqual([
      {
        sku: "PAI-001",
        item: shelf.items.find((item) => item.sku === "PAI-001"),
        reason: {
          source: "data",
          kind: "bought_with",
          withSku: "VIE-001",
          withName: name("VIE-001"),
        },
      },
    ]);
  });

  it("quatre clients distincts : rien — le seuil d'anonymat tient en base", async () => {
    await people(4, ["VIE-001", "PAI-001"]);

    expect(await suggestions(["VIE-001"])).toEqual([]);
  });

  it("une personne qui commande cinq fois reste UN client", async () => {
    const userId = await person();
    for (let index = 0; index < 5; index += 1) {
      await seedOrder({ userId, skus: ["VIE-001", "PAI-001"] });
    }

    expect(await suggestions(["VIE-001"])).toEqual([]);
  });

  it("ni l'annulée, ni l'abonnement, ni la commande de plus de 90 jours ne comptent", async () => {
    await people(4, ["VIE-001", "PAI-001"]);
    await seedOrder({
      userId: await person(),
      skus: ["VIE-001", "PAI-001"],
      cancelled: true,
    });
    await seedOrder({
      userId: await person(),
      skus: ["VIE-001", "PAI-001"],
      fromSubscription: true,
    });
    await seedOrder({ userId: await person(), skus: ["VIE-001", "PAI-001"], daysAgo: 91 });

    expect(await suggestions(["VIE-001"])).toEqual([]);

    await seedOrder({ userId: await person(), skus: ["VIE-001", "PAI-001"], daysAgo: 88 });

    expect(await shownOf(["VIE-001"])).toEqual([["PAI-001", "data"]]);
  });

  it("les paniers des pros ne parlent pas aux particuliers", async () => {
    await people(4, ["VIE-001", "PAI-001"]);
    const company = await createCompany(ctx.prisma);
    await seedOrder({
      userId: await person(),
      companyId: company.id,
      skus: ["VIE-001", "PAI-001"],
    });

    expect(await suggestions(["VIE-001"])).toEqual([]);
  });

  it("le staff passe avant, et le calculé prend la place suivante sans doublon", async () => {
    await people(6, ["VIE-001", "PAI-001", "CHO-001"]);
    const rule: StaffSuggestionRulePayload = {
      trigger: { kind: "product_in_cart", ref: "VIE-001" },
      suggestedSkus: ["PAI-001"],
      placement: "cart",
      audience: "both",
      startsOn: serviceDay(0),
      endsOn: serviceDay(7),
      phrase: null,
      priority: 0,
    };
    await ctx.asSub(E2E_STAFF_SUB).post("/admin/suggestions").send(rule).expect(201);

    expect(await shownOf(["VIE-001"])).toEqual([
      ["PAI-001", "staff"],
      ["CHO-001", "data"],
    ]);
  });
});
