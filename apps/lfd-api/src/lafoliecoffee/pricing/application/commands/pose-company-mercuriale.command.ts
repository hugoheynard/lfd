import type { PoseCompanyMercurialePayload } from "@lfd/contracts";

/** Poser une mercuriale chez ce client, sur une fenêtre datée aux deux bouts. */
export class PoseCompanyMercurialeCommand {
  constructor(
    readonly companyId: string,
    readonly payload: PoseCompanyMercurialePayload,
    readonly staffUserId: string,
    /**
     * La clé d'intention de l'écran (en-tête `Idempotency-Key`) : un second
     * envoi de même clé rend la réponse d'origine sans rien réécrire.
     */
    readonly intentKey: string,
  ) {}
}
