import type { OrderVoucher } from "../entities/order.js";

/**
 * **Que vaut ce bon, pour cette personne, maintenant ?** — la lecture qui
 * précède la passation et le devis (plan des points, C3 étape 1).
 *
 * Déclaré par la commande, implémenté par la fidélité, relié dans
 * `appBootstrap/` (§11 bis S8). Un port de LECTURE, à part de
 * {@link LoyaltyVoucherRedemption} : le devis ne dépend que de lui.
 *
 * Cette lecture n'engage rien : deux onglets peuvent lire le même bon
 * disponible. C'est la réservation, sous le verrou du titulaire, qui tranche.
 */
export abstract class LoyaltyVoucherQuoteReader {
  /**
   * Le bon, s'il appartient à `holderUserId`, est disponible et n'est pas échu
   * à `now`. Sa valeur est **hors taxe**.
   *
   * @throws {ResourceNotFoundError} aucun bon de ce nom à cette personne.
   * @throws {BusinessError} déjà servi, annulé ou expiré — le refus le nomme.
   */
  abstract quote(voucherId: string, holderUserId: string, now: Date): Promise<OrderVoucher>;
}
