import { fractionByBasisPoints, fromCents, roundToCents } from "@lfd/money";

import { htFromTtc } from "./price-basis.js";
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

/**
 * Le prix professionnel TTC, dérivé d'un prix public TTC — tous deux en
 * centimes entiers.
 *
 * **Ici et nulle part ailleurs.** Le serveur en a besoin pour tarifer, l'écran
 * pour montrer ce que le réglage produit. Deux implémentations finiraient par
 * diverger d'un centime d'arrondi, et cette divergence-là ne se voit qu'en
 * comparant deux factures.
 *
 * **Un seul arrondi, en fin de calcul.** Le rationnel exact de `@lfd/money`
 * traverse la multiplication sans jamais retomber sur un centime, et
 * `roundToCents` tranche à la sortie — au plus proche, la moitié s'éloignant de
 * zéro, l'arrondi commercial. Arrondir vers le bas offrirait un demi-centime au
 * client sur chaque ligne, ce qui n'est une remise que personne n'a décidée.
 *
 * Rien ne valide `ratioBp` ici : c'est le rôle du VO côté serveur, et le
 * contrat ne doit pas porter deux fois la même garde. Un appelant qui passe un
 * rapport hors bornes obtient un nombre hors bornes — l'écriture, elle, est
 * murée en base.
 */
export function proPriceFromPublic(publicTtcCents: number, ratioBp: number): number {
  return roundToCents(fractionByBasisPoints(fromCents(publicTtcCents), ratioBp));
}

/**
 * Le **hors taxe professionnel** d'un prix public TTC : la chaîne entière.
 *
 * `null` sans taux — le hors taxe n'est alors pas dérivable, et inventer un
 * taux ferait facturer un montant que personne n'a décidé.
 *
 * ## L'ordre des arrondis, et pourquoi il n'est pas celui qu'on croit
 *
 * On pourrait garder le rationnel exact d'un bout à l'autre et n'arrondir qu'à
 * la toute fin. On ne le fait pas, et c'est délibéré : **le prix pro TTC est un
 * prix**, pas une étape de calcul. C'est le montant qu'un professionnel voit et
 * paie, il s'arrête donc au centime — et le hors taxe se déduit de CE
 * montant-là.
 *
 * L'autre ordre ferait diverger d'un centime les deux nombres que l'écran
 * affiche l'un sous l'autre : le HT annoncé, re-taxé, ne redonnerait pas le TTC
 * annoncé. Un client qui recompte trouverait le désaccord avant nous.
 *
 * C'est la même règle qu'ailleurs — « le TTC fait foi, le HT en est la
 * conséquence » — appliquée deux fois de suite.
 */
export function proHtFromPublic(
  publicTtcCents: number,
  ratioBp: number,
  ratePercent: number | null,
): number | null {
  if (ratePercent === null) {
    return null;
  }
  return htFromTtc(proPriceFromPublic(publicTtcCents, ratioBp), ratePercent);
}
