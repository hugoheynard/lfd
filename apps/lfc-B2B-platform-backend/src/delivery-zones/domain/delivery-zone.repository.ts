import type { DeliveryZonePayload, DeliveryZoneView } from "@lfd/contracts";

/**
 * Port des **zones de livraison** (globales) — un code postal → un frais de
 * livraison. Le code postal est **unique** ; le repository lève sur un doublon.
 */
export abstract class DeliveryZoneRepository {
  /** Toutes les zones, par code postal croissant. */
  abstract list(): Promise<readonly DeliveryZoneView[]>;

  /** La zone d'un code postal, ou `null`. Sert au calcul du frais d'une commande. */
  abstract findByPostalCode(codePostal: string): Promise<DeliveryZoneView | null>;

  /**
   * Ajoute une zone.
   * @throws {DuplicatePostalCodeError} le code postal a déjà une zone.
   */
  abstract create(payload: DeliveryZonePayload): Promise<string>;

  /**
   * Remplace une zone.
   * @throws {DeliveryZoneNotFoundError} l'`id` n'existe pas.
   * @throws {DuplicatePostalCodeError} le code postal est pris par une autre zone.
   */
  abstract update(id: string, payload: DeliveryZonePayload): Promise<void>;

  /**
   * Supprime une zone.
   * @throws {DeliveryZoneNotFoundError} l'`id` n'existe pas.
   */
  abstract remove(id: string): Promise<void>;
}
