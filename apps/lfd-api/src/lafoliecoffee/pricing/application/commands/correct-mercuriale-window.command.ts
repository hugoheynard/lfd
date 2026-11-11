import type { CorrectMercurialeWindowPayload } from "@lfd/contracts";

/** Corriger les dates d'une mercuriale qui n'a pas commencé. */
export class CorrectMercurialeWindowCommand {
  constructor(
    readonly companyId: string,
    readonly mercurialeId: string,
    readonly payload: CorrectMercurialeWindowPayload,
    readonly staffUserId: string,
    /**
     * La clé d'intention de l'écran (en-tête `Idempotency-Key`) : un second
     * envoi de même clé rend la réponse d'origine sans rien réécrire.
     */
    readonly intentKey: string,
  ) {}
}
