import { z } from "zod";

/**
 * **La remise générale d'une mercuriale** — « −40 % sur le pain, −30 % sur le
 * reste, sauf le chocolat » (`documentation/pricing/mercuriales/plan-remise-generale.md`).
 *
 * Un pourcentage du prix de base du jour, qui suit donc le catalogue, à côté
 * des prix fermes du même document ; le prix ferme d'un article passe
 * toujours devant. Chaque ligne porte son taux, la plus précise gagne
 * (déclinaison, puis famille la plus proche, puis le taux de base) ; une
 * ligne sans taux exclut.
 *
 * Le schéma tient la FORME (taux entiers de 1 à 9 999 pb, cibles connues) ;
 * la cohérence — taux de base présent en « tout sauf » et absent en
 * « seulement », pas deux lignes sur la même cible — est un refus du domaine.
 */
export const GENERAL_DISCOUNT_MODE_VALUES = ["all_except", "only"] as const;
export type GeneralDiscountModeValue = (typeof GENERAL_DISCOUNT_MODE_VALUES)[number];

/** Pas de cible « produit » : la chaîne de prix ne connaît que la déclinaison. */
export const GENERAL_DISCOUNT_TARGET_VALUES = ["category", "variant"] as const;
export type GeneralDiscountTargetValue = (typeof GENERAL_DISCOUNT_TARGET_VALUES)[number];

/** Un taux en points de base : 1 (0,01 %) à 9 999 (99,99 %). */
const generalDiscountBpSchema = z.number().int().min(1).max(9_999);

export const generalDiscountRuleSchema = z.object({
  target: z.enum(GENERAL_DISCOUNT_TARGET_VALUES),
  /** L'identifiant de la famille, ou le SKU de la déclinaison. */
  targetId: z.string().min(1),
  /** `null` = exclue de la remise. */
  bp: generalDiscountBpSchema.nullable(),
});

export const generalDiscountSchema = z.object({
  mode: z.enum(GENERAL_DISCOUNT_MODE_VALUES),
  /** Le taux de base : présent en `all_except`, `null` en `only`. */
  baseBp: generalDiscountBpSchema.nullable(),
  rules: z.array(generalDiscountRuleSchema).max(300).default([]),
});
export type GeneralDiscountPayload = z.infer<typeof generalDiscountSchema>;

/**
 * Ce qu'un avenant dit de la remise générale, sur SA fenêtre : `{ set: null }`
 * l'arrête, une valeur la remplace. Absent = il n'en dit rien.
 */
export const generalDiscountChangeSchema = z.object({
  set: generalDiscountSchema.nullable(),
});
export type GeneralDiscountChangePayload = z.infer<typeof generalDiscountChangeSchema>;

/** Une ligne telle que la lecture la rend. */
export interface GeneralDiscountRuleView {
  readonly target: GeneralDiscountTargetValue;
  readonly targetId: string;
  readonly bp: number | null;
}

/** Une remise générale telle que la lecture la rend. */
export interface GeneralDiscountView {
  readonly mode: GeneralDiscountModeValue;
  readonly baseBp: number | null;
  readonly rules: readonly GeneralDiscountRuleView[];
}

/** Ce qu'un avenant lu dit de la remise : `set: null` = il l'arrête. */
export interface GeneralDiscountChangeView {
  readonly set: GeneralDiscountView | null;
}
