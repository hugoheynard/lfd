import type { DeferredTerm } from "@lfd/contracts";
import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import { ACCOUNT_FACTS } from "./account-facts.js";
import type { NamedRef } from "./journal-names.js";

/**
 * Les **actes du staff sur le compte d'un client**.
 *
 * Ils ont tous la même forme : un agent, une société, une décision qui n'est pas
 * la sienne. C'est exactement le profil où l'on vient demander des comptes six
 * mois plus tard — « qui a accordé ce délai », « qui a changé cette adresse de
 * facturation », « sur quelle base ce compte a-t-il été ouvert ». Ils partent
 * donc par `publishTraced` : la trace est écrite dans la transaction de l'acte,
 * et une panne de journal l'annule.
 *
 * L'acteur n'est PAS dans la charge utile. Il est déjà dans la ligne de journal
 * — type, identifiant, nom et fonction figés au moment de l'acte — et l'écrire
 * deux fois ouvrirait la porte à deux réponses différentes à la même question.
 *
 * Chaque événement porte son propre `journalFact()` plutôt qu'une charge
 * générique : c'est ce qui permet au handler de rester à une ligne, et à la
 * charge d'être ce qu'il faut pour relire — jamais une copie de la fiche.
 *
 * La société est reçue **nommée** : son nom du moment part en `subjectLabel`
 * (lot B du plan des phrases, D6), pour qu'une enseigne changée depuis se lise
 * encore sous l'ancienne sur les lignes d'avant.
 */
export abstract class CompanyStaffAct implements JournaledEvent {
  readonly companyId: string;
  readonly companyName: string;

  protected constructor(company: NamedRef) {
    this.companyId = company.id;
    this.companyName = company.name;
  }

  protected abstract type(): JournalFactType;

  /** Ce qu'il faut pour relire l'acte. Vide par défaut : le verbe suffit parfois. */
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

/** Un agent a déposé l'extrait KBIS à la place du client. */
export class KbisUploadedByStaffEvent extends CompanyStaffAct {
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

/**
 * Un agent a corrigé l'identité de la société.
 *
 * On inscrit ce qui a été ÉCRIT, pas le « avant → après » : l'identité légale
 * d'une société se corrige parce qu'elle était fausse, et la valeur d'avant est
 * précisément celle dont on veut pouvoir dire qu'elle ne vaut plus. L'état
 * précédent reste lisible dans le fait précédent — c'est à ça que sert un flux.
 */
export class CompanyIdentityCorrectedEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly identity: {
      readonly raisonSociale: string;
      readonly formeJuridique: string;
      readonly siret: string;
      /** Tel que SAISI : vide quand l'agent ne l'a pas envoyé — le recalcul est en base. */
      readonly siren: string;
    },
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.identityCorrected;
  }
  protected override details(): Record<string, unknown> {
    return { ...this.identity };
  }
}

/**
 * Un agent a fixé les délais de paiement accordés.
 *
 * La liste ENTIÈRE, pas le delta : c'est un octroi, pas une accumulation, et un
 * retrait de délai est le même geste qu'un ajout. Une liste vide est donc une
 * décision lisible — « plus aucun délai » — et non une charge manquante.
 */
export class PaymentTermsGrantedEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly terms: readonly DeferredTerm[],
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.paymentTermsGranted;
  }
  protected override details(): Record<string, unknown> {
    return { terms: [...this.terms] };
  }
}

/** Un agent a suspendu, réactivé ou résilié le compte. */
export class CompanyStatusChangedByStaffEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly action: "suspend" | "reactivate" | "terminate",
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.statusChanged;
  }
  protected override details(): Record<string, unknown> {
    return { action: this.action };
  }
}

/**
 * La comptabilité a bloqué le prélèvement mensuel : les commandes à venir se
 * règlent par carte. La raison part dans la charge — c'est elle qu'on relira
 * avant de débloquer.
 */
export class DirectDebitBlockedEvent extends CompanyStaffAct {
  constructor(
    company: NamedRef,
    readonly reason: string,
  ) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.directDebitBlocked;
  }
  protected override details(): Record<string, unknown> {
    return { reason: this.reason };
  }
}

/** La comptabilité a rétabli le prélèvement mensuel. */
export class DirectDebitUnblockedEvent extends CompanyStaffAct {
  constructor(company: NamedRef) {
    super(company);
  }
  protected type(): JournalFactType {
    return ACCOUNT_FACTS.directDebitUnblocked;
  }
}
