import type { BillingAddressPayload, DeliveryAddressPayload } from "@lfd/contracts";

/**
 * Les commandes de gestion des adresses d'une entreprise.
 *
 * Regroupées : ce sont des variations d'une même intention (« gérer les adresses
 * de cette entreprise »), même acteur, même mur. Chacune garde **son** handler.
 * `actorUserId` accompagne toujours `companyId` : c'est contre le rôle de l'acteur
 * dans cette entreprise que le mur se vérifie.
 */

/** Enregistre l'unique adresse de facturation (création ou remplacement). */
export class SaveBillingAddressCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly payload: BillingAddressPayload,
  ) {}
}

/** Ajoute une adresse de livraison. */
export class AddDeliveryAddressCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly payload: DeliveryAddressPayload,
  ) {}
}

/** Remplace une adresse de livraison. */
export class UpdateDeliveryAddressCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly addressId: string,
    readonly payload: DeliveryAddressPayload,
  ) {}
}

/** Archive une adresse de livraison. */
export class RemoveDeliveryAddressCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly addressId: string,
  ) {}
}

/** Désigne l'adresse de livraison par défaut. */
export class SetDefaultDeliveryAddressCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly addressId: string,
  ) {}
}
