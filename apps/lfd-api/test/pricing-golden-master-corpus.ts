/**
 * **Le corpus du golden master du chiffrage** (plan `le-prix-d-un-panier.md`,
 * §3 G1) : des paniers tirés à graine FIXE, chacun avec ses promotions, son
 * acheminement, son mode de TVA du port, son bon et ses deux révisions.
 *
 * ⚠️ Changer la graine, l'ordre des tirages ou une liste ci-dessous change
 * TOUS les paniers, donc tout l'instantané : un tel changement se fait avec
 * `LFD_GOLDEN_MASTER_WRITE=1`, et le diff de l'instantané se relit en entier.
 */
import type { PromotionTermsPayload } from "@lfd/contracts";

import { E2E_FAMILIES } from "./catalog-fixture.js";
import { anchoredDaysAgo, TEN_PERCENT_SKU } from "./pricing-golden-master-scene.js";
import { drawer, pick, type Drawer } from "./seeded-draw.js";

/** La graine du corpus — la date du lot L0. */
export const GOLDEN_SEED = 20_261_103;
/** La taille du corpus : 32 paniers tiennent en une quarantaine de secondes (2026-11-03). */
export const GOLDEN_BASKETS = 32;

const SKUS = [
  "VIE-001-1",
  "VIE-002-1",
  "VIE-003-1",
  "VIE-011-1",
  "PAI-001-1",
  "PAI-002-1",
  TEN_PERCENT_SKU,
] as const;
/** Les SKU qu'une révision peut ajouter — jamais dans le tirage du panier. */
const REVISION_SKUS = ["VIE-004-1", "PAI-004-1"] as const;

export type GoldenFulfillment = "pickup" | "courier_flat" | "courier_percent";
export type DeliveryVatMode = "standard" | "follows_goods";

export interface GoldenLine {
  readonly sku: string;
  readonly quantity: number;
}

export interface GoldenBasket {
  readonly key: string;
  readonly lines: readonly GoldenLine[];
  readonly fulfillment: GoldenFulfillment;
  readonly deliveryVat: DeliveryVatMode;
  readonly promotions: readonly PromotionTermsPayload[];
  /** Paliers de bon de fidélité du particulier ; 0 = pas de bon. */
  readonly voucherSteps: number;
  /** La commande voulue par le client, puis par l'équipe (révision en deux temps). */
  readonly clientRevision: readonly GoldenLine[];
  readonly staffRevision: readonly GoldenLine[];
}

type Audience = PromotionTermsPayload["audiences"][number];
const AUDIENCES: readonly [Audience, ...Audience[]] = [
  { kind: "everyone", companyId: null },
  { kind: "individuals_registered", companyId: null },
  { kind: "pros_active", companyId: null },
  { kind: "everyone_but_active_pros", companyId: null },
];
const PERCENTS = [333, 500, 1_000, 1_250, 2_000, 3_333] as const;
const AMOUNTS = [1, 199, 300, 1_000, 5_000] as const;

function terms(name: string, over: Partial<PromotionTermsPayload>): PromotionTermsPayload {
  return {
    internalName: name,
    label: { fr: name, en: null, it: null },
    audienceLabels: { individuals: null, pros: null },
    reason: null,
    effect: { kind: "percent_off", value: 1_000 },
    ownFloor: null,
    cumulative: false,
    validFrom: anchoredDaysAgo(10),
    validTo: null,
    audiences: [{ kind: "everyone", companyId: null }],
    fulfillment: { kind: "displayed_price" },
    scope: { mode: "all_except", rules: [] },
    conditions: [],
    ...over,
  };
}

function basketEffect(rng: Drawer): PromotionTermsPayload["effect"] {
  return rng.next() < 0.3
    ? { kind: "basket_amount_off", value: pick(rng, AMOUNTS) }
    : { kind: "percent_off", value: pick(rng, PERCENTS) };
}

function basketScope(rng: Drawer): PromotionTermsPayload["scope"] {
  return rng.next() < 0.3
    ? {
        mode: "only",
        rules: [{ target: "category", targetId: E2E_FAMILIES.VIE.id, eligible: true }],
      }
    : { mode: "all_except", rules: [] };
}

/**
 * Le créneau de la scène est 07:00-08:00 un mercredi : une plage « mercredi
 * 06:00-09:00 » le couvre, « jeudi » non. Les deux se tirent.
 */
function hoursCondition(rng: Drawer): PromotionTermsPayload["conditions"][number] {
  return {
    kind: "weekly_hours",
    moment: "handover_at",
    announceOutside: false,
    windows: [{ weekdays: [rng.next() < 0.6 ? "wed" : "thu"], start: "06:00", end: "09:00" }],
  };
}

function drawPromotions(rng: Drawer, key: string): PromotionTermsPayload[] {
  const promotions: PromotionTermsPayload[] = [];
  const basketCount = rng.int(0, 3);
  const cumulative = basketCount > 1;
  for (let rank = 0; rank < basketCount; rank += 1) {
    const atSlot = rng.next() < 0.3;
    promotions.push(
      terms(`${key} panier ${String(rank)}`, {
        cumulative,
        effect: basketEffect(rng),
        audiences: [pick(rng, AUDIENCES)],
        fulfillment: { kind: "basket", pickup: "all", delivery: rng.next() < 0.4 ? "all" : "none" },
        scope: basketScope(rng),
        conditions: [
          ...(rng.next() < 0.3 ? [{ kind: "min_quantity" as const, value: rng.int(2, 8) }] : []),
          ...(atSlot ? [hoursCondition(rng)] : []),
        ],
      }),
    );
  }
  if (rng.next() < 0.35) {
    promotions.push(
      terms(`${key} étiquette`, {
        effect: { kind: "percent_off", value: pick(rng, PERCENTS) },
        audiences: [pick(rng, AUDIENCES)],
      }),
    );
  }
  return promotions;
}

function drawLines(rng: Drawer, skus: readonly string[], most: number): GoldenLine[] {
  const picked = [...skus].sort(() => rng.next() - 0.5).slice(0, rng.int(1, most));
  return picked.map((sku) => ({ sku, quantity: rng.int(1, 15) }));
}

const FULFILLMENTS = ["pickup", "pickup", "courier_flat", "courier_percent"] as const;

function drawBasket(rng: Drawer, index: number): GoldenBasket {
  const key = `b${String(index).padStart(2, "0")}`;
  const lines = drawLines(rng, SKUS, 4);
  const fulfillment = pick(rng, FULFILLMENTS);
  const deliveryVat = rng.next() < 0.5 ? "standard" : "follows_goods";
  const promotions = drawPromotions(rng, key);
  const voucherSteps = rng.next() < 0.35 ? rng.int(1, 3) : 0;
  const added = drawLines(rng, REVISION_SKUS, 1);
  const clientRevision = [...lines, ...added];
  // L'équipe retire la première ligne, ou double la seule : jamais la commande du client.
  const staffRevision =
    lines.length > 1
      ? lines.slice(1)
      : lines.map((line) => ({ ...line, quantity: line.quantity * 2 }));
  return {
    key,
    lines,
    fulfillment,
    deliveryVat,
    promotions,
    voucherSteps,
    clientRevision,
    staffRevision,
  };
}

/** Le corpus entier, dans l'ordre du tirage. */
export function goldenCorpus(): readonly GoldenBasket[] {
  const rng = drawer(GOLDEN_SEED);
  return Array.from({ length: GOLDEN_BASKETS }, (_, index) => drawBasket(rng, index));
}
