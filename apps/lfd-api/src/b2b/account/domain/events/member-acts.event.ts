import type { BillingAddressPayload, DeferredTerm, DeliveryAddressPayload } from "@lfd/contracts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import { ACCOUNT_FACTS } from "./account-facts.js";
import { placeOf } from "./address-place.js";
import type { DeliveryProcedureStaffAction } from "./staff-address-acts.event.js";

/**
 * Les gestes d'un **client sur le compte de sa propre société** — adresses,
 * contacts, identité, préférence d'acheminement, délai demandé.
 *
 * Hors journal jusqu'au 2026-09-19, par une règle : « le client qui modifie son
 * adresse n'engage que lui ». Hugo l'a levée ce jour-là (plan
 * `documentation/journalisation/plan-journal-d-activite.md` §3, décision 1) :
 * une adresse changée décide où part la prochaine commande, qui que soit
 * l'auteur, et « qui l'a changée » doit avoir une réponse.
 *
 * **Le même geste garde le même nom** que chez le staff (`ACCOUNT_FACTS`) :
 * l'auteur de la ligne — l'id `users` du client, ou la fiche staff — suffit à
 * les distinguer.
 *
 * **Jamais de coordonnées de personne** : un contact se désigne par son
 * identifiant ; une adresse porte **la charge du staff pour le même type** —
 * ville et code postal (`placeOf`), plus l'identifiant pour une adresse de
 * livraison, jamais le numéro ni la rue. Aligné sur le staff le 2026-09-19,
 * décision de Hugo : ville et code postal reconnaissent le lieu sans être une
 * coordonnée de personne. Un type, une forme : le libellé, que le staff
 * n'écrit pas, n'y figure plus.
 */
export abstract class CompanyMemberAct implements JournaledEvent {
  protected constructor(readonly companyId: string) {}

  protected abstract type(): string;

  /** Ce qu'il faut pour relire le geste. Vide par défaut : le verbe suffit parfois. */
  protected details(): Record<string, unknown> {
    return {};
  }

  journalFact(): JournalFact {
    return {
      type: this.type(),
      subjectType: "company",
      subjectId: this.companyId,
      payload: this.details(),
    };
  }
}

/** Le client a écrit son adresse de facturation — la charge du fait staff jumeau. */
export class BillingAddressSavedByMemberEvent extends CompanyMemberAct {
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

/** Une adresse de livraison désignée par son identifiant, sa ville et son code postal. */
abstract class DeliveryAddressPlacedAct extends CompanyMemberAct {
  protected constructor(
    companyId: string,
    readonly addressId: string,
    readonly payload: DeliveryAddressPayload,
  ) {
    super(companyId);
  }
  protected override details(): Record<string, unknown> {
    return { addressId: this.addressId, ...placeOf(this.payload) };
  }
}

export class DeliveryAddressAddedByMemberEvent extends DeliveryAddressPlacedAct {
  constructor(companyId: string, addressId: string, payload: DeliveryAddressPayload) {
    super(companyId, addressId, payload);
  }
  protected type(): string {
    return ACCOUNT_FACTS.deliveryAddressAdded;
  }
}

export class DeliveryAddressUpdatedByMemberEvent extends DeliveryAddressPlacedAct {
  constructor(companyId: string, addressId: string, payload: DeliveryAddressPayload) {
    super(companyId, addressId, payload);
  }
  protected type(): string {
    return ACCOUNT_FACTS.deliveryAddressUpdated;
  }
}

/** Archivage : l'identifiant suffit — le fait d'ajout, toujours dans le flux, dit le reste. */
export class DeliveryAddressRemovedByMemberEvent extends CompanyMemberAct {
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

export class DefaultDeliverySetByMemberEvent extends CompanyMemberAct {
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

/** Retrait ou livraison par défaut — les mêmes champs que chez le staff, aucun n'est une coordonnée. */
export class FulfillmentPreferenceSetByMemberEvent extends CompanyMemberAct {
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

/** Un contact additionnel : son identifiant et son rôle, rien de lui. */
abstract class ContactRoleAct extends CompanyMemberAct {
  protected constructor(
    companyId: string,
    readonly contactId: string,
    readonly role: string,
  ) {
    super(companyId);
  }
  protected override details(): Record<string, unknown> {
    return { contactId: this.contactId, role: this.role };
  }
}

export class ContactAddedByMemberEvent extends ContactRoleAct {
  constructor(companyId: string, contactId: string, role: string) {
    super(companyId, contactId, role);
  }
  protected type(): string {
    return ACCOUNT_FACTS.contactAdded;
  }
}

export class ContactUpdatedByMemberEvent extends ContactRoleAct {
  constructor(companyId: string, contactId: string, role: string) {
    super(companyId, contactId, role);
  }
  protected type(): string {
    return ACCOUNT_FACTS.contactUpdated;
  }
}

export class ContactRemovedByMemberEvent extends CompanyMemberAct {
  constructor(
    companyId: string,
    readonly contactId: string,
  ) {
    super(companyId);
  }
  protected type(): string {
    return ACCOUNT_FACTS.contactRemoved;
  }
  protected override details(): Record<string, unknown> {
    return { contactId: this.contactId };
  }
}

/** L'interlocuteur principal change — la charge est vide, comme chez le staff. */
export class PrimaryContactChangedByMemberEvent extends CompanyMemberAct {
  constructor(companyId: string) {
    super(companyId);
  }
  protected type(): string {
    return ACCOUNT_FACTS.primaryContactChanged;
  }
}

/**
 * Le client a édité l'identité de sa société : enseigne, TVA, et ce qu'il
 * complète de l'identité légale. Ce n'est pas `identity_corrected` — le client
 * ne réécrit jamais un SIRET posé (`Company.completeLegalIdentity`) — et la
 * charge dit **quels champs** ont changé, pas leurs valeurs.
 */
export class CompanyIdentityEditedEvent extends CompanyMemberAct {
  constructor(
    companyId: string,
    readonly fields: readonly string[],
  ) {
    super(companyId);
  }
  protected type(): string {
    return ACCOUNT_FACTS.identityEdited;
  }
  protected override details(): Record<string, unknown> {
    return { fields: [...this.fields] };
  }
}

/**
 * Le client a demandé un délai de paiement — ou retiré sa demande (`after`
 * `null`, cas où il redemande le terme déjà accordé). Le terme accordé, lui,
 * reste un acte du staff (`payment_terms_granted`).
 */
export class PaymentTermRequestedEvent extends CompanyMemberAct {
  constructor(
    companyId: string,
    readonly before: DeferredTerm | null,
    readonly after: DeferredTerm | null,
  ) {
    super(companyId);
  }
  protected type(): string {
    return ACCOUNT_FACTS.paymentTermRequested;
  }
  protected override details(): Record<string, unknown> {
    return { before: this.before, after: this.after };
  }
}

/**
 * Le gestionnaire a modifié la procédure de livraison d'une adresse. Même fait
 * et même charge que chez le staff : le geste, jamais le contenu d'une étape —
 * un titre peut porter un code de portail.
 */
export class DeliveryProcedureEditedByMemberEvent extends CompanyMemberAct {
  constructor(
    companyId: string,
    readonly addressId: string,
    readonly action: DeliveryProcedureStaffAction,
  ) {
    super(companyId);
  }
  protected type(): string {
    return ACCOUNT_FACTS.deliveryProcedureEdited;
  }
  protected override details(): Record<string, unknown> {
    return { companyId: this.companyId, addressId: this.addressId, action: this.action };
  }
}

/** Le gestionnaire a déposé l'extrait KBIS — le nom du fichier, comme chez le staff. */
export class KbisUploadedByMemberEvent extends CompanyMemberAct {
  constructor(
    companyId: string,
    readonly fileName: string,
  ) {
    super(companyId);
  }
  protected type(): string {
    return ACCOUNT_FACTS.kbisUploaded;
  }
  protected override details(): Record<string, unknown> {
    return { fileName: this.fileName };
  }
}
