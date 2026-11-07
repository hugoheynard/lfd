import type { MailCharterSettings } from "@lfd/mail-blocks";

/** Command : enregistrer le brouillon de la charte d'un espace, sur la révision lue. */
export class SaveMailCharterDraftCommand {
  constructor(
    readonly space: string,
    readonly settings: MailCharterSettings,
    readonly expectedRevision: number,
    readonly staffUserId: string,
  ) {}
}
