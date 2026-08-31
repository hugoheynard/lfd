import type { OrderQuoteLineView, VolumeTierPriceView } from '@lfd/contracts';

/**
 * **Le banc d'essai du devis** — les dérivations pures, hors du composant.
 *
 * Le simulateur pose la même question à plusieurs quantités et range les
 * réponses côte à côte. Ce qui se décide ici : QUELLES quantités valent d'être
 * posées, et comment lire une réponse. Rien n'y est calculé qui touche à un
 * prix — chaque prix vient du serveur, par la fonction qui facture.
 */

/** Le maximum de quantités sondées d'un coup — une requête chacune. */
export const MAX_PROBES = 8;

/** Une quantité sondée, et ce que le serveur a répondu pour elle. */
export interface BenchRow {
  readonly quantity: number;
  readonly canonicalMillicents: number;
  readonly unitPriceMillicents: number;
  readonly totalCents: number;
  /** L'écart au tarif de liste, en points de base. Négatif = une hausse. */
  readonly discountBp: number;
  readonly line: OrderQuoteLineView;
}

/**
 * **Les quantités qui valent d'être posées.**
 *
 * Toujours 1, parce que c'est le prix de vitrine et le point de comparaison.
 * Puis **chaque seuil du barème**, et le seuil MOINS UN : c'est là que le
 * système se juge — la marche entre 49 et 50 est la seule chose qu'un client
 * remarque, et un banc qui ne montrerait que les seuils atteints la cacherait.
 *
 * Enfin la quantité librement saisie, quand il y en a une : la vraie question
 * est souvent « et pour 3 200 ? », qui ne tombe sur aucun seuil.
 *
 * Bornée à {@link MAX_PROBES} : chaque quantité est une requête, et un barème à
 * douze paliers en ferait vingt-cinq sur un geste de curiosité.
 */
export function probeQuantities(
  tiers: readonly VolumeTierPriceView[] | null,
  free: number | null,
): readonly number[] {
  const thresholds = (tiers ?? []).flatMap((tier) =>
    tier.minQuantity > 1 ? [tier.minQuantity - 1, tier.minQuantity] : [tier.minQuantity],
  );
  const wanted = [1, ...thresholds, ...(free !== null && free > 0 ? [free] : [])];
  return [...new Set(wanted)].sort((left, right) => left - right).slice(0, MAX_PROBES);
}

/**
 * L'écart au tarif de liste, en points de base.
 *
 * Signé, à la différence de celui du barème : le simulateur sert AUSSI à voir
 * qu'une règle a fait monter un prix — un supplément de préparation, une
 * mercuriale plus chère que le catalogue depuis que le PIM a baissé. Écraser ce
 * cas à zéro cacherait exactement ce qu'on est venu chercher.
 */
export function variationBp(canonicalMillicents: number, unitPriceMillicents: number): number {
  if (canonicalMillicents <= 0) {
    return 0;
  }
  return Math.round(((canonicalMillicents - unitPriceMillicents) / canonicalMillicents) * 10_000);
}

/** La réponse du serveur pour une quantité → une ligne du banc. */
export function benchRow(line: OrderQuoteLineView): BenchRow {
  return {
    quantity: line.quantity,
    canonicalMillicents: line.canonicalMillicents,
    unitPriceMillicents: line.unitPriceMillicents,
    totalCents: line.unitPriceMillicents * line.quantity,
    discountBp: variationBp(line.canonicalMillicents, line.unitPriceMillicents),
    line,
  };
}

/**
 * **La marche franchie à cette quantité**, en centimes par pièce.
 *
 * `null` sur la première ligne : sans quantité précédente, il n'y a pas de
 * marche — et afficher « 0 » y ferait croire qu'on a mesuré quelque chose.
 */
export function stepDownCents(rows: readonly BenchRow[], index: number): number | null {
  const previous = rows[index - 1];
  const current = rows[index];
  if (previous === undefined || current === undefined) {
    return null;
  }
  const gap = previous.unitPriceMillicents - current.unitPriceMillicents;
  return gap === 0 ? null : gap;
}
