/**
 * **Le bac partagé et sa contiguïté** (plan de tournée, lot 4 bis, v2-4) — la
 * SEULE définition de « à refaire », lue par l'écran de chargement, les
 * étiquettes, et « Partir ».
 *
 * Un bac physique cloisonné porte deux moitiés, chacune à UNE commande. Il
 * descend au premier arrêt, remonte, et part au second : il n'a de sens que si
 * les deux commandes sont dans la même tournée vivante, à des arrêts
 * CONSÉCUTIFS.
 *
 * ## Pourquoi « à refaire » est CALCULÉ, et jamais écrit
 *
 * La contiguïté dépend de la COMPOSITION, dont l'écrivain est la tournée
 * (affecter, déplacer, réordonner, retirer, appliquer une proposition). Un
 * drapeau écrit sur le bac obligerait chacun de ces cinq gestes à écrire aussi
 * dans une table du chargement — un second écrivain, et le premier geste qui
 * l'oublierait ferait mentir le bac. Calculé depuis les positions vivantes, il
 * ne peut pas dériver ; et remettre les arrêts côte à côte le « répare » sans
 * aucun geste sur le bac.
 */

/** Où est l'arrêt vivant d'une commande : sa tournée, et son rang parmi les arrêts vivants. */
export interface StopPlace {
  readonly roundId: string;
  /** Rang 0..n-1 parmi les arrêts vivants de la tournée, dans l'ordre de passage. */
  readonly rank: number;
}

/**
 * Deux commandes sont-elles à des arrêts consécutifs d'une même tournée ?
 * `null` = la commande n'est dans aucune tournée vivante : jamais consécutive.
 */
export function areConsecutive(own: StopPlace | null, other: StopPlace | null): boolean {
  if (own === null || other === null || own.roundId !== other.roundId) {
    return false;
  }
  return Math.abs(own.rank - other.rank) === 1;
}

/**
 * Un bac est-il **à refaire** ? Seul un bac PARTAGÉ peut l'être (`partner`
 * non nul : l'autre moitié, non annulée, est à une autre commande).
 */
export function isSharedBinToRedo(
  own: StopPlace | null,
  partner: StopPlace | null | undefined,
): boolean {
  return partner !== undefined && !areConsecutive(own, partner);
}

/** Les places, dans une tournée, des commandes de ses arrêts vivants dans l'ordre. */
export function placesInRound(
  roundId: string,
  orderIds: readonly string[],
): ReadonlyMap<string, StopPlace> {
  return new Map(orderIds.map((orderId, rank) => [orderId, { roundId, rank }]));
}
