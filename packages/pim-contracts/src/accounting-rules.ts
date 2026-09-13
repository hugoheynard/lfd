import {
  divideByBasisPoints,
  fractionByBasisPoints,
  fromCents,
  fromMillicents,
  roundToCents,
  roundToMillicents,
} from "@lfd/money";

import { htFromTtc, htMillicentsOf, taxMultiplierBp } from "./tax.js";
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

// ── Les deux méthodes de prix professionnel ────────────────────────────────

/**
 * **Comment on dérive le prix professionnel du prix public.**
 *
 * 🔴 **`remise_apres_tva_max` est arithmétiquement FAUSSE, et c'est délibéré.**
 * Elle vient d'une réunion de communication où le calcul a été fait avec 20 %
 * de TVA au lieu du taux réel des articles — et elle est **partie à
 * l'impression** : la plaquette commerciale annonce ces prix-là. On la bâtit
 * pour tenir un engagement déjà pris, pas parce qu'elle est juste.
 *
 * **Ne la « corrigez » pas.** Une formule réparée ici casserait la seule chose
 * qu'elle sait faire : redonner les nombres de la plaquette. Si un jour la
 * plaquette est refaite, c'est la MÉTHODE qu'on retire, pas son calcul qu'on
 * ajuste.
 *
 * L'égalité qui dit ce qu'elle est vraiment (vérifiée le 2026-09-13) :
 *
 * ```
 * B_ht = (publicTtc ÷ 1,20) × ratio  ≡  A_ttc ÷ 1,20
 * ```
 *
 * Ce n'est donc pas une autre politique de prix : c'est la même remise, dont on
 * dérive le hors taxe au taux le plus haut au lieu du taux réel de l'article.
 * Sur un catalogue majoritairement à 5,5 %, annoncer « 10 % » revient à en
 * consentir environ 25 % sur le TTC. C'est l'écart que la plaquette ignore, et
 * que l'écran doit montrer.
 */
export const PRO_PRICE_METHODS = ["ratio_ttc", "remise_apres_tva_max"] as const;
export type ProPriceMethod = (typeof PRO_PRICE_METHODS)[number];

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
 * **Le taux figé de la plaquette**, en pourcentage — borné comme un taux de TVA.
 *
 * Exigé par `remise_apres_tva_max`, refusé par `ratio_ttc` : lui donner un taux
 * qui ne sert à rien laisserait croire qu'il compte, et le prochain lecteur
 * chercherait où il s'applique.
 */
export const proPriceMethodPayloadSchema = z
  .object({
    method: z.enum(PRO_PRICE_METHODS),
    fixedVatPercent: z.number().min(0).max(100).nullable(),
  })
  .refine(
    (value) => (value.method === "remise_apres_tva_max") === (value.fixedVatPercent !== null),
    {
      message: "La méthode de la plaquette exige son taux figé ; le ratio TTC n'en accepte aucun.",
      path: ["fixedVatPercent"],
    },
  );
export type ProPriceMethodPayload = z.infer<typeof proPriceMethodPayloadSchema>;

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
  /**
   * La méthode **appliquée** — celle dont le push se sert.
   *
   * `ratio_ttc` tant que personne n'a choisi : c'est le comportement d'origine,
   * et un déploiement qui ne s'est pas prononcé ne doit pas changer de tarif.
   */
  readonly method: ProPriceMethod;
  /** Le taux figé de la plaquette, `null` sous `ratio_ttc`. */
  readonly fixedVatPercent: number | null;
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

/**
 * Le réglage complet, tel qu'il s'applique — méthode ET matériaux.
 *
 * `fixedVatPercent` n'est pas « le plus haut taux du référentiel » : c'est le
 * taux **figé** qu'une réunion a employé un jour donné. Le lire du référentiel
 * à chaque calcul ferait retarifer tout le catalogue professionnel le jour où
 * quelqu'un crée, modifie ou supprime un taux — de l'action à distance sur de
 * l'argent, la pire classe de défaut de ce dépôt. Il est donc saisi avec la
 * méthode, et ne bouge plus.
 *
 * `null` quand la méthode ne s'en sert pas : `ratio_ttc` n'a aucun taux fixe, et
 * lui en donner un laisserait croire qu'il compte.
 */
export interface ProPricePolicy {
  readonly method: ProPriceMethod;
  readonly ratioBp: number;
  readonly fixedVatPercent: number | null;
}

/**
 * Un prix professionnel, dans les **deux** unités que la chaîne demande.
 *
 * Les deux ensemble et jamais l'un sans l'autre : sous `ratio_ttc` c'est le TTC
 * qui est calculé et le HT qui s'en déduit, sous `remise_apres_tva_max` c'est
 * l'inverse. Rendre un seul des deux obligerait chaque appelant à savoir lequel
 * est l'original — c'est-à-dire à reconstruire la branche ici.
 */
export interface ProPrice {
  /** Ce qu'un professionnel paie, taxe comprise. */
  readonly ttcCents: number;
  /** Ce qui part sur le fil et que multiplie une quantité (10⁻⁵ €). */
  readonly htMillicents: number;
}

/**
 * **Le prix professionnel — l'unique porte, quelle que soit la méthode.**
 *
 * Un seul point d'entrée parce que la branche est une décision d'argent : la
 * dupliquer chez ses quatre appelants (le VO, la projection, l'écran des règles
 * et la fiche produit) garantirait qu'un écran finisse par montrer une méthode
 * pendant que le fil en pousse une autre.
 *
 * `null` **sans taux d'article**, dans les deux méthodes — et c'est voulu même
 * sous `remise_apres_tva_max`, où le hors taxe n'en dépend plus : le taux sert
 * toujours à FACTURER. Un article sans taux reste donc écarté du canal
 * (`variant_sans_taux`), pour la même raison qu'avant : inventer un taux
 * facturerait un montant que personne n'a décidé.
 */
export function proPriceOf(
  publicTtcCents: number,
  policy: ProPricePolicy,
  articleVatPercent: number | null,
): ProPrice | null {
  if (articleVatPercent === null) {
    return null;
  }
  if (policy.method === "ratio_ttc") {
    // La chaîne d'origine : le TTC pro est un PRIX, il s'arrête au centime, et
    // le hors taxe se déduit de CE montant-là (cf. `proHtFromPublic`).
    const ttcCents = proPriceFromPublic(publicTtcCents, policy.ratioBp);
    const htMillicents = htMillicentsOf(ttcCents, articleVatPercent);
    return htMillicents === null ? null : { ttcCents, htMillicents };
  }
  const htMillicents = brochureHtMillicents(publicTtcCents, policy.ratioBp, policy.fixedVatPercent);
  if (htMillicents === null) {
    return null;
  }
  // Le TTC pro n'est plus une saisie ni une étape : c'est le hors taxe de la
  // plaquette, retaxé au taux RÉEL de l'article. La plaquette décide ce qu'on
  // facture hors taxe ; l'État décide ce qu'on ajoute dessus.
  return {
    ttcCents: roundToCents(
      // `fractionByBasisPoints` et non `scaleByBasisPoints` : le second ajoute
      // ou retire une fraction (`bp = 5000` → +50 %), le premier PREND la
      // fraction (`bp = 10550` → ×1,055). `taxMultiplierBp` rend un
      // multiplicateur absolu, c'est donc le premier qu'il lui faut.
      fractionByBasisPoints(fromMillicents(htMillicents), taxMultiplierBp(articleVatPercent)),
    ),
    htMillicents,
  };
}

/**
 * Le hors taxe **de la plaquette** : le TTC public dépouillé du taux figé, puis
 * remisé.
 *
 * `null` si le taux figé manque — une méthode qui prétend retirer une TVA sans
 * savoir laquelle ne doit rien produire du tout. Le réglage l'exige à la
 * saisie ; ce `null` est la ceinture pour une ligne écrite avant que l'exigence
 * existe.
 *
 * **Un seul arrondi, à la fin, et en MILLICENTIMES** — pas en centimes comme
 * sous `ratio_ttc`. La raison est la même dans les deux cas, appliquée à des
 * nombres de nature différente : là-bas le résultat est un prix qu'on paie,
 * donc il s'arrête au centime ; ici c'est un hors taxe qui part sur le fil et
 * qu'une quantité multipliera, donc l'arrondir au centime multiplierait
 * l'erreur par la quantité commandée (cf. `htMillicentsOf`).
 */
function brochureHtMillicents(
  publicTtcCents: number,
  ratioBp: number,
  fixedVatPercent: number | null,
): number | null {
  if (fixedVatPercent === null) {
    return null;
  }
  return roundToMillicents(
    fractionByBasisPoints(
      divideByBasisPoints(fromCents(publicTtcCents), taxMultiplierBp(fixedVatPercent)),
      ratioBp,
    ),
  );
}

/**
 * **Ce que la plaquette consent RÉELLEMENT**, en points de base, sur le TTC.
 *
 * La saisie annonce une remise nominale — 10 % — et la méthode de la plaquette
 * en donne davantage dès que le taux de l'article est sous le taux figé. Ce
 * nombre est l'écart que la réunion a ignoré, et la seule raison pour laquelle
 * l'écran de comparaison existe.
 *
 * `null` quand le prix public est nul : il n'y a alors pas de remise à exprimer
 * en proportion de rien.
 */
export function realDiscountBp(publicTtcCents: number, proTtcCents: number): number | null {
  if (publicTtcCents <= 0) {
    return null;
  }
  return Math.round(((publicTtcCents - proTtcCents) / publicTtcCents) * MAX_RATIO_BP);
}
