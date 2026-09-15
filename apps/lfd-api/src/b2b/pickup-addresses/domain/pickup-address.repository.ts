import type { PickupAddressPayload, PickupAddressView } from "@lfd/contracts";

import type { PickupDiscount } from "./pickup-discount.js";

/**
 * Ce qu'on écrit d'un point : ses champs, et sa remise **déjà validée**.
 *
 * La remise est un {@link PickupDiscount} et non les deux champs du contrat :
 * une réduction qui ne vise aucune clientèle ne peut donc pas atteindre
 * l'adaptateur, quel que soit le handler qui écrit.
 */
export type PickupAddressWrite = Omit<PickupAddressPayload, "discount" | "discountAudiences"> & {
  readonly discount: PickupDiscount;
};

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
  abstract create(point: PickupAddressWrite): Promise<string>;

  /**
   * Remplace un point.
   * @throws {PickupAddressNotFoundError} l'`id` n'existe pas.
   */
  abstract update(id: string, point: PickupAddressWrite): Promise<void>;

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
