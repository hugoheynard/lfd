/**
 * Command : **effacer une adresse du registre de préférence** (plan de
 * désinscription, règle 23), à une demande d'effacement. Tous les espaces :
 * un accord part, une désinscription ne garde que son empreinte.
 */
export class EraseMarketingPreferencesCommand {
  constructor(readonly address: string) {}
}
