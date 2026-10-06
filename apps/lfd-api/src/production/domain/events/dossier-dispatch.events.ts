import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";

/**
 * **Le dossier du jour est parti** (plan `dossier-prod-du-jour.md`, E3) —
 * un fait de journal par envoi qui a réellement écrit à quelqu'un. Une
 * redélivrance qui ne sert personne n'en écrit pas.
 *
 * Des comptes seulement : le journal n'écrit ni adresse ni nom de
 * destinataire (`closure.spec.ts`). Les échecs se nomment dans la cloche.
 */
export class DossierSentJournalEvent implements JournaledEvent {
  constructor(
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    readonly sent: number,
    readonly failed: number,
    /** `true` : après un retirage. */
    readonly completed: boolean,
  ) {}

  journalFact(): JournalFact {
    return {
      type: "production_day.dossier_sent",
      subjectType: "production_day",
      subjectId: this.serviceDay,
      payload: {
        subjectLabel: this.serviceDay,
        serviceDay: this.serviceDay,
        sent: this.sent,
        failed: this.failed,
        completed: this.completed,
      },
    };
  }
}
