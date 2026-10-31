import { z } from "zod";

import type { PromotionOfferFulfillmentView } from "./promotion-offer.js";

/**
 * **Les promotions, vues du back-office** (plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.9, lot L7).
 *
 * Les schémas ne valident que la FORME : les invariants (point ⇔
 * acheminement, effet ⇔ point, portée, fenêtre) sont tenus par l'agrégat
 * `Promotion`, et le refus nommé vient de lui.
 */

export const PROMOTION_AUDIENCE_KIND_VALUES = [
  "everyone",
  "individuals",
  "individuals_guest",
  "individuals_registered",
  "pros",
  "pros_active",
  "pros_pending",
  "company",
  "company_and_sites",
  "everyone_but_active_pros",
] as const;
export type PromotionAudienceKindValue = (typeof PROMOTION_AUDIENCE_KIND_VALUES)[number];

/**
 * « Dans le prix affiché » (le prix de l'article baisse au catalogue, pour
 * tous les acheminements) ou « en remise au panier », où retrait et
 * livraison se cochent (plan `documentation/promotions/plan-acheminements-a-cocher.md`).
 */
export const PROMOTION_FULFILLMENT_KIND_VALUES = ["displayed_price", "basket"] as const;
export type PromotionFulfillmentKindValue = (typeof PROMOTION_FULFILLMENT_KIND_VALUES)[number];

export const PROMOTION_EFFECT_KIND_VALUES = [
  "percent_off",
  "unit_amount_off",
  "fixed_unit_price",
  "basket_amount_off",
] as const;
export type PromotionEffectKindValue = (typeof PROMOTION_EFFECT_KIND_VALUES)[number];

export const PROMOTION_SCOPE_TARGET_VALUES = ["category", "product", "variant"] as const;
export type PromotionScopeTargetValue = (typeof PROMOTION_SCOPE_TARGET_VALUES)[number];

/**
 * L'état lu à l'instant de la question : `scheduled` = active mais pas
 * encore ouverte, `ended` = active et fermée, sans être archivée.
 */
export const PROMOTION_LIFECYCLE_STATES = [
  "active",
  "scheduled",
  "paused",
  "ended",
  "archived",
] as const;
export type PromotionLifecycleState = (typeof PROMOTION_LIFECYCLE_STATES)[number];

/** D'où le calcul tire les promotions — l'écran n'écrit qu'à `promotions`. */
export type PromotionsSourceValue = "legacy" | "shadow" | "promotions";

const textSchema = z.string().trim().min(1).max(200);

const labelSchema = z.object({
  fr: textSchema,
  en: textSchema.nullable(),
  it: textSchema.nullable(),
});

/** Une cible du public — `companyId` pour « une société » (± ses sites) seulement. */
const audienceTargetSchema = z.object({
  kind: z.enum(PROMOTION_AUDIENCE_KIND_VALUES),
  companyId: z.string().min(1).nullable(),
});

/** Les identifiants d'une sélection — vide, à blanc ou en double : refusé par l'agrégat, nommé. */
const reachIdsSchema = z.array(z.string().max(64)).max(200);

/** L'acheminement : la forme seule ; « au moins un mode coché » est tenu par l'agrégat. */
const fulfillmentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("displayed_price") }),
  z.object({
    kind: z.literal("basket"),
    pickup: z.union([z.enum(["none", "all"]), z.object({ points: reachIdsSchema })]),
    delivery: z.union([z.enum(["none", "all"]), z.object({ zones: reachIdsSchema })]),
  }),
]);

/** L'acheminement d'une promotion, tel que l'éditeur l'envoie et que la fiche le relit. */
export type PromotionFulfillmentView =
  | { readonly kind: "displayed_price" }
  | ({ readonly kind: "basket" } & PromotionOfferFulfillmentView);

/**
 * La projection d'un public à plusieurs cibles sur une seule (`audience` de
 * la vue) — gardée pour les lecteurs d'avant L8b, lue par personne de neuf.
 */
export const SEVERAL_AUDIENCES = "several";

/** Les termes d'une promotion, tels que l'éditeur les envoie (L8). */
export const promotionTermsPayloadSchema = z.object({
  internalName: textSchema,
  /** Le libellé COMMUN — le repli de chaque audience. */
  label: labelSchema,
  /**
   * Les libellés Particuliers / Pros (L8b) — facultatifs, ils remplacent le
   * commun pour leur audience (§ 15.12 Q2). Absent = aucun.
   */
  audienceLabels: z
    .object({ individuals: labelSchema.nullable(), pros: labelSchema.nullable() })
    .default({ individuals: null, pros: null }),
  reason: z.string().trim().min(1).max(280).nullable(),
  effect: z.object({ kind: z.enum(PROMOTION_EFFECT_KIND_VALUES), value: z.number().int() }),
  ownFloor: z.object({ mode: z.enum(["percent", "amount"]), value: z.number().int() }).nullable(),
  stacksOverMercuriale: z.boolean(),
  /**
   * « Cumulable » (plan des promotions, § 16) : s'ajoute successivement aux
   * autres promotions cumulables du même article et du même client. Point
   * ligne seulement pour l'instant (§ 16.1). Absent = non cumulable.
   */
  cumulative: z.boolean().default(false),
  /** Borne basse incluse. */
  validFrom: z.string().datetime(),
  /** Borne haute exclue ; `null` = sans fin. */
  validTo: z.string().datetime().nullable(),
  /**
   * Le public : un ENSEMBLE non vide de cibles (L8b, § 15.1). Le serveur le
   * ramène à sa forme canonique (tous les enfants d'un parent ⇒ le parent).
   */
  audiences: z.array(audienceTargetSchema).min(1).max(50),
  fulfillment: fulfillmentSchema,
  scope: z.object({
    mode: z.enum(["all_except", "only"]),
    rules: z
      .array(
        z.object({
          target: z.enum(PROMOTION_SCOPE_TARGET_VALUES),
          targetId: z.string().min(1),
          eligible: z.boolean(),
        }),
      )
      .max(500),
  }),
  conditions: z
    .array(z.object({ kind: z.literal("min_quantity"), value: z.number().int() }))
    .max(10),
});
export type PromotionTermsPayload = z.infer<typeof promotionTermsPayloadSchema>;

/** Réviser : de nouveaux termes, et pourquoi. */
export const revisePromotionPayloadSchema = z.object({
  terms: promotionTermsPayloadSchema,
  reason: z.string().trim().min(1).max(280).nullable(),
});
export type RevisePromotionPayload = z.infer<typeof revisePromotionPayloadSchema>;

/** Archiver : le motif est obligatoire (l'agrégat le refuse vide). */
export const archivePromotionPayloadSchema = z.object({
  reason: z.string().max(280),
});
export type ArchivePromotionPayload = z.infer<typeof archivePromotionPayloadSchema>;

/** Une règle de portée, avec le nom que l'écran montre (`null` = inconnu du catalogue servi). */
export interface PromotionScopeRuleView {
  readonly target: PromotionScopeTargetValue;
  readonly targetId: string;
  readonly eligible: boolean;
  readonly name: string | null;
}

/** Une promotion, telle que la liste et la fiche la lisent. */
/** Un libellé client ; anglais et italien `null` = repli sur le français. */
export interface PromotionLabelView {
  readonly fr: string;
  readonly en: string | null;
  readonly it: string | null;
}

/** Une cible du public. */
export interface PromotionAudienceTargetView {
  readonly kind: PromotionAudienceKindValue;
  readonly companyId: string | null;
}

export interface PromotionView {
  readonly id: string;
  readonly internalName: string;
  /** Le libellé commun. */
  readonly label: PromotionLabelView;
  /** Les libellés Particuliers / Pros ; `null` = le commun (L8b). */
  readonly audienceLabels: {
    readonly individuals: PromotionLabelView | null;
    readonly pros: PromotionLabelView | null;
  };
  readonly reason: string | null;
  readonly state: PromotionLifecycleState;
  readonly applicationPoint: "line" | "basket";
  readonly effect: { readonly kind: PromotionEffectKindValue; readonly value: number };
  readonly ownFloor: { readonly mode: "percent" | "amount"; readonly value: number } | null;
  readonly stacksOverMercuriale: boolean;
  /** « Cumulable » (§ 16) ; `false` pour toute promotion d'avant la case. */
  readonly cumulative: boolean;
  readonly validFrom: string;
  readonly validTo: string | null;
  /** Le public, en forme canonique — au moins une cible (L8b). */
  readonly audiences: readonly PromotionAudienceTargetView[];
  /**
   * @deprecated La projection d'avant L8b : la cible unique, ou `several`
   * (société `null`). Lue par personne de neuf ; lire `audiences`.
   */
  readonly audience: {
    readonly kind: PromotionAudienceKindValue | typeof SEVERAL_AUDIENCES;
    readonly companyId: string | null;
  };
  /** Les points et les zones par leur identifiant, triés. */
  readonly fulfillment: PromotionFulfillmentView;
  readonly scope: {
    readonly mode: "all_except" | "only";
    readonly rules: readonly PromotionScopeRuleView[];
  };
  readonly conditions: readonly { readonly kind: "min_quantity"; readonly value: number }[];
  /** Le résumé que le journal fige — identifiants compris. */
  readonly summary: string;
  readonly paused: { readonly at: string; readonly by: string } | null;
  readonly archived: { readonly at: string; readonly by: string; readonly reason: string } | null;
  /** `null` = saisie à l'écran ; sinon la source reprise (`price_rule:…`, `pickup_discount:…`). */
  readonly legacySource: string | null;
  readonly createdAt: string;
}

/**
 * La source seule, et qui écrit : l'écran Promotions quand `editable`, les
 * anciens éditeurs (étage promotion de la grille, remise d'un site) sinon.
 */
export interface PromotionsSourceView {
  readonly source: PromotionsSourceValue;
  readonly editable: boolean;
}

/** La liste, et ce qui dit si l'écran peut écrire. */
export interface PromotionListView {
  readonly source: PromotionsSourceValue;
  /** `true` une fois la bascule faite (`source = promotions`). */
  readonly editable: boolean;
  readonly promotions: readonly PromotionView[];
}
