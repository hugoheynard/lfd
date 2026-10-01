/**
 * **L'état d'une tournée** — ce que `DeliveryRound.restore` réhydrate et ce que
 * `toSnapshot` rend. Sorti de `delivery-round.ts` le 2026-10-01 pour tenir
 * l'agrégat sous sa taille ; il y est ré-exporté.
 */

/**
 * Un arrêt tel que la tournée le connaît. `closedAt` non nul = clos (livré ou
 * raté, lot 6) : il n'est plus vivant, garde sa position figée, et se
 * réécrit tel quel.
 */
export interface DeliveryStopState {
  readonly id: string;
  readonly orderId: string;
  readonly position: number;
  readonly closedAt: Date | null;
}

/** Un arrêt retiré pendant cette écriture : la ligne reste, `removedAt` posé. */
export interface RemovedStopState extends DeliveryStopState {
  readonly removedAt: Date;
}

/**
 * **Le retour au dépôt** (`parcours-du-livreur.md`, PL2) : quand, et qui l'a
 * déclaré — le nom figé au geste, `""` quand l'annuaire n'en connaissait pas.
 */
export interface RoundReturn {
  readonly at: Date;
  readonly byStaffId: string;
  readonly byName: string;
}

/** L'état persisté d'une tournée — ce que `toDomain` réhydrate. Arrêts non retirés seulement. */
export interface DeliveryRoundState {
  readonly id: string;
  readonly serviceDay: string;
  readonly vehicleId: string;
  readonly vehicleName: string;
  readonly passage: number;
  readonly version: number;
  /** Partie le (lot 4, L4-C4), ou `null` : au dépôt. */
  readonly departedAt: Date | null;
  /** Le livreur affecté (plan « Ma tournée », MT-D2), l'id d'une fiche staff ; `null` : aucun. */
  readonly driverStaffId: string | null;
  /**
   * Rentrée (PL2), ou `null` : elle roule encore, ou n'est pas partie.
   * Facultatif à la RÉHYDRATATION seulement — absent vaut `null` ; le
   * dépôt Prisma le passe toujours, et `toSnapshot` le rend toujours.
   */
  readonly returned?: RoundReturn | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly stops: readonly DeliveryStopState[];
}

/** Ce que l'adaptateur écrit : l'état, plus les arrêts retirés par ce geste. */
export interface DeliveryRoundSnapshot extends DeliveryRoundState {
  readonly removedStops: readonly RemovedStopState[];
}

/** Un arrêt vivant, détaché d'une tournée pour entrer dans une autre (I7). */
export interface DetachedStop {
  readonly id: string;
  readonly orderId: string;
}
