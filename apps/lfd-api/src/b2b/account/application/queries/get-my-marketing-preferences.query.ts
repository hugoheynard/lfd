/**
 * « Mes préférences » et la question de la case à la commande (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, C2 et C3) — pour
 * l'adresse du compte connecté, lue dans le principal : jamais une adresse
 * reçue du client, sans quoi la réponse serait un oracle (règle 17).
 */
export class GetMyMarketingPreferencesQuery {
  constructor(readonly address: string) {}
}
