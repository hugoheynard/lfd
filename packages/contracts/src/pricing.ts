import { z } from "zod";

/**
 * Le vocabulaire du **prix** — cf.
 * `documentation/b2b/architecture-resolution-de-prix.md`.
 *
 * Il sert **deux publics**, et c'est pourquoi il ne s'appelle plus
 * « pricing-admin » : le staff qui saisit les règles, et le client qui lit la
 * trace figée sur sa commande. `PriceStepView` traverse les deux.
 *
 * Ce qui ne traverse jamais le fil, c'est le **calcul**. Ce qu'un écran reçoit
 * est le résultat d'une résolution faite par la fonction qui facture, jamais de
 * quoi la refaire côté navigateur : deux implémentations du prix finiraient par
 * en donner deux, et celle qu'on regarde le moins divergerait.
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

/**
 * Un étage qui a produit un effet — l'unité de la trace.
 *
 * `label` est ce que le **client** lit ; `stage` est un mot de la maison
 * (« mercuriale », « geste ») qu'on ne lui montre pas. C'est toute la raison
 * d'être du libellé : sans lui, expliquer un prix reviendrait à exposer le
 * vocabulaire interne du barème.
 */
export interface PriceStepView {
  readonly stage: PriceStage;
  readonly ruleId: string;
  readonly label: string;
  /** Le prix **au sortir** de cet étage. */
  readonly resultCents: number;
}

/**
 * Le schéma des étages, pour **relire** une trace persistée.
 *
 * Elle a été écrite en JSON par une version du code et se relit par une autre,
 * des mois plus tard : c'est la seule barrière entre les deux. Déclaré ici parce
 * que la forme et sa validation doivent vivre au même endroit — deux fichiers
 * finiraient par décrire deux formes.
 */
export const priceStepsSchema = z.array(
  z.object({
    stage: priceStageSchema,
    ruleId: z.string(),
    label: z.string(),
    resultCents: z.number().int(),
  }),
);

/**
 * **La trace figée sur une ligne de commande.**
 *
 * Elle répond à « pourquoi ce prix ? » six mois plus tard, quand les règles qui
 * l'ont produit peuvent avoir été retirées. C'est un **fait clos**, comme le
 * prix lui-même : on ne la recalcule jamais, on la relit.
 *
 * `ruleId` y survit à la suppression de la règle — volontairement. Le lien est
 * une piste pour le service client, pas une clé étrangère : une règle effacée ne
 * doit pas emporter l'explication d'une facture déjà payée.
 */
export interface OrderLinePricingTrace {
  /** Le prix canonique d'entrée, avant tout étage. */
  readonly basePriceCents: number;
  /** Les étages qui ont produit un effet, dans l'ordre. Vide = aucun. */
  readonly steps: readonly PriceStepView[];
  /** Le plancher a-t-il **relevé** le prix ? */
  readonly floored: boolean;
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
  /**
   * Ce que l'altération coûte en volume. `null` quand le prix n'a pas bougé —
   * il n'y a alors rien à compenser, et afficher « ×1,00 » ferait du bruit sur
   * quatre-vingt-dix lignes.
   */
  readonly elasticity: ItemElasticityView | null;
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

// ---------------------------------------------------------------------------
// Élasticité — ce qu'une altération coûte en volume
// ---------------------------------------------------------------------------

/** Une fenêtre d'observation. Borne basse incluse, borne haute exclue. */
export interface VolumeWindowView {
  readonly from: string;
  readonly to: string;
  readonly days: number;
}

/**
 * Une comparaison **volume réalisé contre objectif**, sur deux fenêtres de même
 * durée.
 *
 * `conclusive` n'est pas décoratif : quelques jours après la pose d'une règle,
 * l'écart n'a aucun sens, et l'afficher comme un résultat ferait juger une
 * décision sur du bruit. L'écran doit alors dire « trop tôt » plutôt qu'un
 * pourcentage.
 */
export interface ElasticityComparison {
  readonly baseline: VolumeWindowView;
  readonly baselineVolume: number;
  readonly observed: VolumeWindowView;
  readonly observedVolume: number;
  /** Le volume à atteindre pour tenir le chiffre. `null` = pas de référence. */
  readonly targetVolume: number | null;
  /** Où en est le réalisé vis-à-vis de l'objectif, en bp. `null` = pas d'objectif. */
  readonly attainmentBp: number | null;
  /** La fenêtre observée est-elle assez longue pour conclure ? */
  readonly conclusive: boolean;
}

/**
 * **Ce que l'altération d'un article coûte en volume.**
 *
 * Attachée à l'ARTICLE et non à la règle, parce que c'est là que le prix et le
 * volume existent tous les deux sans ambiguïté : une règle de famille exprimée
 * en euros n'implique pas le même ratio sur un croissant et sur une pièce
 * montée. Une règle en pourcentage, elle, porte son ratio intrinsèquement —
 * l'écran l'affiche alors sur le nœud de la règle aussi.
 */
export interface ItemElasticityView {
  readonly fromCents: number;
  readonly toCents: number;
  /** Le volume qu'il faut vendre pour le même chiffre, en bp (`12500` = ×1,25). */
  readonly isoRevenueRatioBp: number | null;
  /**
   * Avant / après le **changement de prix** — la seule comparaison qui juge la
   * règle. `null` quand rien n'a changé, ou quand la date du changement est
   * inconnue.
   */
  readonly sinceChange: ElasticityComparison | null;
  /** Fenêtre glissante — où on en est aujourd'hui, indépendamment de la règle. */
  readonly rolling: ElasticityComparison;
}
