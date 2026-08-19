import type { PickupAddressPayload, PickupAddressView } from "@lfd/contracts";

/**
 * Port des **points de retrait** (globaux). Un seul `isDefault` ; **au moins un**
 * point doit subsister — le repository tient ces invariants (promotion d'un
 * nouveau défaut à la suppression, refus de supprimer le dernier).
 */
export abstract class PickupAddressRepository {
  /** Tous les points, le **défaut en tête**. */
  abstract list(): Promise<readonly PickupAddressView[]>;

  /**
   * Le point **choisi** (`id`) ou, si `id` est `null`, le point **par défaut** ;
   * `null` si aucun point n'existe. Sert à figer le snapshot d'une commande retrait.
   */
  abstract resolve(id: string | null): Promise<PickupAddressView | null>;

  /** Ajoute un point ; devient le défaut si demandé ou si c'est le premier. */
  abstract create(payload: PickupAddressPayload): Promise<string>;

  /**
   * Remplace un point.
   * @throws {PickupAddressNotFoundError} l'`id` n'existe pas.
   */
  abstract update(id: string, payload: PickupAddressPayload): Promise<void>;

  /**
   * Supprime un point ; réattribue le défaut si besoin.
   * @throws {PickupAddressNotFoundError} l'`id` n'existe pas.
   * @throws {LastPickupAddressError} c'est le dernier (≥1 requis).
   */
  abstract remove(id: string): Promise<void>;

  /**
   * Désigne le point par défaut (l'unique à `true`).
   * @throws {PickupAddressNotFoundError} l'`id` n'existe pas.
   */
  abstract setDefault(id: string): Promise<void>;
}
