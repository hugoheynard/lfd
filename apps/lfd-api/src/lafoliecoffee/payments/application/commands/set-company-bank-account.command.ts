import type { SetCompanyBankAccountPayload } from "@lfd/contracts";

/**
 * Poser — ou remplacer — le **RIB d'une société cliente**.
 *
 * Une seule commande pour les deux, parce que du point de vue du geste il n'y en
 * a qu'un : on recopie un RIB. Ce que ça change au mandat en cours dépend de la
 * réponse de la banque sur l'amendement SEPA, et ne se décide donc pas ici.
 */
export class SetCompanyBankAccountCommand {
  constructor(
    readonly companyId: string,
    readonly payload: SetCompanyBankAccountPayload,
  ) {}
}
