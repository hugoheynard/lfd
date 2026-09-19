import type { BillingAddressPayload, DeliveryAddressPayload } from "@lfd/contracts";
import type { JournalFactType } from "@lfd/contracts/journal-facts";

import { ACCOUNT_FACTS } from "./account-facts.js";
import { placeOf } from "./address-place.js";
import type { DeliveryAddressRef, NamedRef } from "./journal-names.js";
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
 * (`placeOf`, partagé avec les faits du client depuis le 2026-09-19). Une
 * adresse de livraison y est citée par son id et ce même lieu
 * (`DeliveryAddressRef`, lot B du plan des phrases) — jamais par son
 * libellé, texte libre qui peut porter une coordonnée.
 */
export class BillingAddressSavedByStaffEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly payload: BillingAddressPayload,
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.billingAddressSaved;
  }
  protected override details(): Record<string, unknown> {
    return placeOf(this.payload);
  }
}

export class DeliveryAddressAddedByStaffEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly address: DeliveryAddressRef,
    readonly payload: DeliveryAddressPayload,
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.deliveryAddressAdded;
  }
  protected override details(): Record<string, unknown> {
    // Le lieu ÉCRIT par ce geste, dans l'adresse citée : une seule place
    // pour la ville et le code postal (lot B, 2026-09-19).
    return { address: { id: this.address.id, ...placeOf(this.payload) } };
  }
}

export class DeliveryAddressUpdatedByStaffEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly address: DeliveryAddressRef,
    readonly payload: DeliveryAddressPayload,
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.deliveryAddressUpdated;
  }
  protected override details(): Record<string, unknown> {
    // Le lieu ÉCRIT par ce geste, dans l'adresse citée : une seule place
    // pour la ville et le code postal (lot B, 2026-09-19).
    return { address: { id: this.address.id, ...placeOf(this.payload) } };
  }
}

/**
 * L'adresse supprimée n'emporte que son identifiant : elle n'existe plus, et
 * c'est le fait qui l'a créée — toujours dans le flux — qui dit où elle était.
 */
export class DeliveryAddressRemovedByStaffEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly address: DeliveryAddressRef,
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.deliveryAddressRemoved;
  }
  protected override details(): Record<string, unknown> {
    return { address: { ...this.address } };
  }
}

export class DefaultDeliverySetByStaffEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly address: DeliveryAddressRef,
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.defaultDeliverySet;
  }
  protected override details(): Record<string, unknown> {
    return { address: { ...this.address } };
  }
}

/**
 * Retrait ou livraison par défaut, et l'exigence de signature — le socle de la
 * société, celui dont chaque adresse puis chaque commande peut s'écarter.
 */
export class FulfillmentPreferenceSetByStaffEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly preference: {
      readonly method: string | null;
      readonly pickupAddressId: string | null;
      readonly deliveryAddress: DeliveryAddressRef | null;
      readonly signatureRequired: boolean;
    },
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.fulfillmentPreferenceSet;
  }
  protected override details(): Record<string, unknown> {
    return { ...this.preference };
  }
}

/** Ce que l'agent a fait à la procédure de livraison. */
export type DeliveryProcedureStaffAction =
  "step_added" | "step_revised" | "step_removed" | "reordered";

/**
 * Un agent a modifié la procédure de livraison d'une adresse.
 *
 * La charge dit **quel geste**, pas ce qui a été écrit : un titre d'étape peut
 * porter un code de portail, et le journal se garde des années. L'état courant
 * de la procédure dit le reste ; le fait dit qui, quand, et sur quelle adresse.
 */
export class DeliveryProcedureEditedByStaffEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly address: DeliveryAddressRef,
    readonly action: DeliveryProcedureStaffAction,
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.deliveryProcedureEdited;
  }
  protected override details(): Record<string, unknown> {
    // La société est le sujet de la ligne : la charge ne la répète plus (lot B).
    return { address: { ...this.address }, action: this.action };
  }
}
