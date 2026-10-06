import type { AddressPointKind } from "@lfd/contracts";

import type { GeoPoint } from "../value-objects/geo-point.js";

/** Une position relevée au geste, rattachée à sa commande — sans livreur ni heure. */
export interface GesturePositionRow {
  readonly orderId: string;
  /** `door` : la clôture de l'arrêt ; `parking` : l'arrivée. */
  readonly kind: AddressPointKind;
  readonly point: GeoPoint;
  readonly accuracyM: number;
}

/**
 * Port de **lecture** des positions au geste pour les suggestions de
 * correction du carnet (`gps-y-aller-et-position.md`, §6). Il ne rend ni
 * le livreur, ni la tournée, ni l'heure : le calcul n'en a pas besoin, et ce
 * qu'on ne lit pas ne fuit pas. Ce que la purge a effacé n'existe plus.
 */
export abstract class GesturePositionsReader {
  abstract kept(): Promise<readonly GesturePositionRow[]>;
}
