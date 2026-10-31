/**
 * **Poser une promotion par le vrai geste** (`documentation/promotions/promotions.md`,
 * lot L12) — l'écran Promotions (`/admin/promotions`), seul endroit où une
 * promotion se règle depuis le 2026-10-31 (`promotions.md`, § 2.15).
 *
 * Depuis L12, l'étage `promotion` n'est plus occupé que par les promotions et
 * la remise d'un site n'est plus lue : les suites qui posaient une règle
 * d'étage promotion ou une remise sur la fiche d'un site passent par ici.
 * Les données de test viennent du geste, jamais d'un `INSERT` qui
 * contournerait l'agrégat (CLAUDE.md § 5).
 */
import type { PromotionTermsPayload } from "@lfd/contracts";

import { daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";

type Agent = ReturnType<E2eContext["asSub"]>;

/** « −15 % · tout le monde · tous acheminements · tout », ouverte depuis dix jours. */
export function promotionTerms(over: Partial<PromotionTermsPayload> = {}): PromotionTermsPayload {
  return {
    internalName: "Promotion de test",
    label: { fr: "Promotion de printemps", en: null, it: null },
    audienceLabels: { individuals: null, pros: null },
    reason: null,
    effect: { kind: "percent_off", value: 1_500 },
    ownFloor: null,
    stacksOverMercuriale: false,
    cumulative: false,
    validFrom: daysAgo(10),
    validTo: null,
    audiences: [{ kind: "everyone", companyId: null }],
    fulfillment: { kind: "displayed_price" },
    scope: { mode: "all_except", rules: [] },
    conditions: [],
    ...over,
  };
}

/** La portée « seulement cette famille ». */
export function onlyFamily(familyId: string): PromotionTermsPayload["scope"] {
  return { mode: "only", rules: [{ target: "category", targetId: familyId, eligible: true }] };
}

/** La portée « seulement cette déclinaison ». */
export function onlyVariant(sku: string): PromotionTermsPayload["scope"] {
  return { mode: "only", rules: [{ target: "variant", targetId: sku, eligible: true }] };
}

/** Pose la promotion (sous `b2b_pricing`) et rend son identifiant. */
export async function posePromotion(agent: Agent, terms: PromotionTermsPayload): Promise<string> {
  const response = await agent.post("/admin/promotions").send(terms).expect(201);
  return jsonBody<{ id: string }>(response).id;
}

/** Une remise de retrait d'une clientèle, dans les termes de l'ancienne fiche du site. */
export interface SiteDiscount {
  readonly mode: "percent" | "amount";
  /** bp (pourcentage) ou centimes (montant), comme `discount_value`. */
  readonly value: number;
}

/**
 * **La remise d'un point, posée en promotions** — exactement ce que la
 * reprise (§ 13.4) écrivait d'une remise de site : « pros actifs » pour les
 * pros, « tous sauf les pros actifs » pour les particuliers, retrait à ce
 * point, sur tout. Remplace les suites qui écrivaient `discount_mode` /
 * `b2c_discount_mode` en base, colonnes que le prix ne lit plus depuis L12.
 */
export async function poseSiteDiscount(
  agent: Agent,
  pickupId: string,
  discounts: { readonly b2b?: SiteDiscount; readonly b2c?: SiteDiscount },
): Promise<void> {
  const clienteles = [
    ["b2b", "pros_active", discounts.b2b],
    ["b2c", "everyone_but_active_pros", discounts.b2c],
  ] as const;
  for (const [clientele, kind, discount] of clienteles) {
    if (discount === undefined) {
      continue;
    }
    await posePromotion(
      agent,
      promotionTerms({
        internalName: `Remise de retrait · ${clientele}`,
        label: { fr: "Remise de retrait", en: null, it: null },
        effect: {
          kind: discount.mode === "percent" ? "percent_off" : "basket_amount_off",
          value: discount.value,
        },
        audiences: [{ kind, companyId: null }],
        fulfillment: { kind: "basket", pickup: { points: [pickupId] }, delivery: "none" },
      }),
    );
  }
}

/**
 * **Un point de retrait à identifiant connu** (`documentation/promotions/promotions.md`, § 2.14) : une
 * promotion ne nomme plus qu'un site qui existe — clé étrangère, et refus
 * nommé avant elle. Les suites qui visaient un point inventé (`pk_coeur`) le
 * sèment ici. Écrit en Prisma : la route de création tire son identifiant,
 * et ces suites ont besoin de le connaître d'avance.
 */
export async function seedPickupPoint(
  ctx: E2eContext,
  id: string,
  label = "Cœur de station",
): Promise<void> {
  await ctx.prisma.site.create({
    data: {
      id,
      label,
      ligne1: "1 place de la Station",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
    },
  });
}
