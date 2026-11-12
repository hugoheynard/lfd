/** Retire l'autorisation de prélever. Le mandat vit chez nous seuls depuis le 2026-09-19 : aucun prestataire à prévenir. */
export class RevokeMandateCommand {
  constructor(
    readonly companyId: string,
    /** La fiche staff de qui retire — l'acteur de l'intention. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran : un second envoi ne révoque rien de plus. */
    readonly intentKey: string,
  ) {}
}
