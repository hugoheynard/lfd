/** Retire l'autorisation de prélever. Le mandat vit chez nous seuls depuis le 2026-09-19 : aucun prestataire à prévenir. */
export class RevokeMandateCommand {
  constructor(readonly companyId: string) {}
}
