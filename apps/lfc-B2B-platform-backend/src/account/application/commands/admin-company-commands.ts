import type {
  BillingAddressPayload,
  DeliveryAddressPayload,
  UpdateIdentityPayload,
} from "@lfd/contracts";

import type { DeferredTerm, FulfillmentPreferencePayload } from "@lfd/contracts";

/**
 * Commandes **staff** (Porte B) : le commercial complète une société **à la
 * place** du client.
 *
 * Contrairement aux commandes client (`actorUserId → roleOf → ensureCompanyAdmin`),
 * elles ne portent **pas d'acteur** et **ne franchissent aucun mur membership** —
 * le staff n'est membre d'aucune société. L'autorisation est portée **en amont**
 * par `AdminAuthGuard` sur la route `admin/*`. Même patron que
 * `CreateCompanyByStaffCommand`, appliqué aux pièces d'activation.
 */

/** Dépose le KBIS d'une société (le fichier vit dans le stockage objet). */
export class UploadKbisByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly fileName: string,
    readonly bytes: Buffer,
  ) {}
}

/** Édite l'identité souple (enseigne + n° de TVA). L'identité légale reste fixée. */
export class UpdateIdentityByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly payload: UpdateIdentityPayload,
  ) {}
}

/**
 * Fixe la condition de règlement **convenue** — l'acte proprement staff : le
 * client ne peut que *demander*, seul le commercial *convient*.
 */
export class GrantTermsCommand {
  constructor(
    readonly companyId: string,
    readonly grantedTerms: readonly DeferredTerm[],
  ) {}
}

/** Enregistre l'unique adresse de facturation (créée ou mise à jour). */
export class SaveBillingAddressByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly payload: BillingAddressPayload,
  ) {}
}

/** Ajoute une adresse de livraison et renvoie son identifiant. */
export class AddDeliveryAddressByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly payload: DeliveryAddressPayload,
  ) {}
}

/**
 * Pose la **préférence d'acheminement** de la société : comment ce client est
 * servi d'habitude.
 *
 * Geste staff comme les autres pièces — mais qui, lui, ne conditionne rien :
 * c'est un défaut offert à la commande, que le client peut écarter au panier.
 */
export class PreferFulfillmentByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly preference: FulfillmentPreferencePayload,
  ) {}
}
