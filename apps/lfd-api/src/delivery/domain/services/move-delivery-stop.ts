import type { DeliveryRound, DetachedStop } from "../entities/delivery-round.js";
import { LoadedStopMoveError } from "../errors/delivery-loading-errors.js";
import { CrossDayMoveError, SameRoundMoveError } from "../errors/delivery-round-errors.js";

/**
 * **I7 — déplacer un arrêt vers une autre tournée du même jour** : la seule
 * écriture qui touche deux tournées (plan de tournée, lot 3, C3, C11, C13).
 *
 * Pur : il mute les deux agrégats et rend l'arrêt déplacé. La MÊME ligne change
 * de tournée — il ne crée pas d'arrêt neuf, donc l'index unique sur la commande
 * n'est jamais violé en cours de transaction. Enregistrer les deux tournées
 * ensemble, verrous et versions compris, est le travail de l'infrastructure
 * (`DeliveryRoundRepository.saveMove`) : un service de domaine n'ouvre pas de
 * transaction.
 *
 * **Un arrêt qui a un bac chargé ne se déplace pas** (lot 4, L4-C5) : la même
 * ligne changerait de tournée avec ses chargements, et le bac serait dans la
 * mauvaise camionnette. `stopLoaded` est lu par le handler ; `saveMove` le
 * revérifie sous verrou.
 *
 * @throws {SameRoundMoveError} @throws {CrossDayMoveError}
 * @throws {DeliveryStopNotFoundError} @throws {DeliveryStopClosedError}
 * @throws {OrderAlreadyInRoundError} @throws {LoadedStopMoveError}
 * @throws {DeliveryRoundDepartedError}
 */
export function moveDeliveryStop(
  from: DeliveryRound,
  to: DeliveryRound,
  stopId: string,
  at: Date,
  stopLoaded: boolean,
): DetachedStop {
  if (from.id === to.id) {
    throw new SameRoundMoveError();
  }
  if (from.serviceDay !== to.serviceDay) {
    throw new CrossDayMoveError(from.serviceDay, to.serviceDay);
  }
  from.ensureAtDepot();
  to.ensureAtDepot();
  if (stopLoaded) {
    throw new LoadedStopMoveError(from.vehicleName);
  }
  const stop = from.detach(stopId, at);
  to.attach(stop, at);
  return stop;
}
