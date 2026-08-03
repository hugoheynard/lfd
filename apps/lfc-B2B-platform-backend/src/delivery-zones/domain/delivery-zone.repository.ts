import type { DeliveryZonePayload, DeliveryZoneView } from "@lfd/contracts";

/**
 * Port des **zones de livraison** (globales) — un secteur de préfixes de code
 * postal → un frais. Un préfixe appartient à **au plus une** zone ; le repository
 * lève sur un chevauchement.
 */
export abstract class DeliveryZoneRepository {
  /** Toutes les zones. */
  abstract list(): Promise<readonly DeliveryZoneView[]>;

  /**
   * La zone couvrant `codePostal`, ou `null`. En cas de chevauchement, la zone au
   * **préfixe le plus long** (le plus spécifique) gagne. Sert au calcul du frais.
   */
  abstract resolveForPostalCode(codePostal: string): Promise<DeliveryZoneView | null>;

  /**
   * Ajoute une zone.
   * @throws {DuplicatePostalCodeError} un préfixe est déjà couvert par une autre zone.
   */
  abstract create(payload: DeliveryZonePayload): Promise<string>;

  /**
   * Remplace une zone.
   * @throws {DeliveryZoneNotFoundError} l'`id` n'existe pas.
   * @throws {DuplicatePostalCodeError} un préfixe est pris par une autre zone.
   */
  abstract update(id: string, payload: DeliveryZonePayload): Promise<void>;

  /**
   * Supprime une zone.
   * @throws {DeliveryZoneNotFoundError} l'`id` n'existe pas.
   */
  abstract remove(id: string): Promise<void>;
}
