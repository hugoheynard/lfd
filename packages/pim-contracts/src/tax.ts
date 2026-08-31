import { divideByBasisPoints, fromCents, roundToCents, roundToMillicents } from "@lfd/money";

/**
 * **Le hors taxe se déduit du prix d'étiquette.** Ce module ne fait que ça.
 *
 * Il portait aussi l'assiette (`ht` | `ttc`), et le choix entre les deux. Un
 * seul système est valide depuis : un prix public TTC, dont le TTC
 * professionnel se dérive par le rapport des règles comptables, et dont le hors
 * taxe se dérive par le taux de chaque canal. Le hors taxe n'est plus une
 * saisie, il est un résultat — d'où la disparition de l'interrupteur, et le
 * nouveau nom du fichier.
 *
 * Le même croissant est à 1,20 € qu'on l'emporte (5,5 %) ou qu'on le mange en
 * salle (10 %) : le prix affiché ne bouge pas, la part de taxe si. Le
 * référentiel porte UN prix par déclinaison et N taux par contexte, ce qui est
 * exactement la forme que cet ancrage demande — aucune table « prix par
 * contexte » n'est nécessaire.
 */

/**
 * Le **multiplicateur** du taux, en points de base entiers : `5,5 %` → `10 550`.
 *
 * Repasser par l'entier avant de diviser : `1 + 5.5 / 100` ne vaut pas
 * exactement `1,055` en binaire, et l'écart se propage dans une division.
 * `Math.round` sur le pourcentage plutôt que sur son produit — `5.5 * 100`
 * vaut `550.0000000000001`, et la troncature naïve rendrait `550` ici mais
 * `484` pour `4,85 %`. Le référentiel a déjà payé ce piège une fois, dans
 * `VatPercent`.
 */
const BP_PER_UNIT = 10_000;
function taxMultiplierBp(ratePercent: number): number {
  return BP_PER_UNIT + Math.round(ratePercent * 100);
}

/**
 * Le HT que ce taux déduit d'un prix TTC — tous deux en centimes entiers.
 *
 * **Le TTC fait foi.** C'est le nombre qu'un client lit sur l'étiquette et que
 * la caisse encaisse ; le HT en est la conséquence comptable. Le chemin inverse
 * n'existe plus : on ne recalcule jamais une étiquette depuis sa propre
 * déduction, et il n'y a plus de saisie hors taxe d'où repartir.
 *
 * Un seul arrondi, en fin de calcul, comme partout ailleurs dans la chaîne.
 */
export function htFromTtc(ttcCents: number, ratePercent: number): number {
  return roundToCents(divideByBasisPoints(fromCents(ttcCents), taxMultiplierBp(ratePercent)));
}

/**
 * Le hors taxe **en millicentimes** (10⁻⁵ €) — la forme qui part sur le fil, et
 * celle qu'une quantité multipliera.
 *
 * Jumelle de {@link htFromTtc}, un cran plus précis, et c'est le cran qui
 * compte : un hors taxe déduit d'un prix d'étiquette ne tombe presque jamais
 * juste, et l'arrondir ici multiplierait l'erreur par la quantité commandée.
 * L'arrondi n'a lieu qu'au **total de ligne**, chez le récepteur.
 *
 * `null` sans taux : un refus, pas un repli. Inventer un taux ferait facturer
 * un montant que personne n'a décidé, et le référentiel a déjà retiré un défaut
 * de ce genre (`DEFAULT_FOOD_VAT_RATE`).
 */
export function htMillicentsOf(ttcCents: number, ratePercent: number | null): number | null {
  return ratePercent === null
    ? null
    : roundToMillicents(divideByBasisPoints(fromCents(ttcCents), taxMultiplierBp(ratePercent)));
}
