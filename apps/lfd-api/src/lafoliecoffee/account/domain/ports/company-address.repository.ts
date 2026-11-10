import type { BillingAddressPayload } from "@lfd/contracts";

import type { DeliveryAddressBook } from "../entities/delivery-address-book.js";

/**
 * Port d'**écriture** des adresses d'une entreprise.
 *
 * Deux natures, deux traitements — et c'est délibéré :
 *
 * - la **facturation** est unique et sans règle qui puisse refuser son écriture.
 *   Elle reste un CRUD honnête : lui inventer un agrégat serait de la cérémonie
 *   (cf. `CLAUDE.md` §3.1, « où NE PAS mettre d'agrégat ») ;
 * - les **livraisons** forment un carnet dont l'adresse par défaut est une règle
 *   d'ensemble. Elles passent donc par l'agrégat : on charge, on mute par ses
 *   méthodes, on rend le carnet entier.
 *
 * Le `companyId` reste le mur des deux côtés : `loadDeliveryBook` ne rend que ce
 * qui appartient à l'entreprise, et le carnet le reporte dans son écriture.
 */
export abstract class CompanyAddressRepository {
  /**
   * Enregistre l'unique adresse de **facturation** : la met à jour si elle
   * existe déjà, la crée sinon (une entreprise n'en a qu'une).
   */
  abstract saveBilling(companyId: string, payload: BillingAddressPayload): Promise<void>;

  /**
   * Charge le **carnet de livraison** de l'entreprise — archivées comprises, car
   * l'agrégat écrit l'ensemble et doit donc porter ce qu'il a lu.
   *
   * Rend un carnet **vide** plutôt que `null` quand l'entreprise n'a aucune
   * adresse : un carnet sans adresse est un état normal, pas une absence.
   */
  abstract loadDeliveryBook(companyId: string): Promise<DeliveryAddressBook>;

  /**
   * Persiste le carnet **en une transaction** : les lignes, les archivages, et
   * l'unique `is_default`.
   *
   * L'adaptateur réécrit `is_default` sur **toutes** les livraisons de
   * l'entreprise à partir du seul `defaultId` du carnet. C'est ce qui fait que
   * l'invariant traverse la frontière : le domaine ne peut pas exprimer deux
   * défauts, et l'écriture ne peut pas en fabriquer.
   */
  abstract saveDeliveryBook(book: DeliveryAddressBook): Promise<void>;
}
