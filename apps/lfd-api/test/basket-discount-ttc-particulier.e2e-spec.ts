/**
 * E2E des **remises d'un particulier, composées en TTC, de l'étiquette au
 * règlement** (`documentation/pricing/obsolete/plan-centime-particuliers.md`,
 * § 4 et suivants ; `documentation/promotions/promotions.md`, § 2.11) — le
 * pendant de `basket-discount-vat-split-to-invoice.e2e-spec.ts`, qui tient le
 * pro en HT.
 *
 * Un particulier est construit en TTC (`exact_ht`) : ligne = quantité ×
 * étiquette, remises prises sur le TTC, total = Σ lignes − remises, et la TVA
 * n'est extraite qu'à la fin, par taux, au centime SUPÉRIEUR — le HT absorbe
 * l'arrondi. Aucune facture n'est émise à un particulier (plan, § 6) : le
 * « document » est la commande figée (`ttc_by_rate`, `order_discounts`) et
 * l'intention de carte.
 *
 * Tous les montants attendus sont recalculés ici en entiers, sans le code testé.
 */
import { randomUUID } from "node:crypto";

import type { PlacedOrderResponse, ShopCatalogueView } from "@lfd/contracts";
import { htMillicentsOf } from "@lfd/pim-contracts";
import { z } from "zod";

import type {
  CreateIntentParams,
  CreatedIntent,
} from "../src/card-payment/domain/ports/card-provider-types.js";
import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import { PricingMaterialsCache } from "../src/lafoliecoffee/pricing/infrastructure/pricing-materials.cache.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { cardPaid, E2eCardProvider, E2eCardProviders } from "./card-payments.js";
import { createUser } from "./factories.js";
import { onlyVariant, posePromotion, promotionTerms } from "./promotion-fixtures.js";

const CLIENT = "auth0|particulier-remises";
const CROISSANT = "VIE-001-1";
const PAIN = "VIE-002-1";
/** Le cas du § 1 du plan : 21,00 € TTC à 5,5 %. */
const CROISSANT_LABEL = 2_100;
/** 3,37 € à 20 % : 4 pièces = 13,48 €, dont 20 % = 2,696 (un reste .6). */
const PAIN_LABEL = 337;
const BP = 10_000;

/**
 * Le prestataire des e2e, qui garde en plus ce qu'on lui demande d'encaisser :
 * le montant de l'intention est le sujet de la suite.
 */
class AmountRecordingCardProvider extends E2eCardProvider {
  readonly requested: CreateIntentParams[] = [];

  override createIntent(params: CreateIntentParams): Promise<CreatedIntent> {
    this.requested.push(params);
    return super.createIntent(params);
  }
}

/** Le registre doublé, servi par le prestataire qui garde les montants. */
class AmountRecordingCardProviders extends E2eCardProviders {
  override readonly provider: AmountRecordingCardProvider;

  constructor(prefix: string) {
    super(prefix);
    this.provider = new AmountRecordingCardProvider(prefix);
  }
}

/** Jamais remis à zéro : deux commandes ne partagent pas une intention. */
const cardProviders = new AmountRecordingCardProviders("pi_particulier");
const intents = cardProviders.provider.requested;
let ctx: E2eContext;
let pickupId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: CardProviders, value: cardProviders },
      {
        token: AdminTokenVerifier,
        value: { verify: () => Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }) },
      },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

/** Une étiquette TTC saisie au public, à un taux : le HT en dérive, comme au référentiel. */
async function label(sku: string, ttcCents: number, rate: number): Promise<void> {
  const htMillicents = htMillicentsOf(ttcCents, rate);
  if (htMillicents === null) {
    throw new Error("Étiquette sans hors taxe.");
  }
  const item = await ctx.prisma.catalogItem.findUniqueOrThrow({
    where: { sku },
    select: { publicByContext: true },
  });
  const byContext = Object.fromEntries(
    Object.keys(item.publicByContext as Record<string, unknown>).map((key) => [
      key,
      { vatRatePercent: rate, htMillicents },
    ]),
  );
  await ctx.prisma.catalogItem.update({
    where: { sku },
    data: { publicTtcCents: ttcCents, vatRatePercent: rate, publicByContext: byContext },
  });
  await ctx.prisma.catalogPriceHistory.updateMany({
    where: { productSku: sku.replace(/-\d+$/, "") },
    data: { vatRatePercent: rate },
  });
}

beforeEach(async () => {
  await ctx.reset();
  intents.splice(0);
  pickupId = (
    await ctx.prisma.site.create({
      data: {
        label: "Le Labo",
        ligne1: "Route de la Balme",
        ligne2: "",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
        isDefault: true,
      },
      select: { id: true },
    })
  ).id;
  await label(CROISSANT, CROISSANT_LABEL, 5.5);
  await label(PAIN, PAIN_LABEL, 20);
  ctx.app.get(PricingMaterialsCache).invalidate();
  await createUser(ctx.prisma, { auth0Sub: CLIENT, firstName: "Léa" });
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** La passation d'un particulier inscrit : retrait, carte, par `POST /orders`. */
async function place(lines: readonly { sku: string; quantity: number }[]) {
  const response = jsonBody<PlacedOrderResponse>(
    await ctx
      .asSub(CLIENT)
      .post("/orders")
      .send({
        idempotencyKey: randomUUID(),
        salesTerms: null,
        fulfillmentMethod: "pickup",
        requestedWindow: { start: "07:00", end: "08:00" },
        pickupAddressId: pickupId,
        requestedDeliveryDate: serviceDay(),
        note: "",
        lines,
      })
      .expect(201),
  );
  return response;
}

/** Règle la carte comme le webhook du prestataire, par la vraie commande du webhook. */
async function pay(orderId: string): Promise<void> {
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { stripePaymentIntentId: true },
  });
  await cardPaid(ctx, row.stripePaymentIntentId ?? "");
}

const shareSchema = z.array(
  z.object({ rate: z.number(), htCents: z.number(), ttcCents: z.number().optional() }),
);
const byRateSchema = z.array(
  z.object({ rate: z.number(), htCents: z.number(), vatCents: z.number(), ttcCents: z.number() }),
);

/** Arrondi au plus proche, la moitié vers le haut : num / den. */
const roundHalfUp = (num: number, den: number): number => Math.floor((2 * num + den) / (2 * den));
/** La TVA contenue dans un TTC, au centime SUPÉRIEUR (plan, § 4, étape 2). */
const vatCeil = (ttc: number, ratePermille: number): number =>
  Math.ceil((ttc * ratePermille) / (1_000 + ratePermille));

/** Les parts par taux : le plancher de chaque part, puis le centime restant au plus fort reste. */
function splitByLargestRemainder(
  bases: readonly number[],
  num: number,
  den: number,
  total: number,
): readonly number[] {
  const shares = bases.map((base) => Math.floor((base * num) / den));
  const order = bases
    .map((base, index) => ({ index, rest: (base * num) % den }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  let left = total - shares.reduce((sum, cents) => sum + cents, 0);
  for (const { index } of order) {
    if (left <= 0) {
      break;
    }
    shares[index] = (shares[index] ?? 0) + 1;
    left -= 1;
  }
  return shares;
}

describe("un particulier, deux remises cumulées sur deux taux", () => {
  /**
   * −20 % sur tout puis −10 % sur le seul pain, cumulables, sur 1 × 21,00 € (5,5 %)
   * et 4 × 3,37 € (20 %). Tout se calcule sur le TTC :
   *   sous-total 2 100 + 1 348 = 3 448 ; A = 20 % × 3 448 = 689,6 → 690 ;
   *   planchers 420 + 269 = 689 : le centime restant va au plus fort reste (.6 : le pain) ;
   *   reste du pain après A : 1 348 × (3 448 − 690) / 3 448 = 1 078,2 ; B = 107,82 → 108,
   *   tout au 20 %.
   */
  it("chaînées sur le TTC, ventilées par taux, TVA extraite au centime supérieur", async () => {
    const everything = await posePromotion(
      staff(),
      promotionTerms({
        internalName: "Moins vingt au panier",
        label: { fr: "Moins vingt pour cent", en: null, it: null },
        effect: { kind: "percent_off", value: 2_000 },
        fulfillment: { kind: "basket", pickup: "all", delivery: "all" },
        cumulative: true,
      }),
    );
    const onePiece = await posePromotion(
      staff(),
      promotionTerms({
        internalName: "Moins dix sur le pain",
        label: { fr: "Moins dix pour cent sur le pain", en: null, it: null },
        effect: { kind: "percent_off", value: 1_000 },
        fulfillment: { kind: "basket", pickup: "all", delivery: "all" },
        scope: onlyVariant(PAIN),
        cumulative: true,
      }),
    );
    ctx.app.get(PricingMaterialsCache).invalidate();
    const lines = [
      { sku: CROISSANT, quantity: 1 },
      { sku: PAIN, quantity: 4 },
    ];

    // Le devis du particulier inscrit, avant la passation.
    const quote = jsonBody<{ totalCents: number; discountCents: number }>(
      await ctx
        .asSub(CLIENT)
        .post("/shop/quote/mine")
        .send({ lines, fulfillment: { method: "pickup", pickupAddressId: pickupId } })
        .expect(200),
    );
    const order = await place(lines);
    await pay(order.id);

    // Les attentes, en entiers, hors du code testé.
    const croissantTtc = 1 * CROISSANT_LABEL;
    const painTtc = 4 * PAIN_LABEL;
    const subtotal = croissantTtc + painTtc;
    const firstAmount = roundHalfUp(subtotal * 2_000, BP);
    const firstShares = splitByLargestRemainder([croissantTtc, painTtc], 2_000, BP, firstAmount);
    const painLeft = { num: painTtc * (subtotal - firstAmount), den: subtotal };
    const secondAmount = roundHalfUp(painLeft.num * 1_000, painLeft.den * BP);
    expect(subtotal).toBe(3_448);
    expect(firstAmount).toBe(690);
    expect(firstShares).toEqual([420, 270]);
    expect(secondAmount).toBe(108);
    const totalPaid = subtotal - firstAmount - secondAmount;
    expect(totalPaid).toBe(2_650);
    const netTtc = [
      croissantTtc - (firstShares[0] ?? 0),
      painTtc - (firstShares[1] ?? 0) - secondAmount,
    ];
    expect(netTtc).toEqual([1_680, 970]);
    const vat = [vatCeil(netTtc[0] ?? 0, 55), vatCeil(netTtc[1] ?? 0, 200)];
    const ht = [(netTtc[0] ?? 0) - (vat[0] ?? 0), (netTtc[1] ?? 0) - (vat[1] ?? 0)];

    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const lineRows = await ctx.prisma.orderLine.findMany({
      where: { orderId: order.id },
      orderBy: { sku: "asc" },
    });
    const parts = await ctx.prisma.orderDiscount.findMany({
      where: { orderId: order.id, archivedAt: null },
      orderBy: { rank: "asc" },
    });

    // Les lignes : quantité × étiquette, au centime.
    expect(lineRows.map((line) => line.lineTotalTtcCents)).toEqual([croissantTtc, painTtc]);

    // Les remises : dans l'ordre de la chaîne, sur l'assiette TTC.
    expect(parts.map((part) => part.promotionId)).toEqual([everything, onePiece]);
    expect(parts.map((part) => part.amountTtcCents)).toEqual([firstAmount, secondAmount]);
    expect(parts[0]?.baseCents).toBe(subtotal);
    expect(parts[1]?.baseCents).toBe(roundHalfUp(painLeft.num, painLeft.den));
    const ttcShares = (value: unknown): readonly number[] =>
      shareSchema
        .parse(value)
        .sort((a, b) => a.rate - b.rate)
        .map((share) => share.ttcCents ?? Number.NaN);
    expect(ttcShares(parts[0]?.vatShares)).toEqual(firstShares);
    // La seconde ne touche que le pain : une part, au taux de 20 %.
    expect(shareSchema.parse(parts[1]?.vatShares).map((s) => [s.rate, s.ttcCents])).toEqual([
      [20, secondAmount],
    ]);

    // Un seul total, du devis à Stripe : Σ étiquettes − remises.
    expect(quote.totalCents).toBe(totalPaid);
    expect(quote.discountCents).toBeGreaterThan(0);
    expect(row.totalCents).toBe(totalPaid);
    expect(row.discountTtcCents).toBe(firstAmount + secondAmount);
    expect(intents.map((intent) => intent.amountCents)).toEqual([totalPaid]);
    expect(order.payment?.amountCents).toBe(totalPaid);
    expect(row.paymentStatus).toBe("paid");

    // La TVA extraite par taux du TTC net ; le HT absorbe l'arrondi ; aucune base négative.
    const byRate = byRateSchema.parse(row.ttcByRate).sort((a, b) => a.rate - b.rate);
    expect(byRate.map((entry) => entry.rate)).toEqual([5.5, 20]);
    expect(byRate.map((entry) => entry.ttcCents)).toEqual(netTtc);
    expect(byRate.map((entry) => entry.vatCents)).toEqual(vat);
    expect(byRate.map((entry) => entry.htCents)).toEqual(ht);
    for (const entry of byRate) {
      expect(entry.htCents).toBeGreaterThanOrEqual(0);
      expect(entry.htCents + entry.vatCents).toBe(entry.ttcCents);
    }
    expect(row.vatCents).toBe(vat.reduce((sum, cents) => sum + cents, 0));
    expect(row.subtotalCents - row.discountCents + row.vatCents).toBe(totalPaid);
  });
});

describe("la vignette remisée d'un particulier", () => {
  const shelf = async (): Promise<ShopCatalogueView> =>
    jsonBody<ShopCatalogueView>(await ctx.http().get("/shop/catalogue").expect(200));
  const unitOf = (view: ShopCatalogueView, sku: string) =>
    view.items.find((item) => item.sku === sku);

  /**
   * Une promotion « dans le prix affiché » (−12 %) sur le croissant : la
   * vignette montre l'étiquette NETTE ; le client qui en prend 3 ou 7 paie
   * quantité × cette étiquette, au centime — pas un total recalculé en HT.
   * Puis une promotion AU PANIER sur le pain : la vignette ne montre que son
   * texte, jamais un prix net, et l'étiquette reste celle d'avant.
   */
  it("paie quantité × étiquette lue, et une promotion de panier ne bouge pas l'étiquette", async () => {
    await posePromotion(
      staff(),
      promotionTerms({
        internalName: "Moins douze sur le croissant",
        label: { fr: "Moins douze pour cent", en: null, it: null },
        effect: { kind: "percent_off", value: 1_200 },
        scope: onlyVariant(CROISSANT),
      }),
    );
    ctx.app.get(PricingMaterialsCache).invalidate();

    const before = await shelf();
    const labelCents = unitOf(before, CROISSANT)?.unitPriceTtcCents ?? Number.NaN;
    // Une vraie remise, et une étiquette en centimes entiers.
    expect(labelCents).toBeLessThan(CROISSANT_LABEL);
    expect(Number.isInteger(labelCents)).toBe(true);
    expect(unitOf(before, PAIN)?.unitPriceTtcCents).toBe(PAIN_LABEL);

    for (const quantity of [3, 7]) {
      intents.splice(0);
      const order = await place([{ sku: CROISSANT, quantity }]);
      await pay(order.id);
      const expected = quantity * labelCents;
      const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      const lineRow = await ctx.prisma.orderLine.findFirstOrThrow({ where: { orderId: order.id } });
      const [entry, ...others] = byRateSchema.parse(row.ttcByRate);

      expect(lineRow.lineTotalTtcCents).toBe(expected);
      expect(row.totalCents).toBe(expected);
      expect(intents.map((intent) => intent.amountCents)).toEqual([expected]);
      expect(others).toEqual([]);
      expect(entry).toEqual({
        rate: 5.5,
        ttcCents: expected,
        vatCents: vatCeil(expected, 55),
        htCents: expected - vatCeil(expected, 55),
      });
      expect(row.paymentStatus).toBe("paid");
    }

    // La promotion au panier, sur le pain seul, avec son texte de vignette.
    await posePromotion(
      staff(),
      promotionTerms({
        internalName: "Moins dix au panier sur le pain",
        label: { fr: "Moins dix pour cent", en: null, it: null },
        tileText: { fr: "−10 % sur le pain", en: null, it: null },
        effect: { kind: "percent_off", value: 1_000 },
        fulfillment: { kind: "basket", pickup: "all", delivery: "all" },
        scope: onlyVariant(PAIN),
      }),
    );
    ctx.app.get(PricingMaterialsCache).invalidate();

    const after = await shelf();
    const bread = unitOf(after, PAIN);
    expect(bread?.unitPriceTtcCents).toBe(PAIN_LABEL);
    expect(bread?.fulfillmentOffers?.map((offer) => offer.text)).toEqual(["−10 % sur le pain"]);
    expect(unitOf(after, CROISSANT)?.unitPriceTtcCents).toBe(labelCents);
    expect(unitOf(after, CROISSANT)?.fulfillmentOffers).toBeUndefined();

    // À la caisse, la remise de panier se prend sur le TTC des étiquettes.
    intents.splice(0);
    const order = await place([{ sku: PAIN, quantity: 5 }]);
    const gross = 5 * PAIN_LABEL;
    const discount = roundHalfUp(gross * 1_000, BP);
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.discountTtcCents).toBe(discount);
    expect(row.totalCents).toBe(gross - discount);
    expect(intents.map((intent) => intent.amountCents)).toEqual([gross - discount]);
    const [entry] = byRateSchema.parse(row.ttcByRate);
    expect(entry).toEqual({
      rate: 20,
      ttcCents: gross - discount,
      vatCents: vatCeil(gross - discount, 200),
      htCents: gross - discount - vatCeil(gross - discount, 200),
    });
  });
});
