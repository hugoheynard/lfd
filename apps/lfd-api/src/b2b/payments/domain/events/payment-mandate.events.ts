import type { MandateStatus } from "@lfd/contracts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import {
  PAYMENT_MANDATE_FACTS,
  type DraftVoidingCause,
  type MandateActorChannel,
  type ProofPurgeCause,
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
 * Fait : **le mandat frappé est parti chez le client**, par courriel.
 *
 * `providerId` est l'identifiant que le fournisseur a rendu en acceptant
 * l'envoi — `null` en mode à blanc, où rien ne part : il n'y a alors rien à
 * rapprocher, et un identifiant inventé ne correspondrait à rien. L'adresse
 * n'entre pas au payload.
 */
export class MandateSentEvent implements JournaledEvent {
  constructor(
    readonly mandateId: string,
    readonly companyId: string,
    readonly reference: string,
    readonly providerId: string | null,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PAYMENT_MANDATE_FACTS.sent,
      subjectType: SUBJECT_TYPE,
      subjectId: this.mandateId,
      payload: {
        companyId: this.companyId,
        reference: this.reference,
        providerId: this.providerId,
      },
    };
  }
}

/**
 * Fait : **le staff révoque le mandat courant**. `previousStatus` dit ce qui a été
 * révoqué — un mandat qui autorisait un débit, ou un brouillon jamais signé :
 * les deux n'appellent pas la même question du client.
 */
export class MandateRevokedEvent implements JournaledEvent {
  constructor(
    readonly mandateId: string,
    readonly companyId: string,
    readonly reference: string,
    readonly previousStatus: MandateStatus,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PAYMENT_MANDATE_FACTS.revoked,
      subjectType: SUBJECT_TYPE,
      subjectId: this.mandateId,
      payload: {
        companyId: this.companyId,
        reference: this.reference,
        previousStatus: this.previousStatus,
        via: "staff",
      },
    };
  }
}

/**
 * Fait : **le brouillon est révoqué** parce que le RIB ou les zones du mandat
 * ont été réécrits. Sans cette ligne, un brouillon disparu de l'écran du client
 * n'aurait pas d'explication — ni pour lui, ni pour le commercial qu'il appelle.
 *
 * `via` dit qui a réécrit (depuis le 2026-09-14) : « le client a changé son RIB »
 * et « le commercial l'a changé » n'appellent pas le même coup de fil.
 */
export class MandateDraftVoidedEvent implements JournaledEvent {
  constructor(
    readonly mandateId: string,
    readonly companyId: string,
    readonly reference: string,
    readonly cause: DraftVoidingCause,
    readonly via: MandateActorChannel,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PAYMENT_MANDATE_FACTS.draftVoided,
      subjectType: SUBJECT_TYPE,
      subjectId: this.mandateId,
      payload: {
        companyId: this.companyId,
        reference: this.reference,
        cause: this.cause,
        via: this.via,
      },
    };
  }
}

/**
 * Fait : **les zones 14 et 19 sont réécrites**, qu'un brouillon existe ou non.
 *
 * Le sujet est le **RIB** (`company_bank_account`), pas un mandat : les zones
 * vivent sur sa ligne, et il n'existe souvent aucun mandat à nommer. Les
 * valeurs écrites entrent au payload — ce ne sont pas des coordonnées
 * bancaires, et « quelle référence a-t-on imprimée, et depuis quand » est la
 * question qu'on posera.
 */
export class MandateOptionsChangedEvent implements JournaledEvent {
  constructor(
    readonly bankAccountId: string,
    readonly companyId: string,
    readonly debtorReference: string,
    readonly contractNumber: string,
    readonly via: MandateActorChannel,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PAYMENT_MANDATE_FACTS.optionsChanged,
      subjectType: "company_bank_account",
      subjectId: this.bankAccountId,
      payload: {
        companyId: this.companyId,
        debtorReference: this.debtorReference,
        contractNumber: this.contractNumber,
        via: this.via,
      },
    };
  }
}

/**
 * Fait : **le scan d'un mandat jamais signé a quitté le stockage**.
 *
 * Il ne porte ni la clé ni le nom du fichier : la clé désigne un objet qui
 * n'existe plus, et `payment_mandate.proof_attached` a déjà dit quel fichier
 * était entré. Ce fait-ci répond à « où est passé le premier scan ? ».
 */
export class MandateProofPurgedEvent implements JournaledEvent {
  constructor(
    readonly mandateId: string,
    readonly companyId: string,
    readonly reference: string,
    readonly cause: ProofPurgeCause,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PAYMENT_MANDATE_FACTS.proofPurged,
      subjectType: SUBJECT_TYPE,
      subjectId: this.mandateId,
      payload: { companyId: this.companyId, reference: this.reference, cause: this.cause },
    };
  }
}
