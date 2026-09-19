import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";

/**
 * Le type du fait. Préfixé `company.` : le journal range un fait dans son module
 * PAR SON PRÉFIXE (`growth/domain/activity-module.ts`), et `company.` y est déjà
 * rangé sous « comptes » — un `client_note.` n'appartiendrait à aucun module
 * (vérifié le 2026-09-15).
 */
export const CLIENT_NOTE_EDITED_BY_STAFF =
  "company.client_note_edited_by_staff" satisfies JournalFactType;

/** Ce que l'agent a fait au carnet. */
export type ClientNoteStaffAction =
  "note_added" | "note_revised" | "note_removed" | "notes_reordered";

/**
 * Un agent a modifié le carnet de notes d'un client.
 *
 * 🔴 **La charge ne porte AUCUN contenu** — ni titre, ni description, ni clé de
 * photo (plan `documentation/b2b/plan-notes-photo-du-commercial.md`, D6). Le
 * journal est append-only : une note « supprimée définitivement » y resterait
 * lisible pour toujours. Le fait dit qui (la ligne de journal), quand, sur quel
 * client, quelle note et quel geste ; l'état courant du carnet dit le reste.
 *
 * **`noteId` est absent du réordonnancement**, et c'est voulu : le geste range
 * TOUT le carnet, aucune note n'en est le sujet. En nommer une serait faux ; les
 * nommer toutes recopierait l'ordre du carnet dans le journal, qui n'a pas à le
 * garder.
 */
export class ClientNoteEditedByStaffEvent implements JournaledEvent {
  private constructor(
    readonly companyId: string,
    readonly noteId: string | null,
    readonly action: ClientNoteStaffAction,
  ) {}

  /** Un geste sur UNE note : ajoutée, refaite, supprimée. */
  static onNote(
    companyId: string,
    noteId: string,
    action: Exclude<ClientNoteStaffAction, "notes_reordered">,
  ): ClientNoteEditedByStaffEvent {
    return new ClientNoteEditedByStaffEvent(companyId, noteId, action);
  }

  /** Le carnet entier a été réordonné. */
  static reordered(companyId: string): ClientNoteEditedByStaffEvent {
    return new ClientNoteEditedByStaffEvent(companyId, null, "notes_reordered");
  }

  journalFact(): JournalFact {
    return {
      type: CLIENT_NOTE_EDITED_BY_STAFF,
      subjectType: "company",
      subjectId: this.companyId,
      payload:
        this.noteId === null
          ? { companyId: this.companyId, action: this.action }
          : { companyId: this.companyId, noteId: this.noteId, action: this.action },
    };
  }
}
