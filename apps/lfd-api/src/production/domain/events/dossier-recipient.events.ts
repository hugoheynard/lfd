import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { DossierRecipient } from "../entities/dossier-recipient.js";

/**
 * **Les faits des destinataires du dossier du jour** (plan
 * `dossier-prod-du-jour.md`, E2). La ligne archivée garde qui l'a retirée ;
 * le journal garde aussi le nom et l'adresse du moment, qu'une fiche du
 * personnel ne recopie pas — pas son adresse : le journal n'écrit aucun e-mail.
 */
export const DOSSIER_RECIPIENT_FACT_TYPES = {
  added: "production_dossier_recipient.added",
  removed: "production_dossier_recipient.removed",
} as const satisfies Readonly<Record<string, JournalFactType>>;

const SUBJECT_TYPE = "production_dossier_recipient";

/** Fait : **une personne recevra le dossier du jour**. */
export class DossierRecipientAddedEvent implements JournaledEvent {
  constructor(readonly recipient: DossierRecipient) {}

  journalFact(): JournalFact {
    return recipientFact(DOSSIER_RECIPIENT_FACT_TYPES.added, this.recipient);
  }
}

/** Fait : **elle ne le recevra plus**. */
export class DossierRecipientRemovedEvent implements JournaledEvent {
  constructor(readonly recipient: DossierRecipient) {}

  journalFact(): JournalFact {
    return recipientFact(DOSSIER_RECIPIENT_FACT_TYPES.removed, this.recipient);
  }
}

function recipientFact(type: JournalFactType, recipient: DossierRecipient): JournalFact {
  const { target } = recipient;
  return {
    type,
    subjectType: SUBJECT_TYPE,
    subjectId: recipient.id,
    payload: {
      subjectLabel: recipient.label,
      kind: target.kind,
      staffUserId: target.kind === "staff" ? target.staffUserId : null,
    },
  };
}
