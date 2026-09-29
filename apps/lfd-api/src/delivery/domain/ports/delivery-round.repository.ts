import type { DeliveryRound } from "../entities/delivery-round.js";
import type { LiveStopHolder } from "../errors/delivery-round-errors.js";

/**
 * Port d'**écriture** de la composition : on charge la tournée, elle se mute
 * par ses méthodes métier, on la rend.
 *
 * Toute écriture exige en base la version LUE (`loadedVersion`) : une
 * composition changée entre la lecture et l'écriture est refusée, jamais
 * écrasée.
 */
export abstract class DeliveryRoundRepository {
  abstract load(id: string): Promise<DeliveryRound | null>;

  /**
   * Charge la tournée en la VERROUILLANT (lot 4, « Partir ») : les gestes du
   * chargement, qui la verrouillent en partage, attendent la fin du départ.
   */
  abstract loadForDeparture(id: string): Promise<DeliveryRound | null>;

  /**
   * Écrit une tournée (ouverture ou changement).
   * @throws {DeliveryRoundStaleError} la version en base n'est plus celle lue.
   * @throws {OrderAlreadyInRoundError} l'index I3 a vu une course.
   */
  abstract save(round: DeliveryRound): Promise<void>;

  /**
   * **I7** — écrit les deux tournées d'un déplacement ensemble (C13) : verrous
   * pris dans l'ordre des identifiants, deux versions vérifiées, une seule
   * transaction. Puis, APRÈS les tournées, les lignes de chargement de leurs
   * arrêts, dans l'ordre des identifiants (lot 4, L4-C18) : un bac chargé
   * entre la lecture et l'écriture refuse le déplacement.
   *
   * @throws {DeliveryRoundStaleError} @throws {LoadedStopMoveError}
   */
  abstract saveMove(from: DeliveryRound, to: DeliveryRound, stopId: string): Promise<void>;

  /** Le prochain numéro de passage de ce véhicule ce jour-là (1 s'il n'en a aucun). */
  abstract nextPassage(serviceDay: string, vehicleId: string): Promise<number>;

  /**
   * La tournée vivante qui porte déjà cette commande, tous jours confondus ;
   * `null` si aucune. Lu avant d'écrire, pour que le refus la nomme — après un
   * échec d'index, la transaction est perdue et ne peut plus le dire.
   */
  abstract liveHolderOf(orderId: string): Promise<LiveStopHolder | null>;
}
