import type { AmendCompanyMercurialePayload } from "@lfd/contracts";

/**
 * Amender la mercuriale `mercurialeId` de ce client : un avenant daté qui
 * ajoute des prix et/ou arrête des lignes (`documentation/pricing/mercuriales/l-avenant-date.md`).
 */
export class AmendCompanyMercurialeCommand {
  constructor(
    readonly companyId: string,
    readonly mercurialeId: string,
    readonly payload: AmendCompanyMercurialePayload,
    readonly staffUserId: string,
    /**
     * La clé d'intention de l'écran (en-tête `Idempotency-Key`) : un second
     * envoi de même clé rend la réponse d'origine sans rien réécrire.
     */
    readonly intentKey: string,
  ) {}
}
