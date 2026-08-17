import { z } from "zod";

/**
 * Le **paramétrage tarifaire** vu du back-office — cf.
 * `documentation/b2b/architecture-resolution-de-prix.md`.
 *
 * Ce fichier ne décrit **que** la saisie et la lecture par le staff. Le calcul,
 * lui, vit dans le domaine du backend et n'a pas à traverser le fil : ce que
 * l'écran reçoit est le **résultat** d'une résolution faite par la même fonction
 * que celle qui facture, jamais de quoi la refaire côté navigateur. Deux
 * implémentations du prix finiraient par en donner deux.
 */

/** Les étages, dans l'ordre où ils s'appliquent. L'ordre EST la décision. */
export const priceStageSchema = z.enum(["mercuriale", "volume", "promotion", "geste"]);
export type PriceStage = z.infer<typeof priceStageSchema>;

/** Ce qu'une règle vise, du plus large au plus précis. */
export const priceScopeTypeSchema = z.enum(["global", "category", "product", "variant"]);
export type PriceScopeType = z.infer<typeof priceScopeTypeSchema>;

/** Qui elle vise, du plus large au plus précis. */
export const priceAudienceTypeSchema = z.enum(["all", "segment", "company"]);
export type PriceAudienceType = z.infer<typeof priceAudienceTypeSchema>;

export const priceDirectionSchema = z.enum(["increase", "decrease"]);
export type PriceDirection = z.infer<typeof priceDirectionSchema>;

export const priceModeSchema = z.enum(["percent", "amount"]);
export type PriceMode = z.infer<typeof priceModeSchema>;

/** Étiquettes des étages, écrites une fois — l'écran ne les réinvente pas. */
export const PRICE_STAGE_LABELS: Readonly<Record<PriceStage, string>> = {
  mercuriale: "Mercuriale",
  volume: "Volume",
  promotion: "Promotion",
  geste: "Geste",
};

export const PRICE_SCOPE_LABELS: Readonly<Record<PriceScopeType, string>> = {
  global: "Tout le catalogue",
  category: "Famille",
  product: "Produit",
  variant: "Déclinaison",
};

/**
 * La portée d'une règle ou d'un plancher.
 *
 * `id` est `null` **si et seulement si** `type === 'global'`. Le serveur le
 * refuse dans les deux sens : une portée « famille » sans famille ne vise rien,
 * et une portée « tout le catalogue » qui nomme une famille dit deux choses
 * contradictoires.
 */
export const priceScopeSchema = z.object({
  type: priceScopeTypeSchema,
  id: z.string().min(1).nullable(),
});
export type PriceScopePayload = z.infer<typeof priceScopeSchema>;

export const priceAudienceSchema = z.object({
  type: priceAudienceTypeSchema,
  id: z.string().min(1).nullable(),
});
export type PriceAudiencePayload = z.infer<typeof priceAudienceSchema>;

/**
 * Ce qu'une règle **fait** au prix : elle en pose un, ou elle modifie l'entrant.
 *
 * La distinction n'est pas cosmétique. Une mercuriale saisie en « −13 % » suit
 * le tarif de liste : le jour où il augmente, le prix négocié augmente avec lui
 * — ce n'est pas ce qu'on a promis au client. Un tarif négocié est un engagement
 * en euros, il se stocke en euros.
 */
export const priceEffectSchema = z.discriminatedUnion("nature", [
  z.object({
    nature: z.literal("replace"),
    /** Le prix posé, HT en centimes. Zéro passe — un article offert est réel. */
    amountCents: z.number().int().nonnegative(),
  }),
  z.object({
    nature: z.literal("alter"),
    direction: priceDirectionSchema,
    mode: priceModeSchema,
    /** Points de base si `percent`, centimes si `amount`. **Toujours positif** :
     *  le signe se dit par `direction`, jamais par le nombre. */
    value: z.number().int().positive(),
  }),
]);
export type PriceEffectPayload = z.infer<typeof priceEffectSchema>;

/** Créer une règle. Le serveur refuse tout ce que l'agrégat refuse. */
export const createPriceRulePayloadSchema = z.object({
  stage: priceStageSchema,
  scope: priceScopeSchema,
  audience: priceAudienceSchema,
  /** Palier de quantité. `null` = aucun seuil. */
  minQuantity: z.number().int().positive().nullable(),
  effect: priceEffectSchema,
  /** Ce que la trace affichera au client et au service client. */
  label: z.string().min(1).max(120),
  /** Borne basse **incluse**. */
  validFrom: z.string().datetime(),
  /** Borne haute **exclue**. `null` = ouverte. */
  validTo: z.string().datetime().nullable(),
});
export type CreatePriceRulePayload = z.infer<typeof createPriceRulePayloadSchema>;

/**
 * Poser un plancher sur une portée. **Idempotent par portée** : re-poser
 * remplace, il n'y a jamais deux limites sur la même cible.
 */
export const setPriceFloorPayloadSchema = z.object({
  scope: priceScopeSchema,
  mode: priceModeSchema,
  /** Points de base du **prix canonique** si `percent`, centimes si `amount`. */
  value: z.number().int().positive(),
});
export type SetPriceFloorPayload = z.infer<typeof setPriceFloorPayloadSchema>;

/** Une règle telle que l'écran la lit. */
export interface PriceRuleView {
  readonly id: string;
  readonly stage: PriceStage;
  readonly scope: PriceScopePayload;
  readonly audience: PriceAudiencePayload;
  readonly minQuantity: number | null;
  readonly effect: PriceEffectPayload;
  readonly label: string;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
}

/** Un plancher tel que l'écran le lit. */
export interface PriceFloorView {
  readonly id: string;
  readonly scope: PriceScopePayload;
  readonly mode: PriceMode;
  readonly value: number;
  readonly createdBy: string;
  readonly updatedAt: string;
}

/** Un étage qui a produit un effet — l'unité de la trace. */
export interface PriceStepView {
  readonly stage: PriceStage;
  readonly ruleId: string;
  readonly label: string;
  /** Le prix **au sortir** de cet étage. */
  readonly resultCents: number;
}

/**
 * Un article, avec tout ce qui décide de son prix — la ligne de l'écran.
 *
 * `supersededRuleIds` mérite son existence : une règle de famille et une règle
 * de produit **du même étage** ne se composent pas, la plus spécifique
 * **remplace** l'autre. Sans ce champ, l'écran afficherait deux altérations
 * l'une après l'autre et laisserait croire qu'elles s'enchaînent, alors que la
 * première n'a produit aucun effet sur cette ligne-là.
 */
export interface PricingItemView {
  readonly sku: string;
  readonly name: string;
  /** L'entrée du pipeline : le prix B2B s'il est posé, celui du PIM sinon. */
  readonly canonicalCents: number;
  /** Le plancher posé **sur cet article**, ou `null`. */
  readonly ownFloor: PriceFloorView | null;
  /** Celui qui s'applique réellement — le sien, ou celui dont il hérite. */
  readonly effectiveFloor: PriceFloorView | null;
  /** Les règles qui visent cet article nommément. */
  readonly rules: readonly PriceRuleView[];
  /** Les règles de famille qu'une règle d'article évince, étage par étage. */
  readonly supersededRuleIds: readonly string[];
  readonly steps: readonly PriceStepView[];
  /** Le plancher a-t-il **relevé** le prix ? */
  readonly floored: boolean;
  readonly finalCents: number;
}

/** Une famille et ses articles — la bande horizontale de l'écran. */
export interface PricingCategoryView {
  readonly id: string;
  readonly name: string;
  /** `null` = famille sans régime de TVA : ses articles ne sont pas vendables. */
  readonly vatRatePercent: number | null;
  readonly floor: PriceFloorView | null;
  readonly rules: readonly PriceRuleView[];
  readonly items: readonly PricingItemView[];
}

/**
 * Le tableau complet.
 *
 * `simulation` n'est pas décoratif : le prix montré est celui d'**un** article
 * commandé par **quelqu'un sans tarif négocié**, aujourd'hui. Les mercuriales et
 * les paliers de volume existent et ne se voient pas ici. Le taire ferait passer
 * cette colonne pour « le prix », alors qu'elle est le prix de vitrine.
 */
export interface PricingBoardView {
  readonly categories: readonly PricingCategoryView[];
  readonly globalFloor: PriceFloorView | null;
  /** Les règles de portée globale — elles s'appliquent à toutes les familles. */
  readonly globalRules: readonly PriceRuleView[];
  readonly simulation: {
    readonly quantity: number;
    readonly at: string;
    readonly audience: "all";
  };
}
