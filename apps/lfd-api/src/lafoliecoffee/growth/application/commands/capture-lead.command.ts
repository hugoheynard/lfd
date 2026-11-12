import type { CaptureLeadPayload } from "@lfd/contracts";

/** Command : **saisir** un lead cold (démarchage sortant). */
export class CaptureLeadCommand {
  constructor(
    readonly payload: CaptureLeadPayload,
    /** La fiche du staff qui agit : l'acteur de l'intention. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (`Idempotency-Key`) : un rejeu ne refait pas le geste. */
    readonly intentKey: string,
  ) {}
}
