import type { BillingAddressPayload, DeliveryAddressPayload } from "@lfd/contracts";

import { ACCOUNT_FACTS } from "./account-facts.js";
import { CompanyStaffAct } from "./staff-acts.event.js";

/**
 * Les actes du staff sur les **adresses** d'un client.
 *
 * Une adresse n'est pas un détail administratif : celle de facturation part sur
 * les factures, celle de livraison décide où la prochaine commande arrive. Un
 * colis livré à la mauvaise porte se remonte à qui a changé l'adresse, et
 * quand — pas à l'état courant, qui ne dit rien de la veille.
 *
 * La charge porte **où**, jamais toute l'adresse : ville et code postal
 * suffisent à reconnaître le lieu dans un historique, et recopier une fiche
 * entière ferait du journal une seconde base — désynchronisée par construction.
 */
function placeOf(payload: BillingAddressPayload): Record<string, unknown> {
  return { ville: payload.ville, codePostal: payload.codePostal };
}

export class BillingAddressSavedByStaffEvent extends CompanyStaffAct {
  constructor(
    companyId: string,
    readonly payload: BillingAddressPayload,
  ) {
    super(companyId);
  }
  protected type(): string {
    return ACCOUNT_FACTS.billingAddressSaved;
  }
  protected override details(): Record<string, unknown> {
    return placeOf(this.payload);
  }
}

export class DeliveryAddressAddedByStaffEvent extends CompanyStaffAct {
  constructor(
    companyId: string,
    readonly addressId: string,
    readonly payload: DeliveryAddressPayload,
  ) {
    super(companyId);
  }
  protected type(): string {
    return ACCOUNT_FACTS.deliveryAddressAdded;
  }
  protected override details(): Record<string, unknown> {
    return { addressId: this.addressId, ...placeOf(this.payload) };
  }
}

export class DeliveryAddressUpdatedByStaffEvent extends CompanyStaffAct {
  constructor(
    companyId: string,
    readonly addressId: string,
    readonly payload: DeliveryAddressPayload,
  ) {
    super(companyId);
  }
  protected type(): string {
    return ACCOUNT_FACTS.deliveryAddressUpdated;
  }
  protected override details(): Record<string, unknown> {
    return { addressId: this.addressId, ...placeOf(this.payload) };
  }
}

/**
 * L'adresse supprimée n'emporte que son identifiant : elle n'existe plus, et
 * c'est le fait qui l'a créée — toujours dans le flux — qui dit où elle était.
 */
export class DeliveryAddressRemovedByStaffEvent extends CompanyStaffAct {
  constructor(
    companyId: string,
    readonly addressId: string,
  ) {
    super(companyId);
  }
  protected type(): string {
    return ACCOUNT_FACTS.deliveryAddressRemoved;
  }
  protected override details(): Record<string, unknown> {
    return { addressId: this.addressId };
  }
}

export class DefaultDeliverySetByStaffEvent extends CompanyStaffAct {
  constructor(
    companyId: string,
    readonly addressId: string,
  ) {
    super(companyId);
  }
  protected type(): string {
    return ACCOUNT_FACTS.defaultDeliverySet;
  }
  protected override details(): Record<string, unknown> {
    return { addressId: this.addressId };
  }
}

/**
 * Retrait ou livraison par défaut, et l'exigence de signature — le socle de la
 * société, celui dont chaque adresse puis chaque commande peut s'écarter.
 */
export class FulfillmentPreferenceSetByStaffEvent extends CompanyStaffAct {
  constructor(
    companyId: string,
    readonly preference: {
      readonly method: string | null;
      readonly pickupAddressId: string | null;
      readonly deliveryAddressId: string | null;
      readonly signatureRequired: boolean;
    },
  ) {
    super(companyId);
  }
  protected type(): string {
    return ACCOUNT_FACTS.fulfillmentPreferenceSet;
  }
  protected override details(): Record<string, unknown> {
    return { ...this.preference };
  }
}
