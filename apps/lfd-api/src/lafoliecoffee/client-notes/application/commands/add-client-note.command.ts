import type { ClientNoteFields } from "@lfd/contracts";

/**
 * Ajoute une note au carnet d'un client, **par un agent**. Rend l'id de la note.
 *
 * `staffUserId` est dans la commande, contrairement aux autres gestes du carnet :
 * l'auteur est figé SUR la note, pas seulement dans le journal.
 */
export class AddClientNoteCommand {
  constructor(
    readonly companyId: string,
    readonly fields: ClientNoteFields,
    readonly photo: Buffer | null,
    readonly thumbnail: Buffer | null,
    readonly staffUserId: string,
  ) {}
}
