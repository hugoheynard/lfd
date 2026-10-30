/**
 * 🔴 **Propriété : le devis prédit la passation au centime, et la facture
 * s'additionne** — sur des paniers tirés au hasard.
 *
 * `shop-quote-placement.e2e-spec.ts` éprouve quatre paniers choisis à la main.
 * Les écarts de centime, eux, vivent dans les paniers que personne n'a pensé à
 * écrire : un pourcentage qui tombe sur la demie, un montant fixe plus grand
 * que l'assiette, un seuil de quantité qui écarte la moitié des lignes, une
 * promotion de ligne devant une promotion de panier. Le tirage est à graine
 * FIXE : un rouge se rejoue à l'identique, et le message nomme le panier.
 *
 * Deux propriétés, pour un invité (`/shop/quote` → `/shop/orders`) et pour un
 * inscrit (`/shop/quote/mine` → `/orders`) :
 *
 * 1. le devis, la commande écrite et (invité) l'intention de règlement disent
 *    le même sous-total, la même remise, le même total TTC ;
 * 2. le décompte du devis retombe sur son total : marchandises − remise − bon
 *    + frais + TVA = total TTC, et la somme des lignes HT = le sous-total.
 */
import { randomUUID } from "node:crypto";

import type {
  CreatedPickupResponse,
  PlaceShopOrderPayload,
  PlacedOrderResponse,
  PromotionTermsPayload,
  ShopQuoteView,
} from "@lfd/contracts";

import { PlaceShopOrderCommand } from "../src/b2b/orders/application/commands/place-shop-order.command.js";
import { PlaceShopOrderHandler } from "../src/b2b/orders/application/commands/place-shop-order.handler.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { PricingMaterialsCache } from "../src/b2b/pricing/infrastructure/pricing-materials.cache.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { E2E_FAMILIES } from "./catalog-fixture.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { createUser } from "./factories.js";

const REGISTERED = "auth0|propriete-inscrit";
const SERVICE_DAY = serviceDay();
/** Le tirage est rejouable : changer la graine change TOUS les paniers. */
const SEED = 20_261_030;
const CASES = 50;
const SKUS = [
  "VIE-001-1",
  "VIE-002-1",
  "VIE-003-1",
  "VIE-004-1",
  "VIE-011-1",
  "PAI-001-1",
  "PAI-002-1",
  "PAI-004-1",
] as const;

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({
      paymentIntentId: `pi_prop_${String(intentCounter)}`,
      clientSecret: `pi_prop_${String(intentCounter)}_secret`,
    });
  },
  retrieveIntent: (id: string) =>
    Promise.resolve({
      paymentIntentId: id,
      clientSecret: `${id}_secret`,
      state: "awaiting_payment" as const,
    }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

/** Un tirage déterministe (mulberry32) — rien ne dépend de l'horloge ni de `Math.random`. */
function drawer(seed: number): { next: () => number; int: (min: number, max: number) => number } {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return { next, int: (min, max) => min + Math.floor(next() * (max - min + 1)) };
}

let ctx: E2eContext;
let site = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
  await ctx.reset();
  ctx.app.get(PricingMaterialsCache).invalidate();
  site = await scene();
});

afterAll(async () => {
  await ctx.close();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Un point de retrait, un particulier inscrit, puis la bascule des promotions. */
async function scene(): Promise<string> {
  await createUser(ctx.prisma, { auth0Sub: REGISTERED });
  const created = jsonBody<CreatedPickupResponse>(
    await staff()
      .post("/admin/pickup-addresses")
      .send({
        label: "Le Labo",
        ligne1: "5 rue du Four",
        ligne2: "",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
        discounts: { b2b: null, b2c: null },
      })
      .expect(201),
  );
  await ctx.prisma.$executeRawUnsafe("SELECT public.bascule_des_promotions()");
  ctx.app.get(PricingMaterialsCache).invalidate();
  return created.id;
}

/** Les promotions du panier tiré — au plus UNE de panier, et une de ligne. */
type Drawn = Partial<PromotionTermsPayload>;

function terms(index: number, over: Drawn): PromotionTermsPayload {
  return {
    internalName: `Tirage ${String(index)}`,
    label: { fr: "Offre tirée", en: null, it: null },
    audienceLabels: { individuals: null, pros: null },
    reason: null,
    effect: { kind: "percent_off", value: 2_000 },
    ownFloor: null,
    stacksOverMercuriale: false,
    cumulative: false,
    validFrom: daysAgo(1),
    validTo: null,
    audiences: [{ kind: "everyone", companyId: null }],
    fulfillment: { kind: "any", pickupId: null },
    scope: { mode: "all_except", rules: [] },
    conditions: [],
    ...over,
  };
}

const PERCENTS = [
  1, 333, 500, 1_000, 1_250, 1_500, 2_000, 3_333, 10_000,
] as const satisfies readonly [number, ...number[]];
const AMOUNTS = [1, 50, 199, 300, 1_000, 5_000, 99_999] as const;
/** Un élément tiré ; les listes ci-dessous ne sont jamais vides. */
function pick<T>(rng: ReturnType<typeof drawer>, items: readonly [T, ...T[]]): T {
  return items[rng.int(0, items.length - 1)] ?? items[0];
}

type Audience = PromotionTermsPayload["audiences"][number];
const AUDIENCES: readonly [Audience, ...Audience[]] = [
  { kind: "everyone" as const, companyId: null },
  { kind: "individuals_registered" as const, companyId: null },
  { kind: "everyone_but_active_pros" as const, companyId: null },
];

interface Basket {
  readonly lines: PlaceShopOrderPayload["lines"];
  readonly promotions: readonly PromotionTermsPayload[];
  readonly describe: string;
}

function drawBasket(rng: ReturnType<typeof drawer>, index: number): Basket {
  const picked = [...SKUS].sort(() => rng.next() - 0.5).slice(0, rng.int(1, 4));
  const lines = picked.map((sku) => ({ sku, quantity: rng.int(1, 15) }));
  const promotions: PromotionTermsPayload[] = [];
  const audience = pick(rng, AUDIENCES);
  if (rng.next() < 0.75) {
    const amount = rng.next() < 0.35;
    const withMin = rng.next() < 0.4;
    const onFamily = rng.next() < 0.35;
    promotions.push(
      terms(index, {
        audiences: [audience],
        effect: amount
          ? { kind: "basket_amount_off", value: pick(rng, AMOUNTS) }
          : { kind: "percent_off", value: pick(rng, PERCENTS) },
        fulfillment:
          rng.next() < 0.5
            ? { kind: "pickup", pickupId: null }
            : { kind: "pickup_point", pickupId: site },
        conditions: withMin ? [{ kind: "min_quantity", value: rng.int(2, 8) }] : [],
        scope: onFamily
          ? {
              mode: "only",
              rules: [{ target: "category", targetId: E2E_FAMILIES.VIE.id, eligible: true }],
            }
          : { mode: "all_except", rules: [] },
      }),
    );
  }
  if (rng.next() < 0.3) {
    promotions.push(
      terms(index + 1_000, {
        effect: { kind: "percent_off", value: pick(rng, PERCENTS) },
      }),
    );
  }
  return {
    lines,
    promotions,
    describe: JSON.stringify({
      lines,
      promotions: promotions.map((p) => [p.effect, p.fulfillment, p.conditions, p.scope.mode]),
    }),
  };
}

async function setPromotions(promotions: readonly PromotionTermsPayload[]): Promise<void> {
  await ctx.prisma.promotionScopeRule.deleteMany();
  await ctx.prisma.promotionAudienceTarget.deleteMany();
  await ctx.prisma.promotion.deleteMany();
  for (const promotion of promotions) {
    const response = await staff()
      .post(
        promotion.fulfillment.kind === "pickup_point"
          ? `/admin/sites/${site}/promotions`
          : "/admin/promotions",
      )
      .send(promotion);
    if (response.status !== 201) {
      throw new Error(
        `Pose refusée (${String(response.status)}) : ${JSON.stringify(response.body)} pour ${JSON.stringify(promotion)}`,
      );
    }
  }
  ctx.app.get(PricingMaterialsCache).invalidate();
}

interface Paid {
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly totalCents: number;
}

const quotePaid = (view: ShopQuoteView): Paid => ({
  subtotalCents: view.subtotalHtCents,
  discountCents: view.discountCents,
  totalCents: view.totalCents,
});

async function orderPaid(orderId: string): Promise<Paid> {
  const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  return {
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    totalCents: order.totalCents,
  };
}

/** Le décompte du devis retombe sur son total, et ses lignes sur son sous-total. */
function expectArithmetic(view: ShopQuoteView, label: string): void {
  const linesHt = view.lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const vat = view.vat.reduce((sum, share) => sum + share.amountCents, 0);
  expect({ label, linesHt }).toEqual({ label, linesHt: view.subtotalHtCents });
  expect(view.discountCents).toBeGreaterThanOrEqual(0);
  expect(view.discountCents).toBeLessThanOrEqual(view.subtotalHtCents);
  const rebuilt =
    view.subtotalHtCents -
    view.discountCents -
    view.voucherDiscountCents +
    view.deliveryFeeCents +
    vat;
  expect({ label, rebuilt }).toEqual({ label, rebuilt: view.totalCents });
}

const FULFILLMENT = (): { method: "pickup"; pickupAddressId: string } => ({
  method: "pickup",
  pickupAddressId: site,
});

describe("le devis prédit la passation, sur des paniers tirés au hasard", () => {
  it(`${String(CASES)} paniers (graine ${String(SEED)}) : même total TTC au centime, décompte qui s'additionne`, async () => {
    const rng = drawer(SEED);
    let discounted = 0;

    for (let index = 0; index < CASES; index += 1) {
      const basket = drawBasket(rng, index);
      await setPromotions(basket.promotions);
      const label = `#${String(index)} ${basket.describe}`;

      const anonymous = jsonBody<ShopQuoteView>(
        await ctx
          .http()
          .post("/shop/quote")
          .send({ lines: basket.lines, fulfillment: FULFILLMENT() })
          .expect(200),
      );
      const mine = jsonBody<ShopQuoteView>(
        await ctx
          .asSub(REGISTERED)
          .post("/shop/quote/mine")
          .send({ lines: basket.lines, fulfillment: FULFILLMENT() })
          .expect(200),
      );
      expectArithmetic(anonymous, `${label} (invité)`);
      expectArithmetic(mine, `${label} (inscrit)`);

      // Par le handler : la route publique est limitée en débit, et cinquante
      // passations d'invité de suite la feraient répondre 429 — sans rapport
      // avec ce qu'on éprouve ici (le calcul, pas la porte HTTP).
      const guest = await ctx.app.get(PlaceShopOrderHandler).execute(
        new PlaceShopOrderCommand({
          idempotencyKey: randomUUID(),
          salesTerms: null,
          buyer: { firstName: "Camille", email: "camille@visiteur.fr", phone: "0600000000" },
          fulfillmentMethod: "pickup",
          requestedWindow: { start: "07:00", end: "08:00" },
          deliveryAddress: null,
          deliveryAddressId: null,
          pickupAddressId: site,
          requestedDeliveryDate: SERVICE_DAY,
          note: "",
          lines: basket.lines,
        }),
      );
      const registered = jsonBody<PlacedOrderResponse>(
        await ctx
          .asSub(REGISTERED)
          .post("/orders")
          .send({
            idempotencyKey: randomUUID(),
            salesTerms: null,
            pickupAddressId: site,
            requestedDeliveryDate: SERVICE_DAY,
            fulfillmentMethod: "pickup",
            requestedWindow: { start: "07:00", end: "08:00" },
            note: "",
            lines: basket.lines,
          })
          .expect(201),
      );
      await ctx.drain();

      expect({ label, invité: await orderPaid(guest.id) }).toEqual({
        label,
        invité: quotePaid(anonymous),
      });
      expect({ label, inscrit: await orderPaid(registered.id) }).toEqual({
        label,
        inscrit: quotePaid(mine),
      });
      expect({ label, intention: guest.payment?.amountCents }).toEqual({
        label,
        // Un total nul (100 % de remise) n'ouvre aucune intention de règlement.
        intention: anonymous.totalCents > 0 ? anonymous.totalCents : undefined,
      });
      if (mine.discountCents > 0) discounted += 1;
    }

    // Le tirage doit éprouver des remises : un lot sans remise ne prouverait rien.
    expect(discounted).toBeGreaterThan(CASES / 5);
  }, 600_000);
});
