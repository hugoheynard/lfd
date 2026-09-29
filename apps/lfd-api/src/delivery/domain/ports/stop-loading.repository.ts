import type { DeliveryRound } from "../entities/delivery-round.js";
import type { StopLoading } from "../entities/stop-loading.js";

/**
 * Port d'**écriture** du chargement (lot 4, L4-C18) — l'exécution est le SEUL
 * écrivain de `delivery_bin_load` (C10).
 *
 * Les deux lectures VERROUILLENT, dans la transaction en cours, et toujours
 * APRÈS la tournée : c'est l'ordre que suivent aussi `saveMove` et « Partir »,
 * et deux gestes qui prennent leurs verrous dans le même ordre ne
 * s'interbloquent pas.
 */
export abstract class StopLoadingRepository {
  /**
   * Le chargement de l'arrêt VIVANT de cette commande, tous jours confondus
   * (I3), ou `null` si elle n'est dans aucune tournée. Sa tournée est
   * verrouillée en partage : un « Partir » concurrent attend la fin du geste.
   *
   * `lockBinId` : le bac que le geste vise est verrouillé en EXCLUSIF, APRÈS
   * la tournée — annuler et charger le même bac en même temps se sérialisent,
   * et le second relit ce que le premier a écrit (jamais « annulé ET chargé »).
   * Le bac est verrouillé même si la commande n'est dans aucune tournée.
   *
   * @throws {DeliveryLoadingStaleError} l'arrêt a bougé entre la lecture et le verrou.
   */
  abstract forOrder(orderId: string, lockBinId?: string): Promise<StopLoading | null>;

  /**
   * Le chargement de chaque arrêt vivant d'une tournée DÉJÀ verrouillée par
   * `DeliveryRoundRepository.loadForDeparture` ; leurs lignes de chargement
   * sont verrouillées dans l'ordre de leur identifiant.
   */
  abstract forRound(round: DeliveryRound): Promise<readonly StopLoading[]>;

  /**
   * Écrit les lignes que le geste a changées. Rend `false` si une ligne neuve
   * existait déjà (un double scan passé malgré le verrou) : rien n'est écrit,
   * et l'appelant n'a rien à tracer — charger deux fois n'écrit rien.
   */
  abstract save(loading: StopLoading): Promise<boolean>;
}
