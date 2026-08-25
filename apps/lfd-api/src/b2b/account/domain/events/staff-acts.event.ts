import type { DeferredTerm } from "@lfd/contracts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import { ACCOUNT_FACTS } from "./account-facts.js";

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
 */
export abstract class CompanyStaffAct implements JournaledEvent {
  protected constructor(readonly companyId: string) {}

  protected abstract type(): string;

  /** Ce qu'il faut pour relire l'acte. Vide par défaut : le verbe suffit parfois. */
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

/** Un agent a déposé l'extrait KBIS à la place du client. */
export class KbisUploadedByStaffEvent extends CompanyStaffAct {
  constructor(
    companyId: string,
    readonly fileName: string,
  ) {
    super(companyId);
  }
  protected type(): string {
    return ACCOUNT_FACTS.kbisUploadedByStaff;
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
    companyId: string,
    readonly identity: {
      readonly raisonSociale: string;
      readonly formeJuridique: string;
      readonly siret: string;
    },
  ) {
    super(companyId);
  }
  protected type(): string {
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
    companyId: string,
    readonly terms: readonly DeferredTerm[],
  ) {
    super(companyId);
  }
  protected type(): string {
    return ACCOUNT_FACTS.paymentTermsGranted;
  }
  protected override details(): Record<string, unknown> {
    return { terms: [...this.terms] };
  }
}

/** Un agent a suspendu, réactivé ou résilié le compte. */
export class CompanyStatusChangedByStaffEvent extends CompanyStaffAct {
  constructor(
    companyId: string,
    readonly action: "suspend" | "reactivate" | "terminate",
  ) {
    super(companyId);
  }
  protected type(): string {
    return ACCOUNT_FACTS.statusChanged;
  }
  protected override details(): Record<string, unknown> {
    return { action: this.action };
  }
}
