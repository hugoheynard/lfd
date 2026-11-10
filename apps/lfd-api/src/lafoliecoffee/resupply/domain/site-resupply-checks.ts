import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import type { ResupplyTrace } from "./resupply-trace.js";
import type { SiteResupplySnapshot } from "./site-resupply-snapshot.js";

/**
 * **Ce que l'appelant a lu SOUS le verrou de la journée**, nommé, pour les
 * gestes qui en dépendent. Des booléens positionnels (`cancel(t, r, true,
 * false)`) se croisaient sans que le compilateur le voie : deux drapeaux
 * intervertis compilent (audit du réassort, 2026-11-03).
 */

/** L'envoi : cf. `assertPlaceable`. */
export interface PlacementCheck {
  /** L'heure du réassort pour sa journée, ou `null` si elle n'existe pas ce jour-là. */
  readonly deadline: Date | null;
  /** Le plan du fournil pour la journée est arrêté. */
  readonly planStopped: boolean;
}

/** Une sortie de réserve et un « au plus tôt » : ni heure limite, ni arrêt. */
export const UNGATED_PLACEMENT: PlacementCheck = { deadline: null, planStopped: false };

/** L'annulation : cf. `assertCancellable`. */
export interface CancellationCheck {
  /** Le reçu « Réceptionner », ou `null` avant. */
  readonly reception: ResupplyTrace | null;
  readonly planStopped: boolean;
  /** Lancé au fournil (lu au fournil, jamais à la colonne d'affichage). */
  readonly launched: boolean;
}

/** « Monté » : cf. `SiteResupplyProgress.markMounted`. */
export interface MountCheck {
  readonly reception: ResupplyTrace | null;
  readonly launched: boolean;
}

/**
 * Une ligne relue qui porte un geste impossible sans envoi — annulée,
 * arrivée, lancée ou partie alors que `placed` est vide. Les CHECK
 * `site_resupply_cancelled_after_placed` et `site_resupply_arrival_placed`
 * tiennent les deux premiers (lus le 2026-11-03) ; aucun ne tient le
 * lancement ni le départ. Refusé à la relecture plutôt que réhydraté en un
 * « brouillon » qui porterait déjà une annulation.
 */
export class ImpossibleSiteResupplyStateError extends TechnicalError {
  constructor(
    readonly resupplyId: string,
    readonly gesture: string,
  ) {
    super(
      "resupply.order.impossible_state",
      `Le réassort ${resupplyId} porte le geste « ${gesture} » sans avoir été envoyé : rien n'a été modifié. Signalez-le, la ligne est à réparer en base.`,
    );
  }
}

/** @throws {ImpossibleSiteResupplyStateError} */
export function assertRestorable(snapshot: SiteResupplySnapshot): void {
  if (snapshot.placed !== null) {
    return;
  }
  const marks: readonly (readonly [string, unknown])[] = [
    ["annulé", snapshot.cancelled],
    ["arrivé", snapshot.arrived],
    ["lancé", snapshot.launched ?? null],
    ["parti", snapshot.departed ?? null],
  ];
  const impossible = marks.find(([, mark]) => mark !== null);
  if (impossible !== undefined) {
    throw new ImpossibleSiteResupplyStateError(snapshot.id, impossible[0]);
  }
}
