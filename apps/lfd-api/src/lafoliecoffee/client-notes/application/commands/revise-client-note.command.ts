import type { ClientNoteFields } from "@lfd/contracts";

/**
 * Refait une note — titre, description, photo gardée, retirée ou remplacée —
 * **par un agent**. L'agent est figé par le journal, pas sur la note : l'auteur
 * d'une note est celui qui l'a déposée.
 */
export class ReviseClientNoteCommand {
  constructor(
    readonly companyId: string,
    readonly noteId: string,
    readonly fields: ClientNoteFields,
    readonly removePhoto: boolean,
    readonly photo: Buffer | null,
    readonly thumbnail: Buffer | null,
  ) {}
}
