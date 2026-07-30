import type { BillingAddressPayload, DeliveryAddressPayload } from "@lfd/contracts";

/**
 * Port d'**écriture** des adresses d'une entreprise — une facturation (unique) et
 * N livraisons (une par défaut).
 *
 * Chaque méthode porte `companyId` : c'est le mur. Une écriture qui viserait
 * l'adresse d'une **autre** entreprise ne doit rien toucher — l'implémentation
 * filtre sur (`id` ET `companyId`) et signale l'absence plutôt que d'agir à
 * l'aveugle.
 *
 * Les charges sont les DTO **validés** de `@lfd/contracts` : la forme et les
 * invariants (créneau `début < fin`, bornes GPS) sont déjà garantis à la
 * frontière, le port n'a plus qu'à persister.
 */
export abstract class CompanyAddressRepository {
  /**
   * Enregistre l'unique adresse de **facturation** : la met à jour si elle
   * existe déjà, la crée sinon (une entreprise n'en a qu'une).
   */
  abstract saveBilling(companyId: string, payload: BillingAddressPayload): Promise<void>;

  /**
   * Ajoute une adresse de **livraison** et renvoie son identifiant. Devient le
   * défaut si elle le demande, ou si c'est la première livraison de l'entreprise.
   */
  abstract addDelivery(companyId: string, payload: DeliveryAddressPayload): Promise<string>;

  /**
   * Remplace une adresse de livraison.
   * @throws {CompanyAddressNotFoundError} l'`id` n'appartient pas à `companyId`.
   */
  abstract updateDelivery(
    companyId: string,
    addressId: string,
    payload: DeliveryAddressPayload,
  ): Promise<void>;

  /**
   * Archive une adresse de livraison (jamais de DELETE physique). Réattribue le
   * défaut à une autre livraison si l'archivée l'était.
   * @throws {CompanyAddressNotFoundError} l'`id` n'appartient pas à `companyId`.
   */
  abstract archiveDelivery(companyId: string, addressId: string): Promise<void>;

  /**
   * Désigne l'adresse de livraison par défaut (l'unique à `true`).
   * @throws {CompanyAddressNotFoundError} l'`id` n'appartient pas à `companyId`.
   */
  abstract setDefaultDelivery(companyId: string, addressId: string): Promise<void>;
}
