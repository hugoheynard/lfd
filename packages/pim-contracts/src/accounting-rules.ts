import { z } from "zod";

/**
 * **Les règles comptables du référentiel** — ce que la maison décide une fois,
 * et qui vaut pour tout le catalogue.
 *
 * Elles n'en portent qu'une aujourd'hui : le rapport entre le prix public et le
 * prix professionnel. C'est délibérément un réglage **global** et non un champ
 * par famille — la décision « le pro paie 10 % de moins » se prend au niveau de
 * la maison, pas rayon par rayon. Le jour où un rayon devra y déroger, la
 * dérogation s'ajoutera SOUS ce réglage, comme une famille déroge à un taux ;
 * elle ne le remplacera pas.
 */

/**
 * Le plafond du rapport : **100 %**, soit 10 000 points de base.
 *
 * Un prix professionnel au-dessus du prix public n'est pas une politique
 * commerciale, c'est une faute de frappe — et une faute de frappe ici
 * surfacture silencieusement tous les professionnels, sur tout le catalogue.
 * La borne est donc dans le contrat, pas seulement à l'écran.
 */
export const MAX_RATIO_BP = 10_000;

/**
 * En **points de base entiers**, jamais en pourcentage flottant.
 *
 * `0.9` n'est pas représentable en binaire, et un rapport qui dérive au
 * quinzième chiffre finit par produire deux prix différents pour le même
 * article selon qui l'a calculé. L'entier ne dérive pas — et c'est déjà l'unité
 * de `PriceRule.value`, côté plateforme.
 *
 * On stocke le rapport (9 000 = 90 %), pas la remise (−10 %). C'est ce qui
 * MULTIPLIE : le dériver d'une remise imposerait une soustraction à chaque
 * lecture, donc un endroit de plus où se tromper de sens.
 */
export const proPriceRatioPayloadSchema = z.object({
  ratioBp: z.number().int().positive().max(MAX_RATIO_BP),
});
export type ProPriceRatioPayload = z.infer<typeof proPriceRatioPayloadSchema>;

/**
 * Ce que l'écran lit.
 *
 * `ratioBp` à `null` = **jamais réglé**, et c'est une information à part entière :
 * l'écran doit dire « à régler » plutôt qu'afficher 100 %, qui affirmerait
 * « le pro paie le prix public » — une phrase que personne n'a prononcée. Le
 * référentiel a déjà retiré un défaut de ce genre (`DEFAULT_FOOD_VAT_RATE`) :
 * nommer un défaut qui n'existe pas est pire que ne rien nommer.
 */
export interface AccountingRulesView {
  readonly ratioBp: number | null;
  /** ISO-8601, ou `null` si rien n'a jamais été réglé. */
  readonly updatedAt: string | null;
}
