import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import {
  PAYMENT_MANDATE_FACTS,
  type DraftVoidingCause,
  type MandateActorChannel,
} from "./payment-mandate-facts.js";

/** Le sujet commun : le mandat, par son identifiant. */
const SUBJECT_TYPE = "payment_mandate";

/**
 * Fait : **une RUM est frappée**. La référence entre au payload — c'est elle
 * que le débiteur oppose, et le seul moyen de relier une ligne du journal au
 * papier qu'il a dans son classeur.
 */
export class MandateMintedEvent implements JournaledEvent {
  constructor(
    readonly mandateId: string,
    readonly companyId: string,
    readonly reference: string,
    readonly via: MandateActorChannel,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PAYMENT_MANDATE_FACTS.minted,
      subjectType: SUBJECT_TYPE,
      subjectId: this.mandateId,
      payload: { companyId: this.companyId, reference: this.reference, via: this.via },
    };
  }
}

/**
 * Fait : **un scan signé est déposé**. Un nouveau dépôt sur le brouillon
 * remplace la pièce précédente sans l'archiver (plan §7 #5) : ce fait est donc
 * la seule mémoire qu'il y en a eu une autre.
 */
export class MandateProofAttachedEvent implements JournaledEvent {
  constructor(
    readonly mandateId: string,
    readonly companyId: string,
    readonly reference: string,
    readonly fileName: string,
    readonly via: MandateActorChannel,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PAYMENT_MANDATE_FACTS.proofAttached,
      subjectType: SUBJECT_TYPE,
      subjectId: this.mandateId,
      payload: {
        companyId: this.companyId,
        reference: this.reference,
        fileName: this.fileName,
        via: this.via,
      },
    };
  }
}

/**
 * Fait : **le mandat est activé**. `signedAt` est la date du PAPIER ; l'instant
 * de la saisie est celui du journal. Les deux ensemble disent combien de temps
 * la pièce a attendu sa relecture.
 */
export class MandateSignedEvent implements JournaledEvent {
  constructor(
    readonly mandateId: string,
    readonly companyId: string,
    readonly reference: string,
    readonly signedAt: string,
    /** Le mandat actif révoqué dans la même transaction, s'il y en avait un. */
    readonly replacedMandateId: string | null,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PAYMENT_MANDATE_FACTS.signed,
      subjectType: SUBJECT_TYPE,
      subjectId: this.mandateId,
      payload: {
        companyId: this.companyId,
        reference: this.reference,
        signedAt: this.signedAt,
        replacedMandateId: this.replacedMandateId,
      },
    };
  }
}

/**
 * Fait : **le brouillon est révoqué** parce que le RIB ou les zones du mandat
 * ont été réécrits. Sans cette ligne, un brouillon disparu de l'écran du client
 * n'aurait pas d'explication — ni pour lui, ni pour le commercial qu'il appelle.
 */
export class MandateDraftVoidedEvent implements JournaledEvent {
  constructor(
    readonly mandateId: string,
    readonly companyId: string,
    readonly reference: string,
    readonly cause: DraftVoidingCause,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PAYMENT_MANDATE_FACTS.draftVoided,
      subjectType: SUBJECT_TYPE,
      subjectId: this.mandateId,
      payload: { companyId: this.companyId, reference: this.reference, cause: this.cause },
    };
  }
}
