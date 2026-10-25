/**
 * **La part de la réserve du jour retenue par un réassort lancé** (réassort,
 * lot R4b — `reassort-boutiques/plan-au-plus-tot.md` §2 ③, Q7 : « le colisage
 * réserve les pièces d'un réassort lancé »).
 *
 * Une réservation ne déplace aucune pièce : elle dit combien des pièces
 * LIBRES de la réserve `(jour, SKU)` une fiche « au plus tôt » retient encore
 * — sa quantité, moins ce que sa ligne a déjà emballé. Ce reste dû n'est pas
 * stocké : il se déduit de la ligne, qui s'écrit sous le même verrou.
 *
 * Pures, sans dépendance : l'agrégat `PackingStock`, le poste et la fiche
 * lisent les mêmes.
 */
export interface StockReservationSnapshot {
  /** Le réassort qui retient, opaque. */
  readonly resupplyId: string;
  /** Les pièces réservées au lancement — la quantité demandée par la ligne. */
  readonly quantity: number;
  /** Ce que la ligne de la fiche a déjà emballé (pris dans la réserve). */
  readonly packed: number;
  /** L'instant où le fait du lancement a été reçu au colisage. */
  readonly reservedAt: Date;
  /** La levée, à la clôture de la fiche ; `null` : la réservation tient. */
  readonly releasedAt: Date | null;
}

/** Ce que la réservation retient encore : 0 une fois levée ou toute emballée. */
export function outstandingOf(reservation: StockReservationSnapshot): number {
  return reservation.releasedAt === null
    ? Math.max(0, reservation.quantity - reservation.packed)
    : 0;
}

/** Σ des restes dus d'un article — ce qu'aucune commande ne peut prendre. */
export function reservedOf(reservations: readonly StockReservationSnapshot[]): number {
  return reservations.reduce((sum, reservation) => sum + outstandingOf(reservation), 0);
}

/** Les compteurs physiques d'une réserve, réduits à ce que la règle lit. */
export interface StockCounters {
  readonly received: number;
  readonly returned: number;
  readonly packed: number;
  /** Les pièces sorties vers une boutique (plan A1, lot A1.4). */
  readonly sentToShop: number;
}

/**
 * L'ordre de service des réservations : la première lancée est servie la
 * première (puis l'identifiant, pour départager un même instant). Sans cet
 * ordre, deux réservations qui se partagent une remise trop courte se
 * bloqueraient l'une l'autre, et des pièces sorties du four resteraient
 * immobiles.
 */
function servedBefore(a: StockReservationSnapshot, b: StockReservationSnapshot): boolean {
  const byTime = a.reservedAt.getTime() - b.reservedAt.getTime();
  return byTime === 0 ? a.resupplyId < b.resupplyId : byTime < 0;
}

/**
 * Ce que la fiche `resupplyId` peut prendre : les pièces sorties du four et
 * pas encore au bac, moins ce que retiennent les réservations servies AVANT
 * la sienne. Une fiche sans réservation tenue (un réassort du soir, ou une
 * réservation levée) passe après toutes : elle n'a que le libre des
 * commandes. Jamais négatif.
 */
export function availableTo(
  counters: StockCounters,
  reservations: readonly StockReservationSnapshot[],
  resupplyId: string,
): number {
  const own = reservations.find(
    (reservation) => reservation.resupplyId === resupplyId && reservation.releasedAt === null,
  );
  const ahead =
    own === undefined
      ? reservations
      : reservations.filter((reservation) => servedBefore(reservation, own));
  return Math.max(
    0,
    counters.received -
      counters.returned -
      counters.packed -
      counters.sentToShop -
      reservedOf(ahead),
  );
}

/**
 * **« En attente du four »** : les pièces que la réservation de `resupplyId`
 * retient et que le four n'a pas encore remises — elles viendront des
 * fournées suivantes, jamais d'un bac. 0 : tout ce qu'elle retient est là.
 */
export function awaitingOvenOf(
  counters: StockCounters,
  reservations: readonly StockReservationSnapshot[],
  resupplyId: string,
): number {
  const own = reservations.find((reservation) => reservation.resupplyId === resupplyId);
  if (own === undefined) {
    return 0;
  }
  const outstanding = outstandingOf(own);
  return Math.max(0, outstanding - availableTo(counters, reservations, resupplyId));
}
