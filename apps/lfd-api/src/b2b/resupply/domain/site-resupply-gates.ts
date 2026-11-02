import { instantToLocal } from "@lfd/contracts";

import type { ResupplyOrigin } from "./resupply-origin.js";
import { ResupplyNotReceivableError } from "./resupply-receipt-errors.js";
import {
  BakehouseResupplyAfterStopError,
  EmptyResupplyError,
  ResupplyDayPassedError,
  ResupplyAlreadyReceivedNotCancellableError,
  ResupplyFrozenInPlanError,
  ResupplyLaunchedNotCancellableError,
  ResupplyNotCancellableError,
  ResupplyPastCutoffError,
  ResupplyPlanStoppedError,
  ReserveResupplyNotCancellableError,
} from "./site-resupply-errors.js";
import type {
  ResupplyTarget,
  SiteResupplyStatus,
  SiteResupplyTrace,
} from "./site-resupply-snapshot.js";

/**
 * **Les refus de l'envoi et de l'annulation** d'un `SiteResupply` — sortis
 * de l'agrégat pour qu'il tienne en un fichier (dette du réassort,
 * 2026-11-02). L'agrégat les appelle avec son propre état ; aucun autre
 * appelant (vérifié le 2026-11-02).
 */

/** Ce que l'envoi lit du réassort et de ce que l'appelant a lu sous verrou. */
export interface PlacementState {
  readonly lineCount: number;
  readonly target: ResupplyTarget;
  readonly origin: ResupplyOrigin;
  readonly serviceDay: string;
  readonly at: Date;
  readonly deadline: Date | null;
  readonly planStopped: boolean;
}

/**
 * Au moins une ligne, une journée pas encore passée, et — pour « pour
 * demain » seulement — avant l'heure du réassort et avant l'arrêt du plan.
 * `deadline` est l'heure du réassort pour sa journée (« la veille, HH:MM »,
 * lot R3a), `null` si elle n'existe pas ce jour-là ; `planStopped` dit si le
 * plan du fournil pour cette journée est arrêté, lu SOUS le verrou de la
 * journée. « Au plus tôt » ignore les deux. Une demande au poids part comme
 * une autre : le fournil, le colisage et le transfert portent son unité
 * (lots L2b-2 et L2b-3).
 */
export function assertPlaceable(state: PlacementState): void {
  if (state.lineCount === 0) {
    throw new EmptyResupplyError();
  }
  if (instantToLocal(state.at).day > state.serviceDay) {
    throw new ResupplyDayPassedError(state.serviceDay);
  }
  if (state.target === "tomorrow") {
    assertBeforeStop(state.origin, state.serviceDay, state.at, state.deadline, state.planStopped);
  }
}

/**
 * Avant l'heure du réassort ET avant l'arrêt — le message suit qui envoie.
 * La borne est incluse : à la seconde de l'heure, c'est encore accepté.
 */
function assertBeforeStop(
  origin: ResupplyOrigin,
  serviceDay: string,
  at: Date,
  deadline: Date | null,
  planStopped: boolean,
): void {
  const late = deadline !== null && at > deadline;
  if (!late && !planStopped) {
    return;
  }
  const limit = deadline === null ? null : instantToLocal(deadline);
  const label = limit === null ? "inconnue" : `la veille à ${limit.time}`;
  if (origin === "bakehouse") {
    throw new BakehouseResupplyAfterStopError(serviceDay, label);
  }
  if (late) {
    throw new ResupplyPastCutoffError(serviceDay, label);
  }
  throw new ResupplyPlanStoppedError(serviceDay);
}

/** Ce que l'annulation lit du réassort et de ce que l'appelant a lu sous verrou. */
export interface CancellationState {
  readonly status: SiteResupplyStatus;
  readonly origin: ResupplyOrigin;
  readonly target: ResupplyTarget;
  readonly serviceDay: string;
  readonly reception: SiteResupplyTrace | null;
  readonly planStopped: boolean;
  readonly launched: boolean;
}

/**
 * Un réassort ne s'annule qu'envoyé et hors réserve. `reception`, lue par
 * l'appelant (`null` avant « Réceptionner ») : arrivé et attesté, il ne
 * s'annule plus (R1d). `planStopped`, lu SOUS le verrou de la journée : un
 * réassort « pour demain » figé dans un plan arrêté ne s'annule plus (R3a,
 * Q3) ; rouvert, il s'annule de nouveau. `launched`, lu au fournil SOUS le
 * même verrou (R4a) : un « au plus tôt » lancé est au plan, il ne s'annule
 * plus.
 */
export function assertCancellable(state: CancellationState): void {
  if (state.status !== "placed") {
    throw new ResupplyNotCancellableError();
  }
  if (state.origin === "reserve") {
    throw new ReserveResupplyNotCancellableError();
  }
  if (state.target === "tomorrow" && state.planStopped) {
    throw new ResupplyFrozenInPlanError(state.serviceDay);
  }
  if (state.launched) {
    throw new ResupplyLaunchedNotCancellableError(state.serviceDay);
  }
  if (state.reception !== null) {
    throw new ResupplyAlreadyReceivedNotCancellableError(
      state.reception.author.name,
      instantToLocal(state.reception.at).time,
    );
  }
}

/**
 * **« Réceptionner »** (G1, audit du 2026-11-02) : seul un réassort envoyé et
 * non annulé se réceptionne. L'appelant SAUVE ensuite l'agrégat sous sa
 * version : une annulation, une arrivée ou une seconde réception lues avant
 * celle-ci échouent alors à l'écriture (`SiteResupplyChangedMeanwhileError`),
 * au lieu de passer à côté.
 *
 * @throws {ResupplyNotReceivableError}
 */
export function assertReceivableStatus(status: SiteResupplyStatus): void {
  if (status !== "placed") {
    throw new ResupplyNotReceivableError();
  }
}
