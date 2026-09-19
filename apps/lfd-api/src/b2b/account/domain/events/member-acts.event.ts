import type { BillingAddressPayload, DeferredTerm, DeliveryAddressPayload } from "@lfd/contracts";
import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import { ACCOUNT_FACTS } from "./account-facts.js";
import { placeOf } from "./address-place.js";
import type { DeliveryAddressRef, NamedRef, PersonRef } from "./journal-names.js";
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
 *
 * Lot B du plan des phrases (2026-09-19) : la société part nommée en
 * `subjectLabel` ; un contact cité l'est avec son nom du moment, une adresse
 * par son id, sa ville et son code postal — la même forme que chez le staff.
 */
export abstract class CompanyMemberAct implements JournaledEvent {
  readonly companyId: string;
  readonly companyName: string;

  protected constructor(company: NamedRef) {
    this.companyId = company.id;
    this.companyName = company.name;
  }

  protected abstract type(): JournalFactType;

  /** Ce qu'il faut pour relire le geste. Vide par défaut : le verbe suffit parfois. */
  protected details(): Record<string, unknown> {
    return {};
  }

  journalFact(): JournalFact {
    return {
      type: this.type(),
      subjectType: "company",
      subjectId: this.companyId,
      payload: { subjectLabel: this.companyName, ...this.details() },
    };
  }
}

/** Le client a écrit son adresse de facturation — la charge du fait staff jumeau. */
export class BillingAddressSavedByMemberEvent extends CompanyMemberAct {
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

/** Une adresse de livraison désignée par son id, et le lieu que ce geste écrit. */
abstract class DeliveryAddressPlacedAct extends CompanyMemberAct {
  protected constructor(
    company: NamedRef,
    readonly address: DeliveryAddressRef,
    readonly payload: DeliveryAddressPayload,
  ) {
    super(company);
  }
  protected override details(): Record<string, unknown> {
    // Le lieu ÉCRIT par ce geste, dans l'adresse citée : une seule place
    // pour la ville et le code postal (lot B, 2026-09-19).
    return { address: { id: this.address.id, ...placeOf(this.payload) } };
  }
}

export class DeliveryAddressAddedByMemberEvent extends DeliveryAddressPlacedAct {
  constructor(company: NamedRef, address: DeliveryAddressRef, payload: DeliveryAddressPayload) {
    super(company, address, payload);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.deliveryAddressAdded;
  }
}

export class DeliveryAddressUpdatedByMemberEvent extends DeliveryAddressPlacedAct {
  constructor(company: NamedRef, address: DeliveryAddressRef, payload: DeliveryAddressPayload) {
    super(company, address, payload);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.deliveryAddressUpdated;
  }
}

/** Archivage : l'identifiant suffit — le fait d'ajout, toujours dans le flux, dit le reste. */
export class DeliveryAddressRemovedByMemberEvent extends CompanyMemberAct {
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

export class DefaultDeliverySetByMemberEvent extends CompanyMemberAct {
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

/** Retrait ou livraison par défaut — les mêmes champs que chez le staff, aucun n'est une coordonnée. */
export class FulfillmentPreferenceSetByMemberEvent extends CompanyMemberAct {
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

/** Un contact additionnel : son identifiant, son nom s'il en a un, et son rôle — rien d'autre de lui. */
abstract class ContactRoleAct extends CompanyMemberAct {
  protected constructor(
    company: NamedRef,
    readonly contact: PersonRef,
    readonly role: string,
  ) {
    super(company);
  }
  protected override details(): Record<string, unknown> {
    return { contact: { ...this.contact }, role: this.role };
  }
}

export class ContactAddedByMemberEvent extends ContactRoleAct {
  constructor(company: NamedRef, contact: PersonRef, role: string) {
    super(company, contact, role);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.contactAdded;
  }
}

export class ContactUpdatedByMemberEvent extends ContactRoleAct {
  constructor(company: NamedRef, contact: PersonRef, role: string) {
    super(company, contact, role);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.contactUpdated;
  }
}

export class ContactRemovedByMemberEvent extends CompanyMemberAct {
  constructor(
    company: NamedRef,
    readonly contact: PersonRef,
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.contactRemoved;
  }
  protected override details(): Record<string, unknown> {
    return { contact: { ...this.contact } };
  }
}

/** L'interlocuteur principal change — la charge est vide, comme chez le staff. */
export class PrimaryContactChangedByMemberEvent extends CompanyMemberAct {
  constructor(company: NamedRef) {
    super(company);
  }
  protected type(): JournalFactType {
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
    company: NamedRef,
    readonly fields: readonly string[],
  ) {
    super(company);
  }
  protected type(): JournalFactType {
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
    company: NamedRef,
    readonly before: DeferredTerm | null,
    readonly after: DeferredTerm | null,
  ) {
    super(company);
  }
  protected type(): JournalFactType {
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

/** Le gestionnaire a déposé l'extrait KBIS — le nom du fichier, comme chez le staff. */
export class KbisUploadedByMemberEvent extends CompanyMemberAct {
  constructor(
    company: NamedRef,
    readonly fileName: string,
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.kbisUploaded;
  }
  protected override details(): Record<string, unknown> {
    return { fileName: this.fileName };
  }
}
