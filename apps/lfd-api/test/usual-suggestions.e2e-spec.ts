/**
 * E2E de **« vos habituels »** (lot R1 de
 * `documentation/recommandation-produit/plan-recommandation-de-produits.md`).
 *
 * Ce qu'aucun test unitaire ne prouve : la requête de l'historique elle-même
 * — le MUR `company_id` dans le `where` et l'agrégat, le jour de la commande
 * (celui pour lequel elle est passée), le seuil de trois commandes, les
 * exclusions (annulée, abonnement, plus de douze mois) — puis la route murée
 * seule : un particulier et un invité n'ont rien.
 */
import {
  addDays,
  weekdayOf,
  type ShopCatalogueView,
  type UsualSuggestionView,
  type UsualSuggestionsPayload,
} from "@lfd/contracts";
import request from "supertest";

import { CommandBus } from "@nestjs/cqrs";

import { CancelOrderCommand } from "../src/b2b/orders/application/commands/cancel-order.command.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import {
  bootstrapE2e,
  placedDaysAgo,
  E2E_STAFF_ID,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { cardGatewayDouble, payByCard, pickupSite, placeOrder } from "./order-factory.js";
import { stubAdminVerifier } from "./operations-at-commerce-scene.js";

let ctx: E2eContext;
let seq = 0;

const MEMBER_A = "auth0|usuals-a";
const MEMBER_B = "auth0|usuals-b";
const PERSON = "auth0|usuals-person";
const TUESDAY = 2;

let companyA = "";
let companyB = "";
let userA = "";
let userB = "";
let userPerson = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: cardGatewayDouble("pi_habituels") },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const a = await createUser(ctx.prisma, { auth0Sub: MEMBER_A });
  const b = await createUser(ctx.prisma, { auth0Sub: MEMBER_B });
  const person = await createUser(ctx.prisma, { auth0Sub: PERSON });
  companyA = (await createCompany(ctx.prisma)).id;
  companyB = (await createCompany(ctx.prisma)).id;
  await attachTo(ctx.prisma, a.id, companyA);
  await attachTo(ctx.prisma, b.id, companyB);
  userA = a.id;
  userB = b.id;
  userPerson = person.id;
});

/** Combien de jours en arrière tombe le mardi passé le plus proche (1 à 7). */
function lastTuesdayBack(): number {
  for (let back = 1; back <= 7; back += 1) {
    if (weekdayOf(serviceDay(-back)) === TUESDAY) {
      return back;
    }
  }
  return 7;
}

interface SeedOrder {
  readonly userId: string;
  readonly companyId: string | null;
  readonly skus: readonly string[];
  /** Le jour pour lequel la commande est passée, `back` jours en arrière. */
  readonly back: number;
  readonly cancelled?: boolean;
  readonly fromSubscription?: boolean;
  /** Passée combien de jours avant son jour ; la veille par défaut. */
  readonly placedBefore?: number;
}

/**
 * Une commande passée par le vrai chemin (plan T) pour le jour `back` jours en
 * arrière, un exemplaire par article, puis réglée — ou annulée par l'équipe.
 */
async function seedOrder(order: SeedOrder): Promise<void> {
  seq += 1;
  const placed = await placeOrder(ctx, {
    buyerUserId: order.userId,
    companyId: order.companyId,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    forDay: serviceDay(-order.back),
    placedAt: new Date(placedDaysAgo(order.back + (order.placedBefore ?? 1))),
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
    // test ne déclenche pour un jour passé. La commande est vraie ; seule sa
    // provenance est posée après coup, et c'est elle que la requête exclut.
    await ctx.prisma.order.update({
      where: { id: placed.id },
      data: { fromSubscriptionId: `sub-${String(seq)}` },
    });
  }
}

/** `count` mardis consécutifs, les plus récents d'abord, pour cette société. */
async function tuesdays(count: number, companyId: string, skus: readonly string[]): Promise<void> {
  const first = lastTuesdayBack();
  // Le membre de LA société : la passation refuse qu'un acheteur commande pour
  // une maison dont il n'est pas (le semis brut laissait A commander pour B).
  const userId = companyId === companyB ? userB : userA;
  for (let week = 0; week < count; week += 1) {
    await seedOrder({ userId, companyId, skus, back: first + 7 * week });
  }
}

const payload: UsualSuggestionsPayload = { skus: [], target: null };

async function usualsOf(sub: string, company?: string): Promise<readonly UsualSuggestionView[]> {
  const call = ctx.asSub(sub).post("/shop/suggestions/usuals/mine");
  const response = await (company === undefined ? call : call.set("x-lfc-company", company))
    .send(payload)
    .expect(200);
  return jsonBody<UsualSuggestionView[]>(response);
}

describe("vos habituels (R1)", () => {
  it("trois commandes du mardi : « tous les mardis », au prix de la vitrine de la société", async () => {
    await tuesdays(3, companyA, ["VIE-001"]);

    const shelf = jsonBody<ShopCatalogueView>(
      await ctx.asSub(MEMBER_A).get("/shop/catalogue/mine").expect(200),
    );

    expect(await usualsOf(MEMBER_A)).toEqual([
      {
        sku: "VIE-001",
        item: shelf.items.find((item) => item.sku === "VIE-001"),
        reason: { source: "data", kind: "weekly_rhythm", weekday: "tue" },
      },
    ]);
  });

  it("deux commandes : rien — une habitude commence à trois", async () => {
    await tuesdays(2, companyA, ["VIE-001"]);

    expect(await usualsOf(MEMBER_A)).toEqual([]);
  });

  it("trois commandes sans jour qui revient : « commandé 3 fois »", async () => {
    const first = lastTuesdayBack();
    for (const back of [first, first + 1, first + 2]) {
      await seedOrder({ userId: userA, companyId: companyA, skus: ["PAI-001"], back });
    }

    expect((await usualsOf(MEMBER_A)).map(({ sku, reason }) => [sku, reason])).toEqual([
      ["PAI-001", { source: "data", kind: "frequent", orderCount: 3 }],
    ]);
  });

  it("ni l'annulée, ni l'abonnement, ni la commande de plus de douze mois ne comptent", async () => {
    await tuesdays(2, companyA, ["VIE-001"]);
    const first = lastTuesdayBack();
    const base = { userId: userA, companyId: companyA, skus: ["VIE-001"] };
    await seedOrder({ ...base, back: first + 14, cancelled: true });
    await seedOrder({ ...base, back: first + 21, fromSubscription: true });
    await seedOrder({ ...base, back: first + 7 * 54 });

    expect(await usualsOf(MEMBER_A)).toEqual([]);
  });

  it("🔴 le mur : la société B ne voit rien des habitudes de A, même par un en-tête qui ment", async () => {
    await tuesdays(4, companyA, ["VIE-001", "PAI-001"]);

    expect(await usualsOf(MEMBER_B)).toEqual([]);
    expect(await usualsOf(MEMBER_B, companyA)).toEqual([]);
  });

  it("🔴 le mur dans l'agrégat : deux commandes de A et deux de B ne font pas une habitude de B", async () => {
    await tuesdays(2, companyA, ["VIE-001"]);
    await tuesdays(2, companyB, ["VIE-001"]);

    expect(await usualsOf(MEMBER_B)).toEqual([]);
  });

  it("un particulier n'a pas d'habituels, même avec ses propres commandes (R3 attend le cabinet)", async () => {
    const first = lastTuesdayBack();
    for (const week of [0, 1, 2]) {
      await seedOrder({
        userId: userPerson,
        companyId: null,
        skus: ["VIE-001"],
        back: first + 7 * week,
      });
    }

    expect(await usualsOf(PERSON)).toEqual([]);
  });

  it("aucune route publique : un invité n'a rien à demander", async () => {
    await request(ctx.app.getHttpServer())
      .post("/shop/suggestions/usuals")
      .send(payload)
      .expect(404);
    await request(ctx.app.getHttpServer())
      .post("/shop/suggestions/usuals/mine")
      .send(payload)
      .expect(401);
  });

  it("le panier exclut : un habituel déjà au panier n'est pas proposé", async () => {
    await tuesdays(3, companyA, ["VIE-001"]);
    const response = await ctx
      .asSub(MEMBER_A)
      .post("/shop/suggestions/usuals/mine")
      .send({
        skus: ["VIE-001"],
        target: { date: addDays(serviceDay(0), 7), pickupAddressId: null },
      })
      .expect(200);

    expect(jsonBody<UsualSuggestionView[]>(response)).toEqual([]);
  });
});
